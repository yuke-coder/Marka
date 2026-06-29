import { useState } from 'react';
import { Copy, Download, Smartphone, Tablet, Monitor, Loader2, Link2, Unlink2, FileText, FileCode2, FileType2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DesktopToolbarProps {
    previewDevice: 'mobile' | 'tablet' | 'pc';
    onDeviceChange: (device: 'mobile' | 'tablet' | 'pc') => void;
    onExportPdf: () => void;
    onExportHtml: () => void;
    onExportMarkdown: () => void;
    onCopy: () => void;
    onCopyMarkdown: () => void;
    isCopying: boolean;
    scrollSyncEnabled: boolean;
    onToggleScrollSync: () => void;
}

interface MobileToolbarProps {
    onExportPdf: () => void;
    onExportHtml: () => void;
    onExportMarkdown: () => void;
    onCopy: () => void;
    onCopyMarkdown: () => void;
    isCopying: boolean;
    compact?: boolean;
}

const tb = 'inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-medium transition-all duration-150 border select-none shrink-0 whitespace-nowrap';
const idle = 'border-[#00000010] dark:border-[#ffffff16] text-[#5e5e63] dark:text-[#98989d] bg-transparent hover:border-[#00000025] dark:hover:border-[#ffffff28] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/[0.03] dark:hover:bg-white/[0.05] active:scale-[0.96]';
const active = 'border-[#0066cc]/35 dark:border-[#0a84ff]/35 text-[#0066cc] dark:text-[#0a84ff] bg-[#0066cc]/7 dark:bg-[#0a84ff]/10';

const segWrap = 'inline-flex items-center p-0.5 rounded-lg bg-black/[0.035] dark:bg-white/[0.055] border border-[#0000000c] dark:border-[#ffffff12] shrink-0';
const segBtn = 'inline-flex items-center justify-center w-7 h-6 rounded-[5px] transition-all duration-200 select-none text-[13px]';
const segOn = 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] shadow-[0_1px_2px_rgba(0,0,0,0.07)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)]';
const segOff = 'text-[#8e8e93] dark:text-[#6c6c70] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-95';

const exportItems = [
    { id: 'pdf', label: 'PDF 文档', icon: FileType2, action: 'onExportPdf' as const, desc: '适合存档与分享' },
    { id: 'html', label: 'HTML 文件', icon: FileCode2, action: 'onExportHtml' as const, desc: '带样式网页文件' },
    { id: 'md', label: 'Markdown 文件', icon: FileText, action: 'onExportMarkdown' as const, desc: '原始 Markdown 源码' },
];

