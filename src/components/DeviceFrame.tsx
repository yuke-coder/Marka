import React, { useEffect, useRef } from 'react';

interface DeviceFrameProps {
    device: 'mobile' | 'tablet';
    scrollRef?: React.RefObject<HTMLDivElement>;
    onScroll?: () => void;
    children: React.ReactNode;
}

export default function DeviceFrame({ device, scrollRef, onScroll, children }: DeviceFrameProps) {
    const localRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef && localRef.current) {
            (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = localRef.current;
        }
    }, [scrollRef]);

    const isMobile = device === 'mobile';
    // 名义尺寸，但允许在小视口下自适应缩放，保留呼吸感
    const sizeClass = isMobile
        ? 'w-[390px] max-w-[94vw] h-[844px] max-h-[88vh] rounded-[44px]'
        : 'w-[744px] max-w-[92vw] h-[1000px] max-h-[88vh] rounded-[36px]';

    return (
        <div className={`relative flex-shrink-0 bg-black shadow-2xl p-2 ${sizeClass}`}>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-2xl z-10" />
            <div
                ref={localRef}
                onScroll={onScroll}
                className="w-full h-full rounded-[36px] overflow-y-auto no-scrollbar bg-[#fbfbfd] dark:bg-[#1c1c1e] scroll-touch"
            >
                {children}
            </div>
        </div>
    );
}
