import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
} from 'react';
import {
    normalizeScrollRatio,
    type PreviewSurfaceHandle,
    type PreviewZoomDirection,
} from './PreviewSurface';

interface HtmlPreviewSurfaceProps {
    html: string;
    className: string;
    onScrollRatio?: (ratio: number) => void;
    onZoom?: (direction: PreviewZoomDirection) => void;
}

interface HtmlPreviewBridgeMessage {
    readonly source?: string;
    readonly channel?: string;
    readonly type?: string;
    readonly ratio?: number;
    readonly direction?: number;
}

const HTML_PREVIEW_MESSAGE_SOURCE = 'marka-html-preview';

function addHtmlPreviewBridge(html: string, channel: string): string {
    const bridge = `
<script>
(() => {
    const source = ${JSON.stringify(HTML_PREVIEW_MESSAGE_SOURCE)};
    const channel = ${JSON.stringify(channel)};
    const bridgeScript = document.currentScript;
    let port = null;
    let scrollFrame = 0;
    let zoomFrame = 0;
    let pendingProgrammaticRatio = null;
    let pendingZoomDirection = 0;

    const getScroller = () => document.scrollingElement || document.documentElement;
    const getScrollRatio = () => {
        const scroller = getScroller();
        const maxScroll = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
        return maxScroll > 0 ? scroller.scrollTop / maxScroll : 0;
    };
    const send = (type, payload = {}) => port?.postMessage({ source, channel, type, ...payload });
    const emitScroll = () => {
        scrollFrame = 0;
        if (!port) return;
        const ratio = getScrollRatio();
        if (pendingProgrammaticRatio !== null && Math.abs(ratio - pendingProgrammaticRatio) <= 0.001) {
            pendingProgrammaticRatio = null;
            return;
        }
        pendingProgrammaticRatio = null;
        send('scroll', { ratio });
    };
    const scheduleScroll = () => {
        if (!port || scrollFrame) return;
        scrollFrame = requestAnimationFrame(emitScroll);
    };
    const receivePortMessage = (event) => {
        const data = event.data;
        if (!data || data.source !== source || data.channel !== channel || data.type !== 'set-scroll-ratio') return;
        const ratio = Math.min(1, Math.max(0, Number(data.ratio) || 0));
        const scroller = getScroller();
        const maxScroll = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
        pendingProgrammaticRatio = ratio;
        scroller.scrollTop = ratio * maxScroll;
        scheduleScroll();
    };

    addEventListener('scroll', scheduleScroll, { passive: true });
    addEventListener('message', (event) => {
        const data = event.data;
        const nextPort = event.ports && event.ports[0];
        if (event.source !== parent || !data || data.source !== source || data.channel !== channel || data.type !== 'connect' || !nextPort) return;

        port?.close();
        port = nextPort;
        port.addEventListener('message', receivePortMessage);
        port.start();
        send('ready');
    });
    addEventListener('wheel', (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        pendingZoomDirection = event.deltaY < 0 ? 1 : -1;
        if (zoomFrame) return;
        zoomFrame = requestAnimationFrame(() => {
            zoomFrame = 0;
            send('zoom', { direction: pendingZoomDirection });
            pendingZoomDirection = 0;
        });
    }, { passive: false });

    bridgeScript?.remove();
})();
</script>`;

    if (/<\/body\s*>/i.test(html)) {
        return html.replace(/<\/body\s*>/i, `${bridge}</body>`);
    }
    if (/<\/html\s*>/i.test(html)) {
        return html.replace(/<\/html\s*>/i, `${bridge}</html>`);
    }
    return `${html}\n${bridge}`;
}

const HtmlPreviewSurface = forwardRef<PreviewSurfaceHandle, HtmlPreviewSurfaceProps>(
    function HtmlPreviewSurface({ html, className, onScrollRatio, onZoom }, ref) {
        const iframeRef = useRef<HTMLIFrameElement>(null);
        const channelRef = useRef(`marka-html-preview-${Math.random().toString(36).slice(2)}`);
        const portRef = useRef<MessagePort | null>(null);
        const bridgeReadyRef = useRef(false);
        const pendingScrollRatioRef = useRef<number | null>(null);
        const onScrollRatioRef = useRef(onScrollRatio);
        const onZoomRef = useRef(onZoom);
        const channel = channelRef.current;
        const bridgedHtml = useMemo(() => addHtmlPreviewBridge(html, channel), [channel, html]);

        useEffect(() => {
            onScrollRatioRef.current = onScrollRatio;
        }, [onScrollRatio]);

        useEffect(() => {
            onZoomRef.current = onZoom;
        }, [onZoom]);

        const closeBridgePort = useCallback(() => {
            bridgeReadyRef.current = false;
            portRef.current?.close();
            portRef.current = null;
        }, []);

        const postScrollRatio = useCallback((ratio: number) => {
            const normalizedRatio = normalizeScrollRatio(ratio);
            pendingScrollRatioRef.current = normalizedRatio;
            if (!bridgeReadyRef.current) return;

            portRef.current?.postMessage({
                source: HTML_PREVIEW_MESSAGE_SOURCE,
                channel,
                type: 'set-scroll-ratio',
                ratio: normalizedRatio,
            });
        }, [channel]);

        const connectBridge = useCallback(() => {
            closeBridgePort();
            const iframeWindow = iframeRef.current?.contentWindow;
            if (!iframeWindow) return;

            const messageChannel = new MessageChannel();
            const port = messageChannel.port1;
            port.onmessage = (event: MessageEvent<HtmlPreviewBridgeMessage>) => {
                const data = event.data;
                if (!data || data.source !== HTML_PREVIEW_MESSAGE_SOURCE || data.channel !== channel) return;

                if (data.type === 'ready') {
                    bridgeReadyRef.current = true;
                    if (pendingScrollRatioRef.current !== null) {
                        postScrollRatio(pendingScrollRatioRef.current);
                    }
                    return;
                }
                if (data.type === 'scroll' && Number.isFinite(data.ratio)) {
                    onScrollRatioRef.current?.(normalizeScrollRatio(data.ratio ?? 0));
                    return;
                }
                if (data.type === 'zoom' && (data.direction === 1 || data.direction === -1)) {
                    onZoomRef.current?.(data.direction);
                }
            };
            port.start();
            portRef.current = port;

            // A sandboxed srcDoc document has an opaque origin, so the bootstrap
            // transfer must target '*'. All subsequent traffic stays on this port.
            iframeWindow.postMessage({
                source: HTML_PREVIEW_MESSAGE_SOURCE,
                channel,
                type: 'connect',
            }, '*', [messageChannel.port2]);
        }, [channel, closeBridgePort, postScrollRatio]);

        useImperativeHandle(ref, () => ({
            scrollToRatio: postScrollRatio,
        }), [postScrollRatio]);

        useEffect(() => closeBridgePort, [closeBridgePort]);

        return (
            <iframe
                ref={iframeRef}
                data-testid="html-preview-frame"
                title="HTML 预览"
                srcDoc={bridgedHtml}
                onLoad={connectBridge}
                // Imported HTML is sanitized before this trusted bridge is appended. Scripts can
                // run, but the missing allow-same-origin keeps the document opaque to both sides.
                sandbox="allow-scripts"
                className={`block bg-white ${className}`}
            />
        );
    },
);

export default HtmlPreviewSurface;
