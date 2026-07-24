import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProxyAgent } from 'undici';
import {
    buildAiFormattingInstructions,
    DEFAULT_AI_FORMATTING_PRESET,
    isAiFormattingPresetId,
    type AiFormattingPresetId,
} from './aiFormattingPresets';

interface AiMarkdownBody {
    presetId?: string;
    model?: string;
    reasoningEffort?: string;
    speed?: string;
    sourceText?: string;
}

const PROVIDERS = {
    openai: { apiKeyEnvs: ['OPENAI_API_KEY'], apiUrl: 'https://api.openai.com/v1/responses', label: 'OpenAI' },
    doubao: { apiKeyEnvs: ['ARK_API_KEY', 'DOUBAO_API_KEY', 'VOLCENGINE_API_KEY'], apiUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions', label: 'Doubao' },
} as const;
const DOUBAO_RESPONSES_API_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3/responses';
type AiProvider = keyof typeof PROVIDERS;

const DEFAULT_MODEL = 'doubao-seed-2.0-pro';
const AUTO_ROUTED_MODEL = 'ark-code-latest';
const DEFAULT_REASONING_EFFORT = 'low';
const MODEL_OPTIONS = [
    { id: 'auto', label: 'Auto', provider: 'doubao' },
    { id: 'doubao-seed-2.1-pro', label: 'Doubao-Seed-2.1-pro', provider: 'doubao' },
    { id: 'doubao-seed-2.1-turbo', label: 'Doubao-Seed-2.1-Turbo', provider: 'doubao' },
    { id: 'doubao-seed-2.0-pro', label: 'Doubao-Seed-2.0-pro', provider: 'doubao' },
    { id: 'doubao-seed-2.0-code', label: 'Doubao-Seed-2.0-Code', provider: 'doubao' },
    { id: 'doubao-seed-2.0-lite', label: 'Doubao-Seed-2.0-lite', provider: 'doubao' },
    { id: 'doubao-seed-code', label: 'Doubao-Seed-Code', provider: 'doubao' },
    { id: 'glm-5.2', label: 'GLM-5.2', provider: 'doubao' },
    { id: 'kimi-k2.7-code', label: 'Kimi-K2.7-Code', provider: 'doubao' },
    { id: 'minimax-m3', label: 'MiniMax-M3', provider: 'doubao' },
    { id: 'deepseek-v4-flash', label: 'DeepSeek-V4-Flash', provider: 'doubao' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro', provider: 'doubao' },
    { id: 'minimax-m2.7', label: 'MiniMax-M2.7', provider: 'doubao' },
    { id: 'kimi-k2.6', label: 'Kimi-K2.6', provider: 'doubao' },
    { id: 'gpt-5.5', label: 'GPT-5.5', provider: 'openai' },
    { id: 'gpt-5.5-pro', label: 'GPT-5.5 Pro', provider: 'openai' },
    { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'openai' },
    { id: 'gpt-5.4-pro', label: 'GPT-5.4 Pro', provider: 'openai' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'openai' },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', provider: 'openai' },
] as const;
const SELECTABLE_REASONING_EFFORTS: Set<string> = new Set(['low', 'medium', 'high', 'xhigh']);
const SELECTABLE_SPEEDS: Set<string> = new Set(['standard', 'fast']);
const MODEL_ENV_KEYS = ['AI_MARKDOWN_MODEL', 'DOUBAO_MODEL', 'ARK_MODEL', 'OPENAI_MODEL'];

let _openaiProxyAgent: ProxyAgent | null | undefined;

function readEnv(name: string) {
    const value = process.env[name]?.trim() || '';
    return value.replace(/^(['"])(.*)\1$/, '$2').trim();
}

function getOpenAIProxyAgent() {
    if (_openaiProxyAgent !== undefined) return _openaiProxyAgent;
    const proxy = readEnv('OPENAI_PROXY') || readEnv('HTTPS_PROXY') || readEnv('HTTP_PROXY');
    _openaiProxyAgent = proxy ? new ProxyAgent(proxy) : null;
    return _openaiProxyAgent;
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

function getModelOption(id: string) {
    return MODEL_OPTIONS.find(option => option.id === id);
}

function normalizeReasoningEffort(effort: string) {
    if (effort === 'xhigh') return 'high';
    return effort;
}

function supportsReasoningControls(model: string) {
    return /^gpt-5(?:[.-]|$)/i.test(model) || /^o[1-9](?:[.-]|$)/i.test(model);
}

function buildResponsesRequestBody(args: {
    provider: AiProvider;
    model: string;
    reasoningEffort: string;
    speed: string;
    presetId: AiFormattingPresetId;
    sourceText: string;
}) {
    const body: Record<string, unknown> = {
        model: args.model,
        stream: true,
        instructions: buildAiFormattingInstructions(args.presetId),
        input: buildInput(args.sourceText),
    };

    const isAutoRoute = args.provider === 'doubao' && args.model === AUTO_ROUTED_MODEL;
    if (supportsReasoningControls(args.model) || isAutoRoute) {
        body.reasoning = {
            effort: normalizeReasoningEffort(args.reasoningEffort),
            summary: 'auto',
        };
    }
    if (args.provider === 'openai' && args.speed === 'fast') body.service_tier = 'auto';
    return body;
}

function buildChatRequestBody(args: {
    provider: AiProvider;
    model: string;
    reasoningEffort: string;
    presetId: AiFormattingPresetId;
    sourceText: string;
}) {
    const body: Record<string, unknown> = {
        model: args.model,
        stream: true,
        messages: [
            { role: 'system', content: buildAiFormattingInstructions(args.presetId) },
            { role: 'user', content: buildInput(args.sourceText) },
        ],
    };

    if (args.provider === 'doubao' && args.model === AUTO_ROUTED_MODEL) {
        body.thinking = { type: 'enabled' };
        body.reasoning_effort = normalizeReasoningEffort(args.reasoningEffort);
    } else if (args.provider === 'doubao' && args.model.startsWith('deepseek-')) {
        body.thinking = { type: 'enabled' };
        body.reasoning_effort = normalizeReasoningEffort(args.reasoningEffort);
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
        return `${label} 模型调用失败，请检查 API 配置`;
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

function buildInput(sourceText: string) {
    return `Source plain text:\n---\n${sourceText.trim()}\n---`;
}

export async function handleAiMarkdownRequest(req: IncomingMessage, res: ServerResponse) {
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

    const requestedPresetId = (body.presetId || '').trim();
    const requestedModel = (body.model || '').trim();
    const requestedReasoningEffort = (body.reasoningEffort || '').trim();
    const requestedSpeed = (body.speed || '').trim();
    const sourceText = (body.sourceText || '').trim();

    if (requestedPresetId && !isAiFormattingPresetId(requestedPresetId)) {
        sendJson(res, 400, { error: '排版方案无效' });
        return;
    }

    if (requestedReasoningEffort && !SELECTABLE_REASONING_EFFORTS.has(requestedReasoningEffort)) {
        sendJson(res, 400, { error: '请选择有效的推理等级' });
        return;
    }

    if (requestedSpeed && !SELECTABLE_SPEEDS.has(requestedSpeed)) {
        sendJson(res, 400, { error: '请选择有效的速度设置' });
        return;
    }

    if (!sourceText) {
        sendJson(res, 400, { error: '请输入纯文本内容' });
        return;
    }

    const configuredModel = MODEL_ENV_KEYS
        .map(readEnv)
        .find(id => getModelOption(id));
    const model = requestedModel
        || configuredModel
        || DEFAULT_MODEL;
    const modelOption = getModelOption(model);
    if (!modelOption) {
        sendJson(res, 400, { error: '模型参数无效' });
        return;
    }

    const provider = modelOption.provider;
    const upstreamModel = model === 'auto' ? AUTO_ROUTED_MODEL : model;
    const apiKey = getApiKey(provider);
    if (!apiKey) {
        sendJson(res, 500, { error: `缺少 ${getApiKeyEnvLabel(provider)} 环境变量` });
        return;
    }

    const reasoningEffort = requestedReasoningEffort || DEFAULT_REASONING_EFFORT;
    const presetId = isAiFormattingPresetId(requestedPresetId)
        ? requestedPresetId
        : DEFAULT_AI_FORMATTING_PRESET;
    const usesResponsesApi = provider === 'openai' || upstreamModel === AUTO_ROUTED_MODEL;
    const upstreamUrl = provider === 'doubao' && usesResponsesApi
        ? DOUBAO_RESPONSES_API_URL
        : PROVIDERS[provider].apiUrl;

    let upstream: Response;
    try {
        const fetchOptions: RequestInit & { dispatcher?: InstanceType<typeof ProxyAgent> } = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(usesResponsesApi
                ? buildResponsesRequestBody({ provider, model: upstreamModel, reasoningEffort, speed: requestedSpeed || 'standard', presetId, sourceText })
                : buildChatRequestBody({ provider, model: upstreamModel, reasoningEffort, presetId, sourceText })),
        };
        if (provider === 'openai') {
            const dispatcher = getOpenAIProxyAgent();
            if (dispatcher) fetchOptions.dispatcher = dispatcher;
        }
        upstream = await fetch(upstreamUrl, fetchOptions);
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
