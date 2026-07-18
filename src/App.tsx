import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PenLine, Eye, Minimize2, PanelLeftOpen, PanelRightOpen } from 'lucide-react';

import { THEMES } from './lib/themes';
import { defaultContent } from './defaultContent';
import { findImagePosition, selectTextAreaRange } from './lib/imageSelector';
import { findElementPosition, type ElementLocation } from './lib/markdownLocator';
import Header from './components/Header';
import ThemeSelector from './components/ThemeSelector';
import { DesktopToolbar, MobileToolbar, type LayoutMode } from './components/Toolbar';
import EditorPanel from './components/EditorPanel';
import PreviewPanel, { type PreviewSurfaceHandle } from './components/PreviewPanel';
import Divider from './components/Divider';
import { DEVICE_FRAME_PADDING, DEVICE_FRAME_SIZE } from './components/DeviceFrame';

import CopyToast, { type Notice } from './components/CopyToast';
import Tooltip from './components/Tooltip';
import AiMarkdownDialog from './components/AiMarkdownDialog';
import DropOverlay from './components/DropOverlay';
import PngExportDialog from './components/PngExportDialog';
import { type AiApplyMode, type AiGenerationPhase } from './lib/aiMarkdown';
import { saveBlob } from './lib/fileSave';
import { isInIframe, fallbackCopyText, fallbackCopyHtml } from './lib/clipboard';
import { readFile } from './lib/fileImport';
import { buildDocBlob } from './lib/docExport';
import {
    applyMarkdownResult,
    createHtmlDocument,
    createMarkdownDocument,
    getMarkaDocumentDefinition,
    getMarkdownSource,
    insertDocumentFragment,
    isMarkdownDocument,
    updateDocumentSource,
    type MarkaDocument,
} from './lib/markaDocument';
import { loadMarkaDocument, saveMarkaDocument } from './lib/markaDocumentStorage';
import {
    buildMarkaClipboardPayload,
    getMarkaDocumentExportHtml,
    renderMarkaDocumentPreview,
} from './lib/markaDocumentRender';

// 持久化键：布局、主题、面板折叠状态等全部记住；文档自身由 MarkaDocument 负责。
const SPLIT_RATIO_STORAGE_KEY = 'marka:splitRatio';
const PREVIEW_DEVICE_STORAGE_KEY = 'marka:previewDevice';
const THEME_MODE_STORAGE_KEY = 'marka:themeMode';
const ACTIVE_THEME_STORAGE_KEY = 'marka:activeTheme';
const SCROLL_SYNC_STORAGE_KEY = 'marka:scrollSync';
const ACTIVE_PANEL_STORAGE_KEY = 'marka:activePanel';
const EDITOR_COLLAPSED_STORAGE_KEY = 'marka:editorCollapsed';
const PREVIEW_COLLAPSED_STORAGE_KEY = 'marka:previewCollapsed';
const EDITOR_ON_RIGHT_STORAGE_KEY = 'marka:editorOnRight';
const EDITOR_ZOOM_STORAGE_KEY = 'marka:editorZoom';
const PREVIEW_ZOOM_STORAGE_KEY = 'marka:previewZoom';

const SPLIT_RATIO_DEFAULT = 38.2;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.05;
const PREVIEW_DEVICE_DEFAULT: 'mobile' | 'tablet' | 'pc' = 'pc';

function loadPreviewDevice(): 'mobile' | 'tablet' | 'pc' {
    try {
        const raw = localStorage.getItem(PREVIEW_DEVICE_STORAGE_KEY);
        if (raw === 'mobile' || raw === 'tablet' || raw === 'pc') return raw;
        return PREVIEW_DEVICE_DEFAULT;
    } catch {
        return PREVIEW_DEVICE_DEFAULT;
    }
}

// 手机和平板预览会等比缩放，这里只限制可用下限，避免中轴线拖动范围被设备名义宽度锁死。
const PREVIEW_MIN_PX_BY_DEVICE: Record<'mobile' | 'tablet' | 'pc', number> = {
    mobile: 280,
    tablet: 420,
    pc: 680,
};
// 编辑区最小可读宽度
const EDITOR_MIN_PX = 280;

function loadSplitRatio(): number {
    try {
        const raw = localStorage.getItem(SPLIT_RATIO_STORAGE_KEY);
        if (raw === null) return SPLIT_RATIO_DEFAULT;
        const v = parseFloat(raw);
        if (!Number.isFinite(v)) return SPLIT_RATIO_DEFAULT;
        // 仅做基础范围兜底，实际动态边界在渲染与拖拽时基于容器宽度计算
        return Math.min(100, Math.max(0, v));
    } catch {
        return SPLIT_RATIO_DEFAULT;
    }
}

function loadInitialDocument(): MarkaDocument {
    try {
        return loadMarkaDocument(localStorage, defaultContent);
    } catch {
        return createMarkdownDocument(defaultContent);
    }
}

function loadThemeMode(): 'light' | 'dark' {
    try {
        const raw = localStorage.getItem(THEME_MODE_STORAGE_KEY);
        if (raw === 'light' || raw === 'dark') return raw;
        // 顺从系统主题
        if (typeof window !== 'undefined' && window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'light';
    } catch {
        return 'light';
    }
}

function loadActiveTheme(): string {
    try {
        const raw = localStorage.getItem(ACTIVE_THEME_STORAGE_KEY);
        if (raw && THEMES.some((t) => t.id === raw)) return raw;
        return THEMES[0].id;
    } catch {
        return THEMES[0].id;
    }
}

function loadScrollSync(): boolean {
    try {
        const raw = localStorage.getItem(SCROLL_SYNC_STORAGE_KEY);
        if (raw === null) return true;
        return raw === 'true';
    } catch {
        return true;
    }
}

function loadActivePanel(embedded: boolean): 'editor' | 'preview' {
    try {
        if (embedded) return 'preview';
        const raw = localStorage.getItem(ACTIVE_PANEL_STORAGE_KEY);
        if (raw === 'editor' || raw === 'preview') return raw;
        return 'editor';
    } catch {
        return 'editor';
    }
}

function loadBool(key: string, def = false): boolean {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return def;
        return raw === 'true';
    } catch {
        return def;
    }
}

function loadEditorOnRight(): boolean {
    try {
        const raw = localStorage.getItem(EDITOR_ON_RIGHT_STORAGE_KEY);
        if (raw === null) return false;
        return raw === 'true';
    } catch {
        return false;
    }
}

function loadZoomValue(key: string): number {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return 1;
        const v = parseFloat(raw);
        if (!Number.isFinite(v)) return 1;
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
    } catch {
        return 1;
    }
}

// 基于容器可用宽度计算中轴线的合法 [minRatio, maxRatio] 区间
// previewMinPx 随当前预览模式变化，避免在手机/平板模式下的过度限制
function computeRatioBounds(containerWidth: number, previewMinPx: number): { min: number; max: number } {
    if (containerWidth <= 0) return { min: SPLIT_RATIO_DEFAULT, max: SPLIT_RATIO_DEFAULT };
    const dividerWidth = 6;
    const usable = Math.max(0, containerWidth - dividerWidth);
    // 编辑区宽度 = (ratio/100) * usable >= EDITOR_MIN_PX
    const min = Math.max(0, (EDITOR_MIN_PX / usable) * 100);
    // 预览区宽度 = ((100-ratio)/100) * usable >= previewMinPx
    const max = Math.min(100, 100 - (previewMinPx / usable) * 100);
    // 兜底：若容器过小不足以同时满足两端，放宽到允许编辑区更窄
    if (min > max) return { min: 0, max: 100 };
    return { min, max };
}

// 钳制 ratio 到指定区间
const clampRatio = (ratio: number, bounds: { min: number; max: number }) =>
    Math.min(bounds.max, Math.max(bounds.min, ratio));

