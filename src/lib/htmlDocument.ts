import DOMPurify from 'dompurify';

const FULL_DOCUMENT_RE = /(?:<!doctype\s+html|<html(?:\s|>))/i;
export const HTML_SANITIZER_POLICY_VERSION = 1;

/**
 * Keep WeChat/Skill inline structure and styles while removing executable HTML.
 * DOMPurify is MIT licensed: https://github.com/cure53/DOMPurify
 */
export function sanitizeImportedHtml(source: string): string {
    return DOMPurify.sanitize(source, {
        WHOLE_DOCUMENT: FULL_DOCUMENT_RE.test(source),
        ADD_ATTR: ['leaf'],
        FORBID_TAGS: ['script', 'base', 'meta', 'object', 'embed', 'iframe'],
        FORBID_ATTR: ['srcdoc'],
    });
}

export function htmlToPlainText(html: string): string {
    const document = new DOMParser().parseFromString(html, 'text/html');
    return document.body.innerText || document.body.textContent || '';
}
