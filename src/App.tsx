import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PenLine, Eye, Minimize2 } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { md, preprocessMarkdown, applyTheme } from './lib/markdown';
import { markElementIndexes } from './lib/markdownIndexer';
import { makeWeChatCompatible, cleanInternalAttributes } from './lib/wechatCompat';
import { THEMES } from './lib/themes';
import { defaultContent } from './defaultContent';
import { findImagePosition, selectTextAreaRange } from './lib/imageSelector';
import { findElementPosition, type ElementLocation } from './lib/markdownLocator';
import Header from './components/Header';
import ThemeSelector from './components/ThemeSelector';
import { DesktopToolbar, MobileToolbar } from './components/Toolbar';
import EditorPanel from './components/EditorPanel';
import PreviewPanel from './components/PreviewPanel';
import Divider from './components/Divider';
import { DEVICE_FRAME_PADDING, DEVICE_FRAME_SIZE } from './components/DeviceFrame';

import CopyToast, { type Notice } from './components/CopyToast';
import AiMarkdownDialog from './components/AiMarkdownDialog';
import { cleanAiMarkdown, streamAiMarkdown, type AiApplyMode, type AiMarkdownRequest } from './lib/aiMarkdown';

const SPLIT_RATIO_STORAGE_KEY = 'marka:splitRatio';
const SPLIT_RATIO_DEFAULT = 38.2;
const PREVIEW_DEVICE_STORAGE_KEY = 'marka:previewDevice';
const PREVIEW_DEVICE_DEFAULT: 'mobile' | 'tablet' | 'pc' = 'pc';

function isTextEditingTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest('textarea, input, [contenteditable="true"], [data-swipe-ignore="true"]'));
}

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

/**
 * 保存 Blob 到文件。
 * 支持.showSaveFilePicker 时弹窗让用户选位置并写入，await 真实完成；
 * 否则降级为 a.click() 立即下载。
 * 返回 true=已保存，false=用户取消。
 */
async function saveBlob(blob: Blob, filename: string, ext: string, label: string): Promise<boolean> {
    const baseMime = blob.type.split(';')[0].trim() || 'application/octet-stream';
    const doAnchorDownload = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };
    try {
        const w = window as unknown as { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }> };
        if (w.showSaveFilePicker) {
            try {
                const handle = await w.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: label, accept: { [baseMime]: [ext] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (pickerErr) {
                if (pickerErr instanceof DOMException && pickerErr.name === 'AbortError') return false;
                console.warn('showSaveFilePicker failed, falling back to anchor download:', pickerErr);
                doAnchorDownload();
                return true;
            }
        } else {
            doAnchorDownload();
        }
        return true;
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return false;
        throw err;
    }
}

function isInIframe(): boolean {
    try {
        return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
        return true;
    }
}

// 剪贴板回退方案：当 Clipboard API 不可用时使用 execCommand
function fallbackCopyText(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
}

function fallbackCopyHtml(html: string): void {
    const listener = (e: ClipboardEvent) => {
        e.clipboardData?.setData('text/html', html);
        e.clipboardData?.setData('text/plain', html.replace(/<[^>]*>/g, ''));
        e.preventDefault();
    };
    document.addEventListener('copy', listener);
    document.execCommand('copy');
    document.removeEventListener('copy', listener);
}

type AiEditorStream = { phase: 'idle' | 'connecting' | 'thinking' | 'streaming'; chars: number; connectionMs?: number };

