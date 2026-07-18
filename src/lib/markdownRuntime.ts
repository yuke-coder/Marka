import { createPreviewArtifact } from './documentArtifact';
import type {
    DocumentFeature,
    DocumentRenderContext,
    DocumentRuntime,
    FeatureAvailability,
} from './documentRuntime';
import { applyTheme, md, preprocessMarkdown } from './markdown';
import { findMarkdownDialect } from './markdownDialects';
import { markElementIndexes } from './markdownIndexer';
import { presentRMarkdownDocument } from './rMarkdownPresentation';

const DISABLED_EXPORT_REASON = '该导出格式尚未接入统一文档产物管线';

const FEATURE_AVAILABILITY: Record<DocumentFeature, FeatureAvailability> = {
    'theme.select': { state: 'enabled' },
    smartPaste: { state: 'enabled' },
    'scroll.sync': { state: 'enabled' },
    'source.location': { state: 'enabled' },
    'copy.source': { state: 'enabled' },
    'copy.html': { state: 'enabled' },
    'copy.wechat': { state: 'enabled' },
    'export.source': { state: 'enabled' },
    'export.html': { state: 'enabled' },
    'export.word': { state: 'enabled' },
    'export.pdf': { state: 'enabled' },
    'export.png': { state: 'enabled' },
};

void DISABLED_EXPORT_REASON;

export const markdownRuntime: DocumentRuntime<'markdown'> = {
    kind: 'markdown',
    render(document, context: DocumentRenderContext) {
        const dialect = findMarkdownDialect(document.source);
        const renderMarkdown = (source: string) => md.render(preprocessMarkdown(source));
        const rawHtml = document.source.trim()
            ? dialect
                ? dialect.render(document.source, renderMarkdown)
                : renderMarkdown(document.source)
            : '';
        const presentedHtml = rawHtml
            ? dialect?.id === 'r-markdown'
                ? presentRMarkdownDocument(document.source, rawHtml)
                : applyTheme(rawHtml, context.themeId)
            : '';
        const html = presentedHtml
            ? markElementIndexes(presentedHtml)
            : '';

        return createPreviewArtifact({
            kind: 'markdown',
            source: document.source,
            html,
            renderMode: 'themed-dom',
            variant: dialect
                ? `${dialect.id}-compat-${context.themeId}`
                : `theme-${context.themeId}`,
            sanitizerPolicyVersion: 1,
        });
    },
    availability(feature) {
        return FEATURE_AVAILABILITY[feature];
    },
};
