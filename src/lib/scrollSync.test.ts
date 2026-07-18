import { describe, expect, it } from 'vitest';
import { ScrollSyncController, type ScrollFrameScheduler } from './scrollSync';

function createFrameScheduler(): ScrollFrameScheduler & { flush(): void; pendingCount(): number } {
    let nextHandle = 1;
    const callbacks = new Map<number, FrameRequestCallback>();

    return {
        request(callback) {
            const handle = nextHandle++;
            callbacks.set(handle, callback);
            return handle;
        },
        cancel(handle) {
            callbacks.delete(handle);
        },
        flush() {
            const scheduled = [...callbacks.values()];
            callbacks.clear();
            scheduled.forEach((callback) => callback(16));
        },
        pendingCount() {
            return callbacks.size;
        },
    };
}

describe('ScrollSyncController', () => {
    it('coalesces an event burst and only applies the latest scroll ratio', () => {
        const scheduler = createFrameScheduler();
        const controller = new ScrollSyncController({ scheduler });
        const applied: number[] = [];

        controller.synchronize('editor', 0.2, (ratio) => applied.push(ratio));
        controller.synchronize('editor', 0.7, (ratio) => applied.push(ratio));

        expect(scheduler.pendingCount()).toBe(1);
        scheduler.flush();
        expect(applied).toEqual([0.7]);
    });

    it('suppresses only the matching scroll event generated in the other pane', () => {
        const scheduler = createFrameScheduler();
        const controller = new ScrollSyncController({ scheduler });
        const previewUpdates: number[] = [];
        const editorUpdates: number[] = [];

        controller.synchronize('editor', 0.42, (ratio) => previewUpdates.push(ratio));
        scheduler.flush();

        expect(controller.synchronize('preview', 0.421, (ratio) => editorUpdates.push(ratio))).toBe(false);
        expect(scheduler.pendingCount()).toBe(0);

        expect(controller.synchronize('preview', 0.7, (ratio) => editorUpdates.push(ratio))).toBe(true);
        scheduler.flush();
        expect(previewUpdates).toEqual([0.42]);
        expect(editorUpdates).toEqual([0.7]);
    });

    it('clears pending work and expected echo state on reset', () => {
        const scheduler = createFrameScheduler();
        const controller = new ScrollSyncController({ scheduler });
        const applied: number[] = [];

        controller.synchronize('editor', 0.5, (ratio) => applied.push(ratio));
        controller.reset();
        scheduler.flush();

        expect(applied).toEqual([]);
        expect(controller.synchronize('preview', 0.5, (ratio) => applied.push(ratio))).toBe(true);
    });
});
