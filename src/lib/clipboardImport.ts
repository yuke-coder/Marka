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

export function detectClipboardDocumentImport(
    clipboardData: ClipboardData,
): ClipboardDocumentImport | null {
    const htmlFile = getClipboardFiles(clipboardData).find(isHtmlFile);
    if (htmlFile) return { kind: 'html-file', file: htmlFile };

    const plainSource = clipboardData.getData('text/plain').trim();
    if (isHtmlSource(plainSource)) {
        return {
            kind: 'html-source',
            source: plainSource,
            detectedFrom: 'plain-source',
        };
    }

    const richHtml = clipboardData.getData('text/html').trim();
    if (richHtml && (FULL_HTML_DOCUMENT_RE.test(richHtml) || HTML_FIDELITY_SIGNATURE_RE.test(richHtml))) {
        return {
            kind: 'html-source',
            source: richHtml,
            detectedFrom: 'rich-signature',
        };
    }

    return null;
}
