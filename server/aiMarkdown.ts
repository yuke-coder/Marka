import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

type AiMarkdownMode = 'format' | 'rewrite';
type AiMarkdownTask = 'generate' | 'revise' | 'continue';

interface AiMarkdownBody {
    mode?: AiMarkdownMode;
    task?: AiMarkdownTask;
    sourceText?: string;
    extraInstruction?: string;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.5';
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
        return '当前 OpenAI 模型不可用，请检查 OPENAI_MODEL 环境变量';
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
        '你是 Marka 的 Markdown 排版助手。',
        '只输出可直接填入 Markdown 编辑器的 Markdown 源码。',
        '不要输出解释、寒暄、JSON、HTML 或 ```markdown 包裹。',
        '不得编造事实，不得加入原文没有的新信息。',
    ];

    if (task === 'continue') {
        base.push('用户会提供一份已经生成到一半的 Markdown，请从末尾自然继续，只输出后续 Markdown 片段，不要重复已有内容。');
    } else if (task === 'revise') {
        base.push('用户会提供一份已有 Markdown，请根据继续要求优化它，并返回完整的新 Markdown。');
    } else {
        base.push('用户会提供纯文本，请把它转换成结构清晰、格式丰富的 Markdown。');
    }

    if (mode === 'format') {
        base.push('当前是排版模式：完全保留原文内容，只做结构整理、Markdown 化和排版增强；不得删减、扩写、改写或总结。');
    } else {
        base.push('当前是改写模式：可以按用户要求调整表达、语气和结构，但必须保留原文事实，不能编造。');
    }

    return base.join('\n');
}

function buildInput(body: Required<AiMarkdownBody>) {
    const label = body.task === 'revise' ? '当前 Markdown 源码' : body.task === 'continue' ? '已生成的 Markdown 片段' : '原始纯文本';
    const instruction = body.extraInstruction.trim() || '无额外要求';
    return [
        `用户额外要求：\n---\n${instruction}\n---`,
        `${label}：\n---\n${body.sourceText.trim()}\n---`,
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
    const sourceText = (body.sourceText || '').trim();
    const extraInstruction = body.extraInstruction || '';

    if (!sourceText) {
        sendJson(res, 400, { error: task === 'generate' ? '请输入纯文本内容' : '没有可继续处理的 Markdown' });
        return;
    }

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
                model: readEnv('OPENAI_MODEL') || DEFAULT_MODEL,
                stream: true,
                instructions: buildInstructions(mode, task),
                input: buildInput({ mode, task, sourceText, extraInstruction }),
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
