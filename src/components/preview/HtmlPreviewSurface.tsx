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

const HTML_PREVIEW_MESSAGE_SOURCE = 'marka-html-preview';

function addHtmlPreviewBridge(html: string, channel: string): string {
    const bridge = `
<script>
(() => {
    const source = ${JSON.stringify(HTML_PREVIEW_MESSAGE_SOURCE)};
    const channel = ${JSON.stringify(channel)};
    const send = (type, payload = {}) => parent.postMessage({ source, channel, type, ...payload }, '*');
    const getScroller = () => document.scrollingElement || document.documentElement;
    const emitScroll = () => {
        const scroller = getScroller();
        const maxScroll = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
        send('scroll', { ratio: maxScroll > 0 ? scroller.scrollTop / maxScroll : 0 });
    };

    addEventListener('scroll', emitScroll, { passive: true });
    addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.source !== source || data.channel !== channel || data.type !== 'set-scroll-ratio') return;
        const scroller = getScroller();
        const maxScroll = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
        scroller.scrollTop = Math.min(1, Math.max(0, Number(data.ratio) || 0)) * maxScroll;
    });
    addEventListener('wheel', (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        send('zoom', { direction: event.deltaY < 0 ? 1 : -1 });
    }, { passive: false });

    document.currentScript?.remove();
    send('ready');
})();
</script>`;

    return `${html}\n${bridge}`;
}

const HtmlPreviewSurface = forwardRef<PreviewSurfaceHandle, HtmlPreviewSurfaceProps>(
    function HtmlPreviewSurface({ html, className, onScrollRatio, onZoom }, ref) {
        const iframeRef = useRef<HTMLIFrameElement>(null);
        const channelRef = useRef(`marka-html-preview-${Math.random().toString(36).slice(2)}`);
        const pendingScrollRatioRef = useRef<number | null>(null);
        const channel = channelRef.current;
        const bridgedHtml = useMemo(() => addHtmlPreviewBridge(html, channel), [channel, html]);

        const postScrollRatio = useCallback((ratio: number) => {
            iframeRef.current?.contentWindow?.postMessage({
                source: HTML_PREVIEW_MESSAGE_SOURCE,
                channel,
                type: 'set-scroll-ratio',
                ratio,
            }, '*');
        }, [channel]);

        useImperativeHandle(ref, () => ({
            scrollToRatio: (ratio: number) => {
                const normalizedRatio = normalizeScrollRatio(ratio);
                pendingScrollRatioRef.current = normalizedRatio;
                postScrollRatio(normalizedRatio);
            },
        }), [postScrollRatio]);

        useEffect(() => {
            const handleMessage = (event: MessageEvent) => {
                if (event.source !== iframeRef.current?.contentWindow) return;
                const data = event.data as {
                    source?: string;
                    channel?: string;
                    type?: string;
                    ratio?: number;
                    direction?: number;
                } | null;
                if (!data || data.source !== HTML_PREVIEW_MESSAGE_SOURCE || data.channel !== channel) return;

                if (data.type === 'ready') {
                    if (pendingScrollRatioRef.current !== null) {
                        postScrollRatio(pendingScrollRatioRef.current);
                    }
                    return;
                }
                if (data.type === 'scroll' && Number.isFinite(data.ratio)) {
                    onScrollRatio?.(normalizeScrollRatio(data.ratio ?? 0));
                    return;
                }
                if (data.type === 'zoom' && (data.direction === 1 || data.direction === -1)) {
                    onZoom?.(data.direction);
                }
            };

            window.addEventListener('message', handleMessage);
            return () => window.removeEventListener('message', handleMessage);
        }, [channel, onScrollRatio, onZoom, postScrollRatio]);

        return (
            <iframe
                ref={iframeRef}
                data-testid="html-preview-frame"
                title="HTML 预览"
                srcDoc={bridgedHtml}
                // Imported HTML is sanitized before this trusted bridge is appended. Scripts can
                // run, but the missing allow-same-origin keeps the document opaque to both sides.
                sandbox="allow-scripts"
                className={`block bg-white ${className}`}
            />
        );
    },
);

export default HtmlPreviewSurface;
