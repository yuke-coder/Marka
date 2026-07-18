import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Upload, Smartphone, Tablet, Monitor, Loader2, Link2, Unlink2, FileText, FileCode2, FileType2, ChevronDown, FileType, Image as ImageIcon, PanelLeftClose, PanelRightClose, ArrowLeftRight, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getMarkaDocumentDefinition,
    type MarkaDocumentDefinition,
    type MarkaDocumentKind,
} from '../lib/markaDocument';
import {
    getDocumentFeatureAvailability,
    type DocumentFeature,
    type FeatureAvailability,
} from '../lib/documentRuntime';

export type LayoutMode = 'both' | 'edit' | 'preview';

interface DesktopToolbarProps {
    previewDevice: 'mobile' | 'tablet' | 'pc';
    onDeviceChange: (device: 'mobile' | 'tablet' | 'pc') => void;
    onExportPdf: () => void;
    onExportHtml: () => void;
    onExportSource: () => void;
    onExportDoc: () => void;
    onExportPng: () => void;
    onImport: (file: File) => void;
    onCopy: () => void;
    onCopySource: () => void;
    documentKind: MarkaDocumentKind;
    isCopying: boolean;
    scrollSyncEnabled: boolean;
    onToggleScrollSync: () => void;
    layoutMode: LayoutMode;
    onLayoutModeChange: (mode: LayoutMode) => void;
    pageFullscreen: boolean;
    onTogglePageFullscreen: () => void;
    systemFullscreen: boolean;
    onToggleSystemFullscreen: () => void;
    editorCollapsed: boolean;
    previewCollapsed: boolean;
    onToggleEditorCollapse: () => void;
    onTogglePreviewCollapse: () => void;
    editorOnRight: boolean;
    onEditorSideChange: (onRight: boolean) => void;
    zoom: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetZoom: () => void;
}

interface MobileToolbarProps {
    onExportPdf: () => void;
    onExportHtml: () => void;
    onExportSource: () => void;
    onExportDoc: () => void;
    onExportPng: () => void;
    onImport: (file: File) => void;
    onCopy: () => void;
    onCopySource: () => void;
    documentKind: MarkaDocumentKind;
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

const viewModes: Array<{ id: LayoutMode; label: string }> = [
    { id: 'both', label: '编辑 + 预览' },
    { id: 'edit', label: '仅编辑' },
    { id: 'preview', label: '仅预览' },
];

function ViewDropdown({
    layoutMode,
    onLayoutModeChange,
    pageFullscreen,
    onTogglePageFullscreen,
    systemFullscreen,
    onToggleSystemFullscreen,
    editorOnRight,
    onEditorSideChange,
}: Pick<DesktopToolbarProps,
    | 'layoutMode'
    | 'onLayoutModeChange'
    | 'pageFullscreen'
    | 'onTogglePageFullscreen'
    | 'systemFullscreen'
    | 'onToggleSystemFullscreen'
    | 'editorOnRight'
    | 'onEditorSideChange'
>) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const close = (restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
    };

    const runAction = (action: () => void) => {
        action();
        close(true);
    };

