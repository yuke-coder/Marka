import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

type AiMarkdownMode = 'format' | 'rewrite';
type AiMarkdownTask = 'generate' | 'revise' | 'continue';

interface AiMarkdownBody {
    mode?: AiMarkdownMode;
    model?: string;
    reasoningEffort?: string;
    speed?: string;
    task?: AiMarkdownTask;
    sourceText?: string;
    extraInstruction?: string;
}

const PROVIDERS = {
    openai: { apiKeyEnvs: ['OPENAI_API_KEY'], apiUrl: 'https://api.openai.com/v1/responses', modelsUrl: 'https://api.openai.com/v1/models', label: 'OpenAI' },
    deepseek: { apiKeyEnvs: ['DEEPSEEK_API_KEY'], apiUrl: 'https://api.deepseek.com/chat/completions', modelsUrl: 'https://api.deepseek.com/models', label: 'DeepSeek' },
    doubao: { apiKeyEnvs: ['ARK_API_KEY', 'DOUBAO_API_KEY', 'VOLCENGINE_API_KEY'], apiUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions', modelsUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3/models', label: 'Doubao' },
} as const;
type AiProvider = keyof typeof PROVIDERS;

const DOUBAO_SEED_MODEL = 'doubao-seed-2-1-pro-260628';
const DEFAULT_MODEL = DOUBAO_SEED_MODEL;
const DEFAULT_REASONING_EFFORT = 'low';
const MODEL_OPTIONS = [
    { id: DOUBAO_SEED_MODEL, label: 'Doubao-Seed-2.1-pro', provider: 'doubao' },
    { id: 'gpt-5.5', label: 'GPT-5.5', provider: 'openai' },
    { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'openai' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'openai' },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', provider: 'openai' },
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'deepseek' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', provider: 'deepseek' },
] as const;
const SELECTABLE_REASONING_EFFORTS: Set<string> = new Set(['low', 'medium', 'high', 'xhigh']);
const SELECTABLE_SPEEDS: Set<string> = new Set(['standard', 'fast']);
const MODELS_CACHE_MS = 5 * 60 * 1000;
const MODEL_ENV_KEYS = ['AI_MARKDOWN_MODEL', 'DOUBAO_MODEL', 'ARK_MODEL', 'OPENAI_MODEL', 'DEEPSEEK_MODEL'];
type ModelOption = { id: string; label: string; provider: AiProvider };

let proxyReady = false;
let availableModelsCache: { expiresAt: number; models: ModelOption[] } | null = null;

