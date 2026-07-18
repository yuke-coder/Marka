import { getExt } from './fileImport';

export type ClipboardDocumentImport =
    | {
        readonly kind: 'html-file';
        readonly file: File;
    }
    | {
        readonly kind: 'html-source';
        readonly source: string;
        readonly detectedFrom: 'plain-source' | 'rich-signature';
    };

export type ClipboardHtmlSourceImport = Extract<ClipboardDocumentImport, {
    readonly kind: 'html-source';
}>;

type ClipboardData = Pick<DataTransfer, 'getData' | 'files' | 'items'>;

const FULL_HTML_DOCUMENT_RE = /(?:<!doctype\s+html|<html(?:\s|>))/i;
const HTML_FIDELITY_SIGNATURE_RE = /(?:\sleaf(?:\s|=|>)|data-marka-document\s*=\s*["']html["']|data-mpa-(?:powered-by|template)|mp-style-type)/i;
const HTML_TAG_RE = /<\/?([a-z][\w:-]*)\b[^>]*>/gi;
const HTML_SOURCE_TAGS = new Set([
    'a', 'article', 'aside', 'b', 'blockquote', 'body', 'br', 'button', 'caption', 'code',
    'col', 'colgroup', 'dd', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
    'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html',
    'i', 'iframe', 'img', 'input', 'label', 'li', 'link', 'main', 'meta', 'nav', 'ol',
    'option', 'p', 'picture', 'pre', 'script', 'section', 'select', 'small', 'source',
    'span', 'strong', 'style', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot',
    'th', 'thead', 'time', 'title', 'tr', 'u', 'ul', 'video',
]);

function getClipboardFiles(clipboardData: ClipboardData): File[] {
    const itemFiles = Array.from(clipboardData.items || [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
    const directFiles = Array.from(clipboardData.files || []);
    return Array.from(new Set([...itemFiles, ...directFiles]));
}

function isHtmlFile(file: File): boolean {
    return ['html', 'htm'].includes(getExt(file.name));
}

export function isHtmlSource(text: string): boolean {
    const source = text.trim();
    if (!source || !source.startsWith('<') || !source.endsWith('>')) return false;
    if (FULL_HTML_DOCUMENT_RE.test(source)) return true;

    const tags = Array.from(source.matchAll(HTML_TAG_RE));
    if (tags.length === 0) return false;
    return tags.some((match) => HTML_SOURCE_TAGS.has(match[1].toLowerCase()));
}

/**
 * Classifies text read from either a paste event or the Clipboard API.
 * Only explicit source or known publisher/skill signatures switch the document
 * into native HTML mode; ordinary rich text remains available to Markdown paste.
 */
export function detectHtmlDocumentSource(
    plainText: string,
    richHtml: string,
): ClipboardHtmlSourceImport | null {
    const plainSource = plainText.trim();
    if (isHtmlSource(plainSource)) {
        return {
            kind: 'html-source',
            source: plainSource,
            detectedFrom: 'plain-source',
        };
    }

    const richSource = richHtml.trim();
    if (richSource && (FULL_HTML_DOCUMENT_RE.test(richSource) || HTML_FIDELITY_SIGNATURE_RE.test(richSource))) {
        return {
            kind: 'html-source',
            source: richSource,
            detectedFrom: 'rich-signature',
        };
    }

    return null;
}

export function detectClipboardDocumentImport(
    clipboardData: ClipboardData,
): ClipboardDocumentImport | null {
    const htmlFile = getClipboardFiles(clipboardData).find(isHtmlFile);
    if (htmlFile) return { kind: 'html-file', file: htmlFile };

    return detectHtmlDocumentSource(
        clipboardData.getData('text/plain'),
        clipboardData.getData('text/html'),
    );
}
