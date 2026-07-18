import { describe, expect, it } from 'vitest';
import { findMarkdownDialect, MARKDOWN_DIALECTS } from './markdownDialects';

describe('Markdown dialect rulebook', () => {
    it('keeps ordinary Markdown on Marka’s standard rendering path', () => {
        expect(findMarkdownDialect('# 普通标题\n\n正文')).toBeUndefined();
    });

    it('selects the R-Markdown rule set for its custom components', () => {
        const dialect = findMarkdownDialect('<steps title="流程">\n- 输入 | 内容\n</steps>');

        expect(dialect?.id).toBe('r-markdown');
        expect(dialect?.render('<badges tone="green">React|Vite</badges>', (source) => `<markdown>${source}</markdown>`))
            .toContain('data-rmarkdown-component="badges"');
    });

    it('keeps each custom syntax family explicitly registered', () => {
        expect(MARKDOWN_DIALECTS.map((dialect) => dialect.id)).toEqual([
            'r-markdown',
            'custom-components',
        ]);
    });

    it('selects the neutral component path for an unregistered custom tag', () => {
        const dialect = findMarkdownDialect('<notice-box title="提醒">\n这里是内容。\n</notice-box>');

        expect(dialect?.id).toBe('custom-components');
        expect(dialect?.render(
            '<notice-box title="提醒">\n这里是内容。\n</notice-box>',
            (source) => `<markdown>${source}</markdown>`,
        )).toContain('data-custom-markdown-component="notice-box"');
    });
});
