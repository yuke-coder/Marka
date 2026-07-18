import React, { useEffect, useRef } from 'react';

export const DEVICE_FRAME_SIZE = {
    mobile: { width: 393, height: 852 },
    tablet: { width: 744, height: 1133 },
} as const;

type DeviceFrameMode = keyof typeof DEVICE_FRAME_SIZE;

export const DEVICE_FRAME_PADDING: Record<DeviceFrameMode, number> = {
    mobile: 8,
    tablet: 6,
};

interface DeviceFrameProps {
    device: DeviceFrameMode;
    scrollRef?: React.RefObject<HTMLDivElement>;
    onScroll?: () => void;
    screenSize?: { width: number; height: number };
    children: React.ReactNode;
}

export default function DeviceFrame({ device, scrollRef, onScroll, screenSize, children }: DeviceFrameProps) {
    const localRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef && localRef.current) {
            (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = localRef.current;
        }
    }, [scrollRef]);

    const isMobile = device === 'mobile';
    const framePadding = DEVICE_FRAME_PADDING[device];
    const displaySize = screenSize ?? DEVICE_FRAME_SIZE[device];
    const sizeClass = isMobile
        ? 'rounded-[44px] p-2'
        : 'rounded-[36px] p-1.5';
    const screenRadiusClass = isMobile ? 'rounded-[36px]' : 'rounded-[30px]';
    const frameStyle = {
        width: `${displaySize.width + framePadding * 2}px`,
        height: `${displaySize.height + framePadding * 2}px`,
    } as React.CSSProperties;

    return (
        <div
            data-testid="preview-device-frame"
            className={`relative flex-shrink-0 bg-black shadow-2xl ${sizeClass}`}
            style={frameStyle}
        >
            {isMobile && <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-2xl z-10" />}
            <div
                ref={localRef}
                onScroll={onScroll}
                className={`w-full h-full ${screenRadiusClass} overflow-y-auto no-scrollbar bg-[#fbfbfd] dark:bg-[#1c1c1e] scroll-touch`}
            >
                {children}
            </div>
        </div>
    );
}
