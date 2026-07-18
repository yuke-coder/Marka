import { describe, expect, it } from 'vitest';
import { readClipboardContent, type ClipboardReader } from './clipboard';

function clipboardReader(values: Record<string, string>) {
    return {
        read: async () => [{
            types: Object.keys(values),
            presentationStyle: 'unspecified' as const,
            getType: async (type: string) => new Blob([values[type] ?? ''], { type }),
        }],
        readText: async () => values['text/plain'] ?? '',
    } as ClipboardReader;
}

describe('Clipboard content reader', () => {
    it('preserves plain text and rich HTML together for document detection', async () => {
        await expect(readClipboardContent(clipboardReader({
            'text/plain': 'Skill HTML',
            'text/html': '<section><span leaf="">Skill HTML</span></section>',
        }))).resolves.toEqual({
            text: 'Skill HTML',
            html: '<section><span leaf="">Skill HTML</span></section>',
        });
    });

    it('falls back to plain text when rich ClipboardItem access is unavailable', async () => {
        const reader = {
            read: async () => {
                throw new Error('denied');
            },
            readText: async () => 'fallback text',
        } as ClipboardReader;

        await expect(readClipboardContent(reader)).resolves.toEqual({
            text: 'fallback text',
            html: null,
        });
    });
});
