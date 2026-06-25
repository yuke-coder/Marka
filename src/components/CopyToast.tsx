import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Download, AlertCircle, X } from 'lucide-react';

export type NoticeTone = 'success' | 'download' | 'error';
export type Notice = { title: string; description: string; tone: NoticeTone };

interface CopyToastProps {
    notice: Notice | null;
    onClose: () => void;
    duration?: number;
}

const TONE_CONFIG: Record<NoticeTone, { icon: typeof CheckCircle2; iconColor: string; barColor: string }> = {
    success: { icon: CheckCircle2, iconColor: 'text-[#34c759]', barColor: 'bg-[#34c759]' },
    download: { icon: Download, iconColor: 'text-[#0a84ff]', barColor: 'bg-[#0a84ff]' },
    error: { icon: AlertCircle, iconColor: 'text-[#ff3b30]', barColor: 'bg-[#ff3b30]' },
};

/**
 * 通用提示弹窗（复制成功 / 导出完成）。
 * 从屏幕右侧向左侧平滑弹出；底部进度条匀速递减，归零自动关闭；
 * 鼠标悬停时进度条暂停，离开后继续。
 */
export default function CopyToast({ notice, onClose, duration = 3000 }: CopyToastProps) {
    const [progress, setProgress] = useState(100);
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(false);
    const elapsedRef = useRef(0);
    const onCloseRef = useRef(onClose);

    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!notice) {
            elapsedRef.current = 0;
            setProgress(100);
            setIsPaused(false);
            isPausedRef.current = false;
            return;
        }
        let lastTime = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const delta = now - lastTime;
            lastTime = now;
            if (!isPausedRef.current) {
                elapsedRef.current += delta;
                const remaining = Math.max(0, 100 - (elapsedRef.current / duration) * 100);
                setProgress(remaining);
                if (remaining <= 0) { onCloseRef.current(); return; }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [notice, duration]);

    const toneCfg = notice ? TONE_CONFIG[notice.tone] : TONE_CONFIG.success;

    return (
        <AnimatePresence>
            {notice && (
                <motion.div
                    initial={{ opacity: 0, x: 320 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 320 }}
                    transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                    onHoverStart={() => setIsPaused(true)}
                    onHoverEnd={() => setIsPaused(false)}
                    className="fixed right-4 sm:right-6 top-24 z-[200] w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#0000000a] bg-white/90 dark:bg-[#2c2c2e]/90 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl"
                >
                    <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 20 }}
                            className="mt-0.5 shrink-0"
                        >
                            <toneCfg.icon size={20} className={toneCfg.iconColor} />
                        </motion.div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">{notice.title}</p>
                            <p className="mt-0.5 text-xs text-[#86868b] dark:text-[#a1a1a6]">{notice.description}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="shrink-0 rounded-full p-1 text-[#86868b] dark:text-[#a1a1a6] transition-colors hover:bg-[#00000008] dark:hover:bg-[#ffffff10] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
                            aria-label="关闭"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <div className="h-1 w-full bg-[#00000008] dark:bg-[#ffffff10]">
                        <div className={`h-full ${toneCfg.barColor} transition-none`} style={{ width: `${progress}%` }} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
