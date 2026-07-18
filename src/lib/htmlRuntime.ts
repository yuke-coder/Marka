import { createPreviewArtifact } from './documentArtifact';
import type {
    DocumentFeature,
    DocumentRuntime,
    FeatureAvailability,
} from './documentRuntime';
import {
    HTML_SANITIZER_POLICY_VERSION,
    sanitizeImportedHtml,
} from './htmlDocument';

const FEATURE_AVAILABILITY: Record<DocumentFeature, FeatureAvailability> = {
    'theme.select': {
        state: 'disabled',
        reason: 'HTML 文档保留原始样式，无法应用 Marka 排版主题',
    },
    smartPaste: {
        state: 'disabled',
        reason: 'HTML 文档使用原生 HTML 粘贴语义',
    },
    'scroll.sync': { state: 'enabled' },
    'source.location': {
        state: 'disabled',
        reason: 'HTML 文档暂未建立源码节点定位映射',
    },
    'copy.source': { state: 'enabled' },
    'copy.html': { state: 'enabled' },
    'copy.wechat': { state: 'enabled' },
    'export.source': { state: 'enabled' },
    'export.html': { state: 'enabled' },
    'export.word': {
        state: 'disabled',
        reason: 'HTML Word 导出将在统一导出管线中启用',
    },
    'export.pdf': {
        state: 'disabled',
        reason: 'HTML PDF 导出将在独立打印管线中启用',
    },
    'export.png': {
        state: 'disabled',
        reason: 'HTML PNG 导出将在离屏渲染管线中启用',
    },
};

export const htmlRuntime: DocumentRuntime<'html'> = {
    kind: 'html',
    render(document) {
        const html = document.source.trim()
            ? sanitizeImportedHtml(document.source)
            : '';

        return createPreviewArtifact({
            kind: 'html',
            source: document.source,
            html,
            renderMode: 'isolated-html',
            variant: 'original-style',
            sanitizerPolicyVersion: HTML_SANITIZER_POLICY_VERSION,
        });
    },
    availability(feature) {
        return FEATURE_AVAILABILITY[feature];
    },
};
