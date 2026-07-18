import { describe, expect, it } from 'vitest';
import { renderRMarkdown } from './rMarkdownCompat';

const options = {
    renderMarkdown: (source: string) => `<markdown>${source}</markdown>`,
};

describe('R-Markdown compatibility renderer', () => {
    it('renders the public title, image, and inline extensions without keeping their source tags', () => {
        const html = renderRMarkdown([
            '<title type="DA02" badge="GUIDE" subtitle="简介" chips="图片|卡片">功能全集</title>',
            '<p-title num="01" title="图片增强" level="1"></p-title>',
            '![限高图](https://example.com/image.webp)[100% 250px]',
            '< ![图1](https://example.com/1.webp), ![图2](https://example.com/2.webp) >',
            '<slider images="https://example.com/1.webp,https://example.com/2.webp" height="200px"></slider>',
            '<img src="https://example.com/3.webp" width="100%" height="120px" fit="cover" />',
            '==渐变== !!胶囊!! ^^强调^^ ::柔光:: $E=mc^2$',
        ].join('\n'), options);

        expect(html).toContain('data-rmarkdown-component="title"');
        expect(html).toContain('data-rmarkdown-component="p-title"');
        expect(html).toContain('data-rmarkdown-component="sized-image"');
        expect(html).toContain('data-rmarkdown-component="image-row"');
        expect(html).toContain('data-rmarkdown-component="slider"');
        expect(html).toContain('data-rmarkdown-component="img"');
        expect(html).toContain('data-rmarkdown-inline="gradient"');
        expect(html).toContain('data-rmarkdown-inline="math"');
        expect(html).not.toContain('<p-title');
        expect(html).not.toContain('<slider');
    });

    it('renders the public card, flow, layout, and ending components', () => {
        const html = renderRMarkdown([
            '<breaking badge="NEW" title="上线">摘要</breaking>',
            '<steps title="流程" active="2">',
            '- 输入 | 内容',
            '- 输出 | 结果',
            '</steps>',
            '<case-flow>',
            '- [案例 01] 优化体验',
            '</case-flow>',
            '<compare left-title="过去" right-title="未来">',
            '<left>左侧内容</left>',
            '<right>右侧内容</right>',
            '</compare>',
            '<cta label="START" title="开始" button="立即使用"></cta>',
            '<timeline>',
            '- 2024年01月 | 启动 | 完成准备',
            '</timeline>',
            '<badges tone="green">React|Vite</badges>',
            '<statement>重要结论</statement>',
            '<lead>引导文字</lead>',
            '<engage title="感谢阅读" subtitle="欢迎互动"></engage>',
        ].join('\n'), options);

        for (const component of [
            'breaking', 'steps', 'case-flow', 'compare', 'cta', 'timeline',
            'badges', 'statement', 'lead', 'engage',
        ]) {
            expect(html).toContain(`data-rmarkdown-component="${component}"`);
        }
        expect(html).toContain('左侧内容');
        expect(html).toContain('2024年01月');
    });

    it('keeps component-looking text in fenced code blocks as ordinary Markdown', () => {
        const html = renderRMarkdown('```html\n<steps>example</steps>\n```', options);
        expect(html).toContain('<markdown>```html');
        expect(html).toContain('<steps>example</steps>');
        expect(html).not.toContain('data-rmarkdown-component="steps"');
    });
});
