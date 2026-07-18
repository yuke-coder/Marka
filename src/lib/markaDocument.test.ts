import { describe, expect, it } from 'vitest';
import {
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

    it('defines immutable file metadata centrally for both document kinds', () => {
        expect(getMarkaDocumentDefinition('markdown')).toMatchObject({
            label: 'Markdown',
            fileExtension: '.md',
            mimeType: 'text/markdown;charset=utf-8',
            editorPlaceholder: '在这里输入 Markdown 内容...',
        });
        expect(getMarkaDocumentDefinition('html')).toMatchObject({
            label: 'HTML',
            fileExtension: '.html',
            mimeType: 'text/html;charset=utf-8',
            editorPlaceholder: '在这里编辑 HTML 源码...',
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

});
