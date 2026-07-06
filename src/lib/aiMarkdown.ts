export type AiMarkdownMode = 'format' | 'rewrite';
export type AiApplyMode = 'replace' | 'insert' | 'append';
export type AiMarkdownTask = 'generate' | 'revise' | 'continue';
export type AiMarkdownModel = string;
export type AiReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type AiMarkdownSpeed = 'standard' | 'fast';
export interface AiMarkdownModelOption {
    id: AiMarkdownModel;
    label: string;
}

const DOUBAO_SEED_MODEL = 'doubao-seed-2-1-pro-260628';
export const DEFAULT_AI_MARKDOWN_MODEL: AiMarkdownModel = DOUBAO_SEED_MODEL;
export const DEFAULT_AI_REASONING_EFFORT: AiReasoningEffort = 'low';
export const DEFAULT_AI_MARKDOWN_SPEED: AiMarkdownSpeed = 'standard';

export const aiMarkdownModels: AiMarkdownModelOption[] = [
    { id: DOUBAO_SEED_MODEL, label: 'Doubao-Seed-2.1-pro' },
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
];

export const aiReasoningEfforts: Array<{ id: AiReasoningEffort; label: string }> = [
    { id: 'low', label: '低' },
    { id: 'medium', label: '中' },
    { id: 'high', label: '高' },
    { id: 'xhigh', label: '超高' },
];

export const aiMarkdownSpeeds: Array<{ id: AiMarkdownSpeed; label: string; description: string }> = [
    { id: 'standard', label: '标准', description: '默认速度' },
    { id: 'fast', label: '快速', description: '1.5x speed, increased usage' },
];

export interface AiMarkdownRequest {
    mode: AiMarkdownMode;
    model: AiMarkdownModel;
    reasoningEffort: AiReasoningEffort;
    speed: AiMarkdownSpeed;
    task: AiMarkdownTask;
    sourceText: string;
    extraInstruction: string;
}

export async function fetchAiMarkdownModels(): Promise<AiMarkdownModelOption[]> {
    const response = await fetch('/api/ai-markdown');
    if (!response.ok) {
        let message = '模型列表获取失败';
        try {
            const data = await response.json();
            if (typeof data?.error === 'string') message = data.error;
        } catch {
            // Keep the generic message when the server does not return JSON.
        }
        throw new Error(message);
    }

    const data = await response.json();
    return Array.isArray(data?.models) ? data.models : [];
}

export function cleanAiMarkdown(markdown: string): string {
    let next = markdown.trim();
    const fence = next.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
    if (fence) next = fence[1].trim();
    return next;
}

function getAiStreamError(event: any): string {
    const error = event?.response?.error || event?.error;
    const code = typeof error?.code === 'string' ? error.code : '';

    if (code === 'insufficient_quota') return 'AI 额度不足或账单未开通，请检查账户余额';
    if (code === 'rate_limit_exceeded') return 'AI 请求过于频繁，请稍后再试';
    if (code === 'invalid_api_key') return 'API Key 无效，请重新配置';
    if (code === 'model_not_found') return '当前模型不可用，请检查模型选择或 API 配置';

    return typeof error?.message === 'string' ? error.message : 'AI 生成失败';
}

export async function streamAiMarkdown(
    payload: AiMarkdownRequest,
    options: {
        signal?: AbortSignal;
        onConnected?: () => void;
        onDelta: (delta: string) => void;
    }
): Promise<string> {
    const response = await fetch('/api/ai-markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal,
    });

    if (!response.ok || !response.body) {
        let message = 'AI 生成失败，请稍后重试';
        try {
            const data = await response.json();
            if (typeof data?.error === 'string') message = data.error;
        } catch {
            const text = await response.text().catch(() => '');
            if (text) message = text;
        }
        throw new Error(message);
    }

    options.onConnected?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = '';
    let streamError: Error | null = null;

    const handleEvent = (raw: string) => {
        const data = raw
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim())
            .join('\n');

        if (!data || data === '[DONE]') return;

        try {
            const event = JSON.parse(data);
            const delta = event.type === 'response.output_text.delta' && typeof event.delta === 'string'
                ? event.delta
                : event.choices?.[0]?.delta?.content;

            if (typeof delta === 'string' && delta) {
                result += delta;
                options.onDelta(delta);
            } else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
                streamError = new Error(getAiStreamError(event));
            }
        } catch {
            // Ignore non-JSON SSE comments or provider-side keepalive lines.
        }
    };

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split(/\n\n/);
        buffer = parts.pop() || '';
        parts.forEach(handleEvent);
        if (streamError) throw streamError;
    }

    if (buffer) handleEvent(buffer);
    if (streamError) throw streamError;
    return cleanAiMarkdown(result);
}
