import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon } from 'lucide-react';
import { RATIO_PRESETS, renderPreviewToPng, dataUrlToBlob, type RatioPreset } from '../lib/pngExport';
import { saveBlob } from '../lib/fileSave';

interface PngExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    previewRef: React.MutableRefObject<HTMLDivElement | null>;
    isDark: boolean;
    onExported: () => void;
    onError: (msg: string) => void;
}

export default function PngExportDialog({ isOpen, onClose, previewRef, isDark, onExported, onError }: PngExportDialogProps) {
    const [ratio, setRatio] = useState<string>('9:16');
    const [cropFit, setCropFit] = useState(false);
    const [dataUrl, setDataUrl] = useState('');
    const [rendering, setRendering] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const currentImageDataUrlRef = useRef('');

    const currentPreset: RatioPreset = RATIO_PRESETS.find((p) => p.id === ratio) ?? RATIO_PRESETS[0];

    const render = useCallback(async () => {
        const el = previewRef.current;
        if (!el) return;
        setRendering(true);
        setDataUrl('');
        currentImageDataUrlRef.current = '';
        try {
            const result = await renderPreviewToPng(el, currentPreset, cropFit, isDark);
            setDataUrl(result.dataUrl);
            currentImageDataUrlRef.current = result.dataUrl;
        } catch (err) {
            console.error('PNG render failed', err);
            onError(err instanceof Error ? err.message : '渲染失败');
        } finally {
            setRendering(false);
        }
    }, [previewRef, currentPreset, cropFit, isDark, onError]);

    // 打开时或参数变化时自动渲染一次
    useEffect(() => {
        if (!isOpen) return;
        const t = setTimeout(() => { void render(); }, 60);
        return () => clearTimeout(t);
    }, [isOpen, ratio, cropFit, render]);

    const handleDownload = async () => {
        const url = currentImageDataUrlRef.current || dataUrl;
        if (!url) return;
        setDownloading(true);
        try {
            const blob = dataUrlToBlob(url);
            const filename = `Marka_Article_${Date.now()}.png`;
            const saved = await saveBlob(blob, filename, '.png', 'PNG 图片');
            if (saved) onExported();
        } catch (err) {
            console.error('PNG download failed', err);
            onError('下载失败');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[360] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0, 0, 0, 0.35)', backdropFilter: 'blur(4px)' }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.98 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full max-w-[640px] max-h-[86vh] flex flex-col rounded-[14px] overflow-hidden"
                        style={{
                            background: isDark ? '#151821' : '#ffffff',
                            color: isDark ? '#f0f2f7' : '#1a1d23',
                            boxShadow: isDark
                                ? '0 16px 48px rgba(0, 0, 0, 0.55)'
                                : '0 16px 48px rgba(15, 23, 42, 0.12)',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label="导出图片"
                    >
                        {/* 头部 */}
                        <div
                            className="flex items-center justify-between px-5 py-4"
                            style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}
                        >
                            <h3 className="m-0 text-[17px] font-semibold inline-flex items-center gap-2">
                                <ImageIcon size={18} style={{ color: isDark ? '#a5adb8' : '#5f6775' }} />
                                <span>导出图片</span>
                            </h3>
                            <button
                                onClick={onClose}
                                aria-label="关闭"
                                className="inline-flex items-center justify-center p-1 rounded-md transition-colors"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: isDark ? '#6b7280' : '#8a93a1',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = isDark ? '#1c1f2a' : '#f3f5f8';
                                    e.currentTarget.style.color = isDark ? '#f0f2f7' : '#1a1d23';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = isDark ? '#6b7280' : '#8a93a1';
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* 内容区 */}
                        <div
                            className="flex-1 min-h-0 overflow-y-auto px-5 py-[18px] text-[14px] leading-[1.7]"
                        >
                            <label
                                className="block font-medium mb-[6px] text-[13px]"
                                style={{ color: isDark ? '#f0f2f7' : '#1a1d23' }}
                            >
                                分享比例
                            </label>
                            <div
                                className="grid gap-2 mb-[14px]"
                                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))' }}
                            >
                                {RATIO_PRESETS.map((p) => {
                                    const active = ratio === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => setRatio(p.id)}
                                            className="py-2.5 px-1 rounded-md text-[13px] font-medium transition-all leading-[1.3]"
                                            style={{
                                                border: `1px solid ${active
                                                    ? (isDark ? '#818cf8' : '#4f46e5')
                                                    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
                                                background: active
                                                    ? (isDark ? '#818cf8' : '#4f46e5')
                                                    : (isDark ? '#1c1f2a' : '#f7f8fa'),
                                                color: active ? '#fff' : (isDark ? '#a5adb8' : '#5f6775'),
                                            }}
                                            onMouseEnter={(e) => {
                                                if (active) return;
                                                e.currentTarget.style.borderColor = isDark ? '#818cf8' : '#4f46e5';
                                                e.currentTarget.style.color = isDark ? '#818cf8' : '#4f46e5';
                                                e.currentTarget.style.background = isDark ? '#151821' : '#ffffff';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (active) return;
                                                e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
                                                e.currentTarget.style.color = isDark ? '#a5adb8' : '#5f6775';
                                                e.currentTarget.style.background = isDark ? '#1c1f2a' : '#f7f8fa';
                                            }}
                                        >
                                            <span>{p.label}</span>
                                            <small
                                                className="block text-[11px] font-normal mt-0.5"
                                                style={{ color: active ? 'rgba(255,255,255,0.85)' : (isDark ? '#6b7280' : '#8a93a1') }}
                                            >
                                                {p.desc}
                                            </small>
                                        </button>
                                    );
                                })}
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer select-none my-3">
                                <input
                                    type="checkbox"
                                    checked={cropFit}
                                    onChange={(e) => setCropFit(e.target.checked)}
                                    className="h-4 w-4"
                                    style={{ accentColor: isDark ? '#818cf8' : '#4f46e5' }}
                                />
                                <span
                                    className="text-[13px]"
                                    style={{ color: isDark ? '#a5adb8' : '#5f6775' }}
                                >
                                    过长时裁剪为固定比例（默认生成长图）
                                </span>
                            </label>

                            <label
                                className="block font-medium mb-[6px] text-[13px]"
                                style={{ color: isDark ? '#f0f2f7' : '#1a1d23' }}
                            >
                                预览
                            </label>
                            <div
                                className="flex items-center justify-center overflow-auto p-2.5"
                                style={{
                                    minHeight: 120,
                                    maxHeight: 420,
                                    background: isDark ? '#0b0d12' : '#f7f8fa',
                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                    borderRadius: '10px',
                                }}
                            >
                                {rendering ? (
                                    <span style={{ color: isDark ? '#6b7280' : '#8a93a1' }}>渲染中…</span>
                                ) : dataUrl ? (
                                    <img
                                        src={dataUrl}
                                        alt="导出预览"
                                        className="max-w-full block rounded-md"
                                        style={{ borderRadius: '6px' }}
                                    />
                                ) : null}
                            </div>
                            <p
                                className="mt-2.5 mb-0 text-[12px]"
                                style={{ color: isDark ? '#6b7280' : '#8a93a1' }}
                            >
                                内容较长时将按内容高度生成长图，方便手机阅读。
                            </p>
                        </div>

                        {/* 底部操作 */}
                        <div
                            className="flex justify-end gap-2 px-5 py-[14px]"
                            style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}
                        >
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-md text-[13px] font-medium transition-all"
                                style={{
                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                    background: isDark ? '#151821' : '#ffffff',
                                    color: isDark ? '#a5adb8' : '#5f6775',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = isDark ? '#818cf8' : '#4f46e5';
                                    e.currentTarget.style.color = isDark ? '#818cf8' : '#4f46e5';
                                    e.currentTarget.style.background = isDark ? '#1c1f2a' : '#f3f5f8';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
                                    e.currentTarget.style.color = isDark ? '#a5adb8' : '#5f6775';
                                    e.currentTarget.style.background = isDark ? '#151821' : '#ffffff';
                                }}
                            >
                                取消
                            </button>
                            <button
                                onClick={render}
                                disabled={rendering}
                                className="px-4 py-2 rounded-md text-[13px] font-medium transition-all disabled:opacity-50"
                                style={{
                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                    background: isDark ? '#151821' : '#ffffff',
                                    color: isDark ? '#a5adb8' : '#5f6775',
                                }}
                                onMouseEnter={(e) => {
                                    if (rendering) return;
                                    e.currentTarget.style.borderColor = isDark ? '#818cf8' : '#4f46e5';
                                    e.currentTarget.style.color = isDark ? '#818cf8' : '#4f46e5';
                                    e.currentTarget.style.background = isDark ? '#1c1f2a' : '#f3f5f8';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
                                    e.currentTarget.style.color = isDark ? '#a5adb8' : '#5f6775';
                                    e.currentTarget.style.background = isDark ? '#151821' : '#ffffff';
                                }}
                            >
                                {rendering ? '渲染中…' : '刷新预览'}
                            </button>
                            <button
                                onClick={handleDownload}
                                disabled={!dataUrl || downloading}
                                className="px-4 py-2 rounded-md text-[13px] font-medium transition-all disabled:opacity-50"
                                style={{
                                    border: '1px solid transparent',
                                    background: isDark ? '#818cf8' : '#4f46e5',
                                    color: '#fff',
                                }}
                                onMouseEnter={(e) => {
                                    if (!dataUrl || downloading) return;
                                    e.currentTarget.style.background = isDark ? '#a5b4fc' : '#4338ca';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isDark ? '#818cf8' : '#4f46e5';
                                }}
                            >
                                {downloading ? '下载中…' : '下载 PNG'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