function readEnv(name: string) {
    const value = process.env[name]?.trim() || '';
    return value.replace(/^(['"])(.*)\1$/, '$2').trim();
}

function setupProxy() {
    if (proxyReady) return;
    proxyReady = true;
    const proxy = readEnv('OPENAI_PROXY') || readEnv('HTTPS_PROXY') || readEnv('HTTP_PROXY');
    if (proxy) setGlobalDispatcher(new ProxyAgent(proxy));
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function getApiKey(provider: AiProvider) {
    return PROVIDERS[provider].apiKeyEnvs.map(readEnv).find(Boolean) || '';
}

function getApiKeyEnvLabel(provider: AiProvider) {
    return PROVIDERS[provider].apiKeyEnvs.join(' 或 ');
}

function getStaticModelOption(id: string) {
    return MODEL_OPTIONS.find(option => option.id === id);
}

function getModelOption(id: string, models?: ModelOption[] | null) {
    return models?.find(option => option.id === id) ?? getStaticModelOption(id);
}

function toModelOption(provider: AiProvider, id: string): ModelOption {
    return { id, label: getStaticModelOption(id)?.label ?? id, provider };
}

async function readAvailableModels(provider: AiProvider) {
    setupProxy();
    const config = PROVIDERS[provider];
    const apiKey = getApiKey(provider);
    if (!apiKey) return [];

    const response = await fetch(config.modelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) throw new Error(`${config.label} models request failed: ${response.status}`);

    const data = await response.json();
    return Array.isArray(data?.data)
        ? data.data
            .map((model: { id?: unknown }) => model.id)
            .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
            .map((id: string) => toModelOption(provider, id.trim()))
        : [];
}

async function getAvailableModels() {
    const now = Date.now();
    if (availableModelsCache && availableModelsCache.expiresAt > now) return availableModelsCache.models;

    const providerModels = await Promise.all((Object.keys(PROVIDERS) as AiProvider[]).map(async provider => {
        try {
            return await readAvailableModels(provider);
        } catch (err) {
            console.error(`${PROVIDERS[provider].label} models request failed:`, err);
            return [];
        }
    }));

    const staticOrder = new Map(MODEL_OPTIONS.map((option, index) => [option.id, index]));
    const seen = new Set<string>();
    const models = providerModels
        .flat()
        .filter(option => {
            if (seen.has(option.id)) return false;
            seen.add(option.id);
            return true;
        })
        .sort((a, b) =>
            (a.id === DEFAULT_MODEL ? -1 : b.id === DEFAULT_MODEL ? 1 : 0)
            || ((staticOrder.get(a.id) ?? 10_000) - (staticOrder.get(b.id) ?? 10_000))
            || a.provider.localeCompare(b.provider)
            || a.id.localeCompare(b.id)
        );

    availableModelsCache = { expiresAt: now + MODELS_CACHE_MS, models };
    return models;
}

function normalizeReasoningEffort(effort: string) {
    if (effort === 'xhigh') return 'high';
    return effort;
}

function supportsReasoningControls(model: string) {
    return /^gpt-5(?:[.-]|$)/i.test(model) || /^o[1-9](?:[.-]|$)/i.test(model);
}

function buildOpenAIRequestBody(args: {
    model: string;
    reasoningEffort: string;
    speed: string;
    mode: AiMarkdownMode;
    task: AiMarkdownTask;
    sourceText: string;
    extraInstruction: string;
}) {
    const body: Record<string, unknown> = {
        model: args.model,
        stream: true,
        instructions: buildInstructions(args.mode, args.task),
        input: buildInput(args),
    };

    if (supportsReasoningControls(args.model)) body.reasoning = { effort: normalizeReasoningEffort(args.reasoningEffort) };
    if (args.speed === 'fast') body.service_tier = 'auto';
    return body;
}

function buildChatRequestBody(args: {
    provider: AiProvider;
    model: string;
    reasoningEffort: string;
    mode: AiMarkdownMode;
    task: AiMarkdownTask;
    sourceText: string;
    extraInstruction: string;
}) {
    const body: Record<string, unknown> = {
        model: args.model,
        stream: true,
        messages: [
            { role: 'system', content: buildInstructions(args.mode, args.task) },
            { role: 'user', content: buildInput(args) },
        ],
    };

    if (args.provider === 'deepseek') {
        body.thinking = { type: args.reasoningEffort === 'low' ? 'disabled' : 'enabled' };
        if (args.reasoningEffort !== 'low') body.reasoning_effort = args.reasoningEffort === 'xhigh' ? 'max' : 'high';
    }

    return body;
}

async function readProviderError(provider: AiProvider, upstream: Response) {
    const text = await upstream.text().catch(() => '');
    let code = '';
    let type = '';

    try {
        const data = JSON.parse(text);
        code = typeof data?.error?.code === 'string' ? data.error.code : '';
        type = typeof data?.error?.type === 'string' ? data.error.type : '';
    } catch {
        // Keep provider error details out of the client response.
    }

    const label = PROVIDERS[provider].label;
    console.error(`${label} response failed:`, { status: upstream.status, code, type });

    if (upstream.status === 401 || code === 'invalid_api_key') {
        return `${label} API Key 无效或未被当前账号接受，请重新复制或生成新的 Key 后重试`;
    }

    if (upstream.status === 429 || code === 'rate_limit_exceeded') {
        return `${label} 请求过于频繁或额度不足，请稍后重试`;
    }

    if (upstream.status === 402 || code === 'insufficient_quota') {
        return `${label} 余额不足或计费未开通，请检查账户余额后重试`;
    }

    if (code === 'model_not_found') {
        return `当前 ${label} 模型不可用，请检查模型选择或 API 配置`;
    }

    return `${label} 请求失败（${upstream.status || 502}）`;
}

function readJson(req: IncomingMessage): Promise<AiMarkdownBody> {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 120_000) {
                reject(new Error('文本过长，请分段处理'));
                req.destroy();
            }
        });
        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                reject(new Error('请求格式无效'));
            }
        });
        req.on('error', reject);
    });
}