function formatAiConnectionTime(ms?: number) {
    if (typeof ms !== 'number') return '';
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function AiEditorStreamNotice({ state }: { state: AiEditorStream }) {
    if (state.phase === 'idle') return null;
    const connecting = state.phase === 'connecting';
    const thinking = state.phase === 'thinking';

    return (
        <div className={`pointer-events-none absolute left-1/2 z-[95] -translate-x-1/2 ${connecting ? 'top-8' : 'top-4'}`}>
            <div className={`${connecting ? 'w-[270px] flex-col px-5 pb-4 pt-4' : 'px-3 py-2'} flex items-center gap-2 rounded-md bg-white/94 text-[12px] font-medium text-[#394150] shadow-[0_10px_30px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.06] backdrop-blur-md dark:bg-[#242426]/94 dark:text-[#e5e5ea] dark:ring-white/[0.08]`}>
                {connecting ? (
                    <>
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
                    </>
                ) : thinking ? (
                    <>
                        <span className="h-2 w-2 rounded-full bg-[#0a84ff] dark:bg-[#64aaff]" />
                        <span>{`已连接模型 · ${formatAiConnectionTime(state.connectionMs)} · 正在思考`}</span>
                    </>
                ) : (
                    <>
                        <span className="h-2 w-2 rounded-full bg-[#0a84ff] dark:bg-[#64aaff]" />
                        <span>{`正在写入编辑区 · ${state.chars} 字`}</span>
                    </>
                )}
            </div>
        </div>
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
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
    const [markdownInput, setMarkdownInput] = useState<string>(defaultContent);
    const [renderedHtml, setRenderedHtml] = useState<string>('');
    const [activeTheme, setActiveTheme] = useState(THEMES[0].id);
    const [notice, setNotice] = useState<Notice | null>(null);
    const noticeIdRef = useRef(0);
    const showNotice = (
        title: string,
        description: string,
        tone: Notice['tone'],
        action?: Pick<Notice, 'actionLabel' | 'onAction'>
    ) => setNotice({ id: ++noticeIdRef.current, title, description, tone, ...action });
    const [aiMarkdownOpen, setAiMarkdownOpen] = useState(false);
    const [aiEditorStream, setAiEditorStream] = useState<AiEditorStream>({ phase: 'idle', chars: 0 });
    const [lastAiRequest, setLastAiRequest] = useState<AiMarkdownRequest | null>(null);
    const [aiStreamInterrupted, setAiStreamInterrupted] = useState(false);
    const [hasAiGeneratedContent, setHasAiGeneratedContent] = useState(false);
    const [confirmClearEditor, setConfirmClearEditor] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [isImmersive, setIsImmersive] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'pc'>(() =>
        embedded ? 'mobile' : loadPreviewDevice()
    );
    const [activePanel, setActivePanel] = useState<'editor' | 'preview'>(embedded ? 'preview' : 'editor');
    const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
    const [splitRatio, setSplitRatio] = useState<number>(loadSplitRatio);
    const [isDraggingDivider, setIsDraggingDivider] = useState(false);
    const [containerWidth, setContainerWidth] = useState(0);
    const [isDesktop, setIsDesktop] = useState(() =>
        embedded ? false : (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
    );
    const previewRef = useRef<HTMLDivElement>(null);
    const editorScrollRef = useRef<HTMLTextAreaElement>(null);
    const previewOuterScrollRef = useRef<HTMLDivElement>(null);
    const previewInnerScrollRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLElement>(null);
    const aiStreamAbortRef = useRef<AbortController | null>(null);
    const scrollSyncLockRef = useRef<'editor' | 'preview' | null>(null);
    const scrollLockReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const swipeRef = useRef<{ startX: number; startY: number; locked: boolean | 'h' | 'v' }>({ startX: 0, startY: 0, locked: false });
    const [swipeDx, setSwipeDx] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const mobileToolbarRef = useRef<HTMLDivElement>(null);
    const [toolbarCompact, setToolbarCompact] = useState(false);

    // 检测移动端工具栏溢出，动态切换紧凑模式
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

    const tabIndicatorX = useMemo(() => {
        const w = typeof window !== 'undefined' ? window.innerWidth : 390;
        const base = activePanel === 'editor' ? 0 : 1;
        const drag = activePanel === 'editor' ? Math.max(0, Math.min(1, -swipeDx / w)) : -Math.max(0, Math.min(1, swipeDx / w));
        return base + drag;
    }, [activePanel, swipeDx]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (isDesktop) return;
        if (isTextEditingTarget(e.target)) {
            swipeRef.current = { startX: 0, startY: 0, locked: 'v' };
            setSwipeDx(0);
            setIsSwiping(false);
            return;
        }
        const t = e.touches[0];
        swipeRef.current = { startX: t.clientX, startY: t.clientY, locked: false };
        setSwipeDx(0);
    }, [isDesktop]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (isDesktop) return;
        const s = swipeRef.current;
        const t = e.touches[0];
        const dx = t.clientX - s.startX;
        const dy = t.clientY - s.startY;

        if (!s.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
            if (s.locked === 'h') setIsSwiping(true);
        }
        if (s.locked === 'h') {
            e.preventDefault();
            const clamped = activePanel === 'editor' ? Math.min(0, Math.max(-window.innerWidth, dx)) : Math.min(window.innerWidth, Math.max(0, dx));
            setSwipeDx(clamped);
        }
    }, [isDesktop, activePanel]);

    const handleTouchEnd = useCallback(() => {
        if (isDesktop) return;
        const s = swipeRef.current;
        if (s.locked === 'h') {
            const threshold = window.innerWidth * 0.2;
            const dx = swipeDx;
            if ((activePanel === 'editor' && dx < -threshold) || (activePanel === 'preview' && dx > threshold)) {
                setActivePanel(activePanel === 'editor' ? 'preview' : 'editor');
            }
            setSwipeDx(0);
            setIsSwiping(false);
        }
        s.locked = false;
    }, [isDesktop, activePanel, swipeDx]);

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
    const ratioBounds = computeRatioBounds(containerWidth, previewMinPx);

    // 容器宽度变化（如窗口缩放）时，若已保存的 ratio 越界则自动收回
    // 初始化阶段 containerWidth 为 0，ratioBounds 为默认值 {DEFAULT,DEFAULT}，
    // 此时不应钳制，否则会把用户保存的 ratio 误覆盖为默认值并持久化到 localStorage
    useEffect(() => {
        if (containerWidth <= 0) return;
        setSplitRatio((prev) => clampRatio(prev, ratioBounds));
    }, [ratioBounds.min, ratioBounds.max, containerWidth]);

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
            const ratio = (x / rect.width) * 100;
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
    }, [previewDevice]);

    const toggleTheme = () => {
        setThemeMode((prev) => {
            const next = prev === 'light' ? 'dark' : 'light';
            if (next === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            return next;
        });
    };

    const applyAiMarkdown = (markdown: string, mode: AiApplyMode) => {
        const previous = markdownInput;
        const previousAiState = hasAiGeneratedContent;
        let next = markdown;
        let cursorPos: number | null = null;
        const textarea = editorScrollRef.current;

        if (mode === 'append') {
            next = `${markdownInput.trimEnd()}\n\n${markdown}`.trimStart();
        } else if (mode === 'insert' && textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            next = markdownInput.slice(0, start) + markdown + markdownInput.slice(end);
            cursorPos = start + markdown.length;
        }

        setMarkdownInput(next);
        setHasAiGeneratedContent(Boolean(next.trim()));

        if (cursorPos !== null && textarea) {
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(cursorPos, cursorPos);
            }, 0);
        }

        const modeLabel = mode === 'replace' ? '已替换当前内容' : mode === 'insert' ? '已插入到光标处' : '已追加到末尾';
        showNotice('AI Markdown 已应用', modeLabel, 'success', {
            actionLabel: '撤销',
            onAction: () => {
                setMarkdownInput(previous);
                setHasAiGeneratedContent(previousAiState);
                showNotice('已撤销', '已恢复 AI 应用前的内容', 'success');
            },
        });
    };

    const streamReplaceAiMarkdown = useCallback(async (request: AiMarkdownRequest) => {
        aiStreamAbortRef.current?.abort();
        const controller = new AbortController();
        const previous = markdownInput;
        const previousAiState = hasAiGeneratedContent;
        let streamed = '';

        aiStreamAbortRef.current = controller;
        setLastAiRequest(request);
        setAiStreamInterrupted(false);
        setAiMarkdownOpen(false);
        setActivePanel('editor');
        setMarkdownInput('');
        setHasAiGeneratedContent(false);
        setAiEditorStream({ phase: 'connecting', chars: 0 });

        try {
            const markdown = await streamAiMarkdown(request, {
                signal: controller.signal,
                onConnected: (connectionMs) => {
                    setAiEditorStream({ phase: 'thinking', chars: 0, connectionMs });
                },
                onDelta: (delta) => {
                    streamed += delta;
                    setMarkdownInput(streamed);
                    setAiEditorStream({ phase: 'streaming', chars: streamed.length });
                },
            });
            const cleaned = cleanAiMarkdown(markdown || streamed);
            if (!cleaned) throw new Error('模型没有返回 Markdown 内容');

            setMarkdownInput(cleaned);
            setHasAiGeneratedContent(true);
            setAiEditorStream({ phase: 'idle', chars: cleaned.length });
            showNotice('AI Markdown 已应用', '已替换当前内容', 'success', {
                actionLabel: '撤销',
                onAction: () => {
                    setMarkdownInput(previous);
                    setHasAiGeneratedContent(previousAiState);
                    setAiStreamInterrupted(false);
                    setLastAiRequest(null);
                    showNotice('已撤销', '已恢复 AI 应用前的内容', 'success');
                },
            });
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                setAiEditorStream({ phase: 'idle', chars: 0 });
                setHasAiGeneratedContent(Boolean(streamed.trim()));
                setAiStreamInterrupted(true);
                return;
            }
            setMarkdownInput(previous);
            setHasAiGeneratedContent(previousAiState);
            setAiStreamInterrupted(false);
            setAiEditorStream({ phase: 'idle', chars: 0 });
            showNotice('生成失败', err instanceof Error ? err.message : 'AI 生成失败，请稍后重试', 'error');
        } finally {
            if (aiStreamAbortRef.current === controller) aiStreamAbortRef.current = null;
        }
    }, [hasAiGeneratedContent, markdownInput, showNotice]);

    const requestClearEditor = useCallback(() => setConfirmClearEditor(true), []);

    const confirmClearEditorContent = useCallback(() => {
        setMarkdownInput('');
        setHasAiGeneratedContent(false);
        setConfirmClearEditor(false);
        editorScrollRef.current?.focus();
        showNotice('已清除', '编辑区内容已清空', 'success');
    }, [showNotice]);

    useEffect(() => {
        // Core rendering: markdown → HTML → styled HTML
        const rawHtml = md.render(preprocessMarkdown(markdownInput));
        const styledHtml = applyTheme(rawHtml, activeTheme);

        // Enhancement layer: add index markers for click-to-locate
        // This is decoupled from core rendering logic
        const indexedHtml = markElementIndexes(styledHtml);

        setRenderedHtml(indexedHtml);
    }, [markdownInput, activeTheme]);

    useEffect(() => {
        if (!scrollSyncEnabled) resetScrollSyncLock();
    }, [scrollSyncEnabled, resetScrollSyncLock]);

    useEffect(() => {
        resetScrollSyncLock();
    }, [previewDevice, resetScrollSyncLock]);

    useEffect(() => {
        return () => resetScrollSyncLock();
    }, [resetScrollSyncLock]);

    const getActivePreviewScrollElement = () => {
        if (previewDevice === 'pc' || !isDesktop) return previewOuterScrollRef.current;
        return previewInnerScrollRef.current;
    };

    const syncScrollPosition = (
        sourceElement: HTMLElement,
        targetElement: HTMLElement,
        sourcePanel: 'editor' | 'preview'
    ) => {
        if (!scrollSyncEnabled) return;
        if (scrollSyncLockRef.current && scrollSyncLockRef.current !== sourcePanel) return;

        const sourceMaxScroll = sourceElement.scrollHeight - sourceElement.clientHeight;
        const targetMaxScroll = targetElement.scrollHeight - targetElement.clientHeight;
        if (sourceMaxScroll <= 0) {
            targetElement.scrollTop = 0;
            return;
        }

        const scrollRatio = sourceElement.scrollTop / sourceMaxScroll;
        scrollSyncLockRef.current = sourcePanel;
        targetElement.scrollTop = scrollRatio * Math.max(targetMaxScroll, 0);

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
        const previewElement = getActivePreviewScrollElement();
        if (!editorElement || !previewElement) return;
        syncScrollPosition(editorElement, previewElement, 'editor');
    };

    const handlePreviewOuterScroll = () => {
        if (previewDevice !== 'pc' && isDesktop) return;
        const previewElement = previewOuterScrollRef.current;
        const editorElement = editorScrollRef.current;
        if (!previewElement || !editorElement) return;
        syncScrollPosition(previewElement, editorElement, 'preview');
    };

    const handlePreviewInnerScroll = () => {
        if (previewDevice === 'pc' || !isDesktop) return;
        const previewElement = previewInnerScrollRef.current;
        const editorElement = editorScrollRef.current;
        if (!previewElement || !editorElement) return;
        syncScrollPosition(previewElement, editorElement, 'preview');
    };

    const handleSelectAll = useCallback(() => {
        const textarea = editorScrollRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.select();
    }, []);

    const abortAiStream = useCallback(() => {
        aiStreamAbortRef.current?.abort();
    }, []);

    const regenerateAiStream = useCallback(() => {
        if (lastAiRequest) void streamReplaceAiMarkdown(lastAiRequest);
    }, [lastAiRequest]);

    const isAiStreaming = aiEditorStream.phase !== 'idle';
    const editorClearAction = !isAiStreaming && hasAiGeneratedContent && markdownInput.trim().length > 0 ? requestClearEditor : undefined;
    const canRegenerateStream = !isAiStreaming && aiStreamInterrupted && lastAiRequest !== null;

    const handleCopy = async () => {
        if (!previewRef.current) return;
        setIsCopying(true);
        try {
            const finalHtmlForCopy = await makeWeChatCompatible(renderedHtml, activeTheme);

            const blob = new Blob([finalHtmlForCopy], { type: 'text/html' });
            const textBlob = new Blob([previewRef.current.innerText], { type: 'text/plain' });

            try {
                const clipboardItem = new ClipboardItem({
                    'text/html': blob,
                    'text/plain': textBlob
                });
                await navigator.clipboard.write([clipboardItem]);
            } catch {
                fallbackCopyHtml(finalHtmlForCopy);
            }

            showNotice('排版已复制', '可直接粘贴到公众号编辑器', 'success');
        } catch (err) {
            console.error('Copy failed', err);
            alert('复制格式失败，请检查浏览器剪贴板权限');
        } finally {
            setIsCopying(false);
        }
    };

    const handleCopyMarkdown = async () => {
        try {
            await navigator.clipboard.writeText(markdownInput);
            showNotice('Markdown 已复制', '原始 Markdown 源码已复制到剪贴板', 'success');
        } catch (err) {
            console.error('Copy Markdown failed', err);
            fallbackCopyText(markdownInput);
            showNotice('Markdown 已复制', '原始 Markdown 源码已复制到剪贴板', 'success');
        }
    };

    const handleExportHtml = async () => {
        const blob = new Blob([cleanInternalAttributes(renderedHtml)], { type: 'text/html;charset=utf-8' });
        const filename = `Marka_Article_${Date.now()}.html`;
        try {
            const saved = await saveBlob(blob, filename, '.html', 'HTML 文档');
            if (saved) showNotice('HTML 已导出', '文件已保存到指定位置', 'download');
        } catch (err) {
            console.error('HTML export failed', err);
            showNotice('导出失败', '请稍后重试', 'error');
        }
    };

    const handleExportMarkdown = async () => {
        const blob = new Blob([markdownInput], { type: 'text/markdown;charset=utf-8' });
        const filename = `Marka_Article_${Date.now()}.md`;
        try {
            const saved = await saveBlob(blob, filename, '.md', 'Markdown 文档');
            if (saved) showNotice('Markdown 已导出', '文件已保存到指定位置', 'download');
        } catch (err) {
            console.error('Markdown export failed', err);
            showNotice('导出失败', '请稍后重试', 'error');
        }
    };

    const handleExportPdf = async () => {
        if (!previewRef.current) return;
        const opt = {
            margin: 10,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff' },
            jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
        };
        const clonedElement = previewRef.current.cloneNode(true) as HTMLElement;
        clonedElement.querySelectorAll('*').forEach(el => {
            el.removeAttribute('data-md-type');
            el.removeAttribute('data-md-index');
        });
        const cloneContainer = document.createElement('div');
        cloneContainer.style.background = document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff';
        cloneContainer.appendChild(clonedElement);
        document.body.appendChild(cloneContainer);

        try {
            const pdfBlob = await html2pdf().set(opt).from(cloneContainer).output('blob') as unknown as Blob;
            const filename = `Marka_Article_${Date.now()}.pdf`;
            const saved = await saveBlob(pdfBlob, filename, '.pdf', 'PDF 文档');
            if (saved) showNotice('PDF 已导出', '文件已保存到指定位置', 'download');
        } catch (err) {
            console.error('PDF export failed', err);
            showNotice('导出失败', 'PDF 生成失败，请重试', 'error');
        } finally {
            cloneContainer.remove();
        }
    };

    const handleImageClick = useCallback((info: { type: string; index: number; src?: string; alt?: string; content?: string }) => {
        if (!editorScrollRef.current) return;

        let location: ElementLocation | null = null;

        // Images use specialized positioning
        if (info.type === 'image' && info.src) {
            const match = findImagePosition(markdownInput, info.src, info.alt || '');
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
            location = findElementPosition(markdownInput, info.type, '', info.index);
        }

        if (location) {
            // Always select the entire content - consistent user experience
            selectTextAreaRange(editorScrollRef.current, location.start, location.end);

            // Switch to editor panel on mobile
            if (window.innerWidth < 768 && activePanel !== 'editor') {
                setActivePanel('editor');
            }
        }
    }, [markdownInput, activePanel]);

    const deviceWidthClass = () => {
        if (previewDevice === 'mobile') return 'max-w-[520px] w-full';
        if (previewDevice === 'tablet') return 'max-w-[800px] w-full';
        return 'max-w-[840px] xl:max-w-[1024px] w-full';
    };

    // 中轴线动态分栏：编辑区 fr / 分隔条 / 预览区 fr
    // 渲染时再次钳制到当前容器边界，防止状态未及时更新导致预览区被压缩到裁切
    // 容器宽度未就绪时直接使用保存值，避免初次渲染误钳制为默认值产生闪烁
    const safeRatio = containerWidth > 0 ? clampRatio(splitRatio, ratioBounds) : splitRatio;
    const mainGridStyle: React.CSSProperties = {
        gridTemplateColumns: isDesktop
            ? `${safeRatio}fr 6px ${100 - safeRatio}fr`
            : '1fr',
    };

    const appContent = (
        <div className="flex flex-col h-screen overflow-hidden antialiased bg-[#fbfbfd] dark:bg-black transition-colors duration-300">

            {!isImmersive && (
                <Header
                    themeMode={themeMode}
                    onToggleTheme={toggleTheme}
                    onOpenAi={() => setAiMarkdownOpen(true)}
                    isImmersive={isImmersive}
                    onToggleImmersive={() => {
                        setIsImmersive((prev) => !prev);
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
                <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                <DesktopToolbar
                    previewDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onExportPdf={handleExportPdf}
                    onExportHtml={handleExportHtml}
                    onExportMarkdown={handleExportMarkdown}
                    onCopy={handleCopy}
                    onCopyMarkdown={handleCopyMarkdown}
                    isCopying={isCopying}
                    scrollSyncEnabled={scrollSyncEnabled}
                    onToggleScrollSync={() => setScrollSyncEnabled((prev) => !prev)}
                />
            </div>}

            {/* 移动端工具栏（仅预览Tab显示）：整行自适应，溢出时切换紧凑模式 */}
            {!isImmersive && activePanel === 'preview' && (
                <div ref={mobileToolbarRef} className="md:hidden glass-toolbar flex items-center px-2 py-1 z-[90] gap-1.5 overflow-hidden">
                    <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} mobile compact={toolbarCompact} />
                    <MobileToolbar
                        onExportPdf={handleExportPdf}
                        onExportHtml={handleExportHtml}
                        onExportMarkdown={handleExportMarkdown}
                        onCopy={handleCopy}
                        onCopyMarkdown={handleCopyMarkdown}
                        isCopying={isCopying}
                        compact={toolbarCompact}
                    />
                </div>
            )}

            {/* 编辑区 & 预览区 */}
            <main
                ref={mainRef}
                className={`flex-1 overflow-hidden relative ${isDesktop ? '' : ''}`}
            >
                <AiEditorStreamNotice state={aiEditorStream} />

                {/* 桌面端：左右分栏 */}
                {isDesktop && (
                    <div
                        className="w-full h-full grid"
                        style={mainGridStyle}
                    >
                        <div className="flex flex-col overflow-hidden">
                            <EditorPanel
                                markdownInput={markdownInput}
                                onInputChange={setMarkdownInput}
                                editorScrollRef={editorScrollRef}
                                onEditorScroll={handleEditorScroll}
                                scrollSyncEnabled={scrollSyncEnabled}
                                onClearRequest={editorClearAction}
                                onAbortStream={isAiStreaming ? abortAiStream : undefined}
                                onRegenerateStream={canRegenerateStream ? regenerateAiStream : undefined}
                                thinkingConnectionMs={aiEditorStream.phase === 'thinking' ? aiEditorStream.connectionMs : undefined}
                                immersive={isImmersive}
                            />
                        </div>
                        <Divider
                            onPointerDown={handleDividerPointerDown}
                            isDragging={isDraggingDivider}
                            ratio={safeRatio}
                            minRatio={ratioBounds.min}
                            maxRatio={ratioBounds.max}
                        />
                        <div className="flex flex-col overflow-hidden">
                            <PreviewPanel
                                renderedHtml={renderedHtml}
                                deviceWidthClass={deviceWidthClass()}
                                previewDevice={previewDevice}
                                previewRef={previewRef}
                                previewOuterScrollRef={previewOuterScrollRef}
                                previewInnerScrollRef={previewInnerScrollRef}
                                onPreviewOuterScroll={handlePreviewOuterScroll}
                                onPreviewInnerScroll={handlePreviewInnerScroll}
                                scrollSyncEnabled={scrollSyncEnabled}
                                onImageClick={handleImageClick}
                                isMobileView={false}
                            />
                        </div>
                    </div>
                )}

                {/* 移动端：左右滑动切换 */}
                {!isDesktop && (
                    <div
                        className="w-[200%] h-full flex flex-nowrap"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{
                            transform: `translateX(${(activePanel === 'editor' ? 0 : -(typeof window !== 'undefined' ? window.innerWidth : 0)) + swipeDx}px)`,
                            transition: isSwiping ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
                            touchAction: 'pan-y',
                        }}
                    >
                        <div className="w-1/2 h-full flex-shrink-0 flex flex-col overflow-hidden">
                            <EditorPanel
                                markdownInput={markdownInput}
                                onInputChange={setMarkdownInput}
                                editorScrollRef={editorScrollRef}
                                onEditorScroll={handleEditorScroll}
                                scrollSyncEnabled={scrollSyncEnabled}
                                onSelectAll={isAiStreaming || editorClearAction || canRegenerateStream ? undefined : handleSelectAll}
                                onClearRequest={editorClearAction}
                                onAbortStream={isAiStreaming ? abortAiStream : undefined}
                                onRegenerateStream={canRegenerateStream ? regenerateAiStream : undefined}
                                thinkingConnectionMs={aiEditorStream.phase === 'thinking' ? aiEditorStream.connectionMs : undefined}
                                immersive={isImmersive}
                            />
                        </div>
                        <div className="w-1/2 h-full flex-shrink-0 flex flex-col overflow-hidden">
                            <PreviewPanel
                                renderedHtml={renderedHtml}
                                deviceWidthClass={deviceWidthClass()}
                                previewDevice={previewDevice}
                                previewRef={previewRef}
                                previewOuterScrollRef={previewOuterScrollRef}
                                previewInnerScrollRef={previewInnerScrollRef}
                                onPreviewOuterScroll={handlePreviewOuterScroll}
                                onPreviewInnerScroll={handlePreviewInnerScroll}
                                scrollSyncEnabled={scrollSyncEnabled}
                                onImageClick={handleImageClick}
                                isMobileView={true}
                            />
                        </div>
                    </div>
                )}
            </main>

            {/* 沉浸模式：悬浮退出按钮 */}
            {isImmersive && (
                <motion.button
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    data-testid="immersive-exit"
                    onClick={() => setIsImmersive(false)}
                    className="fixed top-3 right-3 z-[200] inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/85 dark:bg-[#1c1c1e]/85 backdrop-blur-md text-[12px] font-medium text-[#1d1d1f] dark:text-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-black/[0.08] dark:border-white/[0.1] transition-colors hover:bg-white dark:hover:bg-[#2c2c2e] active:scale-95"
                    title="退出沉浸编辑（ESC）"
                >
                    <Minimize2 size={13} />
                    <span className="hidden sm:inline">退出沉浸</span>
                </motion.button>
            )}

            <AiMarkdownDialog
                isOpen={aiMarkdownOpen}
                isDesktop={isDesktop}
                currentMarkdown={markdownInput}
                onClose={() => setAiMarkdownOpen(false)}
                onApply={applyAiMarkdown}
                onStreamReplace={(request) => void streamReplaceAiMarkdown(request)}
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
