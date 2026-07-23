import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

const thinkingMarkdown = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: false,
});

thinkingMarkdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
    tokens[index].attrSet('target', '_blank');
    tokens[index].attrSet('rel', 'noopener noreferrer');
    return renderer.renderToken(tokens, index, options);
};

export function renderThinkingMarkdown(source: string): string {
    return DOMPurify.sanitize(thinkingMarkdown.render(source));
}
