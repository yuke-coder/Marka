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

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.4-nano';
const DEFAULT_REASONING_EFFORT = 'low';
const SELECTABLE_MODELS = new Set([
    'gpt-5.5',
    'gpt-5.5-pro',
    'gpt-5.4',
    'gpt-5.4-pro',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.3-codex-spark',
]);
const SELECTABLE_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);
const SELECTABLE_SPEEDS = new Set(['standard', 'fast']);
let proxyReady = false;

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

async function readOpenAIError(upstream: Response) {
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

    console.error('OpenAI response failed:', { status: upstream.status, code, type });

    if (upstream.status === 401 || code === 'invalid_api_key') {
        return 'OpenAI API Key 无效或未被当前账号接受，请重新复制或生成新的 Key 后重试';
    }

    if (upstream.status === 429 || code === 'rate_limit_exceeded') {
        return 'OpenAI 请求过于频繁或额度不足，请稍后重试';
    }

    if (code === 'model_not_found') {
        return '当前 OpenAI 模型不可用，请检查模型选择或 OPENAI_MODEL 环境变量';
    }

    return `OpenAI 请求失败（${upstream.status || 502}）`;
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
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: '仅支持 POST 请求' });
        return;
    }

    const apiKey = readEnv('OPENAI_API_KEY');
    if (!apiKey) {
        sendJson(res, 500, { error: '缺少 OPENAI_API_KEY 环境变量' });
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

    if (requestedModel && !SELECTABLE_MODELS.has(requestedModel)) {
        sendJson(res, 400, { error: '请选择有效的 OpenAI 模型' });
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
        sendJson(res, 400, { error: task === 'generate' ? '请输入纯文本内容' : '没有可继续处理的 Markdown' });
        return;
    }

    const model = requestedModel || readEnv('OPENAI_MODEL') || DEFAULT_MODEL;
    const reasoningEffort = requestedReasoningEffort || DEFAULT_REASONING_EFFORT;
    const serviceTier = requestedSpeed === 'fast' ? 'priority' : 'default';

    let upstream: Response;
    try {
        setupProxy();
        upstream = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                reasoning: { effort: reasoningEffort },
                service_tier: serviceTier,
                stream: true,
                instructions: buildInstructions(mode, task),
                input: buildInput({ task, sourceText, extraInstruction }),
            }),
        });
    } catch (err) {
        console.error('OpenAI request failed:', err);
        sendJson(res, 502, { error: 'OpenAI 请求失败，请检查网络或 API 配置' });
        return;
    }

    if (!upstream.ok || !upstream.body) {
        sendJson(res, upstream.status || 502, { error: await readOpenAIError(upstream) });
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
