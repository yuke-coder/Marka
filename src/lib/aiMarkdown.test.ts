import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAiMarkdown, type AiMarkdownRequest } from './aiMarkdown';

const request: AiMarkdownRequest = {
    presetId: 'rmarkdown',
    model: 'auto',
    reasoningEffort: 'low',
    speed: 'standard',
    sourceText: '测试内容',
};

function createChunkedEventStream(events: string[]): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(events.join(''));
    const chunkSizes = [1, 2, 7, 3, 11, 5];

    return new ReadableStream({
        start(controller) {
            let offset = 0;
            let chunkIndex = 0;
            while (offset < bytes.length) {
                const nextOffset = Math.min(bytes.length, offset + chunkSizes[chunkIndex % chunkSizes.length]);
                controller.enqueue(bytes.slice(offset, nextOffset));
                offset = nextOffset;
                chunkIndex += 1;
            }
            controller.close();
        },
    });
}

describe('streamAiMarkdown', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('forwards backend deltas unchanged across arbitrary byte chunks and CRLF event boundaries', async () => {
        const reasoning = '先检查结构。';
        const answerChunks = ['甲乙丙', '丁戊己'];
        const events = [
            `data: ${JSON.stringify({ type: 'response.reasoning_summary_text.delta', item_id: 'rs-test', summary_index: 0, delta: reasoning })}\r\n\r\n`,
            `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: answerChunks[0] })}\r\n\r\n`,
            `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: answerChunks[1] })}\r\n\r\n`,
            'data: [DONE]\r\n\r\n',
        ];
        const order: string[] = [];
        const onDelta = vi.fn((delta: string) => order.push(`delta:${delta}`));
        const onThinkingDelta = vi.fn();
        const onThinkingDone = vi.fn(() => order.push('thinking-done'));
        const selectedRequest: AiMarkdownRequest = { ...request, presetId: 'standard-markdown' };

        const fetchMock = vi.fn(async () => new Response(createChunkedEventStream(events), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await streamAiMarkdown(selectedRequest, {
            onDelta,
            onThinkingDelta,
            onThinkingDone,
        });

        expect(onThinkingDelta).toHaveBeenCalledTimes(1);
        expect(onThinkingDelta).toHaveBeenCalledWith(reasoning);
        expect(onThinkingDone).toHaveBeenCalledTimes(1);
        expect(onDelta.mock.calls).toEqual(answerChunks.map(chunk => [chunk]));
        expect(order).toEqual(['thinking-done', ...answerChunks.map(chunk => `delta:${chunk}`)]);
        const requestInit = (fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>)[0]?.[1];
        const requestBody = JSON.parse(requestInit?.body as string);
        expect(requestBody).toMatchObject({
            presetId: selectedRequest.presetId,
        });
        expect(requestBody).not.toHaveProperty('extraInstruction');
        expect(result).toBe(answerChunks.join(''));
    });

    it('reconciles the final text from response.completed', async () => {
        const events = [
            `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '甲乙' })}\n\n`,
            `data: ${JSON.stringify({
                type: 'response.completed',
                response: {
                    output: [{ type: 'message', content: [{ type: 'output_text', text: '甲乙丙' }] }],
                },
            })}\n\n`,
            'data: [DONE]\n\n',
        ];
        const onDelta = vi.fn();

        vi.stubGlobal('fetch', vi.fn(async () => new Response(createChunkedEventStream(events), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
        })));

        const result = await streamAiMarkdown(request, { onDelta });

        expect(onDelta.mock.calls).toEqual([['甲乙'], ['丙']]);
        expect(result).toBe('甲乙丙');
    });
});
