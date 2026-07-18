import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud } from 'lucide-react';

// 拖放文件时的全屏遮罩提示，直接复制自 lengyi-markdown-editor 的 .drop-overlay
export default function DropOverlay({ visible }: { visible: boolean }) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="pointer-events-none fixed inset-0 z-[400] flex items-center justify-center backdrop-blur-[2px]"
                    style={{
                        background: 'rgba(0, 102, 204, 0.06)',
                        boxShadow: 'inset 0 0 0 2px #0066cc',
                    }}
                >
                    <div className="flex flex-col items-center gap-3 text-[#0066cc] dark:text-[#0a84ff]">
                        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/80 dark:bg-[#1c1c1e]/80 shadow-lg">
                            <UploadCloud size={30} />
                        </div>
                        <span className="text-[15px] font-semibold">释放以打开文件或插入图片</span>
                        <span className="text-[11px] text-[#86868b] dark:text-[#8a8a8f]">支持 .md / .txt / .html / 图片</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
