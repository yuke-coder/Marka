const STANDARD_HTML_TAGS = new Set([
    'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'blockquote', 'body',
    'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data',
    'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em',
    'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
    'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img',
    'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'mark', 'menu',
    'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output',
    'p', 'picture', 'pre', 'progress', 'q', 's', 'samp', 'script', 'section', 'select',
    'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'svg',
    'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr',
    'track', 'u', 'ul', 'var', 'video', 'wbr',
]);

function isFence(line: string): boolean {
    return /^\s*(?:`{3,}|~{3,})/.test(line);
}

export function isCustomMarkdownComponentTag(tag: string): boolean {
    const normalized = tag.toLowerCase();
    return normalized.includes('-') || !STANDARD_HTML_TAGS.has(normalized);
}

/**
 * Finds HTML-like blocks that are not standard HTML. This deliberately does
 * not claim to understand every custom Markdown syntax; it is the safe default
 * for component-shaped extensions such as <notice-box> or <steps>.
 */
export function hasCustomMarkdownComponents(source: string): boolean {
    let insideFence = false;

    for (const line of source.split(/\r?\n/)) {
        if (isFence(line)) {
            insideFence = !insideFence;
            continue;
        }
        if (insideFence) continue;

        for (const match of line.matchAll(/<([a-z][\w-]*)\b[^>]*>/gi)) {
            if (isCustomMarkdownComponentTag(match[1])) return true;
        }
    }

    return false;
}
