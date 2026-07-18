/**
 * The public R-Markdown component vocabulary supported by Marka.
 * Detection and rendering intentionally consume this same list so a new tag
 * cannot be recognized without also declaring how it is parsed.
 */
export const R_MARKDOWN_BLOCK_COMPONENTS = [
    'breaking',
    'steps',
    'case-flow',
    'compare',
    'timeline',
    'badges',
    'statement',
    'lead',
    'reading-path',
] as const;

export const R_MARKDOWN_SELF_CLOSING_COMPONENTS = [
    'title',
    'p-title',
    'slider',
    'img',
    'cta',
    'engage',
] as const;

export type RMarkdownBlockComponent = typeof R_MARKDOWN_BLOCK_COMPONENTS[number];
export type RMarkdownSelfClosingComponent = typeof R_MARKDOWN_SELF_CLOSING_COMPONENTS[number];
export type RMarkdownComponent = RMarkdownBlockComponent | RMarkdownSelfClosingComponent;

export const R_MARKDOWN_COMPONENT_TAGS: ReadonlySet<string> = new Set([
    ...R_MARKDOWN_BLOCK_COMPONENTS,
    ...R_MARKDOWN_SELF_CLOSING_COMPONENTS,
]);

export function isRMarkdownBlockComponent(tag: string): tag is RMarkdownBlockComponent {
    return (R_MARKDOWN_BLOCK_COMPONENTS as readonly string[]).includes(tag);
}

export function isRMarkdownSelfClosingComponent(tag: string): tag is RMarkdownSelfClosingComponent {
    return (R_MARKDOWN_SELF_CLOSING_COMPONENTS as readonly string[]).includes(tag);
}
