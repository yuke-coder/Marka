import type { PreviewArtifact } from './documentArtifact';
import { renderDocumentArtifact } from './documentRuntime';
import { stripIndexMarkers } from './markdownIndexer';
import { htmlToPlainText } from './htmlDocument';
import { makeWeChatCompatible } from './wechatCompat';
import {
    isHtmlDocument,
    type MarkaDocument,
} from './markaDocument';

export interface MarkaClipboardPayload {
    readonly html: string;
    readonly plainText: string;
}

export function renderMarkaDocumentPreview(document: MarkaDocument, themeId: string): string {
    return renderMarkaDocumentArtifact(document, themeId).html;
}

export function renderMarkaDocumentArtifact(
    document: MarkaDocument,
    themeId: string,
): PreviewArtifact {
    return renderDocumentArtifact(document, { themeId });
}

export function getMarkaDocumentExportHtml(document: MarkaDocument, renderedHtml: string): string {
    return isHtmlDocument(document) ? renderedHtml : stripIndexMarkers(renderedHtml);
}

export async function buildMarkaClipboardPayload(
    document: MarkaDocument,
    renderedHtml: string,
    themeId: string,
): Promise<MarkaClipboardPayload> {
    const html = isHtmlDocument(document)
        ? renderedHtml
        : await makeWeChatCompatible(renderedHtml, themeId);
    return {
        html,
        plainText: htmlToPlainText(html),
    };
}
