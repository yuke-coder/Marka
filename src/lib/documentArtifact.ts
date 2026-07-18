import type { MarkaDocumentKind } from './markaDocument';

export type PreviewRenderMode = 'themed-dom' | 'isolated-html';

export interface PreviewArtifact {
    readonly id: string;
    readonly kind: MarkaDocumentKind;
    readonly html: string;
    readonly renderMode: PreviewRenderMode;
    readonly sourceRevision: string;
    readonly sanitizerPolicyVersion: number;
}

interface CreatePreviewArtifactInput {
    readonly kind: MarkaDocumentKind;
    readonly source: string;
    readonly html: string;
    readonly renderMode: PreviewRenderMode;
    readonly variant: string;
    readonly sanitizerPolicyVersion: number;
}

function hashText(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

export function createPreviewArtifact(input: CreatePreviewArtifactInput): PreviewArtifact {
    const sourceRevision = hashText(input.source);
    return {
        id: [
            input.kind,
            sourceRevision,
            input.variant,
            `policy-${input.sanitizerPolicyVersion}`,
        ].join(':'),
        kind: input.kind,
        html: input.html,
        renderMode: input.renderMode,
        sourceRevision,
        sanitizerPolicyVersion: input.sanitizerPolicyVersion,
    };
}

export function createEmptyPreviewArtifact(kind: MarkaDocumentKind): PreviewArtifact {
    return createPreviewArtifact({
        kind,
        source: '',
        html: '',
        renderMode: kind === 'html' ? 'isolated-html' : 'themed-dom',
        variant: 'empty',
        sanitizerPolicyVersion: 1,
    });
}
