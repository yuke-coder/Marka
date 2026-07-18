import { describe, expect, it } from 'vitest';
import {
    applyMarkdownResult,
    createHtmlDocument,
    createMarkdownDocument,
    getMarkaDocumentDefinition,
    getMarkdownSource,
    insertDocumentFragment,
    isHtmlDocument,
    isMarkdownDocument,
    updateDocumentSource,
} from './markaDocument';

describe('MarkaDocument', () => {
    it('models Markdown and HTML as distinct immutable document types', () => {
        const markdown = createMarkdownDocument('# old');
        const html = createHtmlDocument('<p>old</p>');

        expect(isMarkdownDocument(markdown)).toBe(true);
        expect(isHtmlDocument(html)).toBe(true);
        expect(updateDocumentSource(markdown, '# new')).toEqual({ kind: 'markdown', source: '# new' });
        expect(updateDocumentSource(html, '<p>new</p>')).toEqual({ kind: 'html', source: '<p>new</p>' });
        expect(getMarkdownSource(markdown)).toBe('# old');
        expect(getMarkdownSource(html)).toBe('');
    });

    it('defines capabilities and file metadata centrally for both document kinds', () => {
        expect(getMarkaDocumentDefinition('markdown')).toMatchObject({
            label: 'Markdown',
            fileExtension: '.md',
            previewMode: 'themed',
            capabilities: {
                themes: true,
                smartPaste: true,
                scrollSync: true,
                sourceLocation: true,
                wordExport: true,
                pdfExport: true,
                htmlExport: true,
                pngExport: true,
            },
        });
        expect(getMarkaDocumentDefinition('html')).toMatchObject({
            label: 'HTML',
            fileExtension: '.html',
            previewMode: 'isolated',
            capabilities: {
                themes: false,
                smartPaste: false,
                scrollSync: true,
                sourceLocation: false,
                wordExport: false,
                pdfExport: false,
                htmlExport: true,
                pngExport: false,
            },
        });
    });

    it('inserts a native fragment selected by the document kind', () => {
        const fragment = {
            markdown: '![cover](data:image/png;base64,abc)',
            html: '<img src="data:image/png;base64,abc" alt="cover">',
        };

        expect(insertDocumentFragment(createMarkdownDocument('# Title'), fragment).document).toEqual({
            kind: 'markdown',
            source: '# Title\n\n![cover](data:image/png;base64,abc)',
        });
        expect(insertDocumentFragment(
            createHtmlDocument('<section></section>'),
            fragment,
            { start: 9, end: 9 },
        )).toEqual({
            document: {
                kind: 'html',
                source: '<section><img src="data:image/png;base64,abc" alt="cover"></section>',
            },
            cursor: 58,
        });
    });

    it('applies AI Markdown without ever creating a mixed HTML/Markdown document', () => {
        const htmlResult = applyMarkdownResult(
            createHtmlDocument('<section>HTML</section>'),
            '# AI Markdown',
            'append',
        );
        expect(htmlResult).toEqual({
            document: createMarkdownDocument('# AI Markdown'),
            effectiveMode: 'replace',
            cursor: null,
        });

        const markdownResult = applyMarkdownResult(
            createMarkdownDocument('Before After'),
            '**middle**',
            'insert',
            { start: 7, end: 7 },
        );
        expect(markdownResult).toEqual({
            document: createMarkdownDocument('Before **middle**After'),
            effectiveMode: 'insert',
            cursor: 17,
        });
    });
});