function ExportDropdown({ actionMap, isMobile }: {
    actionMap: Record<string, () => void>;
    isMobile?: boolean;
}) {
    const [exportOpen, setExportOpen] = useState(false);

    return (
        <div
            className="relative shrink-0"
            onMouseEnter={() => !isMobile && setExportOpen(true)}
            onMouseLeave={() => !isMobile && setExportOpen(false)}
        >
            <button
                data-testid="export-trigger"
                className={`${tb} ${exportOpen ? 'border-[#00000025] dark:border-[#ffffff28] bg-black/[0.04] dark:bg-white/[0.07] text-[#1d1d1f] dark:text-[#f5f5f7]' : idle}`}
                onClick={() => isMobile && setExportOpen(v => !v)}
            >
                <Download size={13} />
                {!isMobile && <span className="hidden sm:inline">下载</span>}
                <ChevronDown size={11} className={`transition-transform duration-200 ${exportOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {exportOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                        className="absolute top-full right-0 mt-1.5 w-52 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-apple-lg border border-[#00000012] dark:border-[#ffffff15] py-1.5 z-50"
                    >
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-[#86868b] dark:text-[#8a8a8f] uppercase tracking-widest">
                            下载文件
                        </div>
                        {exportItems.map(item => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    data-testid={`export-${item.id}`}
                                    onClick={() => {
                                        actionMap[item.action]();
                                        setExportOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-black/[0.04] dark:hover:bg-white/[0.07] transition-colors"
                                >
                                    <Icon size={15} className="text-[#5e5e63] dark:text-[#98989d] shrink-0" />
                                    <div className="flex flex-col items-start min-w-0">
                                        <span className="font-medium leading-tight">{item.label}</span>
                                        <span className="text-[11px] text-[#86868b] dark:text-[#8a8a8f] leading-tight">{item.desc}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function DesktopToolbar({
    previewDevice, onDeviceChange,
    onExportPdf, onExportHtml, onExportMarkdown,
    onCopy, onCopyMarkdown, isCopying,
    scrollSyncEnabled, onToggleScrollSync
}: DesktopToolbarProps) {
    const actionMap: Record<string, () => void> = { onExportPdf, onExportHtml, onExportMarkdown };

    return (
        <div className="flex-1 min-w-0 flex items-center justify-end px-3 lg:px-4 py-0.5 shrink-0 gap-2">
            <div className={segWrap} role="group" aria-label="预览设备">
                <button
                    data-testid="device-mobile"
                    onClick={() => onDeviceChange('mobile')}
                    className={`${segBtn} ${previewDevice === 'mobile' ? segOn : segOff}`}
                    title="手机预览"
                    aria-pressed={previewDevice === 'mobile'}
                >
                    <Smartphone size={13} />
                </button>
                <button
                    data-testid="device-tablet"
                    onClick={() => onDeviceChange('tablet')}
                    className={`${segBtn} ${previewDevice === 'tablet' ? segOn : segOff}`}
                    title="平板预览"
                    aria-pressed={previewDevice === 'tablet'}
                >
                    <Tablet size={13} />
                </button>
                <button
                    data-testid="device-pc"
                    onClick={() => onDeviceChange('pc')}
                    className={`${segBtn} ${previewDevice === 'pc' ? segOn : segOff}`}
                    title="桌面预览"
                    aria-pressed={previewDevice === 'pc'}
                >
                    <Monitor size={13} />
                </button>
            </div>

            <button
                data-testid="scroll-sync-toggle"
                onClick={onToggleScrollSync}
                className={`${tb} ${scrollSyncEnabled ? active : idle}`}
                title={scrollSyncEnabled ? '关闭滚动同步' : '开启滚动同步'}
            >
                {scrollSyncEnabled ? <Link2 size={13} /> : <Unlink2 size={13} />}
                <span className="hidden md:inline">同步滚动</span>
            </button>

            <ExportDropdown actionMap={actionMap} />

            <button
                data-testid="copy-markdown-button"
                onClick={onCopyMarkdown}
                className={`${tb} ${idle}`}
                title="复制 Markdown 源码到剪贴板"
            >
                <FileText size={13} />
                <span className="hidden sm:inline">复制 MD</span>
            </button>

            <motion.button
                data-testid="copy-button"
                onClick={onCopy}
                disabled={isCopying}
                whileTap={{ scale: 0.96 }}
                className="inline-flex items-center gap-1.5 h-7 px-3.5 rounded-md text-[12px] font-semibold transition-all duration-150 shrink-0 bg-[#1d1d1f] dark:bg-[#f5f5f7] text-white dark:text-black hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
            >
                {isCopying ? <Loader2 className="animate-spin" size={13} /> : <Copy size={13} />}
                <span className="hidden sm:inline">{isCopying ? '打包中...' : '复制公众号'}</span>
                <span className="sm:hidden">{isCopying ? '打包中' : '公众号'}</span>
            </motion.button>
        </div>
    );
}

export function MobileToolbar({
    onExportPdf, onExportHtml, onExportMarkdown,
    onCopy, onCopyMarkdown, isCopying, compact
}: MobileToolbarProps) {
    const iconCls = compact
        ? 'flex items-center justify-center flex-auto h-7 min-w-0 rounded-md text-[11px] font-medium transition-all duration-150 border select-none touch-manipulation active:scale-95'
        : 'flex items-center justify-center flex-auto h-8 min-w-0 rounded-lg text-[11px] font-medium transition-all duration-150 border select-none touch-manipulation active:scale-95';
    const iconSize = compact ? 13 : 15;

    return (
        <div className="flex items-center flex-1 min-w-0 gap-0.5">
            <button
                data-testid="export-pdf"
                onClick={onExportPdf}
                className={`${iconCls} ${idle}`}
                title="导出 PDF"
            >
                <FileType2 size={iconSize} />
            </button>
            <button
                data-testid="export-html"
                onClick={onExportHtml}
                className={`${iconCls} ${idle}`}
                title="导出 HTML"
            >
                <FileCode2 size={iconSize} />
            </button>
            <button
                data-testid="export-md"
                onClick={onExportMarkdown}
                className={`${iconCls} ${idle}`}
                title="导出 Markdown"
            >
                <FileText size={iconSize} />
            </button>
            <button
                data-testid="copy-markdown-button"
                onClick={onCopyMarkdown}
                className={`flex items-center justify-center flex-auto ${compact ? 'h-7 gap-0.5 px-1 text-[10px]' : 'h-8 gap-1 px-2 text-[11px]'} min-w-0 rounded-lg font-medium transition-all duration-150 border select-none whitespace-nowrap touch-manipulation active:scale-95 ${idle}`}
                title="复制 Markdown 源码"
            >
                <FileText size={compact ? 12 : 13} className="shrink-0" />
                {!compact && <span>复制 MD</span>}
            </button>

            <motion.button
                data-testid="copy-button"
                onClick={onCopy}
                disabled={isCopying}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.06 }}
                className={`flex items-center justify-center flex-auto ${compact ? 'h-7 gap-0.5 px-1.5 text-[11px]' : 'h-8 gap-1 px-2 text-[12px]'} min-w-0 rounded-lg font-semibold transition-all duration-150 bg-[#1d1d1f] dark:bg-[#f5f5f7] text-white dark:text-black active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)] touch-manipulation`}
            >
                {isCopying ? <Loader2 className="animate-spin shrink-0" size={compact ? 12 : 13} /> : <Copy size={compact ? 12 : 13} className="shrink-0" />}
                <span className="whitespace-nowrap">{compact ? (isCopying ? '...' : '复制') : (isCopying ? '打包中' : '复制公众号')}</span>
            </motion.button>
        </div>
    );
}

export default DesktopToolbar;