function AiConnectionNotice({ visible }: { visible: boolean }) {
    return (
        <>
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {visible ? '正在连接大模型' : ''}
            </span>
            {visible && (
                <div
                    data-testid="ai-connection-notice"
                    className="pointer-events-none absolute left-1/2 top-8 z-[95] -translate-x-1/2"
                    aria-hidden="true"
                >
                    <div className="flex w-[270px] flex-col items-center gap-2 rounded-md bg-white/94 px-5 pb-4 pt-4 text-[12px] font-medium text-[#394150] shadow-[0_10px_30px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.06] backdrop-blur-md dark:bg-[#242426]/94 dark:text-[#e5e5ea] dark:ring-white/[0.08]">
                        <div className="ai-atom-stage">
                            <div className="atom-spinner">
                                <div className="spinner-inner">
                                    <div className="spinner-line" />
                                    <div className="spinner-line" />
                                    <div className="spinner-line" />
                                    <div className="spinner-circle">&#9679;</div>
                                </div>
                            </div>
                        </div>
                        <span className="mt-1">正在连接大模型</span>
                    </div>
                </div>
            )}
        </>
    );
}

function getForceMobileMode(): boolean {
    if (typeof window === 'undefined') return false;
    if (isInIframe()) return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('mobile') === '1';
}

function isEmbeddedMobileMode(): boolean {
    if (typeof window === 'undefined') return false;
    if (isInIframe()) return true;
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === '1';
}