function buildInstructions(mode: AiMarkdownMode, task: AiMarkdownTask) {
    const base = [
        'You are the Markdown transformation engine inside Marka, a focused editor for turning plain text into clean, publish-ready Markdown.',
        'Return only raw Markdown source that can be inserted directly into the editor.',
        'Do not include explanations, greetings, analysis, JSON, HTML, or wrapping code fences such as ```markdown.',
        'Do not invent facts, claims, data, links, names, dates, examples, or conclusions that are not present in the user-provided text.',
        'Keep the output in the same language as the source text unless the user explicitly asks for another language.',
        'Produce Chinese-first, publish-ready Markdown with the richness of Marka\'s built-in product guide when the source supports it. Use natural Chinese short paragraphs, full-width Chinese punctuation in Chinese prose, readable spacing around English words/numbers/product names/inline code, and one blank line between different Markdown block types.',
        'Before writing, silently infer the source type and hierarchy, then map source relationships to Markdown structures: H1 for a source-implied document title, H2 for major sections, H3 for subtopics, blockquotes for summaries/positioning/warnings/caveats/key takeaways/quoted material, ordered lists for steps/sequences/rankings/timelines/workflows, unordered lists for grouped features/details/benefits/requirements/notes/examples, and bold lead labels when each item has a name plus explanation.',
        'Maximize applicable Markdown coverage. Actively use every Markdown feature that the source legitimately supports: tables for comparisons/feature matrices/parameters/plans/pros-cons/schedules/aligned fields; task lists for todos/checklists/action items/requirements/completion states; fenced code blocks for code/commands/config/logs/data samples/templates/pseudo-code; inline code for commands/identifiers/file names/API names/variables/config keys/keyboard shortcuts/literal values; italic for restrained nuance/titles/contrast; strikethrough only for deprecated/removed/replaced content; links and images only when source URLs or image references exist; horizontal rules before final tips/notes/appendices in longer documents.',
        'Do not force unsupported Markdown features, but do not under-format. A weak output collapses rich source material into plain paragraphs, a shallow outline, or only short bullet lists when the source contains comparison, steps, examples, code, caveats, summaries, action items, or feature groups.',
        'Prefer readable publishing structure over decoration. Avoid empty sections, repeated blank lines, invented examples, gratuitous tables, forced code blocks, and excessive bold text.',
        'Follow the user\'s extra requirements unless they conflict with factual preservation, Markdown-only output, or the selected mode.',
    ];

    if (task === 'continue') {
        base.push('Task: continue an existing partial Markdown result. Start naturally from the end of the provided content, output only the continuation fragment, and do not repeat existing text.');
    } else if (task === 'revise') {
        base.push('Task: revise an existing Markdown document according to the user\'s follow-up request. Return the complete revised Markdown document.');
    } else {
        base.push('Task: convert the provided plain text into clear, well-structured, richly formatted Markdown.');
    }

    if (mode === 'format') {
        base.push('Mode: formatting. Preserve the original content, wording, meaning, order, and level of detail. Only organize structure, convert to Markdown, and improve layout. Do not delete, expand, rewrite, summarize, or reinterpret the source.');
    } else {
        base.push('Mode: rewriting. You may improve wording, tone, flow, and structure according to the user\'s requirements, but you must preserve all original facts and intent. If a fact is unclear, keep the original wording rather than guessing.');
    }

    return base.join('\n');
}

function buildInput(body: { task: AiMarkdownTask; sourceText: string; extraInstruction: string }) {
    const label = body.task === 'revise' ? 'Current Markdown source' : body.task === 'continue' ? 'Existing partial Markdown' : 'Source plain text';
    const instruction = body.extraInstruction.trim() || 'No additional requirements.';
    return [
        `Additional user requirements:\n---\n${instruction}\n---`,
        `${label}:\n---\n${body.sourceText.trim()}\n---`,
    ].join('\n\n');
}

