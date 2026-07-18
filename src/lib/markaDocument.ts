export const MARKA_DOCUMENT_KINDS = ['markdown', 'html'] as const;

export type MarkaDocumentKind = typeof MARKA_DOCUMENT_KINDS[number];

export interface MarkdownDocument {
    readonly kind: 'markdown';
    readonly source: string;
}

export interface HtmlDocument {
    readonly kind: 'html';
    readonly source: string;
}

export type MarkaDocument = MarkdownDocument | HtmlDocument;

export type MarkaPreviewMode = 'themed' | 'isolated';

export interface MarkaDocumentCapabilities {
    readonly themes: boolean;
    readonly smartPaste: boolean;
    readonly scrollSync: boolean;
    readonly sourceLocation: boolean;
    readonly wordExport: boolean;
    readonly pdfExport: boolean;
    readonly htmlExport: boolean;
    readonly pngExport: boolean;
}

export interface MarkaDocumentDefinition {
    readonly kind: MarkaDocumentKind;
    readonly label: 'Markdown' | 'HTML';
    readonly abbreviation: 'MD' | 'HTML';
    readonly fileExtension: '.md' | '.html';
    readonly mimeType: 'text/markdown;charset=utf-8' | 'text/html;charset=utf-8';
    readonly editorPlaceholder: string;
    readonly previewMode: MarkaPreviewMode;
    readonly capabilities: MarkaDocumentCapabilities;
}

const DOCUMENT_DEFINITIONS = {
    markdown: {
        kind: 'markdown',
        label: 'Markdown',
        abbreviation: 'MD',
        fileExtension: '.md',
        mimeType: 'text/markdown;charset=utf-8',
        editorPlaceholder: '在这里输入 Markdown 内容...',
        previewMode: 'themed',
        capabilities: {
            themes: true,
            smartPaste: true,
            scrollSync: true,
            sourceLocation: true,
            wordExport: true,
            pdfExport: true,
            htmlExport: true,
            pngExport: true,
        },
    },
    html: {
        kind: 'html',
        label: 'HTML',
        abbreviation: 'HTML',
        fileExtension: '.html',
        mimeType: 'text/html;charset=utf-8',
        editorPlaceholder: '在这里编辑 HTML 源码...',
        previewMode: 'isolated',
        capabilities: {
            themes: false,
            smartPaste: false,
            scrollSync: true,
            sourceLocation: false,
            wordExport: false,
            pdfExport: false,
            htmlExport: true,
            pngExport: false,
        },
    },
} as const satisfies Record<MarkaDocumentKind, MarkaDocumentDefinition>;

export interface MarkaSourceSelection {
    readonly start: number;
    readonly end: number;
}

export interface MarkaDocumentFragment {
    readonly markdown: string;
    readonly html: string;
}

export interface MarkaDocumentEdit {
    readonly document: MarkaDocument;
    readonly cursor: number | null;
}

export type MarkaDocumentApplyMode = 'replace' | 'insert' | 'append';

export interface MarkaMarkdownApplyResult extends MarkaDocumentEdit {
    readonly document: MarkdownDocument;
    readonly effectiveMode: MarkaDocumentApplyMode;
}

export function createMarkdownDocument(source: string): MarkdownDocument {
    return { kind: 'markdown', source };
}

export function createHtmlDocument(source: string): HtmlDocument {
    return { kind: 'html', source };
}

export function isMarkdownDocument(document: MarkaDocument): document is MarkdownDocument {
    return document.kind === 'markdown';
}

export function isHtmlDocument(document: MarkaDocument): document is HtmlDocument {
    return document.kind === 'html';
}

export function getMarkaDocumentDefinition(
    documentOrKind: MarkaDocument | MarkaDocumentKind,
): MarkaDocumentDefinition {
    const kind = typeof documentOrKind === 'string' ? documentOrKind : documentOrKind.kind;
    return DOCUMENT_DEFINITIONS[kind];
}

export function updateDocumentSource(document: MarkdownDocument, source: string): MarkdownDocument;
export function updateDocumentSource(document: HtmlDocument, source: string): HtmlDocument;
export function updateDocumentSource(document: MarkaDocument, source: string): MarkaDocument;
export function updateDocumentSource(document: MarkaDocument, source: string): MarkaDocument {
    return { ...document, source };
}

export function getMarkdownSource(document: MarkaDocument): string {
    return isMarkdownDocument(document) ? document.source : '';
}

function normalizeSelection(source: string, selection: MarkaSourceSelection): MarkaSourceSelection {
    const start = Math.min(source.length, Math.max(0, selection.start));
    const end = Math.min(source.length, Math.max(start, selection.end));
    return { start, end };
}

function replaceSelection(
    source: string,
    insertSource: string,
    selection: MarkaSourceSelection,
): { source: string; cursor: number } {
    const normalized = normalizeSelection(source, selection);
    return {
        source: source.slice(0, normalized.start) + insertSource + source.slice(normalized.end),
        cursor: normalized.start + insertSource.length,
    };
}

export function insertDocumentFragment(
    document: MarkaDocument,
    fragment: MarkaDocumentFragment,
    selection?: MarkaSourceSelection,
): MarkaDocumentEdit {
    const insertSource = isMarkdownDocument(document) ? fragment.markdown : fragment.html;
    if (selection) {
        const edit = replaceSelection(document.source, insertSource, selection);
        return {
            document: updateDocumentSource(document, edit.source),
            cursor: edit.cursor,
        };
    }

    const separator = document.source.length > 0 ? '\n\n' : '';
    const source = `${document.source}${separator}${insertSource}`;
    return {
        document: updateDocumentSource(document, source),
        cursor: source.length,
    };
}

/**
 * AI produces Markdown. Applying it to an HTML document is therefore an explicit
 * type transition to a new Markdown document; mixed-source documents are forbidden.
 */
export function applyMarkdownResult(
    document: MarkaDocument,
    markdown: string,
    requestedMode: MarkaDocumentApplyMode,
    selection?: MarkaSourceSelection,
): MarkaMarkdownApplyResult {
    if (!isMarkdownDocument(document) || requestedMode === 'replace') {
        return {
            document: createMarkdownDocument(markdown),
            effectiveMode: 'replace',
            cursor: null,
        };
    }

    if (requestedMode === 'append') {
        const source = `${document.source.trimEnd()}\n\n${markdown}`.trimStart();
        return {
            document: createMarkdownDocument(source),
            effectiveMode: 'append',
            cursor: null,
        };
    }

    if (!selection) {
        return {
            document: createMarkdownDocument(markdown),
            effectiveMode: 'replace',
            cursor: null,
        };
    }

    const edit = replaceSelection(document.source, markdown, selection);
    return {
        document: createMarkdownDocument(edit.source),
        effectiveMode: 'insert',
        cursor: edit.cursor,
    };
}
