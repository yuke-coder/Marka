import { describe, expect, it } from 'vitest';
import {
    detectClipboardDocumentImport,
    isHtmlSource,
} from './clipboardImport';

function clipboardData(
    values: Partial<Record<'text/plain' | 'text/html', string>>,
    files: File[] = [],
) {
    return {
        getData: (type: string) => values[type as keyof typeof values] ?? '',
        files,
        items: [],
    } as unknown as DataTransfer;
}

describe('HTML clipboard import detection', () => {
    it('recognizes explicit HTML documents and fragments in plain text', () => {
        expect(isHtmlSource('<!doctype html><html><body>Article</body></html>')).toBe(true);
        expect(isHtmlSource('<section style="color:red"><span>Article</span></section>')).toBe(true);
        expect(isHtmlSource('1 < 2 and 3 > 2')).toBe(false);
        expect(isHtmlSource('Use <strong>bold</strong> here')).toBe(false);
    });

    it('prefers a pasted .html file over clipboard strings', () => {
        const file = new File(['<p>file</p>'], 'article.HTML', { type: 'text/html' });
        expect(detectClipboardDocumentImport(clipboardData(
            { 'text/plain': '<p>string</p>' },
            [file],
        ))).toEqual({ kind: 'html-file', file });
    });

    it('recognizes raw HTML source copied as plain text', () => {
        const source = '<section><strong>HTML source</strong></section>';
        expect(detectClipboardDocumentImport(clipboardData({ 'text/plain': source }))).toEqual({
            kind: 'html-source',
            source,
            detectedFrom: 'plain-source',
        });
    });

    it('recognizes signed Skill rich HTML without hijacking ordinary rich text', () => {
        const skillHtml = '<section><span leaf="">Skill HTML</span></section>';
        expect(detectClipboardDocumentImport(clipboardData({
            'text/plain': 'Skill HTML',
            'text/html': skillHtml,
        }))).toEqual({
            kind: 'html-source',
            source: skillHtml,
            detectedFrom: 'rich-signature',
        });

        expect(detectClipboardDocumentImport(clipboardData({
            'text/plain': '普通富文本',
            'text/html': '<p><strong>普通富文本</strong></p>',
        }))).toBeNull();

        expect(detectClipboardDocumentImport(clipboardData({
            'text/plain': '公众号排版',
            'text/html': '<section data-mpa-powered-by="yiban.io">公众号排版</section>',
        }))).toMatchObject({
            kind: 'html-source',
            detectedFrom: 'rich-signature',
        });
    });
});
