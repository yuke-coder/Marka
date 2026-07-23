import { describe, expect, it } from 'vitest';
import { renderThinkingMarkdown } from './thinkingMarkdown';

describe('renderThinkingMarkdown', () => {
    it('renders Markdown structure instead of exposing its source markers', () => {
        const html = renderThinkingMarkdown('## 分析\n\n- **结构**\n- `节奏`');

        expect(html).toContain('<h2>分析</h2>');
        expect(html).toContain('<strong>结构</strong>');
        expect(html).toContain('<code>节奏</code>');
        expect(html).not.toContain('**');
    });

    it('does not execute raw HTML from model reasoning', () => {
        const html = renderThinkingMarkdown('<script>window.pwned = true</script><b>文本</b>');

        expect(html).not.toContain('<script');
        expect(html).not.toContain('<b>');
        expect(html).toContain('&lt;b&gt;文本&lt;/b&gt;');
    });
});
