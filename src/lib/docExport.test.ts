import { describe, expect, it } from 'vitest';
import { buildDocHtml } from './docExport';

describe('Word export', () => {
    it('uses the already-rendered HTML instead of rendering Markdown a second time', () => {
        const renderedHtml = '<section data-rmarkdown-component="steps"><strong>步骤内容</strong></section>';
        const document = buildDocHtml(renderedHtml, '示例.doc');

        expect(document).toContain(renderedHtml);
        expect(document).toContain('<title>示例</title>');
    });
});
