export type ScrollSyncSource = 'editor' | 'preview';

export interface ScrollFrameScheduler {
    request(callback: FrameRequestCallback): number;
    cancel(handle: number): void;
}

export interface ScrollSyncControllerOptions {
    readonly echoTolerance?: number;
    readonly scheduler?: ScrollFrameScheduler;
}

interface PendingSync {
    readonly source: ScrollSyncSource;
    readonly ratio: number;
    readonly apply: (ratio: number) => void;
}

const DEFAULT_ECHO_TOLERANCE = 0.0025;

const browserFrameScheduler: ScrollFrameScheduler = {
    request(callback) {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            return window.requestAnimationFrame(callback);
        }
        return setTimeout(() => callback(Date.now()), 16) as unknown as number;
    },
    cancel(handle) {
        if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(handle);
            return;
        }
        clearTimeout(handle);
    },
};

export function normalizeScrollRatio(ratio: number): number {
    return Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
}

function targetFor(source: ScrollSyncSource): ScrollSyncSource {
    return source === 'editor' ? 'preview' : 'editor';
}

/**
 * Coalesces frequent scroll events into one paint-frame update and ignores the
 * next matching event caused by that programmatic update. Unlike a timer lock,
 * a real user scroll is accepted immediately when it differs from the target.
 */
export class ScrollSyncController {
    private readonly echoTolerance: number;
    private readonly scheduler: ScrollFrameScheduler;
    private frameHandle: number | null = null;
    private pending: PendingSync | null = null;
    private readonly expectedRatios: Record<ScrollSyncSource, number | null> = {
        editor: null,
        preview: null,
    };

    constructor(options: ScrollSyncControllerOptions = {}) {
        this.echoTolerance = options.echoTolerance ?? DEFAULT_ECHO_TOLERANCE;
        this.scheduler = options.scheduler ?? browserFrameScheduler;
    }

    synchronize(
        source: ScrollSyncSource,
        ratio: number,
        apply: (ratio: number) => void,
    ): boolean {
        const normalizedRatio = normalizeScrollRatio(ratio);
        if (this.consumeExpectedRatio(source, normalizedRatio)) {
            return false;
        }

        this.pending = { source, ratio: normalizedRatio, apply };
        if (this.frameHandle === null) {
            this.frameHandle = this.scheduler.request(() => this.flush());
        }
        return true;
    }

    reset(): void {
        if (this.frameHandle !== null) {
            this.scheduler.cancel(this.frameHandle);
            this.frameHandle = null;
        }
        this.pending = null;
        this.expectedRatios.editor = null;
        this.expectedRatios.preview = null;
    }

    private consumeExpectedRatio(source: ScrollSyncSource, ratio: number): boolean {
        const expected = this.expectedRatios[source];
        if (expected === null) {
            return false;
        }

        this.expectedRatios[source] = null;
        return Math.abs(expected - ratio) <= this.echoTolerance;
    }

    private flush(): void {
        this.frameHandle = null;
        const pending = this.pending;
        this.pending = null;
        if (!pending) {
            return;
        }

        this.expectedRatios[targetFor(pending.source)] = pending.ratio;
        pending.apply(pending.ratio);
    }
}
