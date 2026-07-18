import type { PreviewArtifact } from '../../lib/documentArtifact';

export type PreviewZoomDirection = 1 | -1;

/**
 * Shared contract between document runtimes and the common preview shell.
 * Rendering stays document-specific; the shell only relies on this artifact.
 */
export type PreviewSurfaceArtifact = Pick<PreviewArtifact, 'html' | 'renderMode'>;

export interface PreviewSurfaceHandle {
    scrollToRatio: (ratio: number) => void;
}

export interface PreviewImageClickInfo {
    type: string;
    index: number;
    src?: string;
    alt?: string;
}

export function normalizeScrollRatio(ratio: number): number {
    return Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
}

export function getElementScrollRatio(element: HTMLElement): number {
    const maxScroll = element.scrollHeight - element.clientHeight;
    return maxScroll > 0 ? normalizeScrollRatio(element.scrollTop / maxScroll) : 0;
}

export function scrollElementToRatio(element: HTMLElement, ratio: number): void {
    const maxScroll = Math.max(element.scrollHeight - element.clientHeight, 0);
    element.scrollTop = normalizeScrollRatio(ratio) * maxScroll;
}
