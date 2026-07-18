import { describe, expect, it } from 'vitest';
import { readFile } from './fileImport';

describe('readFile', () => {
    it('imports .html as HTML source without converting it to Markdown', async () => {
        const source = '<section style="color:#059669"><span leaf="">保真排版</span></section>';
        const result = await readFile(new File([source], 'skill-output.html', { type: 'text/html' }));

        expect(result).toEqual({
            kind: 'html',
            content: source,
            filename: 'skill-output.html',
        });
    });

    it('imports .htm case-insensitively', async () => {
        const result = await readFile(new File(['<p>HTML</p>'], 'ARTICLE.HTM', { type: 'text/html' }));
        expect(result.kind).toBe('html');
    });

    it('creates native image source for both first-class document kinds', async () => {
        const result = await readFile(new File(['image'], 'cover"&.png', { type: 'image/png' }));

        expect(result.kind).toBe('image');
        if (result.kind !== 'image') return;
        expect(result.markdown).toMatch(/^!\[cover"&\.png\]\(data:image\/png;base64,/);
        expect(result.html).toMatch(/^<img src="data:image\/png;base64,/);
        expect(result.html).toContain('alt="cover&quot;&amp;.png"');
    });
});
