import {
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import DeviceFrame from './DeviceFrame';
import HtmlPreviewSurface from './preview/HtmlPreviewSurface';
import MarkdownPreviewSurface from './preview/MarkdownPreviewSurface';
import {
    getElementScrollRatio,
    scrollElementToRatio,
    type PreviewSurfaceArtifact,
    type PreviewImageClickInfo,
    type PreviewSurfaceHandle,
    type PreviewZoomDirection,
} from './preview/PreviewSurface';
export type { PreviewSurfaceHandle } from './preview/PreviewSurface';

interface PreviewPanelProps {
    previewArtifact: PreviewSurfaceArtifact;
    deviceWidthClass: string;
    previewDevice: 'mobile' | 'tablet' | 'pc';
    previewRef: React.MutableRefObject<HTMLDivElement | null>;
    surfaceRef?: React.Ref<PreviewSurfaceHandle>;
    onScrollRatio?: (ratio: number) => void;
    scrollSyncEnabled: boolean;
    onImageClick?: (info: PreviewImageClickInfo) => void;
    onPreviewZoom?: (direction: PreviewZoomDirection) => void;
    isMobileView?: boolean;
    zoom?: number;
}

export default function PreviewPanel({
    previewArtifact,
    deviceWidthClass,
    previewDevice,
    previewRef,
    surfaceRef,
    onScrollRatio,
    scrollSyncEnabled,
    onImageClick,
    onPreviewZoom,
    isMobileView,
    zoom = 1,
}: PreviewPanelProps) {
    const { html: renderedHtml, renderMode } = previewArtifact;
    const isolatedPreview = renderMode === 'isolated-html';
    const framedDevice = previewDevice === 'pc' || isMobileView ? null : previewDevice;
    // A simulated device can be taller than the visible preview pane. Keep its
    // top reachable and let the outer pane scroll instead of vertically centering
    // the frame into a negative, unreachable position.
    const framedDeviceSpacing = 'self-center min-h-full py-[clamp(6px,1.25vh,12px)] px-[clamp(2px,0.5vw,8px)]';
    const contentRef = useRef<HTMLDivElement>(null);
    const htmlSurfaceRef = useRef<PreviewSurfaceHandle>(null);
    const outerScrollRef = useRef<HTMLDivElement>(null);
    const innerScrollRef = useRef<HTMLDivElement>(null);
    const zoomWrapperRef = useRef<HTMLDivElement>(null);
    const [scaledWrapperHeight, setScaledWrapperHeight] = useState(0);

    useEffect(() => {
        previewRef.current = isolatedPreview ? null : contentRef.current;
        return () => {
            previewRef.current = null;
        };
    }, [isolatedPreview, isMobileView, previewDevice, previewRef]);

    useImperativeHandle(surfaceRef, () => ({
        scrollToRatio: (ratio: number) => {
            if (isolatedPreview) {
                htmlSurfaceRef.current?.scrollToRatio(ratio);
                return;
            }
            const scrollElement = framedDevice ? innerScrollRef.current : outerScrollRef.current;
            if (scrollElement) scrollElementToRatio(scrollElement, ratio);
        },
    }), [framedDevice, isolatedPreview]);

    useEffect(() => {
        const element = zoomWrapperRef.current;
        if (!element || zoom <= 1) {
            setScaledWrapperHeight(0);
            return;
        }
        const measure = () => setScaledWrapperHeight(element.scrollHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [zoom, renderedHtml, previewDevice, isMobileView]);

    const emitElementScrollRatio = (element: HTMLElement | null) => {
        if (!element || !scrollSyncEnabled || isolatedPreview) return;
        onScrollRatio?.(getElementScrollRatio(element));
    };

    const renderSurface = (htmlClassName: string, markdownClassName: string) => isolatedPreview ? (
        <HtmlPreviewSurface
            ref={htmlSurfaceRef}
            html={renderedHtml}
            className={htmlClassName}
            onScrollRatio={scrollSyncEnabled ? onScrollRatio : undefined}
            onZoom={onPreviewZoom}
        />
    ) : (
        <MarkdownPreviewSurface
            ref={contentRef}
            html={renderedHtml}
            className={markdownClassName}
            onImageClick={onImageClick}
        />
    );

    return (
        <div
            ref={outerScrollRef}
            data-testid="preview-outer-scroll"
            onScroll={!framedDevice && !isolatedPreview && scrollSyncEnabled
                ? () => emitElementScrollRatio(outerScrollRef.current)
                : undefined}
            className={`relative overflow-y-auto no-scrollbar flex flex-col z-20 flex-1 min-h-0 min-w-0 w-full overflow-x-hidden scroll-touch ${isMobileView ? 'bg-white dark:bg-[#1c1c1e]' : 'bg-[#f2f2f7]/50 dark:bg-[#000000]'}`}
        >
            {isMobileView ? (
                <>
                    <div
                        ref={zoomWrapperRef}
                        data-testid="preview-zoom-wrapper"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%` }}
                        className="min-h-full"
                    >
                        {renderSurface(
                            'h-[calc(100vh-116px)] min-h-[520px] w-full',
                            'w-full px-3 py-2 flex-1',
                        )}
                    </div>
                    {zoom > 1 && <div style={{ height: (zoom - 1) * scaledWrapperHeight }} aria-hidden />}
                </>
            ) : renderedHtml ? (
                <div
                    className={`${deviceWidthClass} min-w-0 max-w-full ${framedDevice ? framedDeviceSpacing : 'mt-[clamp(8px,2vh,20px)] mb-[clamp(24px,6vh,56px)] mx-auto h-fit'} ${framedDevice ? '' : 'min-h-[calc(100%-40px)]'} flex items-start justify-center relative`}
                >
                    <div
                        ref={zoomWrapperRef}
                        data-testid="preview-zoom-wrapper"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', width: `${100 / zoom}%` }}
                        className={framedDevice ? 'flex min-w-0 justify-center' : undefined}
                    >
                        {framedDevice ? (
                            <DeviceFrame
                                device={framedDevice}
                                scrollRef={innerScrollRef}
                                onScroll={!isolatedPreview && scrollSyncEnabled
                                    ? () => emitElementScrollRatio(innerScrollRef.current)
                                    : undefined}
                            >
                                {renderSurface(
                                    'h-full w-full',
                                    `min-w-full ${previewDevice === 'mobile' ? 'px-1 pt-1 pb-8' : 'px-2 pt-2 pb-10'}`,
                                )}
                            </DeviceFrame>
                        ) : (
                            <div className="bg-white rounded-[24px] overflow-hidden shadow-apple-lg ring-1 ring-[#00000008] border-t border-white/50 w-full">
                                {renderSurface(
                                    'h-[calc(100vh-160px)] min-h-[560px] w-full',
                                    'min-w-full',
                                )}
                            </div>
                        )}
                    </div>
                    {zoom > 1 && <div style={{ height: (zoom - 1) * scaledWrapperHeight }} aria-hidden />}
                </div>
            ) : (
                <div ref={contentRef} data-testid="preview-content" className="hidden" />
            )}
        </div>
    );
}