export async function handleAiMarkdownRequest(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'GET') {
        try {
            const models = await getAvailableModels();
            if (!models.length) {
                sendJson(res, 502, { error: '当前没有可用于文本生成的模型，请检查 ARK_API_KEY、DOUBAO_API_KEY、VOLCENGINE_API_KEY、OPENAI_API_KEY 或 DEEPSEEK_API_KEY', models: [] });
                return;
            }
            sendJson(res, 200, { models });
        } catch (err) {
            console.error('AI models request failed:', err);
            sendJson(res, 502, { error: '模型列表获取失败，请检查网络、代理或 API Key', models: [] });
        }
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { error: '仅支持 POST 请求' });
        return;
    }

    let body: AiMarkdownBody;
    try {
        body = await readJson(req);
    } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : '请求格式无效' });
        return;
    }

    const mode = body.mode === 'rewrite' ? 'rewrite' : 'format';
    const task = body.task === 'revise' ? 'revise' : body.task === 'continue' ? 'continue' : 'generate';
    const requestedModel = (body.model || '').trim();
    const requestedReasoningEffort = (body.reasoningEffort || '').trim();
    const requestedSpeed = (body.speed || '').trim();
    const sourceText = (body.sourceText || '').trim();
    const extraInstruction = body.extraInstruction || '';

    if (requestedReasoningEffort && !SELECTABLE_REASONING_EFFORTS.has(requestedReasoningEffort)) {
        sendJson(res, 400, { error: '请选择有效的推理等级' });
        return;
    }

    if (requestedSpeed && !SELECTABLE_SPEEDS.has(requestedSpeed)) {
        sendJson(res, 400, { error: '请选择有效的速度设置' });
        return;
    }

    if (!sourceText) {
        sendJson(res, 400, { error: task === 'generate' ? '请输入纯文本内容' : '没有可继续处理的 Markdown' });
        return;
    }

    let availableModels: ModelOption[] | null = null;
    try {
        availableModels = await getAvailableModels();
    } catch (err) {
        console.error('AI models request failed:', err);
    }

    const availableModelIds = new Set(availableModels?.map(item => item.id) ?? []);
    if (availableModels && !availableModels.length) {
        sendJson(res, 502, { error: '当前没有返回可用于文本生成的模型，请检查 API Key' });
        return;
    }

    if (requestedModel && availableModels && !availableModelIds.has(requestedModel)) {
        sendJson(res, 400, { error: '当前模型不可用，请刷新模型列表后重试' });
        return;
    }

    const configuredModel = MODEL_ENV_KEYS
        .map(readEnv)
        .find(id => getModelOption(id, availableModels) && (!availableModels || availableModelIds.has(id)));
    const model = requestedModel
        || configuredModel
        || availableModels?.[0]?.id
        || DEFAULT_MODEL;
    const modelOption = getModelOption(model, availableModels);
    if (!modelOption) {
        sendJson(res, 400, { error: '请选择有效的模型' });
        return;
    }

    const provider = modelOption.provider;
    const apiKey = getApiKey(provider);
    if (!apiKey) {
        sendJson(res, 500, { error: `缺少 ${getApiKeyEnvLabel(provider)} 环境变量` });
        return;
    }

    const reasoningEffort = requestedReasoningEffort || DEFAULT_REASONING_EFFORT;

    let upstream: Response;
    try {
        setupProxy();
        upstream = await fetch(PROVIDERS[provider].apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(provider === 'openai'
                ? buildOpenAIRequestBody({ model, reasoningEffort, speed: requestedSpeed || 'standard', mode, task, sourceText, extraInstruction })
                : buildChatRequestBody({ provider, model, reasoningEffort, mode, task, sourceText, extraInstruction })),
        });
    } catch (err) {
        console.error(`${PROVIDERS[provider].label} request failed:`, err);
        sendJson(res, 502, { error: `${PROVIDERS[provider].label} 请求失败，请检查网络或 API 配置` });
        return;
    }

    if (!upstream.ok || !upstream.body) {
        sendJson(res, upstream.status || 502, { error: await readProviderError(provider, upstream) });
        return;
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
    });

    try {
        const reader = upstream.body.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) res.write(Buffer.from(value));
        }
    } catch {
        // Client may cancel while streaming.
    } finally {
        res.end();
    }
}
