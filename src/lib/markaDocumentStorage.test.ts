import { beforeEach, describe, expect, it } from 'vitest';
import {
    LEGACY_CONTENT_STORAGE_KEY,
    LEGACY_DOCUMENT_MODE_STORAGE_KEY,
    MARKA_DOCUMENT_STORAGE_KEY,
    loadMarkaDocument,
    saveMarkaDocument,
} from './markaDocumentStorage';
import { createHtmlDocument, createMarkdownDocument } from './markaDocument';

describe('MarkaDocument storage', () => {
    beforeEach(() => localStorage.clear());

    it('round-trips the formal v2 document envelope', () => {
        const document = createHtmlDocument('<section>保真</section>');
        saveMarkaDocument(localStorage, document);

        expect(loadMarkaDocument(localStorage, '# fallback')).toEqual(document);
        expect(JSON.parse(localStorage.getItem(MARKA_DOCUMENT_STORAGE_KEY) ?? '')).toEqual({
            version: 2,
            document,
        });
    });

    it('migrates the v1 wechat-html discriminator', () => {
        localStorage.setItem(MARKA_DOCUMENT_STORAGE_KEY, JSON.stringify({
            version: 1,
            document: { kind: 'wechat-html', source: '<section>v1</section>' },
        }));

        expect(loadMarkaDocument(localStorage, '# fallback')).toEqual(
            createHtmlDocument('<section>v1</section>'),
        );
    });

    it('migrates the legacy content and mode pair once', () => {
        localStorage.setItem(LEGACY_CONTENT_STORAGE_KEY, '<section>旧 HTML</section>');
        localStorage.setItem(LEGACY_DOCUMENT_MODE_STORAGE_KEY, 'html');

        const document = loadMarkaDocument(localStorage, '# fallback');
        expect(document).toEqual(createHtmlDocument('<section>旧 HTML</section>'));

        saveMarkaDocument(localStorage, document);
        expect(localStorage.getItem(LEGACY_CONTENT_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem(LEGACY_DOCUMENT_MODE_STORAGE_KEY)).toBeNull();
    });

    it('falls back to Markdown when stored data is invalid', () => {
        localStorage.setItem(MARKA_DOCUMENT_STORAGE_KEY, '{"version":2,"document":{"kind":"unknown"}}');
        expect(loadMarkaDocument(localStorage, '# fallback')).toEqual(createMarkdownDocument('# fallback'));
    });
});
