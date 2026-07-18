import type { AiFormattingPresetId } from './aiFormattingPresets';

export type AiMarkdownModel = string;
export type AiReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type AiMarkdownSpeed = 'standard' | 'fast';
export type AiGenerationPhase = 'idle' | 'connecting' | 'processing' | 'thinking' | 'finalizing' | 'completed';
export const AI_CONNECTION_GATE_MS = 750;
export interface AiMarkdownModelOption {
    id: AiMarkdownModel;
    label: string;
}

export const DEFAULT_AI_MARKDOWN_MODEL: AiMarkdownModel = 'auto';
export const DEFAULT_AI_REASONING_EFFORT: AiReasoningEffort = 'low';
export const DEFAULT_AI_MARKDOWN_SPEED: AiMarkdownSpeed = 'standard';

const MODEL_DISPLAY_NAMES: Record<string, string> = {
    'auto': 'Auto',
    'doubao-seed-2.1-pro': 'Doubao-Seed-2.1-pro',
    'doubao-seed-2.1-turbo': 'Doubao-Seed-2.1-Turbo',
    'doubao-seed-2.0-code': 'Doubao-Seed-2.0-Code',
    'doubao-seed-2.0-pro': 'Doubao-Seed-2.0-pro',
    'doubao-seed-2.0-lite': 'Doubao-Seed-2.0-lite',
    'doubao-seed-code': 'Doubao-Seed-Code',
    'glm-5.2': 'GLM-5.2',
    'kimi-k2.7-code': 'Kimi-K2.7-Code',
    'minimax-m3': 'MiniMax-M3',
    'deepseek-v4-flash': 'DeepSeek-V4-Flash',
    'deepseek-v4-pro': 'DeepSeek-V4-Pro',
    'minimax-m2.7': 'MiniMax-M2.7',
    'kimi-k2.6': 'Kimi-K2.6',
    'gpt-5.5': 'GPT-5.5',
    'gpt-5.5-pro': 'GPT-5.5 Pro',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-pro': 'GPT-5.4 Pro',
    'gpt-5.4-mini': 'GPT-5.4 Mini',
    'gpt-5.4-nano': 'GPT-5.4 Nano',
};

export function getModelDisplayName(modelId: string): string {
    return MODEL_DISPLAY_NAMES[modelId] ?? modelId;
}

export const aiMarkdownModels: AiMarkdownModelOption[] = [
    { id: 'auto', label: getModelDisplayName('auto') },
    { id: 'doubao-seed-2.1-pro', label: getModelDisplayName('doubao-seed-2.1-pro') },
    { id: 'doubao-seed-2.1-turbo', label: getModelDisplayName('doubao-seed-2.1-turbo') },
    { id: 'doubao-seed-2.0-pro', label: getModelDisplayName('doubao-seed-2.0-pro') },
    { id: 'doubao-seed-2.0-code', label: getModelDisplayName('doubao-seed-2.0-code') },
    { id: 'doubao-seed-2.0-lite', label: getModelDisplayName('doubao-seed-2.0-lite') },
    { id: 'doubao-seed-code', label: getModelDisplayName('doubao-seed-code') },
    { id: 'glm-5.2', label: getModelDisplayName('glm-5.2') },
    { id: 'kimi-k2.7-code', label: getModelDisplayName('kimi-k2.7-code') },
    { id: 'minimax-m3', label: getModelDisplayName('minimax-m3') },
    { id: 'deepseek-v4-flash', label: getModelDisplayName('deepseek-v4-flash') },
    { id: 'deepseek-v4-pro', label: getModelDisplayName('deepseek-v4-pro') },
    { id: 'minimax-m2.7', label: getModelDisplayName('minimax-m2.7') },
    { id: 'kimi-k2.6', label: getModelDisplayName('kimi-k2.6') },
    { id: 'gpt-5.5', label: getModelDisplayName('gpt-5.5') },
    { id: 'gpt-5.5-pro', label: getModelDisplayName('gpt-5.5-pro') },
    { id: 'gpt-5.4', label: getModelDisplayName('gpt-5.4') },
    { id: 'gpt-5.4-pro', label: getModelDisplayName('gpt-5.4-pro') },
    { id: 'gpt-5.4-mini', label: getModelDisplayName('gpt-5.4-mini') },
    { id: 'gpt-5.4-nano', label: getModelDisplayName('gpt-5.4-nano') },
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
    presetId: AiFormattingPresetId;
    model: AiMarkdownModel;
    reasoningEffort: AiReasoningEffort;
    speed: AiMarkdownSpeed;
    sourceText: string;
    extraInstruction: string;
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
    if (code === 'model_not_found') return '模型调用失败，请检查 API 配置';

    return typeof error?.message === 'string' ? error.message : 'AI 生成失败';
}

