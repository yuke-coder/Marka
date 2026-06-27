import React, { useEffect, useRef } from 'react';

interface PreviewPanelProps {
    renderedHtml: string;
    previewRef: React.MutableRefObject<HTMLDivElement | null>;
    previewOuterScrollRef: React.RefObject<HTMLDivElement>;
    onPreviewOuterScroll: () => void;
    scrollSyncEnabled: boolean;
    onImageClick?: (info: { type: string; index: number; src?: string; alt?: string }) => void;
}

export default function PreviewPanel({
    renderedHtml,
    previewRef,
    previewOuterScrollRef,
    onPreviewOuterScroll,
    scrollSyncEnabled,
    onImageClick,
}: PreviewPanelProps) {
    const contentRef = useRef<HTMLDivElement>(null);

    // Sync internal contentRef to external previewRef
    useEffect(() => {
        if (!previewRef || !contentRef.current) return;
        previewRef.current = contentRef.current;
    }, [previewRef]);

    useEffect(() => {
        if (!onImageClick) return;

        const handleElementClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // Find the closest element with location data
            const element = target.closest('[data-md-type]') as HTMLElement;
            if (!element) return;

            const mdType = element.getAttribute('data-md-type');
            const mdIndex = element.getAttribute('data-md-index');

            if (!mdType || mdIndex === null) return;

            // Check if clicked on a link - if so, don't prevent default behavior
            const clickedLink = target.closest('a') as HTMLAnchorElement;
            if (clickedLink) {
                // Link: let it navigate normally
                return;
            }

            // Other elements: prevent default and trigger location
            e.preventDefault();
            e.stopPropagation();

            // Prepare click info object
            const clickInfo: { type: string; index: number; src?: string; alt?: string; content?: string } = {
                type: mdType,
                index: parseInt(mdIndex, 10)
            };


            // For images, include src and alt
            if (mdType === 'image' && target.tagName === 'IMG') {
                const img = target as HTMLImageElement;

                // Use getAttribute('src') to preserve original path (e.g., "./images/photo.png")
                // img.src returns resolved absolute URL, which won't match markdown text
                const originalSrc = img.getAttribute('src') || img.src;

                clickInfo.src = originalSrc;
                clickInfo.alt = img.alt || '';
            }

            onImageClick(clickInfo);
        };

        // Use event delegation on document to handle clicks on dynamically rendered content
        document.addEventListener('click', handleElementClick);

        // Add visual feedback style for all clickable elements
        const style = document.createElement('style');
        style.textContent = `
            .preview-content [data-md-type] {
                cursor: pointer;
                transition: background-color 0.2s ease, outline 0.2s ease;
            }
            .preview-content [data-md-type="image"]:hover,
            .preview-content [data-md-type="paragraph"]:hover {
                background-color: rgba(0, 102, 204, 0.05);
                border-radius: 4px;
            }
            .preview-content [data-md-type="heading"]:hover {
                background-color: rgba(0, 102, 204, 0.05);
                border-radius: 4px;
            }
            .preview-content img:hover {
                outline: 2px solid rgba(0, 102, 204, 0.5);
                outline-offset: 2px;
            }
        `;
        document.head.appendChild(style);

        return () => {
            document.removeEventListener('click', handleElementClick);
            document.head.removeChild(style);
        };
    }, [onImageClick]);

    return (
        <div
            ref={previewOuterScrollRef}
            data-testid="preview-outer-scroll"
            onScroll={scrollSyncEnabled ? onPreviewOuterScroll : undefined}
            className="relative overflow-y-auto no-scrollbar flex flex-col z-20 flex-1 min-h-0 w-full overflow-x-hidden scroll-touch bg-[#f2f2f7]/50 dark:bg-[#000000]"
        >
            <div
                className="w-full md:w-[840px] xl:w-[1024px] md:max-w-[95%] transition-all duration-500 mt-6 md:mt-12 mb-16 md:mb-32 mx-auto md:ml-6 md:mr-auto h-fit min-h-[calc(100%-48px)] flex items-start justify-center relative px-3 md:px-0"
            >
                <div className="bg-white rounded-[24px] overflow-hidden shadow-apple-lg transition-all duration-500 ring-1 ring-[#00000008] border-t border-white/50 w-full">
                    <div
                        ref={contentRef}
                        data-testid="preview-content"
                        dangerouslySetInnerHTML={{ __html: renderedHtml }}
                        className="preview-content min-w-full"
                    />
                </div>
            </div>
        </div>
    );
}
