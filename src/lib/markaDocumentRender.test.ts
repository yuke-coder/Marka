import { describe, expect, it } from 'vitest';
import { createHtmlDocument, createMarkdownDocument } from './markaDocument';
import {
    buildMarkaClipboardPayload,
    getMarkaDocumentExportHtml,
    renderMarkaDocumentPreview,
} from './markaDocumentRender';

describe('MarkaDocument render pipeline', () => {
    it('renders Markdown through the themed and indexed preview pipeline', () => {
        const html = renderMarkaDocumentPreview(createMarkdownDocument('# 标题'), 'mac-white');
        expect(html).toContain('标题');
        expect(html).toContain('data-md-type');
    });

    it('renders HTML through the isolated sanitizer without applying Markdown themes', () => {
        const html = renderMarkaDocumentPreview(
            createHtmlDocument('<section style="color:red">保真<script>alert(1)</script></section>'),
            'mac-white',
        );
        expect(html).toContain('<section style="color:red">保真</section>');
        expect(html).not.toContain('script');
        expect(html).not.toContain('data-md-type');
    });

    it('renders R-Markdown components through the compatibility layer without exposing component source', () => {
        const source = [
            '<p-title num="01" title="组件演示" level="1"></p-title>',
            '<steps title="流程">',
            '- 输入 | 内容',
            '</steps>',
        ].join('\n');

        const html = renderMarkaDocumentPreview(createMarkdownDocument(source), 'mac-white');

        expect(html).toContain('data-rmarkdown-component="p-title"');
        expect(html).toContain('data-rmarkdown-component="steps"');
        expect(html).toContain('组件演示');
        expect(html).toContain('输入');
        expect(html).not.toContain('<p-title');
        expect(html).not.toContain('<steps');
        expect(source).toContain('<p-title');
        expect(source).toContain('<steps');
    });

    it('does not let the generic image enhancer rewrite R-Markdown image layouts', () => {
        const html = renderMarkaDocumentPreview(createMarkdownDocument(
            '<img src="https://example.com/banner.webp" width="100%" height="120px" radius="8px" fit="cover" />',
        ), 'mac-white');

        const document = new DOMParser().parseFromString(html, 'text/html');
        const image = document.querySelector('[data-rmarkdown-component="img"] img');
        expect(image?.getAttribute('style')).toContain('height:120px');
        expect(image?.getAttribute('style')).not.toContain('border:1px');
    });

    it('exports HTML unchanged and removes Markdown locator markers', () => {
        expect(getMarkaDocumentExportHtml(createHtmlDocument(''), '<section>HTML</section>')).toBe(
            '<section>HTML</section>',
        );
        expect(getMarkaDocumentExportHtml(
            createMarkdownDocument(''),
            '<p data-md-type="paragraph" data-md-index="0">Markdown</p>',
        )).toBe('<p>Markdown</p>');
    });

    it('builds a sanitized HTML clipboard payload for a native HTML document', async () => {
        const payload = await buildMarkaClipboardPayload(
            createHtmlDocument('<p>保真</p>'),
            '<p>保真</p>',
            'mac-white',
        );
        expect(payload).toEqual({ html: '<p>保真</p>', plainText: '保真' });
    });
});
