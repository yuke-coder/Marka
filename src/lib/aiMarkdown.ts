export type AiMarkdownMode = 'format' | 'rewrite';
export type AiApplyMode = 'replace' | 'insert' | 'append';
export type AiMarkdownTask = 'generate' | 'revise' | 'continue';

export interface AiMarkdownRequest {
    mode: AiMarkdownMode;
    task: AiMarkdownTask;
    sourceText: string;
    extraInstruction: string;
}

export function cleanAiMarkdown(markdown: string): string {
    let next = markdown.trim();
    const fence = next.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
    if (fence) next = fence[1].trim();
    return next;
}

export async function streamAiMarkdown(
    payload: AiMarkdownRequest,
    options: {
        signal?: AbortSignal;
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = '';

    const handleEvent = (raw: string) => {
        const data = raw
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim())
            .join('\n');

        if (!data || data === '[DONE]') return;

        try {
            const event = JSON.parse(data);
            if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
                result += event.delta;
                options.onDelta(event.delta);
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
    }

    if (buffer) handleEvent(buffer);
    return cleanAiMarkdown(result);
}