    const focusItem = (index: number) => {
        const items = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item));
        if (!items.length) return;
        items[(index + items.length) % items.length]?.focus();
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            close(true);
            return;
        }
        if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(event.key === 'ArrowDown' ? 0 : -1));
            return;
        }
        if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const items = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Home') focusItem(0);
        else if (event.key === 'End') focusItem(-1);
        else focusItem(current + (event.key === 'ArrowDown' ? 1 : -1));
    };

    const menuItemClass = (active: boolean) =>
        `w-full px-3 py-2 text-left text-[13px] font-medium leading-5 transition-colors focus-visible:outline-none ${active
            ? 'bg-[#0066cc]/8 text-[#0066cc] dark:bg-[#0a84ff]/12 dark:text-[#0a84ff]'
            : 'text-[#3a3a3c] hover:bg-black/[0.04] focus-visible:bg-black/[0.04] dark:text-[#d1d1d6] dark:hover:bg-white/[0.07] dark:focus-visible:bg-white/[0.07]'}`;

    return (
        <div
            ref={rootRef}
            className="relative shrink-0"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onBlurCapture={(event) => {
                if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
            }}
            onKeyDown={onKeyDown}
        >
            <button
                ref={triggerRef}
                type="button"
                data-testid="view-trigger"
                aria-haspopup="menu"
                aria-expanded={open}
                className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/30 ${open
                    ? 'bg-black/[0.04] text-[#1d1d1f] dark:bg-white/[0.07] dark:text-[#f5f5f7]'
                    : 'text-[#5e5e63] hover:bg-black/[0.03] hover:text-[#1d1d1f] dark:text-[#98989d] dark:hover:bg-white/[0.05] dark:hover:text-[#f5f5f7]'}`}
                onClick={() => setOpen((value) => !value)}
            >
                <span>视图</span>
                <ChevronDown size={11} aria-hidden="true" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -3, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -3, scale: 0.98 }}
                        transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
                        className="absolute right-0 top-full z-[150] w-36 pt-1.5"
                    >
                        <div
                            data-testid="view-menu"
                            role="menu"
                            aria-label="视图布局"
                            className="overflow-hidden rounded-xl bg-white py-1.5 shadow-apple-lg dark:bg-[#1c1c1e]"
                        >
                            <div role="group" aria-label="布局模式">
                                {viewModes.map((item, index) => (
                                    <button
                                        key={item.id}
                                        ref={(node) => { itemRefs.current[index] = node; }}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={layoutMode === item.id}
                                        data-testid={`view-${item.id}`}
                                        tabIndex={layoutMode === item.id ? 0 : -1}
                                        onClick={() => runAction(() => onLayoutModeChange(item.id))}
                                        className={menuItemClass(layoutMode === item.id)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                            {layoutMode === 'both' && (
                                <>
                                    <div role="group" aria-label="编辑区位置">
                                        <button
                                            ref={(node) => { itemRefs.current[3] = node; }}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={!editorOnRight}
                                            data-testid="view-editor-left"
                                            tabIndex={-1}
                                            onClick={() => runAction(() => onEditorSideChange(false))}
                                            className={menuItemClass(!editorOnRight)}
                                        >
                                            左侧编辑
                                        </button>
                                        <button
                                            ref={(node) => { itemRefs.current[4] = node; }}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={editorOnRight}
                                            data-testid="view-editor-right"
                                            tabIndex={-1}
                                            onClick={() => runAction(() => onEditorSideChange(true))}
                                            className={menuItemClass(editorOnRight)}
                                        >
                                            右侧编辑
                                        </button>
                                    </div>
                                </>
                            )}
                            <button
                                ref={(node) => { itemRefs.current[5] = node; }}
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={pageFullscreen}
                                data-testid="view-page-fullscreen"
                                tabIndex={-1}
                                onClick={() => runAction(onTogglePageFullscreen)}
                                className={menuItemClass(pageFullscreen)}
                            >
                                页面全屏
                            </button>
                            <button
                                ref={(node) => { itemRefs.current[6] = node; }}
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={systemFullscreen}
                                data-testid="view-system-fullscreen"
                                tabIndex={-1}
                                onClick={() => runAction(onToggleSystemFullscreen)}
                                className={menuItemClass(systemFullscreen)}
                            >
                                系统全屏
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ImportButton({ onImport, compact }: { onImport: (file: File) => void; compact?: boolean }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <>
            <input
                ref={inputRef}
                data-testid="import-file-input"
                type="file"
                accept=".md,.markdown,.txt,.html,.htm"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImport(file);
                    e.currentTarget.value = '';
                }}
            />
            <button
                data-testid="import-button"
                onClick={() => inputRef.current?.click()}
                className={`${compact ? 'inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-md text-[12px]' : tb} ${idle}`}
            >
                <Upload size={compact ? 14 : 13} />
                {!compact && <span className="hidden sm:inline">导入</span>}
            </button>
        </>
    );
}

const exportItems = [
    { id: 'source', label: 'Markdown 源文件', icon: FileText, action: 'onExportSource' as const, desc: '原始 Markdown 源码', feature: 'export.source' as const },
    { id: 'doc', label: 'Word 文档', icon: FileType, action: 'onExportDoc' as const, desc: '可在 Office 打开', feature: 'export.word' as const },
    { id: 'pdf', label: 'PDF 文档', icon: FileType2, action: 'onExportPdf' as const, desc: '适合存档与分享', feature: 'export.pdf' as const },
    { id: 'html', label: 'HTML 文件', icon: FileCode2, action: 'onExportHtml' as const, desc: '带样式网页文件', feature: 'export.html' as const },
    { id: 'png', label: 'PNG 长图', icon: ImageIcon, action: 'onExportPng' as const, desc: '社交分享长图', feature: 'export.png' as const },
];

function exportItemAvailability(
    feature: Extract<DocumentFeature, `export.${string}`>,
    documentKind: MarkaDocumentKind,
): FeatureAvailability {
    return getDocumentFeatureAvailability(documentKind, feature);
}

function ExportDropdown({ actionMap, documentDefinition, isMobile, compact }: {
    actionMap: Record<string, () => void>;
    documentDefinition: MarkaDocumentDefinition;
    isMobile?: boolean;
    compact?: boolean;
}) {
    const [exportOpen, setExportOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
    const stableExportItems = exportItems.map((item) => item.id === 'source'
        ? {
            ...item,
            label: `${documentDefinition.label} 源文件`,
            desc: `原始 ${documentDefinition.label} 源码`,
        }
        : item);

    useEffect(() => {
        if (!isMobile || !exportOpen || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const menuWidth = 208; // w-52 = 13rem ≈ 208px
        const margin = 12;
        const vw = window.innerWidth;
        // 默认右对齐：菜单右边缘与按钮右边缘对齐
        let right = vw - rect.right;
        // 防止左侧超出屏幕
        const left = vw - right - menuWidth;
        if (left < margin) {
            right = vw - margin - menuWidth;
        }
        // 防止右侧超出屏幕
        if (right < margin) {
            right = margin;
        }
        setMenuPos({ top: rect.bottom + 6, right });
    }, [isMobile, exportOpen]);

    const menu = (
        <AnimatePresence>
            {exportOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                    className={`${isMobile ? 'fixed' : 'absolute top-full right-0 mt-1.5'} w-52 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-apple-lg border border-[#00000012] dark:border-[#ffffff15] py-1.5 z-[100]`}
                    style={isMobile && menuPos ? { top: menuPos.top, right: menuPos.right } : undefined}
                    onMouseEnter={() => !isMobile && setExportOpen(true)}
                    onMouseLeave={() => !isMobile && setExportOpen(false)}
                >
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-[#86868b] dark:text-[#8a8a8f] uppercase tracking-widest">
                        下载文件
                    </div>
                    {stableExportItems.map(item => {
                        const Icon = item.icon;
                        const availability = exportItemAvailability(item.feature, documentDefinition.kind);
                        const available = availability.state === 'enabled';
                        const unavailableReason = availability.state === 'enabled'
                            ? undefined
                            : availability.reason;
                        return (
                            <button
                                key={item.id}
                                data-testid={`export-${item.id}`}
                                disabled={!available}
                                aria-disabled={!available}
                                data-tooltip={!available ? unavailableReason : undefined}
                                title={!available ? unavailableReason : undefined}
                                onClick={() => {
                                    if (!available) return;
                                    actionMap[item.action]();
                                    setExportOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors ${available
                                    ? 'text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-black/[0.04] dark:hover:bg-white/[0.07]'
                                    : 'text-[#8e8e93] dark:text-[#6e6e73] opacity-45 cursor-not-allowed'
                                }`}
                            >
                                <Icon size={15} className={`${available ? 'text-[#5e5e63] dark:text-[#98989d]' : 'text-current'} shrink-0`} />
                                <div className="flex flex-col items-start min-w-0">
                                    <span className="font-medium leading-tight">{item.label}</span>
                                    <span className={`text-[11px] leading-tight ${available ? 'text-[#86868b] dark:text-[#8a8a8f]' : 'text-current'}`}>
                                        {available ? item.desc : '当前文档类型暂不可用'}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div
            className="relative shrink-0"
            onMouseEnter={() => !isMobile && setExportOpen(true)}
            onMouseLeave={() => !isMobile && setExportOpen(false)}
        >
            <button
                ref={triggerRef}
                data-testid="export-trigger"
                className={`${compact ? 'inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-md text-[12px]' : tb} ${exportOpen ? 'border-[#00000025] dark:border-[#ffffff28] bg-black/[0.04] dark:bg-white/[0.07] text-[#1d1d1f] dark:text-[#f5f5f7]' : idle}`}
                onClick={() => isMobile && setExportOpen(v => !v)}
            >
                <Download size={compact ? 14 : 13} />
                {!isMobile && <span className="hidden sm:inline">下载</span>}
                <ChevronDown size={11} className={`transition-transform duration-200 ${exportOpen ? 'rotate-180' : ''}`} />
            </button>

            {isMobile ? createPortal(menu, document.body) : menu}
        </div>
    );
}

export function DesktopToolbar({
    previewDevice, onDeviceChange,
    onExportPdf, onExportHtml, onExportSource, onExportDoc, onExportPng,
    onImport,
    onCopy, onCopySource, documentKind, isCopying,
    scrollSyncEnabled, onToggleScrollSync,
    layoutMode, onLayoutModeChange,
    pageFullscreen, onTogglePageFullscreen,
    systemFullscreen, onToggleSystemFullscreen,
    editorCollapsed, previewCollapsed, onToggleEditorCollapse, onTogglePreviewCollapse,
    editorOnRight, onEditorSideChange,
    zoom, onZoomIn, onZoomOut, onResetZoom,
}: DesktopToolbarProps) {
    const documentDefinition = getMarkaDocumentDefinition(documentKind);
    const actionMap: Record<string, () => void> = { onExportPdf, onExportHtml, onExportSource, onExportDoc, onExportPng };
    const scrollSyncAvailability = getDocumentFeatureAvailability(documentKind, 'scroll.sync');
    const canSyncScroll = scrollSyncAvailability.state === 'enabled';
    const scrollSyncUnavailableReason = scrollSyncAvailability.state === 'enabled'
        ? undefined
        : scrollSyncAvailability.reason;

    return (
        <div className="flex-1 min-w-0 flex items-center justify-end px-3 lg:px-4 py-0.5 shrink-0 gap-2">
            <div className={segWrap} role="group" aria-label="面板折叠">
                <button
                    data-testid="collapse-editor"
                    onClick={onToggleEditorCollapse}
                    disabled={previewCollapsed}
                    className={`${segBtn} ${editorCollapsed ? segOn : segOff} disabled:opacity-30 disabled:cursor-not-allowed`}
                    data-tooltip={editorCollapsed ? '展开编辑区' : '收起编辑区'}
                    aria-pressed={editorCollapsed}
                    aria-label="切换编辑区折叠"
                >
                    <PanelLeftClose size={13} />
                </button>
                <button
                    data-testid="collapse-preview"
                    onClick={onTogglePreviewCollapse}
                    disabled={editorCollapsed}
                    className={`${segBtn} ${previewCollapsed ? segOn : segOff} disabled:opacity-30 disabled:cursor-not-allowed`}
                    data-tooltip={previewCollapsed ? '展开预览区' : '收起预览区'}
                    aria-pressed={previewCollapsed}
                    aria-label="切换预览区折叠"
                >
                    <PanelRightClose size={13} />
                </button>
            </div>

            <button
                data-testid="swap-panels"
                onClick={() => onEditorSideChange(!editorOnRight)}
                disabled={editorCollapsed || previewCollapsed}
                className={`${segBtn} ${segOff} disabled:opacity-30 disabled:cursor-not-allowed`}
                data-tooltip={editorCollapsed || previewCollapsed ? '双栏展开时才可交换位置' : (editorOnRight ? '编辑区在右' : '编辑区在左')}
                aria-pressed={editorOnRight}
                aria-label="切换编辑区左右位置"
            >
                <ArrowLeftRight size={13} />
            </button>

            <ViewDropdown
                layoutMode={layoutMode}
                onLayoutModeChange={onLayoutModeChange}
                pageFullscreen={pageFullscreen}
                onTogglePageFullscreen={onTogglePageFullscreen}
                systemFullscreen={systemFullscreen}
                onToggleSystemFullscreen={onToggleSystemFullscreen}
                editorOnRight={editorOnRight}
                onEditorSideChange={onEditorSideChange}
            />

            <div className={segWrap} role="group" aria-label="预览设备">
                <button
                    data-testid="device-mobile"
                    onClick={() => onDeviceChange('mobile')}
                    className={`${segBtn} ${previewDevice === 'mobile' ? segOn : segOff}`}
                    data-tooltip="手机预览"
                    aria-pressed={previewDevice === 'mobile'}
                >
                    <Smartphone size={13} />
                </button>
                <button
                    data-testid="device-tablet"
                    onClick={() => onDeviceChange('tablet')}
                    className={`${segBtn} ${previewDevice === 'tablet' ? segOn : segOff}`}
                    data-tooltip="平板预览"
                    aria-pressed={previewDevice === 'tablet'}
                >
                    <Tablet size={13} />
                </button>
                <button
                    data-testid="device-pc"
                    onClick={() => onDeviceChange('pc')}
                    className={`${segBtn} ${previewDevice === 'pc' ? segOn : segOff}`}
                    data-tooltip="桌面预览"
                    aria-pressed={previewDevice === 'pc'}
                >
                    <Monitor size={13} />
                </button>
            </div>

            <div className={segWrap} role="group" aria-label="缩放">
                <button
                    data-testid="zoom-out"
                    onClick={onZoomOut}
                    className={`${segBtn} ${segOff}`}
                    data-tooltip="缩小"
                    aria-label="缩小"
                >
                    <ZoomOut size={13} />
                </button>
                <button
                    data-testid="zoom-reset"
                    onClick={onResetZoom}
                    className={`${segBtn} ${segOff} w-auto px-1 text-[11px] font-medium tabular-nums`}
                    data-tooltip="重置缩放"
                    aria-label="重置缩放"
                >
                    {Math.round(zoom * 100)}%
                </button>
                <button
                    data-testid="zoom-in"
                    onClick={onZoomIn}
                    className={`${segBtn} ${segOff}`}
                    data-tooltip="放大"
                    aria-label="放大"
                >
                    <ZoomIn size={13} />
                </button>
            </div>

            <button
                data-testid="scroll-sync-toggle"
                onClick={onToggleScrollSync}
                disabled={!canSyncScroll}
                aria-disabled={!canSyncScroll}
                aria-pressed={canSyncScroll && scrollSyncEnabled}
                data-tooltip={scrollSyncUnavailableReason}
                title={scrollSyncUnavailableReason}
                className={`${tb} ${canSyncScroll
                    ? scrollSyncEnabled ? active : idle
                    : 'border-[#00000010] dark:border-[#ffffff16] text-[#8e8e93] dark:text-[#6e6e73] bg-transparent opacity-40 cursor-not-allowed'
                }`}
            >
                {scrollSyncEnabled && canSyncScroll ? <Link2 size={13} /> : <Unlink2 size={13} />}
                <span className="hidden md:inline">同步滚动</span>
            </button>

            <ImportButton onImport={onImport} />

            <ExportDropdown actionMap={actionMap} documentDefinition={documentDefinition} />

            <button
                data-testid="copy-markdown-button"
                onClick={onCopySource}
                className={`${tb} ${idle}`}
            >
                <FileText size={13} />
                <span className="hidden sm:inline">{`复制 ${documentDefinition.abbreviation}`}</span>
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
    onExportPdf, onExportHtml, onExportSource, onExportDoc, onExportPng,
    onImport,
    onCopy, onCopySource, documentKind, isCopying, compact
}: MobileToolbarProps) {
    const documentDefinition = getMarkaDocumentDefinition(documentKind);
    const actionMap: Record<string, () => void> = { onExportPdf, onExportHtml, onExportSource, onExportDoc, onExportPng };

    return (
        <div className="flex items-center flex-1 min-w-0 gap-0.5">
            <ImportButton onImport={onImport} compact={compact} />
            <ExportDropdown actionMap={actionMap} documentDefinition={documentDefinition} isMobile compact={compact} />
            <button
                data-testid="copy-markdown-button"
                onClick={onCopySource}
                className={`flex items-center justify-center flex-auto ${compact ? 'h-7 gap-0.5 px-1 text-[10px]' : 'h-8 gap-1 px-2 text-[11px]'} min-w-0 rounded-lg font-medium transition-all duration-150 border select-none whitespace-nowrap touch-manipulation active:scale-95 ${idle}`}
            >
                <FileText size={compact ? 12 : 13} className="shrink-0" />
                {!compact && <span>{`复制 ${documentDefinition.abbreviation}`}</span>}
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
