import { describe, expect, it } from 'vitest';
import { detectRMarkdown } from './rMarkdownDialect';

describe('R-Markdown dialect detection', () => {
    it('recognizes the proprietary components used by the downloadable example', () => {
        const result = detectRMarkdown([
            '<p-title num="01" title="图片增强特性" level="1"></p-title>',
            '<steps title="安装好之后怎么跑起来">',
            '- 输入 | 往知识库里喂东西',
            '</steps>',
            '![限高图](https://example.com/image.webp)[100% 250px]',
        ].join('\n'));

        expect(result.detected).toBe(true);
        expect(result.features).toEqual(expect.arrayContaining([
            { kind: 'component', name: 'p-title', line: 1 },
            { kind: 'component', name: 'steps', line: 2 },
            { kind: 'image-layout', name: 'sized-image', line: 5 },
        ]));
    });

    it('recognizes every public proprietary component tag', () => {
        const tags = [
            'p-title', 'slider', 'breaking', 'steps', 'case-flow', 'compare',
            'cta', 'timeline', 'badges', 'statement', 'lead', 'engage', 'reading-path',
        ];

        for (const tag of tags) {
            expect(detectRMarkdown(`<${tag}></${tag}>`).detected, tag).toBe(true);
        }
    });

    it('does not misclassify ordinary Markdown, generic title tags, or one weak style marker', () => {
        expect(detectRMarkdown('# Normal\n\nA regular paragraph.').detected).toBe(false);
        expect(detectRMarkdown('<title>Normal HTML title</title>').detected).toBe(false);
        expect(detectRMarkdown('这是一个 ==普通等式== 的说明。').detected).toBe(false);
    });

    it('ignores component-looking text inside fenced code blocks', () => {
        expect(detectRMarkdown('```html\n<steps>not a component</steps>\n```').detected).toBe(false);
    });
});
