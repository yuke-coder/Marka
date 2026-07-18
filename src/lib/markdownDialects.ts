import { hasCustomMarkdownComponents } from './customMarkdownComponents';
import { renderRMarkdown } from './rMarkdownCompat';
import { detectRMarkdown } from './rMarkdownDialect';

export interface MarkdownDialect {
    /** Stable identifier used in renderer variants and diagnostics. */
    readonly id: string;
    /** User-facing name for import and preview messaging. */
    readonly label: string;
    /** Returns true only when the source belongs to this custom Markdown dialect. */
    readonly matches: (source: string) => boolean;
    /** Converts the dialect extensions, delegating ordinary Markdown unchanged. */
    readonly render: (source: string, renderMarkdown: (source: string) => string) => string;
}

const R_MARKDOWN_DIALECT: MarkdownDialect = {
    id: 'r-markdown',
    label: 'R-Markdown',
    matches: (source) => detectRMarkdown(source).detected,
    render: (source, renderMarkdown) => renderRMarkdown(source, { renderMarkdown }),
};

const CUSTOM_COMPONENT_DIALECT: MarkdownDialect = {
    id: 'custom-components',
    label: '自定义组件 Markdown',
    matches: hasCustomMarkdownComponents,
    // Known R-Markdown components keep their dedicated rendering. Other
    // component-shaped tags use its neutral fallback renderer.
    render: (source, renderMarkdown) => renderRMarkdown(source, { renderMarkdown }),
};

/**
 * Marka's custom Markdown rulebook. A new syntax family is added here as one
 * self-contained dialect, without changing the standard Markdown pipeline.
 */
export const MARKDOWN_DIALECTS: readonly MarkdownDialect[] = [
    R_MARKDOWN_DIALECT,
    CUSTOM_COMPONENT_DIALECT,
];

export function findMarkdownDialect(source: string): MarkdownDialect | undefined {
    return MARKDOWN_DIALECTS.find((dialect) => dialect.matches(source));
}