export default function App() {
    const forceMobile = getForceMobileMode();
    const embedded = isEmbeddedMobileMode();
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>(loadThemeMode);
    const [markaDocument, setMarkaDocument] = useState<MarkaDocument>(loadInitialDocument);
    const documentSource = markaDocument.source;
    const documentDefinition = getMarkaDocumentDefinition(markaDocument);
    const setDocumentSource = useCallback((source: string) => {
        setMarkaDocument((current) => updateDocumentSource(current, source));
    }, []);
    const [renderedHtml, setRenderedHtml] = useState<string>('');
    const [activeTheme, setActiveTheme] = useState<string>(loadActiveTheme);
    const [notice, setNotice] = useState<Notice | null>(null);
    const noticeIdRef = useRef(0);
    const showNotice = useCallback((
        title: string,
        description: string,
        tone: Notice['tone'],
        action?: Pick<Notice, 'actionLabel' | 'onAction'>
    ) => setNotice({ id: ++noticeIdRef.current, title, description, tone, ...action }), []);
    const [aiMarkdownOpen, setAiMarkdownOpen] = useState(false);
    const [aiGenerationPhase, setAiGenerationPhase] = useState<AiGenerationPhase>('idle');
    const isAiStreaming = aiGenerationPhase !== 'idle' && aiGenerationPhase !== 'completed';
    const isAiConnecting = aiGenerationPhase === 'connecting';
    const [aiThinking, setAiThinking] = useState('');
    const [isAiThinkingExpanded, setIsAiThinkingExpanded] = useState(false);
    const [aiMainTextStarted, setAiMainTextStarted] = useState(false);
    const [hasAiGeneratedContent, setHasAiGeneratedContent] = useState(false);
    const [confirmClearEditor, setConfirmClearEditor] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [isImmersive, setIsImmersive] = useState(false);
    const [isSystemFullscreen, setIsSystemFullscreen] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'pc'>(() =>
        embedded ? 'mobile' : loadPreviewDevice()
    );
    const [activePanel, setActivePanel] = useState<'editor' | 'preview'>(() => loadActivePanel(embedded));
    const [scrollSyncEnabled, setScrollSyncEnabled] = useState<boolean>(loadScrollSync);
    const [splitRatio, setSplitRatio] = useState<number>(loadSplitRatio);
    const [isDraggingDivider, setIsDraggingDivider] = useState(false);
    const [containerWidth, setContainerWidth] = useState(() =>
        typeof window === 'undefined' ? 0 : document.documentElement.clientWidth
    );
    const [isDesktop, setIsDesktop] = useState(() => {
        if (embedded) return false;
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('mobile') === '1') return false;
            return window.matchMedia('(min-width: 768px)').matches;
        }
        return true;
    });
    const previewRef = useRef<HTMLDivElement>(null);
    const editorScrollRef = useRef<HTMLTextAreaElement>(null);
    const previewSurfaceRef = useRef<PreviewSurfaceHandle>(null);
    const aiStreamAbortRef = useRef<(() => void) | null>(null);
    const scrollSyncLockRef = useRef<'editor' | 'preview' | null>(null);
    const scrollLockReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activePanelRef = useRef(activePanel);
    activePanelRef.current = activePanel;

    const [swipeDx, setSwipeDx] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [mobileWidth, setMobileWidth] = useState(0);
    const mobileToolbarRef = useRef<HTMLDivElement>(null);
    const [toolbarCompact, setToolbarCompact] = useState(false);

    // 面板刚性平移动画
    const mainRef = useRef<HTMLElement>(null);
    const editorMeasureRef = useRef<HTMLDivElement>(null);
    const previewMeasureRef = useRef<HTMLDivElement>(null);

    // 面板折叠：编辑区/预览区可独立收起，但不能同时收起
    const [editorCollapsed, setEditorCollapsed] = useState<boolean>(() => loadBool(EDITOR_COLLAPSED_STORAGE_KEY));
    const [previewCollapsed, setPreviewCollapsed] = useState<boolean>(() => loadBool(PREVIEW_COLLAPSED_STORAGE_KEY));
    // 面板左右位置：编辑区默认在左侧
    const [editorOnRight, setEditorOnRight] = useState<boolean>(() => loadEditorOnRight());
    // 缩放：编辑区与预览区独立，悬停哪个区域就调整哪个区域
    const [editorZoom, setEditorZoom] = useState<number>(() => loadZoomValue(EDITOR_ZOOM_STORAGE_KEY));
    const [previewZoom, setPreviewZoom] = useState<number>(() => loadZoomValue(PREVIEW_ZOOM_STORAGE_KEY));
    const [activeZoomRegion, setActiveZoomRegion] = useState<'editor' | 'preview'>('editor');

    // 拖拽导入遮罩
    const [dropActive, setDropActive] = useState(false);
    const dragCounterRef = useRef(0);
    // PNG 长图导出弹窗
    const [pngExportOpen, setPngExportOpen] = useState(false);

    useEffect(() => {
        if (isDesktop) return;
        const el = mobileToolbarRef.current;
        if (!el) return;
        const check = () => setToolbarCompact(el.scrollWidth > el.clientWidth + 1);
        const timer = setTimeout(check, 50);
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => { clearTimeout(timer); ro.disconnect(); };
    }, [isDesktop, activePanel, activeTheme]);

    const w = mobileWidth || 390;
    const tabIndicatorX = activePanel === 'editor' ? Math.min(1, -swipeDx / w) : 1 - Math.min(1, swipeDx / w);

    useEffect(() => {
        if (isDesktop) return;
        const el = mainRef.current;
        if (!el) return;

        let startX = 0, startY = 0, locked: boolean | 'h' | 'v' = false, dx = 0, rafId: number | null = null;
        const ro = new ResizeObserver(() => setMobileWidth(el.clientWidth));
        ro.observe(el);
        setMobileWidth(el.clientWidth);

        const onStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            locked = false; dx = 0;
            setSwipeDx(0); setIsSwiping(false);
        };

        const onMove = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            const dX = e.touches[0].clientX - startX, dY = e.touches[0].clientY - startY;
            if (!locked) {
                if (Math.abs(dX) < 8 && Math.abs(dY) < 8) return;
                locked = Math.abs(dX) > Math.abs(dY) * 1.3 ? 'h' : 'v';
                if (locked === 'h') setIsSwiping(true);
            }
            if (locked === 'h') {
                e.preventDefault();
                e.stopPropagation();
                const w = el.clientWidth;
                dx = activePanelRef.current === 'editor' ? Math.min(0, Math.max(-w, dX)) : Math.min(w, Math.max(0, dX));
                if (rafId === null) rafId = requestAnimationFrame(() => { setSwipeDx(dx); rafId = null; });
            }
        };

        const onEnd = () => {
            if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
            if (locked === 'h') {
                const shouldSwitch = Math.abs(dx) > el.clientWidth * 0.2;
                setIsSwiping(false);
                requestAnimationFrame(() => {
                    if (shouldSwitch) setActivePanel(p => p === 'editor' ? 'preview' : 'editor');
                    setSwipeDx(0);
                });
            }
            locked = false;
        };

        const moveOpts: AddEventListenerOptions = { passive: false, capture: true };
        const passiveOpts: AddEventListenerOptions = { passive: true };
        el.addEventListener('touchstart', onStart, passiveOpts);
        el.addEventListener('touchmove', onMove, moveOpts);
        el.addEventListener('touchend', onEnd, passiveOpts);
        el.addEventListener('touchcancel', onEnd, passiveOpts);
        return () => {
            ro.disconnect();
            el.removeEventListener('touchstart', onStart, passiveOpts);
            el.removeEventListener('touchmove', onMove, moveOpts);
            el.removeEventListener('touchend', onEnd, passiveOpts);
            el.removeEventListener('touchcancel', onEnd, passiveOpts);
        };
    }, [isDesktop]);

    const resetScrollSyncLock = useCallback(() => {
        scrollSyncLockRef.current = null;
        if (scrollLockReleaseTimeoutRef.current) {
            clearTimeout(scrollLockReleaseTimeoutRef.current);
            scrollLockReleaseTimeoutRef.current = null;
        }
    }, []);

    // 沉浸模式下按 ESC 退出
    useEffect(() => {
        if (!isImmersive) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsImmersive(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isImmersive]);

    // 系统全屏可被浏览器的 Esc、F11 或标签页切换退出，以 fullscreenchange 为唯一状态来源
    useEffect(() => {
        const syncFullscreenState = () => setIsSystemFullscreen(Boolean(document.fullscreenElement));
        syncFullscreenState();
        document.addEventListener('fullscreenchange', syncFullscreenState);
        return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
    }, []);

    // 持久化中轴线位置
    useEffect(() => {
        try {
            localStorage.setItem(SPLIT_RATIO_STORAGE_KEY, String(splitRatio));
        } catch {
            // ignore quota / privacy errors
        }
    }, [splitRatio]);

    // 持久化预览设备模式
    useEffect(() => {
        try {
            localStorage.setItem(PREVIEW_DEVICE_STORAGE_KEY, previewDevice);
        } catch {
            // ignore quota / privacy errors
        }
    }, [previewDevice]);

    // 初始挂载时按已保存的主题模式应用 dark class
    useEffect(() => {
        if (themeMode === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 持久化明暗主题模式
    useEffect(() => {
        try {
            localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
        } catch {
            // ignore
        }
    }, [themeMode]);

    // 持久化排版主题
    useEffect(() => {
        try {
            localStorage.setItem(ACTIVE_THEME_STORAGE_KEY, activeTheme);
        } catch {
            // ignore
        }
    }, [activeTheme]);

    // 持久化同步滚动开关
    useEffect(() => {
        try {
            localStorage.setItem(SCROLL_SYNC_STORAGE_KEY, String(scrollSyncEnabled));
        } catch {
            // ignore
        }
    }, [scrollSyncEnabled]);

    // 持久化移动端当前面板
    useEffect(() => {
        if (embedded) return;
        try {
            localStorage.setItem(ACTIVE_PANEL_STORAGE_KEY, activePanel);
        } catch {
            // ignore
        }
    }, [activePanel, embedded]);

    // 持久化面板折叠状态
    useEffect(() => {
        try {
            localStorage.setItem(EDITOR_COLLAPSED_STORAGE_KEY, String(editorCollapsed));
        } catch {
            // ignore
        }
    }, [editorCollapsed]);

    useEffect(() => {
        try {
            localStorage.setItem(PREVIEW_COLLAPSED_STORAGE_KEY, String(previewCollapsed));
        } catch {
            // ignore
        }
    }, [previewCollapsed]);

    // 持久化编辑区左右位置
    useEffect(() => {
        try {
            localStorage.setItem(EDITOR_ON_RIGHT_STORAGE_KEY, String(editorOnRight));
        } catch {
            // ignore
        }
    }, [editorOnRight]);

    // 持久化一等文档对象：类型与源码原子写入，避免双键状态漂移。
    const saveDocumentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (isAiStreaming) return;
        if (saveDocumentTimerRef.current) clearTimeout(saveDocumentTimerRef.current);
        saveDocumentTimerRef.current = setTimeout(() => {
            try {
                saveMarkaDocument(localStorage, markaDocument);
            } catch {
                // ignore quota
            }
        }, 500);
        return () => {
            if (saveDocumentTimerRef.current) clearTimeout(saveDocumentTimerRef.current);
        };
    }, [markaDocument, isAiStreaming]);

    // 文件导入处理：拖拽和按钮导入共用同一套逻辑
    // 直接复制自 lengyi-markdown-editor 的 loadFile / insertImageMarkdown
    const handleImportFile = useCallback(async (file: File) => {
        const result = await readFile(file);
        if (result.kind === 'text') {
            setMarkaDocument(createMarkdownDocument(result.content));
            setHasAiGeneratedContent(Boolean(result.content.trim()));
            showNoticeRef.current('文件已导入', `${result.filename} 内容已载入`, 'success');
        } else if (result.kind === 'html') {
            setMarkaDocument(createHtmlDocument(result.content));
            setHasAiGeneratedContent(Boolean(result.content.trim()));
            showNoticeRef.current('文件已导入', `${result.filename} 内容已载入`, 'success');
        } else if (result.kind === 'image') {
            const ta = editorScrollRef.current;
            const currentDocument = markaDocumentRef.current;
            const edit = insertDocumentFragment(
                currentDocument,
                { markdown: result.markdown, html: result.html },
                ta ? { start: ta.selectionStart, end: ta.selectionEnd } : undefined,
            );
            setMarkaDocument(edit.document);
            if (ta && edit.cursor !== null) {
                setTimeout(() => {
                    ta.focus();
                    ta.setSelectionRange(edit.cursor ?? 0, edit.cursor ?? 0);
                }, 0);
            }
            showNoticeRef.current('图片已插入', `${result.filename} 已插入到光标处`, 'success');
        } else if (result.kind === 'too-large-image') {
            showNoticeRef.current('图片过大', '请使用 5MB 以内的图片', 'error');
        } else {
            showNoticeRef.current('不支持的文件', '仅支持 .md / .txt / .html / 图片', 'error');
        }
    }, []);

    const handleHtmlDocumentPaste = useCallback((source: string) => {
        setMarkaDocument(createHtmlDocument(source));
        setHasAiGeneratedContent(Boolean(source.trim()));
    }, []);

    // 拖拽导入：document 级 dragenter/dragleave/dragover/drop，dragCounter 防抖嵌套事件
    // 用 ref 持有最新文档，避免每次输入都重绑监听器。
    const markaDocumentRef = useRef(markaDocument);
    markaDocumentRef.current = markaDocument;
    const showNoticeRef = useRef(showNotice);
    showNoticeRef.current = showNotice;
    useEffect(() => {
        const onDragEnter = (e: DragEvent) => {
            if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
            e.preventDefault();
            dragCounterRef.current++;
            setDropActive(true);
        };
        const onDragLeave = () => {
            dragCounterRef.current--;
            if (dragCounterRef.current <= 0) {
                dragCounterRef.current = 0;
                setDropActive(false);
            }
        };
        const onDragOver = (e: DragEvent) => {
            if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
            e.preventDefault();
        };
        const onDrop = async (e: DragEvent) => {
            e.preventDefault();
            dragCounterRef.current = 0;
            setDropActive(false);
            const files = e.dataTransfer?.files;
            if (!files || !files.length) return;
            await handleImportFile(files[0]);
        };
        document.addEventListener('dragenter', onDragEnter);
        document.addEventListener('dragleave', onDragLeave);
        document.addEventListener('dragover', onDragOver);
        document.addEventListener('drop', onDrop);
        return () => {
            document.removeEventListener('dragenter', onDragEnter);
            document.removeEventListener('dragleave', onDragLeave);
            document.removeEventListener('dragover', onDragOver);
            document.removeEventListener('drop', onDrop);
        };
    }, [handleImportFile]);

    // 主动请求剪贴板权限，确保复制功能在任何情况下都可用
    useEffect(() => {
        if (typeof navigator !== 'undefined' && navigator.permissions) {
            navigator.permissions.query({ name: 'clipboard-write' as PermissionName })
                .catch(() => { /* 部分浏览器不支持，忽略 */ });
            navigator.permissions.query({ name: 'clipboard-read' as PermissionName })
                .catch(() => { /* 部分浏览器不支持，忽略 */ });
        }
    }, []);

    // 移动端视图下强制使用手机预览模式
    useEffect(() => {
        if (embedded && previewDevice !== 'mobile') {
            setPreviewDevice('mobile');
        }
    }, [embedded, previewDevice]);

    // 跟踪桌面端断点，用于在移动端隐藏分隔条
    useEffect(() => {
        if (embedded) return;
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mobile') === '1') return;
        const mq = window.matchMedia('(min-width: 768px)');
        const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [embedded]);

    // 监听 main 容器实际宽度，用于动态计算中轴线可拖拽边界
    // 确保预览区在任何模式下都能完整显示（不被裁切）
    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;
        const update = () => setContainerWidth(el.getBoundingClientRect().width);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener('resize', update);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, []);

    // 基于当前容器宽度与预览模式计算动态边界
    const previewMinPx = PREVIEW_MIN_PX_BY_DEVICE[previewDevice];
    const ratioBounds = useMemo(() => computeRatioBounds(containerWidth, previewMinPx), [containerWidth, previewMinPx]);

    // 容器宽度变化（如窗口缩放）时，若已保存的 ratio 越界则自动收回
    // 初始化阶段 containerWidth 为 0，ratioBounds 为默认值 {DEFAULT,DEFAULT}，
    // 此时不应钳制，否则会把用户保存的 ratio 误覆盖为默认值并持久化到 localStorage
    useEffect(() => {
        if (containerWidth <= 0) return;
        setSplitRatio((prev) => clampRatio(prev, ratioBounds));
    }, [containerWidth, ratioBounds]);

    // 中轴线拖拽：基于指针在 main 容器内的水平位置计算新比例
    const handleDividerPointerDown = useCallback((e: React.PointerEvent) => {
        if (!mainRef.current) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setIsDraggingDivider(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const rect = mainRef.current.getBoundingClientRect();
        // 拖拽开始时锁定本次的边界，避免拖拽中容器宽度抖动
        const bounds = computeRatioBounds(rect.width, PREVIEW_MIN_PX_BY_DEVICE[previewDevice]);

        const applyClientX = (clientX: number) => {
            const x = clientX - rect.left;
            const ratio = editorOnRight
                ? 100 - (x / rect.width) * 100
                : (x / rect.width) * 100;
            setSplitRatio(clampRatio(ratio, bounds));
        };

        const onMove = (ev: PointerEvent) => applyClientX(ev.clientX);
        const onUp = () => {
            setIsDraggingDivider(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [previewDevice, editorOnRight]);

    const toggleTheme = () => {
        setThemeMode((prev) => {
            const next = prev === 'light' ? 'dark' : 'light';
            if (next === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            return next;
        });
    };

    const applyAiMarkdown = (markdown: string, mode: AiApplyMode) => {
        const previousDocument = markaDocument;
        const previousAiState = hasAiGeneratedContent;
        const textarea = editorScrollRef.current;
        const result = applyMarkdownResult(
            markaDocument,
            markdown,
            mode,
            textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : undefined,
        );

        setMarkaDocument(result.document);
        setHasAiGeneratedContent(Boolean(result.document.source.trim()));

        if (result.cursor !== null && textarea) {
            const cursor = result.cursor;
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(cursor, cursor);
            }, 0);
        }

        const modeLabel = result.effectiveMode === 'replace'
            ? '已替换当前内容'
            : result.effectiveMode === 'insert'
                ? '已插入到光标处'
                : '已追加到末尾';
        showNotice('AI Markdown 已应用', modeLabel, 'success', {
            actionLabel: '撤销',
            onAction: () => {
                setMarkaDocument(previousDocument);
                setHasAiGeneratedContent(previousAiState);
                showNotice('已撤销', '已恢复 AI 应用前的内容', 'success');
            },
        });
    };

    const requestClearEditor = useCallback(() => setConfirmClearEditor(true), []);

    const confirmClearEditorContent = useCallback(() => {
        setMarkaDocument((current) => updateDocumentSource(current, ''));
        setAiThinking('');
        setIsAiThinkingExpanded(false);
        setAiMainTextStarted(false);
        setAiGenerationPhase('idle');
        setHasAiGeneratedContent(false);
        setConfirmClearEditor(false);
        editorScrollRef.current?.focus();
        showNotice('已清除', '编辑区内容已清空', 'success');
    }, [showNotice]);

    const handleThemeChange = useCallback((themeId: string) => {
        if (themeId === activeTheme) return;
        setActiveTheme(themeId);
    }, [activeTheme]);

    useEffect(() => {
        // 流式生成时编辑区直接显示后端增量，预览在结束或中止后一次追平。
        if (isAiStreaming) return;

        setRenderedHtml(renderMarkaDocumentPreview(markaDocument, activeTheme));
    }, [markaDocument, activeTheme, isAiStreaming]);

    useEffect(() => {
        if (!scrollSyncEnabled) resetScrollSyncLock();
    }, [scrollSyncEnabled, resetScrollSyncLock]);

    useEffect(() => {
        resetScrollSyncLock();
    }, [previewDevice, resetScrollSyncLock]);

    useEffect(() => {
        return () => resetScrollSyncLock();
    }, [resetScrollSyncLock]);

    const applyScrollRatio = (
        scrollRatio: number,
        sourcePanel: 'editor' | 'preview',
        updateTarget: (ratio: number) => void,
    ) => {
        if (!scrollSyncEnabled) return;
        if (scrollSyncLockRef.current && scrollSyncLockRef.current !== sourcePanel) return;

        scrollSyncLockRef.current = sourcePanel;
        updateTarget(Math.min(1, Math.max(0, scrollRatio)));

        if (scrollLockReleaseTimeoutRef.current) {
            clearTimeout(scrollLockReleaseTimeoutRef.current);
        }

        scrollLockReleaseTimeoutRef.current = setTimeout(() => {
            if (scrollSyncLockRef.current === sourcePanel) {
                scrollSyncLockRef.current = null;
            }
            scrollLockReleaseTimeoutRef.current = null;
        }, 50);
    };

    const handleEditorScroll = () => {
        const editorElement = editorScrollRef.current;
        if (!editorElement) return;
        const sourceMaxScroll = editorElement.scrollHeight - editorElement.clientHeight;
        const scrollRatio = sourceMaxScroll > 0 ? editorElement.scrollTop / sourceMaxScroll : 0;
        applyScrollRatio(scrollRatio, 'editor', (ratio) => {
            previewSurfaceRef.current?.scrollToRatio(ratio);
        });
    };

    const handlePreviewScroll = (scrollRatio: number) => {
        const editorElement = editorScrollRef.current;
        if (!editorElement) return;
        const editorMaxScroll = editorElement.scrollHeight - editorElement.clientHeight;
        applyScrollRatio(scrollRatio, 'preview', (ratio) => {
            editorElement.scrollTop = ratio * Math.max(editorMaxScroll, 0);
        });
    };

    const handleSelectAll = useCallback(() => {
        const textarea = editorScrollRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.select();
    }, []);

    const abortAiStream = useCallback(() => {
        const abort = aiStreamAbortRef.current;
        if (!abort) return;
        abort();
        aiStreamAbortRef.current = null;
        showNotice('已终止生成', 'AI 生成已停止', 'success');
    }, [showNotice]);

    const isDefaultIntro = isMarkdownDocument(markaDocument) && documentSource === defaultContent;
    const editorClearAction = !isAiStreaming && documentSource.trim().length > 0 && (hasAiGeneratedContent || !isDefaultIntro)
        ? requestClearEditor
        : undefined;
    const editorAbortAction = isAiStreaming ? abortAiStream : undefined;
    const handleRegenerateStream = useCallback(() => {
        abortAiStream();
        setAiMainTextStarted(false);
        setAiMarkdownOpen(true);
    }, [abortAiStream]);

    const handleCopy = async () => {
        if (!documentSource.trim()) {
            showNotice('内容为空', '请先输入内容再复制', 'error');
            return;
        }
        if (documentDefinition.capabilities.sourceLocation && !previewRef.current) return;
        setIsCopying(true);
        try {
            const payload = await buildMarkaClipboardPayload(markaDocument, renderedHtml, activeTheme);

            const blob = new Blob([payload.html], { type: 'text/html' });
            const textBlob = new Blob([payload.plainText], { type: 'text/plain' });

            try {
                const clipboardItem = new ClipboardItem({
                    'text/html': blob,
                    'text/plain': textBlob
                });
                await navigator.clipboard.write([clipboardItem]);
            } catch {
                fallbackCopyHtml(payload.html);
            }

            showNotice('已复制', '内容已复制到剪贴板', 'success');
        } catch (err) {
            console.error('Copy failed', err);
            alert('复制格式失败，请检查浏览器剪贴板权限');
        } finally {
            setIsCopying(false);
        }
    };

    const handleCopySource = async () => {
        if (!documentSource.trim()) {
            showNotice('内容为空', '请先输入内容再复制', 'error');
            return;
        }
        const sourceLabel = documentDefinition.label;
        try {
            await navigator.clipboard.writeText(documentSource);
            showNotice(`${sourceLabel} 已复制`, `原始 ${sourceLabel} 源码已复制到剪贴板`, 'success');
        } catch (err) {
            console.error(`Copy ${sourceLabel} failed`, err);
            fallbackCopyText(documentSource);
            showNotice(`${sourceLabel} 已复制`, `原始 ${sourceLabel} 源码已复制到剪贴板`, 'success');
        }
    };

    const handleExportHtml = async () => {
        const exportHtml = getMarkaDocumentExportHtml(markaDocument, renderedHtml);
        const blob = new Blob([exportHtml], { type: 'text/html;charset=utf-8' });
        const filename = `Marka_Article_${Date.now()}.html`;
        try {
            const saved = await saveBlob(blob, filename, '.html', 'HTML 文档');
            if (saved) showNotice('HTML 已导出', '文件已保存到指定位置', 'download');
        } catch (err) {
            console.error('HTML export failed', err);
            showNotice('导出失败', '请稍后重试', 'error');
        }
    };

    const handleExportSource = async () => {
        const blob = new Blob([documentSource], {
            type: documentDefinition.mimeType,
        });
        const filename = `Marka_Article_${Date.now()}${documentDefinition.fileExtension}`;
        try {
            const saved = await saveBlob(
                blob,
                filename,
                documentDefinition.fileExtension,
                `${documentDefinition.label} 文档`,
            );
            if (saved) showNotice(`${documentDefinition.label} 已导出`, '文件已保存到指定位置', 'download');
        } catch (err) {
            console.error(`${documentDefinition.label} export failed`, err);
            showNotice('导出失败', '请稍后重试', 'error');
        }
    };

    const handleExportPdf = () => {
        // 直接复制自 lengyi-markdown-editor 的 exportPDF：调用系统打印转 PDF
        showNotice('准备打印', '请选择「另存为 PDF」以导出', 'download');
        setTimeout(() => {
            window.print();
        }, 500);
    };

    // Word 导出：HTML 伪装成 .doc，MIME 用 application/msword，直接复制自 lengyi-markdown-editor 的 exportWord
    const handleExportDoc = async () => {
        if (!documentDefinition.capabilities.wordExport) return;
        try {
            const exportHtml = getMarkaDocumentExportHtml(markaDocument, renderedHtml);
            const blob = buildDocBlob(exportHtml, `Marka_Article_${Date.now()}`);
            const filename = `Marka_Article_${Date.now()}.doc`;
            const saved = await saveBlob(blob, filename, '.doc', 'Word 文档');
            if (saved) showNotice('Word 已导出', '文件已保存到指定位置', 'download');
        } catch (err) {
            console.error('DOC export failed', err);
            showNotice('导出失败', '请稍后重试', 'error');
        }
    };

    // 面板折叠切换：复制自 lengyi-markdown-editor 的 togglePane，禁止两端同时收起
    const toggleEditorCollapse = useCallback(() => {
        setEditorCollapsed((prev) => {
            if (!prev && previewCollapsed) return prev; // 预览已收起时禁止再收起编辑区
            return !prev;
        });
    }, [previewCollapsed]);

    const togglePreviewCollapse = useCallback(() => {
        setPreviewCollapsed((prev) => {
            if (!prev && editorCollapsed) return prev; // 编辑已收起时禁止再收起预览区
            return !prev;
        });
    }, [editorCollapsed]);

    const layoutMode: LayoutMode = previewCollapsed
        ? 'edit'
        : editorCollapsed
            ? 'preview'
            : 'both';

    const setLayoutMode = useCallback((mode: LayoutMode) => {
        setEditorCollapsed(mode === 'preview');
        setPreviewCollapsed(mode === 'edit');
    }, []);

    const togglePageFullscreen = useCallback(() => {
        const next = !isImmersive;
        setIsImmersive(next);
        if (next) {
            showNotice('页面全屏已开启', '按 ESC 键退出', 'success');
        }
    }, [isImmersive, showNotice]);

    const toggleSystemFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                setIsSystemFullscreen(Boolean(document.fullscreenElement));
                showNotice('已退出系统全屏', '', 'success');
                return;
            }
            if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
                showNotice('无法进入系统全屏', '当前浏览器或页面环境不支持全屏', 'error');
                return;
            }
            await document.documentElement.requestFullscreen();
            setIsSystemFullscreen(Boolean(document.fullscreenElement));
            showNotice('系统全屏已开启', '按 ESC 键退出', 'success');
        } catch (error) {
            console.error('Fullscreen toggle failed', error);
            showNotice('无法进入系统全屏', '请检查浏览器权限后重试', 'error');
        }
    }, [showNotice]);

    // Ctrl + [ / ] 始终切换左/右侧面板（与编辑区是否交换位置无关）
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey) return;
            if (e.key === '[' || e.key === 'BracketLeft') {
                e.preventDefault();
                // 左侧面板
                if (editorOnRight) togglePreviewCollapse();
                else toggleEditorCollapse();
            } else if (e.key === ']' || e.key === 'BracketRight') {
                e.preventDefault();
                // 右侧面板
                if (editorOnRight) toggleEditorCollapse();
                else togglePreviewCollapse();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggleEditorCollapse, togglePreviewCollapse, editorOnRight]);

    const setEditorSide = useCallback((onRight: boolean) => {
        setEditorOnRight(onRight);
    }, []);

    const handleImageClick = useCallback((info: { type: string; index: number; src?: string; alt?: string; content?: string }) => {
        if (!editorScrollRef.current) return;

        let location: ElementLocation | null = null;

        // Images use specialized positioning
        if (info.type === 'image' && info.src) {
            const match = findImagePosition(documentSource, info.src, info.alt || '');
            if (match) {
                // Add type field to match ElementLocation interface
                location = {
                    start: match.start,
                    end: match.end,
                    type: 'image'
                };
            }
        } else {
            // Other elements use generic positioning
            location = findElementPosition(documentSource, info.type, '', info.index);
        }

        if (location) {
            // Always select the entire content - consistent user experience
            selectTextAreaRange(editorScrollRef.current, location.start, location.end);

            // Switch to editor panel on mobile
            if (window.innerWidth < 768 && activePanel !== 'editor') {
                setActivePanel('editor');
            }
        }
    }, [documentSource, activePanel]);

    const deviceWidthClass = previewDevice === 'mobile'
        ? 'max-w-[520px] w-full'
        : previewDevice === 'tablet'
            ? 'max-w-[800px] w-full'
            : 'max-w-[840px] xl:max-w-[1024px] w-full';

    // 中轴线动态分栏：编辑区 fr / 分隔条 / 预览区 fr
    // 容器宽度未就绪时直接使用保存值，避免初次渲染误钳制为默认值产生闪烁
    const safeRatio = containerWidth > 0 ? clampRatio(splitRatio, ratioBounds) : splitRatio;

    // 编辑区/预览区目标宽度：统一用 safeRatio 计算，避免 DOM 测量值与计算值不一致导致闪动
    const editorSplitWidth = (safeRatio / 100) * containerWidth;
    const previewSplitWidth = ((100 - safeRatio) / 100) * containerWidth;

    const editorTargetWidth = useMemo(() => {
        if (editorCollapsed) return editorSplitWidth;
        if (previewCollapsed) return containerWidth;
        return editorSplitWidth;
    }, [editorCollapsed, previewCollapsed, editorSplitWidth, containerWidth]);

    const previewTargetWidth = useMemo(() => {
        if (previewCollapsed) return previewSplitWidth;
        if (editorCollapsed) return containerWidth;
        return previewSplitWidth;
    }, [previewCollapsed, editorCollapsed, previewSplitWidth, containerWidth]);

    const activeRegion = activeZoomRegion;
    const activeEffectiveZoom = activeRegion === 'editor' ? editorZoom : previewZoom;

    const setActiveZoom = useCallback((value: number) => {
        const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
        if (activeRegion === 'editor') setEditorZoom(clamped);
        else setPreviewZoom(clamped);
    }, [activeRegion]);

    const zoomIn = useCallback(() => {
        setActiveZoom(activeEffectiveZoom + ZOOM_STEP);
    }, [activeEffectiveZoom, setActiveZoom]);

    const zoomOut = useCallback(() => {
        setActiveZoom(activeEffectiveZoom - ZOOM_STEP);
    }, [activeEffectiveZoom, setActiveZoom]);

    const resetZoom = useCallback(() => {
        // 编辑区与预览区均重置为 100%
        setEditorZoom(1);
        setPreviewZoom(1);
    }, []);

    const handleHtmlPreviewZoom = useCallback((direction: 1 | -1) => {
        setActiveZoomRegion('preview');
        setPreviewZoom((current) => Math.min(
            ZOOM_MAX,
            Math.max(ZOOM_MIN, current + direction * ZOOM_STEP),
        ));
    }, []);

    // 持久化缩放
    useEffect(() => {
        try {
            localStorage.setItem(EDITOR_ZOOM_STORAGE_KEY, String(editorZoom));
        } catch {
            // ignore
        }
    }, [editorZoom]);

    useEffect(() => {
        try {
            localStorage.setItem(PREVIEW_ZOOM_STORAGE_KEY, String(previewZoom));
        } catch {
            // ignore
        }
    }, [previewZoom]);

    // Ctrl + 滚轮上下缩放悬停区域
    useEffect(() => {
        const handler = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            const editorEl = editorMeasureRef.current;
            const previewEl = previewMeasureRef.current;
            // 用 elementFromPoint 按鼠标坐标取最上层元素，比 e.target 更可靠
            const target = document.elementFromPoint(e.clientX, e.clientY);
            if (!target) return;
            if (editorEl?.contains(target)) {
                e.preventDefault();
                setEditorZoom(prev => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))));
            } else if (previewEl?.contains(target)) {
                e.preventDefault();
                setPreviewZoom(prev => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))));
            }
        };
        window.addEventListener('wheel', handler, { passive: false });
        return () => window.removeEventListener('wheel', handler);
    }, []);

    const editorPanelProps = {
        source: documentSource,
        onSourceChange: setDocumentSource,
        editorScrollRef,
        onEditorScroll: handleEditorScroll,
        scrollSyncEnabled,
        onSelectAll: isAiStreaming || editorClearAction ? undefined : handleSelectAll,
        onClearRequest: editorClearAction,
        onAbortStream: editorAbortAction,
        onRegenerateStream: (isAiStreaming || hasAiGeneratedContent) ? handleRegenerateStream : undefined,
        immersive: isImmersive,
        aiThinking,
        isAiThinkingExpanded,
        onToggleAiThinkingExpanded: () => setIsAiThinkingExpanded(prev => !prev),
        aiMainTextStarted,
        aiGenerationPhase,
        borderSide: editorOnRight ? 'left' : 'right',
        zoom: editorZoom,
        documentKind: markaDocument.kind,
        onHtmlDocumentPaste: handleHtmlDocumentPaste,
        onPasteFile: handleImportFile,
    };

    const previewPanelProps = {
        renderedHtml,
        deviceWidthClass,
        previewDevice,
        previewRef,
        surfaceRef: previewSurfaceRef,
        onScrollRatio: handlePreviewScroll,
        onPreviewZoom: handleHtmlPreviewZoom,
        scrollSyncEnabled: documentDefinition.capabilities.scrollSync && scrollSyncEnabled,
        onImageClick: documentDefinition.capabilities.sourceLocation ? handleImageClick : undefined,
        zoom: previewZoom,
        documentKind: markaDocument.kind,
    };

    const appContent = (
        <div className="flex flex-col h-screen overflow-hidden antialiased bg-[#fbfbfd] dark:bg-black transition-colors duration-300">

            {!isImmersive && (
                <Header
                    themeMode={themeMode}
                    onToggleTheme={toggleTheme}
                    onOpenAi={() => setAiMarkdownOpen(true)}
                    onEnterImmersive={() => {
                        if (isDesktop) showNotice('沉浸编辑已开启', '按 ESC 键退出沉浸编辑', 'success');
                        setIsImmersive(true);
                        setActivePanel('editor');
                    }}
                />
            )}

            {/* 移动端 Tab 切换 - 精致 segmented control */}
            {!isImmersive && <div className="md:hidden flex items-stretch z-[90] px-3 py-1">
                <div className="relative flex items-center w-full bg-black/[0.04] dark:bg-white/[0.07] rounded-lg p-0.5 border border-[#0000000c] dark:border-[#ffffff12]">
                    <div
                        className="absolute top-0.5 bottom-0.5 left-0 w-[calc(50%-4px)] bg-white dark:bg-[#3a3a3c] rounded-[5px] shadow-sm"
                        style={{
                            transform: `translateX(calc(${tabIndicatorX * 100}% + 2px))`,
                            transition: isSwiping ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
                        }}
                    />
                    <button
                        data-testid="tab-editor"
                        onClick={() => setActivePanel('editor')}
                        className={`relative z-10 flex items-center justify-center gap-1 h-7 flex-1 rounded-[5px] text-[12px] font-medium transition-colors duration-200 ${activePanel === 'editor' ? 'text-[#1d1d1f] dark:text-white' : 'text-[#8e8e93] dark:text-[#8a8a8f]'}`}
                    >
                        <PenLine size={12} />
                        编辑
                    </button>
                    <button
                        data-testid="tab-preview"
                        onClick={() => setActivePanel('preview')}
                        className={`relative z-10 flex items-center justify-center gap-1 h-7 flex-1 rounded-[5px] text-[12px] font-medium transition-colors duration-200 ${activePanel === 'preview' ? 'text-[#1d1d1f] dark:text-white' : 'text-[#8e8e93] dark:text-[#8a8a8f]'}`}
                    >
                        <Eye size={12} />
                        预览
                    </button>
                </div>
            </div>}

            {/* 桌面端工具栏 */}
            {!isImmersive && <div className="glass-toolbar hidden md:flex items-center justify-between gap-2 px-2 lg:px-4 z-[90]">
                <ThemeSelector
                    activeTheme={activeTheme}
                    onThemeChange={handleThemeChange}
                    disabled={!documentDefinition.capabilities.themes}
                    disabledReason={`${documentDefinition.label} 文档保留原始样式，无法切换排版风格`}
                />
                <DesktopToolbar
                    previewDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onExportPdf={handleExportPdf}
                    onExportHtml={handleExportHtml}
                    onExportSource={handleExportSource}
                    onExportDoc={handleExportDoc}
                    onExportPng={() => setPngExportOpen(true)}
                    onImport={handleImportFile}
                    onCopy={handleCopy}
                    onCopySource={handleCopySource}
                    documentKind={markaDocument.kind}
                    isCopying={isCopying}
                    scrollSyncEnabled={scrollSyncEnabled}
                    onToggleScrollSync={() => setScrollSyncEnabled((prev) => !prev)}
                    layoutMode={layoutMode}
                    onLayoutModeChange={setLayoutMode}
                    pageFullscreen={isImmersive}
                    onTogglePageFullscreen={togglePageFullscreen}
                    systemFullscreen={isSystemFullscreen}
                    onToggleSystemFullscreen={toggleSystemFullscreen}
                    editorCollapsed={editorCollapsed}
                    previewCollapsed={previewCollapsed}
                    onToggleEditorCollapse={toggleEditorCollapse}
                    onTogglePreviewCollapse={togglePreviewCollapse}
                    editorOnRight={editorOnRight}
                    onEditorSideChange={setEditorSide}
                    zoom={activeEffectiveZoom}
                    onZoomIn={zoomIn}
                    onZoomOut={zoomOut}
                    onResetZoom={resetZoom}
                />
            </div>}

            {/* 移动端工具栏（仅预览Tab显示）：整行自适应，溢出时切换紧凑模式 */}
            {!isImmersive && activePanel === 'preview' && (
                <div ref={mobileToolbarRef} className="md:hidden glass-toolbar flex items-center px-2 py-1 z-[90] gap-1.5 overflow-hidden">
                    <ThemeSelector
                        activeTheme={activeTheme}
                        onThemeChange={handleThemeChange}
                        mobile
                        compact={toolbarCompact}
                        disabled={!documentDefinition.capabilities.themes}
                        disabledReason={`${documentDefinition.label} 文档保留原始样式，无法切换排版风格`}
                    />
                    <MobileToolbar
                        onExportPdf={handleExportPdf}
                        onExportHtml={handleExportHtml}
                        onExportSource={handleExportSource}
                        onExportDoc={handleExportDoc}
                        onExportPng={() => setPngExportOpen(true)}
                        onImport={handleImportFile}
                        onCopy={handleCopy}
                        onCopySource={handleCopySource}
                        documentKind={markaDocument.kind}
                        isCopying={isCopying}
                        compact={toolbarCompact}
                    />
                </div>
            )}

            {/* 编辑区 & 预览区 */}
            <main
                ref={mainRef}
                className="flex-1 overflow-hidden relative"
            >
                <AiConnectionNotice visible={isAiConnecting} />

                {/* 桌面端：左右分栏，整体刚性平移 */}
                {isDesktop && (
                    <>
                        <motion.div
                            className="absolute top-0 left-0 h-full flex"
                            initial={false}
                            animate={{
                                width: editorTargetWidth + previewTargetWidth,
                                x: editorCollapsed
                                    ? editorOnRight
                                        ? 0
                                        : -editorTargetWidth
                                    : previewCollapsed
                                        ? editorOnRight
                                            ? -previewTargetWidth
                                            : 0
                                        : 0,
                            }}
                            transition={isDraggingDivider ? { duration: 0 } : { duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                        >
                            {editorOnRight ? (
                                <>
                                    <motion.div
                                        ref={previewMeasureRef}
                                        initial={false}
                                        animate={{ width: previewTargetWidth }}
                                        transition={isDraggingDivider ? { duration: 0 } : { duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                                        className="flex flex-col overflow-hidden relative"
                                        style={{ flex: '0 0 auto' }}
                                        onMouseEnter={() => setActiveZoomRegion('preview')}
                                        onFocusCapture={() => setActiveZoomRegion('preview')}
                                    >
                                        <PreviewPanel {...previewPanelProps} isMobileView={false} />
                                    </motion.div>
                                    {(!editorCollapsed && !previewCollapsed) && (
                                        <Divider
                                            onPointerDown={handleDividerPointerDown}
                                            isDragging={isDraggingDivider}
                                            ratio={safeRatio}
                                            minRatio={ratioBounds.min}
                                            maxRatio={ratioBounds.max}
                                        />
                                    )}
                                    <motion.div
                                        ref={editorMeasureRef}
                                        initial={false}
                                        animate={{ width: editorTargetWidth }}
                                        transition={isDraggingDivider ? { duration: 0 } : { duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                                        className="flex flex-col overflow-hidden relative"
                                        style={{ flex: '0 0 auto' }}
                                        onMouseEnter={() => setActiveZoomRegion('editor')}
                                        onFocusCapture={() => setActiveZoomRegion('editor')}
                                    >
                                        <EditorPanel {...editorPanelProps} />
                                    </motion.div>
                                </>
                            ) : (
                                <>
                                    <motion.div
                                        ref={editorMeasureRef}
                                        initial={false}
                                        animate={{ width: editorTargetWidth }}
                                        transition={isDraggingDivider ? { duration: 0 } : { duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                                        className="flex flex-col overflow-hidden relative"
                                        style={{ flex: '0 0 auto' }}
                                        onMouseEnter={() => setActiveZoomRegion('editor')}
                                        onFocusCapture={() => setActiveZoomRegion('editor')}
                                    >
                                        <EditorPanel {...editorPanelProps} />
                                    </motion.div>
                                    {(!editorCollapsed && !previewCollapsed) && (
                                        <Divider
                                            onPointerDown={handleDividerPointerDown}
                                            isDragging={isDraggingDivider}
                                            ratio={safeRatio}
                                            minRatio={ratioBounds.min}
                                            maxRatio={ratioBounds.max}
                                        />
                                    )}
                                    <motion.div
                                        ref={previewMeasureRef}
                                        initial={false}
                                        animate={{ width: previewTargetWidth }}
                                        transition={isDraggingDivider ? { duration: 0 } : { duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                                        className="flex flex-col overflow-hidden relative"
                                        style={{ flex: '0 0 auto' }}
                                        onMouseEnter={() => setActiveZoomRegion('preview')}
                                        onFocusCapture={() => setActiveZoomRegion('preview')}
                                    >
                                        <PreviewPanel {...previewPanelProps} isMobileView={false} />
                                    </motion.div>
                                </>
                            )}
                        </motion.div>

                        {/* 折叠后浮出的展开按钮 */}
                        <AnimatePresence initial={false}>
                            {editorCollapsed && (
                                <motion.button
                                    key="expand-editor"
                                    initial={{ opacity: 0, x: editorOnRight ? 12 : -12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: editorOnRight ? 12 : -12 }}
                                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                                    onClick={toggleEditorCollapse}
                                    data-tooltip="展开编辑区"
                                    aria-label="展开编辑区"
                                    className={`absolute top-3 z-[120] inline-flex items-center gap-1 h-7 px-2 rounded-md border border-[#00000012] dark:border-[#ffffff16] bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-md text-[12px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-white dark:hover:bg-[#2c2c2e] active:scale-95 shadow-sm ${editorOnRight ? 'right-3' : 'left-3'}`}
                                >
                                    {editorOnRight ? <PanelRightOpen size={13} /> : <PanelLeftOpen size={13} />}
                                </motion.button>
                            )}
                        </AnimatePresence>
                        <AnimatePresence initial={false}>
                            {previewCollapsed && (
                                <motion.button
                                    key="expand-preview"
                                    initial={{ opacity: 0, x: editorOnRight ? -12 : 12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: editorOnRight ? -12 : 12 }}
                                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                                    onClick={togglePreviewCollapse}
                                    data-tooltip="展开预览区"
                                    aria-label="展开预览区"
                                    className={`absolute top-3 z-[120] inline-flex items-center gap-1 h-7 px-2 rounded-md border border-[#00000012] dark:border-[#ffffff16] bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-md text-[12px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-white dark:hover:bg-[#2c2c2e] active:scale-95 shadow-sm ${editorOnRight ? 'left-3' : 'right-3'}`}
                                >
                                    {editorOnRight ? <PanelLeftOpen size={13} /> : <PanelRightOpen size={13} />}
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </>
                )}

                {/* 移动端：左右滑动切换 */}
                {!isDesktop && (
                    <div
                        className="w-[200%] h-full flex flex-nowrap"
                        style={{
                            transform: `translateX(${(activePanel === 'editor' ? 0 : -mobileWidth) + swipeDx}px)`,
                            transition: isSwiping ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
                            touchAction: 'pan-y',
                        }}
                    >
                        <div className="w-1/2 h-full flex-shrink-0 flex flex-col overflow-hidden">
                            <EditorPanel {...editorPanelProps} />
                        </div>
                        <div className="w-1/2 h-full flex-shrink-0 flex flex-col overflow-hidden">
                            <PreviewPanel {...previewPanelProps} isMobileView={true} />
                        </div>
                    </div>
                )}
            </main>

            {isImmersive && !isDesktop && (
                <button
                    data-testid="immersive-exit"
                    onClick={() => setIsImmersive(false)}
                    className="fixed top-3 right-3 z-[200] inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/85 dark:bg-[#1c1c1e]/85 backdrop-blur-md text-[12px] font-medium text-[#1d1d1f] dark:text-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-black/[0.08] dark:border-white/[0.1] transition-colors hover:bg-white dark:hover:bg-[#2c2c2e] active:scale-95"
                >
                    <Minimize2 size={13} />
                    <span className="hidden sm:inline">退出沉浸</span>
                </button>
            )}

            <AiMarkdownDialog
                isOpen={aiMarkdownOpen}
                isDesktop={isDesktop}
                currentMarkdown={getMarkdownSource(markaDocument)}
                onClose={() => setAiMarkdownOpen(false)}
                onApply={applyAiMarkdown}
                onStreamOutput={(text) => {
                    setMarkaDocument(createMarkdownDocument(text));
                    if (text.trim().length > 0) {
                        setAiMainTextStarted(true);
                        setHasAiGeneratedContent(true);
                    }
                }}
                onThinkingDelta={(delta) => {
                    setAiThinking(prev => prev + delta);
                }}
                onGenerationPhaseChange={(phase, abort) => {
                    setAiGenerationPhase(phase);
                    if (abort) {
                        aiStreamAbortRef.current = abort;
                        setAiThinking('');
                        setIsAiThinkingExpanded(false);
                        setAiMainTextStarted(false);
                        if (isDesktop) {
                            setEditorCollapsed(false);
                        } else if (activePanel !== 'editor') {
                            setActivePanel('editor');
                        }
                    }
                    if (phase === 'thinking') {
                        setIsAiThinkingExpanded(true);
                    }
                    if (phase === 'completed') {
                        aiStreamAbortRef.current = null;
                        setHasAiGeneratedContent(true);
                    }
                    if (phase === 'idle') {
                        aiStreamAbortRef.current = null;
                        setAiThinking('');
                        setIsAiThinkingExpanded(false);
                    }
                }}
                showNotice={showNotice}
            />

            <AnimatePresence>
                {confirmClearEditor && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[340] grid place-items-center bg-black/30 px-5 backdrop-blur-[2px] dark:bg-black/50"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.98 }}
                            transition={{ duration: 0.16 }}
                            className="w-full max-w-[340px] rounded-lg bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.24)] dark:bg-[#242426]"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="clear-editor-title"
                        >
                            <h3 id="clear-editor-title" className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">清除编辑区内容？</h3>
                            <p className="mt-2 text-[13px] leading-5 text-[#69707d] dark:text-[#a1a1a6]">
                                当前编辑区内容会被清空，此操作不会自动恢复。
                            </p>
                            <div className="mt-4 flex justify-end gap-2">
                                <button
                                    onClick={() => setConfirmClearEditor(false)}
                                    className="inline-flex h-8 items-center justify-center rounded-md bg-[#eef0f4] px-3 text-[12px] font-medium text-[#4b5563] transition-colors hover:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:hover:bg-[#3a3a3c]"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={confirmClearEditorContent}
                                    className="inline-flex h-8 items-center justify-center rounded-md bg-[#d70015] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#b80012] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d70015]/30 dark:bg-[#ff6961] dark:text-black dark:hover:bg-[#ff7b73]"
                                >
                                    确认清除
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <CopyToast notice={notice} onClose={() => setNotice(null)} />
            <Tooltip />

            <DropOverlay visible={dropActive} />
            <PngExportDialog
                isOpen={pngExportOpen}
                onClose={() => setPngExportOpen(false)}
                previewRef={previewRef}
                isDark={themeMode === 'dark'}
                onExported={() => showNotice('PNG 已导出', '长图已保存到指定位置', 'download')}
                onError={(msg) => showNotice('PNG 导出失败', msg, 'error')}
            />

        </div>
    );

    if (forceMobile) {
        const embedUrl = new URL(window.location.href);
        embedUrl.searchParams.delete('mobile');
        embedUrl.searchParams.set('embed', '1');
        const mobileScreen = DEVICE_FRAME_SIZE.mobile;
        const mobilePadding = DEVICE_FRAME_PADDING.mobile;
        return (
            <div className="fixed inset-0 bg-[#1d1d1f] flex items-center justify-center overflow-hidden">
                <div
                    className="relative bg-black rounded-[44px] shadow-2xl flex-shrink-0"
                    style={{
                        width: mobileScreen.width + mobilePadding * 2,
                        height: mobileScreen.height + mobilePadding * 2,
                        padding: mobilePadding,
                    }}
                >
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-2xl z-50" />
                    <div
                        className="w-full h-full rounded-[36px] overflow-hidden"
                        style={{ background: '#fbfbfd' }}
                    >
                        <iframe
                            src={embedUrl.toString()}
                            className="block w-full h-full border-none"
                            style={{ background: '#fbfbfd' }}
                            allow="clipboard-write; clipboard-read"
                        />
                    </div>
                </div>
            </div>
        );
    }

    return appContent;
}
