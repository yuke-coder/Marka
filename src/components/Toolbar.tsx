import { Copy, Download, Smartphone, Tablet, Monitor, Loader2, Link2, Unlink2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface ToolbarProps {
    previewDevice: 'mobile' | 'tablet' | 'pc';
    onDeviceChange: (device: 'mobile' | 'tablet' | 'pc') => void;
    onExportPdf: () => void;
    onExportHtml: () => void;
    onCopy: () => void;
    isCopying: boolean;
    scrollSyncEnabled: boolean;
    onToggleScrollSync: () => void;
}

export default function Toolbar({ previewDevice, onDeviceChange, onExportPdf, onExportHtml, onCopy, isCopying, scrollSyncEnabled, onToggleScrollSync }: ToolbarProps) {
    return (
        <div className="flex items-center justify-end gap-2 lg:gap-4 px-2 lg:px-4 py-3 min-w-0 shrink-0">
            <div className="hidden md:flex bg-[#00000008] dark:bg-[#ffffff10] p-1 rounded-full backdrop-blur-md shrink-0">
                <button
                    data-testid="device-mobile"
                    onClick={() => onDeviceChange('mobile')}
                    className={`p-2 rounded-full transition-all ${previewDevice === 'mobile' ? 'bg-white dark:bg-[#2c2c2e] shadow-sm' : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'}`}
                    title="手机视图 (480px)"
                >
                    <Smartphone size={16} />
                </button>
                <button
                    data-testid="device-tablet"
                    onClick={() => onDeviceChange('tablet')}
                    className={`p-2 rounded-full transition-all ${previewDevice === 'tablet' ? 'bg-white dark:bg-[#2c2c2e] shadow-sm' : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'}`}
                    title="平板视图 (768px)"
                >
                    <Tablet size={16} />
                </button>
                <button
                    data-testid="device-pc"
                    onClick={() => onDeviceChange('pc')}
                    className={`p-2 rounded-full transition-all ${previewDevice === 'pc' ? 'bg-white dark:bg-[#2c2c2e] shadow-sm' : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'}`}
                    title="桌面视图 (PC)"
                >
                    <Monitor size={16} />
                </button>
            </div>

            <div className="flex items-center gap-2 lg:gap-4 shrink-0">
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    data-testid="scroll-sync-toggle"
                    onClick={onToggleScrollSync}
                    className={`apple-export-btn !bg-[#00000008] dark:!bg-[#ffffff10] border-transparent whitespace-nowrap ${scrollSyncEnabled ? 'text-[#0066cc] dark:text-[#0a84ff]' : 'text-[#86868b] dark:text-[#a1a1a6]'}`}
                    title={scrollSyncEnabled ? '关闭滚动同步' : '开启滚动同步'}
                >
                    {scrollSyncEnabled ? <Link2 size={14} /> : <Unlink2 size={14} />}
                    <span className="hidden xl:inline">{scrollSyncEnabled ? '滚动同步开' : '滚动同步关'}</span>
                    <span className="xl:hidden">{scrollSyncEnabled ? '同步开' : '同步关'}</span>
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    data-testid="export-pdf"
                    onClick={onExportPdf}
                    className="apple-export-btn !hidden lg:!flex !bg-[#00000008] dark:!bg-[#ffffff10] border-transparent whitespace-nowrap"
                >
                    <Download size={14} />
                    导出 PDF
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    data-testid="export-html"
                    onClick={onExportHtml}
                    className="apple-export-btn !hidden 2xl:!flex !bg-[#00000008] dark:!bg-[#ffffff10] border-transparent whitespace-nowrap"
                >
                    <Download size={14} />
                    导出 HTML
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    data-testid="copy-button"
                    onClick={onCopy}
                    disabled={isCopying}
                    className={`${isCopying ? "apple-copy-btn opacity-80 cursor-not-allowed" : "apple-copy-btn"} whitespace-nowrap`}
                >
                    {isCopying ? <Loader2 className="animate-spin" size={16} /> : <Copy size={16} />}
                    <span className="hidden sm:inline">{isCopying ? '正在打包图片...' : '复制到公众号'}</span>
                    <span className="sm:hidden">{isCopying ? '打包中...' : '复制'}</span>
                </motion.button>
            </div>
        </div>
    );
}
