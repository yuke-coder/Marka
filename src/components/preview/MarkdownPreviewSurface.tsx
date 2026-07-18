import { forwardRef, useCallback, useEffect } from 'react';
import type { PreviewImageClickInfo } from './PreviewSurface';

interface MarkdownPreviewSurfaceProps {
    html: string;
    className: string;
    onImageClick?: (info: PreviewImageClickInfo) => void;
}

const MarkdownPreviewSurface = forwardRef<HTMLDivElement, MarkdownPreviewSurfaceProps>(
    function MarkdownPreviewSurface({ html, className, onImageClick }, ref) {
        useEffect(() => {
            if (!onImageClick) return;

            const style = document.createElement('style');
            style.textContent = `
                .preview-content [data-md-type] {
                    cursor: pointer;
                    transition: background-color 0.2s ease, outline 0.2s ease;
                }
                .preview-content [data-md-type="image"]:hover,
                .preview-content [data-md-type="paragraph"]:hover,
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
                document.head.removeChild(style);
            };
        }, [onImageClick]);

        const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
            if (!onImageClick) return;
            const target = event.target as HTMLElement;
            const element = target.closest('[data-md-type]') as HTMLElement | null;
            if (!element || target.closest('a')) return;

            const type = element.getAttribute('data-md-type');
            const index = element.getAttribute('data-md-index');
            if (!type || index === null) return;

            event.preventDefault();
            event.stopPropagation();

            const info: PreviewImageClickInfo = {
                type,
                index: Number.parseInt(index, 10),
            };
            if (type === 'image' && target.tagName === 'IMG') {
                const image = target as HTMLImageElement;
                info.src = image.getAttribute('src') || image.src;
                info.alt = image.alt || image.getAttribute('alt') || '';
            }
            onImageClick(info);
        }, [onImageClick]);

        return (
            <div
                ref={ref}
                data-testid="preview-content"
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={handleClick}
                className={`preview-content ${className}`}
            />
        );
    },
);

export default MarkdownPreviewSurface;