function getCompletedText(response: any): string {
    if (!Array.isArray(response?.output)) return '';
    return response.output.flatMap((item: any) =>
        Array.isArray(item?.content)
            ? item.content.flatMap((part: any) =>
                part?.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [])
            : []
    ).join('');
}

export interface StreamAiMarkdownOptions {
    signal?: AbortSignal;
    onDelta: (delta: string) => void;
    onThinkingDelta?: (delta: string) => void;
    onThinkingDone?: () => void;
}

export async function streamAiMarkdown(
    payload: AiMarkdownRequest,
    options: StreamAiMarkdownOptions
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = '';
    let streamError: Error | null = null;
    let thinkingDone = false;
    const thinkingParts = new Map<string, string>();

    const emitThinkingDelta = (partKey: string, delta: string) => {
        if (!delta) return;
        const previous = thinkingParts.get(partKey);
        thinkingParts.set(partKey, `${previous || ''}${delta}`);
        options.onThinkingDelta?.(`${previous === undefined && thinkingParts.size > 1 ? '\n\n' : ''}${delta}`);
    };

    const completeThinkingPart = (partKey: string, text: unknown) => {
        if (typeof text !== 'string' || !text) return;
        const streamed = thinkingParts.get(partKey) || '';
        if (!streamed) {
            emitThinkingDelta(partKey, text);
        } else if (text.startsWith(streamed) && text.length > streamed.length) {
            emitThinkingDelta(partKey, text.slice(streamed.length));
        }
    };

    const finishThinking = () => {
        if (thinkingDone) return;
        thinkingDone = true;
        options.onThinkingDone?.();
    };

    const handleEvent = (raw: string) => {
        const data = raw
            .split(/\r\n|\r|\n/)
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim())
            .join('\n');

        if (!data) return;
        if (data === '[DONE]') {
            finishThinking();
            return;
        }

        try {
            const event = JSON.parse(data);
            const choiceDelta = event.choices?.[0]?.delta;

            if (
                (event.type === 'response.reasoning_summary_text.delta'
                    || event.type === 'response.reasoning_text.delta')
                && typeof event.delta === 'string'
            ) {
                const partType = event.type === 'response.reasoning_summary_text.delta' ? 'summary' : 'content';
                const partIndex = partType === 'summary' ? event.summary_index : event.content_index;
                emitThinkingDelta(`${event.item_id || 'response'}:${partType}:${partIndex ?? 0}`, event.delta);
                return;
            }

            if (event.type === 'response.reasoning_summary_text.done' || event.type === 'response.reasoning_text.done') {
                const partType = event.type === 'response.reasoning_summary_text.done' ? 'summary' : 'content';
                const partIndex = partType === 'summary' ? event.summary_index : event.content_index;
                completeThinkingPart(`${event.item_id || 'response'}:${partType}:${partIndex ?? 0}`, event.text);
                return;
            }

            if (event.type === 'response.output_item.done' && event.item?.type === 'reasoning') {
                const itemId = event.item.id || event.item_id || 'response';
                if (Array.isArray(event.item.summary) && event.item.summary.length > 0) {
                    event.item.summary.forEach((part: any, index: number) => {
                        completeThinkingPart(`${itemId}:summary:${index}`, part?.text);
                    });
                } else if (Array.isArray(event.item.content)) {
                    event.item.content.forEach((part: any, index: number) => {
                        completeThinkingPart(`${itemId}:content:${index}`, part?.text);
                    });
                }
                finishThinking();
                return;
            }

            if (event.type === 'response.completed') {
                const completedText = getCompletedText(event.response);
                let missingText = '';
                if (completedText) {
                    missingText = completedText.startsWith(result) ? completedText.slice(result.length) : '';
                    result = completedText;
                }
                finishThinking();
                if (missingText) options.onDelta(missingText);
                return;
            }

            // OpenAI Responses API format
            if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
                finishThinking();
                result += event.delta;
                options.onDelta(event.delta);
                return;
            }

            if (typeof choiceDelta?.reasoning_content === 'string' && choiceDelta.reasoning_content) {
                emitThinkingDelta('chat:reasoning:0', choiceDelta.reasoning_content);
            }

            if (typeof choiceDelta?.content === 'string' && choiceDelta.content) {
                finishThinking();
                result += choiceDelta.content;
                options.onDelta(choiceDelta.content);
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

        const parts = buffer.split(/(?:\r\n|\r|\n){2}/);
        buffer = parts.pop() || '';
        parts.forEach(handleEvent);
        if (streamError) throw streamError;
    }

    if (buffer) handleEvent(buffer);
    finishThinking();
    if (streamError) throw streamError;
    return cleanAiMarkdown(result);
}
