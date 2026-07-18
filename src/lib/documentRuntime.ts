import type { PreviewArtifact } from './documentArtifact';
import { htmlRuntime } from './htmlRuntime';
import type {
    HtmlDocument,
    MarkdownDocument,
    MarkaDocument,
    MarkaDocumentKind,
} from './markaDocument';
import { markdownRuntime } from './markdownRuntime';

export type DocumentFeature =
    | 'theme.select'
    | 'smartPaste'
    | 'scroll.sync'
    | 'source.location'
    | 'copy.source'
    | 'copy.html'
    | 'copy.wechat'
    | 'export.source'
    | 'export.html'
    | 'export.word'
    | 'export.pdf'
    | 'export.png';

export type FeatureAvailability =
    | { readonly state: 'enabled' }
    | { readonly state: 'disabled'; readonly reason: string }
    | { readonly state: 'degraded'; readonly reason: string };

export interface DocumentRenderContext {
    readonly themeId: string;
}

export interface DocumentRuntime<K extends MarkaDocumentKind> {
    readonly kind: K;
    render(
        document: Extract<MarkaDocument, { kind: K }>,
        context: DocumentRenderContext,
    ): PreviewArtifact;
    availability(feature: DocumentFeature): FeatureAvailability;
}

export const DOCUMENT_RUNTIMES = {
    markdown: markdownRuntime,
    html: htmlRuntime,
} satisfies {
    markdown: DocumentRuntime<'markdown'>;
    html: DocumentRuntime<'html'>;
};

export function renderDocumentArtifact(
    document: MarkaDocument,
    context: DocumentRenderContext,
): PreviewArtifact {
    switch (document.kind) {
        case 'markdown':
            return DOCUMENT_RUNTIMES.markdown.render(document as MarkdownDocument, context);
        case 'html':
            return DOCUMENT_RUNTIMES.html.render(document as HtmlDocument, context);
    }
}

export function getDocumentFeatureAvailability(
    kind: MarkaDocumentKind,
    feature: DocumentFeature,
): FeatureAvailability {
    return kind === 'markdown'
        ? DOCUMENT_RUNTIMES.markdown.availability(feature)
        : DOCUMENT_RUNTIMES.html.availability(feature);
}
