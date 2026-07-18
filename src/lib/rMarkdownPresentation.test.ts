import { describe, expect, it } from 'vitest';
import { presentRMarkdownDocument } from './rMarkdownPresentation';

describe('R-Markdown presentation', () => {
    it('keeps the original editor visual treatment without owning canvas sizing', () => {
        const html = presentRMarkdownDocument('<title type="DA02">示例</title>', '<section>示例</section>');

        expect(html).toContain('width:100%;margin:0');
        expect(html).not.toContain('max-width:700px');
        expect(html).toContain('font-size:15px;line-height:1.8');
        expect(html).not.toContain('container-type');
        expect(html).not.toContain('cqw');
    });

    it('keeps document-specific rules visual rather than responsive', () => {
        const html = presentRMarkdownDocument('', '<section>示例</section>');

        expect(html).toContain('[data-rmarkdown-document] p{margin:18px 0;line-height:1.75;color:inherit}');
        expect(html).not.toContain('auto-fit');
    });
});
