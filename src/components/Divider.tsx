import React from 'react';

interface DividerProps {
    onPointerDown: (e: React.PointerEvent) => void;
    isDragging: boolean;
    ratio: number;
    minRatio?: number;
    maxRatio?: number;
}

/**
 * 可拖拽的中轴线分隔条。
 * 仅保留细线与命中区域，拖拽逻辑由父组件通过 onPointerDown 接管。
 */
export default function Divider({ onPointerDown, isDragging, ratio, minRatio = 0, maxRatio = 100 }: DividerProps) {
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(ratio)}
            aria-valuemin={Math.round(minRatio)}
            aria-valuemax={Math.round(maxRatio)}
            aria-label="编辑区与预览区分隔条"
            onPointerDown={onPointerDown}
            className={`relative h-full cursor-col-resize select-none touch-none ${isDragging ? 'z-50' : 'z-30'}`}
        >
            {/* 扩大的命中区域，便于抓取 */}
            <div className="absolute inset-y-0 -left-[6px] -right-[6px]" />

            {/* 视觉线条 */}
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#00000015] dark:bg-[#ffffff15]" />
        </div>
    );
}
