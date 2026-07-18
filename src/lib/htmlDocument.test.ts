import { describe, expect, it } from 'vitest';
import { htmlToPlainText, sanitizeImportedHtml } from './htmlDocument';

describe('sanitizeImportedHtml', () => {
    it('preserves Skill structure, inline styles and leaf attributes', () => {
        const source = '<section style="display:flex;color:#059669"><span leaf="">正文</span></section>';
        const clean = sanitizeImportedHtml(source);

        expect(clean).toContain('<section style="display:flex;color:#059669">');
        expect(clean).toContain('<span leaf="">正文</span>');
    });

    it('removes executable content and unsafe URL handlers', () => {
        const clean = sanitizeImportedHtml(
            '<section onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">链接</a></section>',
        );

        expect(clean).not.toContain('<script');
        expect(clean).not.toContain('onclick');
        expect(clean).not.toContain('javascript:');
        expect(clean).toContain('链接');
    });
});

describe('htmlToPlainText', () => {
    it('extracts a clipboard plain-text fallback', () => {
        expect(htmlToPlainText('<section><p>第一段</p><p>第二段</p></section>')).toContain('第一段');
        expect(htmlToPlainText('<section><p>第一段</p><p>第二段</p></section>')).toContain('第二段');
    });
});
