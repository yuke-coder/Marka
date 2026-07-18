import {
    createHtmlDocument,
    createMarkdownDocument,
    type MarkaDocument,
} from './markaDocument';

export const MARKA_DOCUMENT_STORAGE_KEY = 'marka:document';
export const LEGACY_CONTENT_STORAGE_KEY = 'marka:content';
export const LEGACY_DOCUMENT_MODE_STORAGE_KEY = 'marka:documentMode';
export const MARKA_DOCUMENT_STORAGE_VERSION = 2;

interface StoredMarkaDocumentV2 {
    readonly version: typeof MARKA_DOCUMENT_STORAGE_VERSION;
    readonly document: MarkaDocument;
}

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>;

function parseStoredDocument(value: unknown): MarkaDocument | null {
    if (!value || typeof value !== 'object') return null;
    const stored = value as {
        readonly version?: unknown;
        readonly document?: {
            readonly kind?: unknown;
            readonly source?: unknown;
        };
    };
    const document = stored.document;
    if (!document || typeof document.source !== 'string') return null;

    if (stored.version === MARKA_DOCUMENT_STORAGE_VERSION) {
        if (document.kind === 'markdown') return createMarkdownDocument(document.source);
        if (document.kind === 'html') return createHtmlDocument(document.source);
        return null;
    }

    if (stored.version === 1) {
        if (document.kind === 'markdown') return createMarkdownDocument(document.source);
        if (document.kind === 'wechat-html') return createHtmlDocument(document.source);
    }

    return null;
}

export function serializeMarkaDocument(document: MarkaDocument): string {
    const stored: StoredMarkaDocumentV2 = {
        version: MARKA_DOCUMENT_STORAGE_VERSION,
        document,
    };
    return JSON.stringify(stored);
}

export function parseMarkaDocument(raw: string | null): MarkaDocument | null {
    if (!raw) return null;
    try {
        return parseStoredDocument(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function loadMarkaDocument(storage: ReadableStorage, fallbackMarkdown: string): MarkaDocument {
    try {
        const stored = parseMarkaDocument(storage.getItem(MARKA_DOCUMENT_STORAGE_KEY));
        if (stored) return stored;

        const legacySource = storage.getItem(LEGACY_CONTENT_STORAGE_KEY);
        if (legacySource === null) return createMarkdownDocument(fallbackMarkdown);
        return storage.getItem(LEGACY_DOCUMENT_MODE_STORAGE_KEY) === 'html'
            ? createHtmlDocument(legacySource)
            : createMarkdownDocument(legacySource);
    } catch {
        return createMarkdownDocument(fallbackMarkdown);
    }
}

export function saveMarkaDocument(storage: WritableStorage, document: MarkaDocument): void {
    storage.setItem(MARKA_DOCUMENT_STORAGE_KEY, serializeMarkaDocument(document));
    storage.removeItem(LEGACY_CONTENT_STORAGE_KEY);
    storage.removeItem(LEGACY_DOCUMENT_MODE_STORAGE_KEY);
}
