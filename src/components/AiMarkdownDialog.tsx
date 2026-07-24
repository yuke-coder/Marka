import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, Clipboard, Copy, Eraser, RemoveFormatting, X, Zap } from 'lucide-react';
import {
    DEFAULT_AI_MARKDOWN_MODEL,
    DEFAULT_AI_MARKDOWN_SPEED,
    DEFAULT_AI_REASONING_EFFORT,
    AI_CONNECTION_GATE_MS,
    aiMarkdownModels,
    aiMarkdownSpeeds,
    aiReasoningEfforts,
    cleanAiMarkdown,
    streamAiMarkdown,
    type AiGenerationPhase,
    type AiMarkdownModel,
    type AiMarkdownModelOption,
    type AiMarkdownSpeed,
    type AiReasoningEffort,
} from '../lib/aiMarkdown';
import {
    AI_FORMATTING_PRESETS,
    DEFAULT_AI_FORMATTING_PRESET,
    type AiFormattingPresetId,
} from '../lib/aiFormattingPresets';
import { readClipboardText } from '../lib/clipboard';
import { removeMarkdownFormatting } from '../lib/markdownUtils';
import { ModelIcon } from '../lib/modelIcons';

interface AiMarkdownDialogProps {
    isOpen: boolean;
    isDesktop: boolean;
    onClose: () => void;
    onApply: (markdown: string) => void;
    onStreamOutput?: (text: string) => void;
    onThinkingDelta?: (delta: string) => void;
    onGenerationPhaseChange?: (phase: AiGenerationPhase, abort?: () => void) => void;
    showNotice: (title: string, description: string, tone: 'success' | 'download' | 'error') => void;
}

const ghostButton = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#eef0f4] px-3 text-[12px] font-medium text-[#4b5563] transition-colors hover:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:hover:bg-[#3a3a3c]';
const compactGhostButton = 'inline-flex h-[clamp(20px,calc(var(--sh)*0.03),28px)] items-center justify-center gap-1 rounded-md bg-[#eef0f4] px-[clamp(6px,calc(var(--sh)*0.012),12px)] py-0 text-[clamp(10px,calc(var(--sh)*0.012),12px)] font-medium text-[#4b5563] transition-colors active:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:active:bg-[#3a3a3c]';
const primaryButton = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#1d1d1f] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2f3137] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-[#f5f5f7] dark:text-black';
const compactPrimaryButton = 'inline-flex h-[clamp(20px,calc(var(--sh)*0.03),28px)] items-center justify-center gap-1 rounded-md bg-[#1d1d1f] px-[clamp(6px,calc(var(--sh)*0.014),14px)] py-0 text-[clamp(10px,calc(var(--sh)*0.012),12px)] font-semibold text-white transition-colors active:bg-[#2f3137] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-[#f5f5f7] dark:text-black';
const sourceInputClass = 'h-full w-full resize-none overscroll-contain bg-transparent px-3 pb-4 text-[14px] leading-7 text-[#1d1d1f] outline-none placeholder:text-[#666b73] dark:text-[#f5f5f7] dark:placeholder:text-[#a8a8ad]';
const sourceToolButton = 'inline-flex shrink-0 items-center justify-center rounded-md text-[#515862] transition-[background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none dark:text-[#c7c7cc]';
type WorkflowTab = 'format' | 'preset';
interface WorkflowSwipeGesture {
    pointerId: number;
    startX: number;
    startY: number;
    startedAt: number;
    width: number;
    axis: 'pending' | 'x' | 'y';
    offsetX: number;
    tab: WorkflowTab;
}

const workflowTabs: ReadonlyArray<{ id: WorkflowTab; label: string }> = [
    { id: 'format', label: '排版模式' },
    { id: 'preset', label: '排版方案' },
];

export default function AiMarkdownDialog(props: AiMarkdownDialogProps) {
    const { isOpen, isDesktop, onClose, onApply, onStreamOutput, onThinkingDelta, onGenerationPhaseChange, showNotice } = props;
    const [model, setModel] = useState<AiMarkdownModel>(DEFAULT_AI_MARKDOWN_MODEL);
    const [reasoningEffort, setReasoningEffort] = useState<AiReasoningEffort>(DEFAULT_AI_REASONING_EFFORT);
    const [speed, setSpeed] = useState<AiMarkdownSpeed>(DEFAULT_AI_MARKDOWN_SPEED);
    const [activeTab, setActiveTab] = useState<WorkflowTab>('format');
    const [formattingPreset, setFormattingPreset] = useState<AiFormattingPresetId>(DEFAULT_AI_FORMATTING_PRESET);
    const [hasSourceText, setHasSourceText] = useState(false);
    const [copiedSource, setCopiedSource] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsSubmenu, setSettingsSubmenu] = useState<null | 'model' | 'speed'>(null);
    const [settingsSubmenuOffset, setSettingsSubmenuOffset] = useState(-10);
    const modelOptions: AiMarkdownModelOption[] = aiMarkdownModels;
    const [sheetHeight, setSheetHeight] = useState(88);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    const abortRef = useRef<AbortController | null>(null);
    const isStreamingRef = useRef(false);
    const settingsDetailsRef = useRef<HTMLDivElement>(null);
    const sourceTextRef = useRef('');
    const hasSourceTextRef = useRef(false);
    const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
    const workflowTrackRef = useRef<HTMLDivElement>(null);
    const workflowSwipeRef = useRef<WorkflowSwipeGesture | null>(null);
    const suppressWorkflowClickUntilRef = useRef(0);

    const canGenerate = hasSourceText;
    const prefersReducedMotion = useReducedMotion();
    const workflowTransition = prefersReducedMotion
        ? 'none'
        : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)';
    const keyboardActive = keyboardHeight > 0;

    useEffect(() => {
        if (!isOpen) {
            if (!isStreamingRef.current) abortRef.current?.abort();
            setSettingsOpen(false);
            setSettingsSubmenu(null);
            setSettingsSubmenuOffset(-10);
            setIsFullscreen(false);
            setSheetHeight(88);
            setKeyboardHeight(0);
            setActiveTab('format');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isDesktop) onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, isDesktop, onClose]);

    // 移动端虚拟键盘高度追踪：键盘弹出时收起面板底部并上移，避免遮挡输入框
    useEffect(() => {
        if (isDesktop || !isOpen) return;
        const vv = window.visualViewport;
        if (!vv) return;
        let rafId: number | null = null;
        let lastKb = 0;
        const update = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
                if (kb !== lastKb) {
                    lastKb = kb;
                    setKeyboardHeight(kb);
                }
            });
        };
        update();
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
        };
    }, [isDesktop, isOpen]);

    const syncSourceText = useCallback((text: string) => {
        sourceTextRef.current = text;

        const nextHasSourceText = text.trim().length > 0;
        if (hasSourceTextRef.current !== nextHasSourceText) {
            hasSourceTextRef.current = nextHasSourceText;
            setHasSourceText(nextHasSourceText);
        }
    }, []);

    const insertSourceText = useCallback((text: string) => {
        const textarea = sourceTextareaRef.current;
        if (!textarea) {
            syncSourceText(sourceTextRef.current + text);
            return;
        }

        const currentValue = textarea.value;
        const start = textarea.selectionStart ?? currentValue.length;
        const end = textarea.selectionEnd ?? currentValue.length;
        textarea.setRangeText(text, start, end, 'end');
        syncSourceText(textarea.value);
    }, [syncSourceText]);

    const pasteSourceText = useCallback(async () => {
        const text = await readClipboardText();
        if (!text) {
            showNotice('粘贴失败', '未获得剪贴板权限或剪贴板为空', 'error');
            return;
        }
        insertSourceText(text);
        showNotice('已粘贴', '剪贴板内容已粘贴到纯文本输入框', 'success');
    }, [insertSourceText, showNotice]);

    const clearSourceText = useCallback(() => {
        const textarea = sourceTextareaRef.current;
        if (textarea) {
            textarea.value = '';
            syncSourceText('');
        } else {
            syncSourceText('');
        }
        showNotice('已清除', '纯文本输入框已清空', 'success');
    }, [showNotice, syncSourceText]);

    const clearSourceFormatting = useCallback(() => {
        const textarea = sourceTextareaRef.current;
        const currentValue = textarea?.value ?? sourceTextRef.current;
        const plainText = removeMarkdownFormatting(currentValue);
        if (textarea) textarea.value = plainText;
        syncSourceText(plainText);
        showNotice('已清除格式', '已移除所有格式标记，仅保留纯文本', 'success');
    }, [showNotice, syncSourceText]);

    const handleSheetPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (isFullscreen) return;
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = sheetHeight;
        const vh = window.innerHeight;
        let lastY = startY;
        let lastTime = Date.now();
        let shouldExpand = false;
        let currentHeight = startHeight;
        setIsDragging(true);

        const onMove = (e: PointerEvent) => {
            const now = Date.now();
            const dy = lastY - e.clientY;
            lastY = e.clientY;
            lastTime = now;

            currentHeight = Math.max(50, Math.min(94, startHeight + ((startY - e.clientY) / vh) * 100));
            if (currentHeight >= 90 || (dy / Math.max(1, now - lastTime) > 0.5 && currentHeight >= 85)) {
                shouldExpand = true;
            }
            setSheetHeight(currentHeight);
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            setIsDragging(false);
            if (shouldExpand || currentHeight >= 90) setIsFullscreen(true);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [sheetHeight, isFullscreen]);

    const copySourceText = useCallback(async () => {
        const text = sourceTextareaRef.current?.value ?? sourceTextRef.current;
        if (copiedSource || !text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedSource(true);
            window.setTimeout(() => {
                setCopiedSource(false);
            }, 2000);
        } catch {
            showNotice('复制失败', '无法写入剪贴板', 'error');
        }
    }, [copiedSource, showNotice]);

    const generate = useCallback(async () => {
        const text = sourceTextareaRef.current?.value ?? sourceTextRef.current;

        if (!text.trim()) {
            showNotice('缺少内容', '请输入纯文本内容后再生成', 'error');
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        isStreamingRef.current = true;
        onClose();
        onGenerationPhaseChange?.('connecting', () => controller.abort());

        let currentPhase: AiGenerationPhase = 'connecting';
        let connectionTimer: number | null = null;
        let receivedText = '';
        let receivedThinking = false;
        let connectionGateReleased = false;

        const setPhase = (phase: AiGenerationPhase) => {
            if (abortRef.current !== controller) return;
            if (currentPhase === phase) return;
            currentPhase = phase;
            onGenerationPhaseChange?.(phase);
        };

        const releaseConnectionGate = (phase: 'processing' | 'thinking' | 'finalizing') => {
            if (connectionGateReleased || abortRef.current !== controller || controller.signal.aborted) return;
            if (connectionTimer !== null) window.clearTimeout(connectionTimer);
            connectionTimer = null;
            connectionGateReleased = true;
            setPhase(phase);
        };

        const startConnectionGate = () => {
            connectionTimer = window.setTimeout(() => {
                connectionTimer = null;
                releaseConnectionGate('processing');
            }, AI_CONNECTION_GATE_MS);
        };

        const cancelConnectionGate = () => {
            if (connectionTimer !== null) window.clearTimeout(connectionTimer);
            connectionTimer = null;
        };

        const showStreamPhase = (phase: 'thinking' | 'finalizing') => {
            if (!connectionGateReleased) {
                releaseConnectionGate(phase);
                return;
            }
            if (phase === 'thinking' && currentPhase === 'finalizing') return;
            setPhase(phase);
        };

        try {
            startConnectionGate();
            const markdown = await streamAiMarkdown(
                { presetId: formattingPreset, model, reasoningEffort, speed, sourceText: text },
                {
                    signal: controller.signal,
                    onThinkingDelta: (delta) => {
                        receivedThinking = true;
                        showStreamPhase('thinking');
                        onThinkingDelta?.(delta);
                    },
                    onDelta: (delta) => {
                        receivedText += delta;
                        showStreamPhase('finalizing');
                        onStreamOutput?.(receivedText);
                    },
                }
            );

            const cleaned = cleanAiMarkdown(markdown);
            if (!cleaned) throw new Error('模型没有返回 Markdown 内容');
            if (!receivedText) {
                receivedText = markdown;
                showStreamPhase('finalizing');
                onStreamOutput?.(receivedText);
            }
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            onApply(cleaned);
            setPhase('completed');
        } catch (err) {
            cancelConnectionGate();
            const wasAborted = controller.signal.aborted
                || (err instanceof DOMException && err.name === 'AbortError');
            setPhase(wasAborted || receivedThinking || Boolean(receivedText) ? 'interrupted' : 'idle');
            if (wasAborted) return;
            showNotice('生成失败', err instanceof Error ? err.message : 'AI 生成失败，请稍后重试', 'error');
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                isStreamingRef.current = false;
            }
        }
    }, [formattingPreset, model, onApply, onClose, onStreamOutput, onThinkingDelta, onGenerationPhaseChange, reasoningEffort, showNotice, speed]);

    const settleWorkflowSwipe = useCallback((gesture: WorkflowSwipeGesture, targetTab: WorkflowTab) => {
        const track = workflowTrackRef.current;
        if (!track) return;

        const currentBase = gesture.tab === 'format' ? 0 : -gesture.width;
        const targetBase = targetTab === 'format' ? 0 : -gesture.width;
        track.style.setProperty('--workflow-swipe-x', `${currentBase + gesture.offsetX - targetBase}px`);
        setActiveTab(targetTab);

        requestAnimationFrame(() => {
            track.style.transition = workflowTransition;
            track.style.setProperty('--workflow-swipe-x', '0px');
        });
    }, [workflowTransition]);

    const handleWorkflowPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (isDesktop || event.pointerType === 'mouse' || (event.target as Element).closest('button')) return;
        workflowSwipeRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startedAt: performance.now(),
            width: event.currentTarget.clientWidth,
            axis: 'pending',
            offsetX: 0,
            tab: activeTab,
        };
    }, [activeTab, isDesktop]);

    const handleWorkflowPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = workflowSwipeRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId || gesture.axis === 'y') return;

        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;
        if (gesture.axis === 'pending') {
            if (Math.hypot(deltaX, deltaY) < 8) return;
            gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? 'x' : 'y';
            if (gesture.axis === 'y') return;
            workflowTrackRef.current?.style.setProperty('transition', 'none');
            try {
                event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
                // Synthetic events do not own pointer capture.
            }
        }

        if (event.cancelable) event.preventDefault();
        const outward = (gesture.tab === 'format' && deltaX > 0)
            || (gesture.tab === 'preset' && deltaX < 0);
        const limit = gesture.width * 0.65;
        gesture.offsetX = Math.max(-limit, Math.min(limit, outward ? deltaX * 0.18 : deltaX));
        workflowTrackRef.current?.style.setProperty('--workflow-swipe-x', `${gesture.offsetX}px`);
    }, []);

    const finishWorkflowSwipe = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
        const gesture = workflowSwipeRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        workflowSwipeRef.current = null;

        if (gesture.axis !== 'x') return;
        if (Math.abs(event.clientX - gesture.startX) > 8) {
            suppressWorkflowClickUntilRef.current = performance.now() + 350;
        }

        const deltaX = event.clientX - gesture.startX;
        const velocity = deltaX / Math.max(performance.now() - gesture.startedAt, 1);
        const threshold = Math.min(gesture.width * 0.22, 84);
        const shouldSwitch = !cancelled
            && (Math.abs(gesture.offsetX) >= threshold || Math.abs(velocity) >= 0.45);
        const targetTab = shouldSwitch ? (deltaX < 0 ? 'preset' : 'format') : gesture.tab;

        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // Synthetic events do not own pointer capture.
        }
        settleWorkflowSwipe(gesture, targetTab);
    }, [settleWorkflowSwipe]);

    const renderWorkflowTabs = (mobile: boolean) => {
        const activeIndex = activeTab === 'format' ? 0 : 1;
        return (
            <div
                className="relative inline-grid h-8 shrink-0 grid-cols-2 self-start rounded-full bg-[#f0f1f4] p-0.5 dark:bg-[#2c2c2e]"
                role="tablist"
                aria-label="AI 工作流"
            >
                <span
                    aria-hidden="true"
                    className="absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-[#3a3a3c] dark:shadow-[0_1px_3px_rgba(0,0,0,0.24)]"
                    style={{
                        left: 2,
                        transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 2}px))`,
                    }}
                />
                {workflowTabs.map(tab => (
                    <button
                        key={tab.id}
                        id={`ai-${tab.id}-tab`}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        aria-controls={`ai-${tab.id}-panel`}
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative h-7 whitespace-nowrap rounded-full px-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 ${mobile ? 'text-[13px]' : 'text-[12px]'} ${activeTab === tab.id ? 'text-[#1d1d1f] dark:text-[#f5f5f7]' : 'text-[#717178] hover:text-[#3f4752] dark:text-[#a1a1a6] dark:hover:text-[#d1d1d6]'}`}
                    >
                        <span className="block">{tab.label}</span>
                    </button>
                ))}
            </div>
        );
    };

    const renderPresetPreview = (presetId: AiFormattingPresetId, mobile: boolean) => (
        <span
            aria-hidden="true"
            className={`flex shrink-0 flex-col overflow-hidden rounded-md bg-white shadow-[0_2px_8px_rgba(15,23,42,0.09)] dark:bg-[#171719] dark:shadow-[0_2px_8px_rgba(0,0,0,0.22)] ${mobile ? 'h-[92px] w-[72px] p-2.5' : 'h-[112px] w-[88px] p-3'}`}
        >
            {presetId === 'standard-markdown' ? (
                <>
                    <span className="mx-auto h-1.5 w-2/3 rounded-[2px] bg-[#d95f2a] dark:bg-[#ff8a57]" />
                    <span className="mx-auto mt-1.5 h-0.5 w-5 rounded-full bg-[#f0ad80] dark:bg-[#9d5436]" />
                    <span className="mx-auto mt-2 h-1 w-4/5 rounded-[2px] bg-[#bbb8b4] dark:bg-[#595653]" />
                    <span className="mx-auto mt-1 h-1 w-3/5 rounded-[2px] bg-[#d5d1cd] dark:bg-[#474442]" />
                    <span className="mt-2 flex flex-col items-center gap-1 rounded-[3px] bg-[#fff0e8] p-1.5 dark:bg-[#3a241c]">
                        <span className="h-1 w-full rounded-[2px] bg-[#e78759] dark:bg-[#d26f43]" />
                        <span className="h-1 w-3/4 rounded-[2px] bg-[#efb092] dark:bg-[#9a5032]" />
                    </span>
                    <span className="mx-auto mt-auto h-1 w-1/2 rounded-[2px] bg-[#d95f2a] dark:bg-[#ff8a57]" />
                    <span className="mx-auto mt-1 h-1 w-4/5 rounded-[2px] bg-[#d5d1cd] dark:bg-[#474442]" />
                </>
            ) : (
                <>
                    <span className="h-1.5 w-3/4 rounded-[2px] bg-[#202124] dark:bg-[#f5f5f7]" />
                    <span className="mt-2 h-1 w-full rounded-[2px] bg-[#c5c9d0] dark:bg-[#55555a]" />
                    <span className="mt-1 h-1 w-5/6 rounded-[2px] bg-[#d5d8dd] dark:bg-[#46464b]" />
                    <span className="mt-2 flex flex-col gap-1 rounded-r-[3px] bg-[#eef5fc] p-1.5 shadow-[-2px_0_0_#4a9bdf] dark:bg-[#1f3447] dark:shadow-[-2px_0_0_#5d9ccc]">
                        <span className="h-1 w-full rounded-[2px] bg-[#7ab7eb] dark:bg-[#5d9ccc]" />
                        <span className="h-1 w-2/3 rounded-[2px] bg-[#a9d0f0] dark:bg-[#477ca5]" />
                    </span>
                    <span className="mt-auto grid grid-cols-2 gap-1">
                        <span className="h-3 rounded-[2px] bg-[#d9dde3] dark:bg-[#3c3c41]" />
                        <span className="h-3 rounded-[2px] bg-[#c9ced6] dark:bg-[#4a4a50]" />
                    </span>
                </>
            )}
        </span>
    );

    const renderPresetPane = (mobile: boolean) => (
        <section className={`flex min-h-0 w-full flex-1 flex-col ${mobile ? 'px-3 py-2' : 'px-5 py-3'}`}>
            <div className={mobile ? 'mb-3' : 'mb-4'}>
                <h3 className="text-[14px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">选择排版方案</h3>
                <p className="mt-1 text-[12px] leading-5 text-[#56606f] dark:text-[#b1b1b6]">选择生成内容采用的排版规则</p>
            </div>
            <div className="space-y-2" role="radiogroup" aria-label="排版方案列表">
                {AI_FORMATTING_PRESETS.map(preset => {
                    const selected = formattingPreset === preset.id;
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            data-testid={`ai-formatting-preset-${preset.id}`}
                            onClick={() => setFormattingPreset(preset.id)}
                            className={`group flex w-full items-stretch gap-3 rounded-lg p-2.5 text-left transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.995] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40 ${selected ? 'bg-[#eaf4ff] shadow-[0_1px_3px_rgba(10,132,255,0.1)] dark:bg-[#152b3d] dark:shadow-none' : 'bg-[#f0f1f4] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#e7e9ed] dark:bg-[#262628] dark:[@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#303033]'}`}
                        >
                            {renderPresetPreview(preset.id, mobile)}
                            <span className={`flex min-w-0 flex-1 flex-col ${mobile ? 'py-1' : 'py-1.5'}`}>
                                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className="break-words text-[14px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{preset.label}</span>
                                    {preset.id === DEFAULT_AI_FORMATTING_PRESET && (
                                        <span className="shrink-0 text-[11px] font-medium text-[#0a6fd8] dark:text-[#7dc1ff]">默认</span>
                                    )}
                                </span>
                                <span className="mt-1 block text-[12px] leading-5 text-[#56606f] dark:text-[#b1b1b6]">
                                    {preset.description}
                                </span>
                                <span className="mt-auto block break-words text-[11px] leading-4 text-[#7a8290] dark:text-[#85858b]">
                                    {preset.highlights.join(' · ')}
                                </span>
                            </span>
                            <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${selected ? 'bg-[#0a84ff] text-white' : 'bg-black/[0.06] text-transparent dark:bg-white/[0.1]'}`}>
                                <Check aria-hidden="true" size={14} strokeWidth={2.5} />
                                <span className="sr-only">{selected ? '已选择' : '选择此方案'}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );

    const renderWorkflowContent = () => (
        <div
            data-testid="ai-workflow-content"
            className={`min-h-0 flex-1 overflow-hidden ${isDesktop ? '' : 'touch-pan-y'}`}
            onPointerDown={handleWorkflowPointerDown}
            onPointerMove={handleWorkflowPointerMove}
            onPointerUp={finishWorkflowSwipe}
            onPointerCancel={event => finishWorkflowSwipe(event, true)}
            onClickCapture={event => {
                if (performance.now() < suppressWorkflowClickUntilRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }}
        >
            <div
                ref={workflowTrackRef}
                className="flex h-full min-h-0 w-[200%] will-change-transform"
                style={{
                    transform: `translate3d(calc(${activeTab === 'format' ? 0 : -50}% + var(--workflow-swipe-x, 0px)), 0, 0)`,
                    transition: workflowTransition,
                } as React.CSSProperties}
            >
                <div
                    id="ai-format-panel"
                    role="tabpanel"
                    aria-labelledby="ai-format-tab"
                    aria-hidden={activeTab !== 'format'}
                    ref={element => { element?.toggleAttribute('inert', activeTab !== 'format'); }}
                    className="flex min-h-0 w-1/2 shrink-0 flex-col"
                >
                    {renderInputPane()}
                </div>
                <div
                    id="ai-preset-panel"
                    role="tabpanel"
                    aria-labelledby="ai-preset-tab"
                    aria-hidden={activeTab !== 'preset'}
                    ref={element => { element?.toggleAttribute('inert', activeTab !== 'preset'); }}
                    className="flex min-h-0 w-1/2 shrink-0 flex-col"
                >
                    {renderPresetPane(!isDesktop)}
                </div>
            </div>
        </div>
    );

    const closeSettingsMenu = () => {
        setSettingsOpen(false);
        setSettingsSubmenu(null);
        setSettingsSubmenuOffset(-10);
    };

    const openSettingsSubmenu = (
        key: 'model' | 'speed',
        element: HTMLElement,
        submenuHeight: number
    ) => {
        const rowTop = element.getBoundingClientRect().top;
        const preferredOffset = -10;
        const bottomMargin = 2;
        const topMargin = 8;
        const maxOffset = window.innerHeight - submenuHeight - bottomMargin - rowTop;
        const minOffset = topMargin - rowTop;
        setSettingsSubmenu(key);
        setSettingsSubmenuOffset(Math.max(minOffset, Math.min(preferredOffset, maxOffset)));
    };

    const selectSetting = <T extends { id: string; label: string }>(
        options: T[],
        currentId: T['id'],
        set: (id: T['id']) => void,
        name: string
    ) => (nextId: T['id']) => {
        const item = options.find(option => option.id === nextId);
        if (!item) {
            showNotice('切换失败', `未找到对应的${name}配置`, 'error');
            return;
        }
        if (currentId === item.id) {
            closeSettingsMenu();
            return;
        }
        set(item.id);
        closeSettingsMenu();
        showNotice('已切换', `${name}已切换为 ${item.label}`, 'success');
    };

    const changeReasoningEffort = selectSetting(aiReasoningEfforts, reasoningEffort, setReasoningEffort, '推理等级');
    const changeModel = selectSetting(modelOptions, model, setModel, '模型');
    const changeSpeed = selectSetting(aiMarkdownSpeeds, speed, setSpeed, '速度');

    const renderSettingsControl = ({ mobile = false }: { mobile?: boolean } = {}) => {
        const selectedModel = modelOptions.find(item => item.id === model) ?? modelOptions[0] ?? aiMarkdownModels[0];
        const selectedSpeed = aiMarkdownSpeeds.find(item => item.id === speed) ?? aiMarkdownSpeeds[0];
        const interactiveStateClass = mobile
            ? 'active:bg-black/[0.06] dark:active:bg-white/[0.115]'
            : 'hover:bg-black/[0.06] focus-visible:bg-black/[0.06] dark:hover:bg-white/[0.115] dark:focus-visible:bg-white/[0.115]';
        const menuItemClass = `flex min-h-7 w-full items-center justify-between gap-3 rounded-[7px] px-2 py-1 text-left text-[12px] font-medium text-[#1d1d1f] transition-colors focus-visible:outline-none dark:text-[#f5f5f7] ${interactiveStateClass}`;
        const selectedItemClass = 'bg-black/[0.06] dark:bg-white/[0.115]';
        const submenuBaseClass = `absolute left-full z-[260] ml-1 ${mobile ? 'w-48' : 'w-56'} max-h-[min(360px,calc(100vh-16px))] overflow-y-auto rounded-xl bg-white p-1 shadow-[0_18px_46px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.08] dark:bg-[#2d2d2f]/95 dark:shadow-[0_18px_46px_rgba(0,0,0,0.34)] dark:ring-white/[0.08] dark:backdrop-blur-xl`;
        const desktopSubmenuClass = `invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${submenuBaseClass}`;
        const mobileSubmenuClass = submenuBaseClass;
        const menuWidthClass = mobile ? 'w-44' : 'w-52';
        const modelSubmenuHeight = Math.min(360, 31 + Math.max(modelOptions.length, 1) * 30);

        return (
            <div
                ref={settingsDetailsRef}
                className="relative shrink-0"
                onBlur={(event) => {
                    const nextFocus = event.relatedTarget;
                    if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) closeSettingsMenu();
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        setSettingsOpen(false);
                        event.stopPropagation();
                    }
                }}
            >
                <button
                    type="button"
                    aria-label="选择模型、推理等级和速度"
                    aria-haspopup="menu"
                    aria-expanded={settingsOpen}
                    onClick={() => setSettingsOpen(open => {
                        const next = !open;
                        if (!next) setSettingsSubmenu(null);
                        return next;
                    })}
                    className={`flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md bg-[#eef0f4] px-2.5 text-[12px] font-medium text-[#1d1d1f] shadow-[inset_0_0_0_1px_rgba(29,29,31,0.08)] transition-colors ${mobile ? 'active:bg-[#e4e7ec] dark:active:bg-[#3b3b3e]' : 'hover:bg-[#e4e7ec] dark:hover:bg-[#3b3b3e]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:bg-[#303033] dark:text-[#f5f5f7] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]`}
                >
                    <ModelIcon modelId={selectedModel.id} />
                    <span className="whitespace-nowrap">{selectedModel.label}</span>
                    <ChevronDown size={12} className="text-[#69707d] dark:text-[#b8b8bd]" />
                </button>
                <AnimatePresence initial={false}>
                    {settingsOpen && (
                        <motion.div
                            role="menu"
                            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -7, scale: 0.985 }}
                            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -7, scale: 0.985 }}
                            transition={{ duration: prefersReducedMotion ? 0.1 : 0.16, ease: [0.25, 0.1, 0.25, 1] }}
                            style={{ transformOrigin: 'top left' }}
                            className={`absolute left-0 top-9 z-[250] ${menuWidthClass} rounded-xl bg-white p-1 text-[#1d1d1f] shadow-[0_18px_46px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.08] dark:bg-[#2d2d2f]/95 dark:text-[#f5f5f7] dark:shadow-[0_18px_46px_rgba(0,0,0,0.34)] dark:ring-white/[0.08] dark:backdrop-blur-xl`}
                        >
                            <div className="px-2 pb-1 pt-1 text-[12px] font-semibold text-[#69707d] dark:text-[#a1a1a6]">推理</div>
                            {aiReasoningEfforts.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => changeReasoningEffort(item.id)}
                                    className={`${menuItemClass} ${reasoningEffort === item.id ? selectedItemClass : ''}`}
                                >
                                    <span>{item.label}</span>
                                    {reasoningEffort === item.id && <Check size={13} />}
                                </button>
                            ))}
                            <div className="my-1 h-px bg-black/[0.08] dark:bg-white/[0.09]" />
                            <div className={mobile ? 'relative' : 'group relative'}>
                                <button
                                    type="button"
                                    onMouseEnter={(event) => !mobile && openSettingsSubmenu('model', event.currentTarget, modelSubmenuHeight)}
                                    onFocus={(event) => !mobile && openSettingsSubmenu('model', event.currentTarget, modelSubmenuHeight)}
                                    onClick={(event) => {
                                        if (!mobile) return;
                                        if (settingsSubmenu === 'model') {
                                            setSettingsSubmenu(null);
                                            return;
                                        }
                                        openSettingsSubmenu('model', event.currentTarget, modelSubmenuHeight);
                                    }}
                                    className={`${menuItemClass} ${mobile && settingsSubmenu === 'model' ? selectedItemClass : 'bg-black/[0.04] dark:bg-white/5'}`}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <ModelIcon modelId={selectedModel.id} />
                                        <span className="whitespace-nowrap">{selectedModel.label}</span>
                                    </span>
                                    <ChevronRight size={13} className="text-[#69707d] dark:text-[#a1a1a6]" />
                                </button>
                                <div
                                    className={mobile ? (settingsSubmenu === 'model' ? mobileSubmenuClass : 'hidden') : desktopSubmenuClass}
                                    style={{ top: settingsSubmenuOffset }}
                                >
                                    <div className="px-2 pb-1 pt-1 text-[12px] font-semibold text-[#69707d] dark:text-[#a1a1a6]">模型</div>
                                    {modelOptions.map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => changeModel(item.id)}
                                            className={`${menuItemClass} ${model === item.id ? selectedItemClass : ''}`}
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                <ModelIcon modelId={item.id} />
                                                <span className="whitespace-nowrap">{item.label}</span>
                                            </span>
                                            {model === item.id && <Check size={13} className="shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className={mobile ? 'relative' : 'group relative'}>
                                <button
                                    type="button"
                                    onMouseEnter={(event) => !mobile && openSettingsSubmenu('speed', event.currentTarget, 132)}
                                    onFocus={(event) => !mobile && openSettingsSubmenu('speed', event.currentTarget, 132)}
                                    onClick={(event) => {
                                        if (!mobile) return;
                                        if (settingsSubmenu === 'speed') {
                                            setSettingsSubmenu(null);
                                            return;
                                        }
                                        openSettingsSubmenu('speed', event.currentTarget, 132);
                                    }}
                                    className={`${menuItemClass} ${mobile && settingsSubmenu === 'speed' ? selectedItemClass : ''}`}
                                >
                                    <span>速度</span>
                                    <ChevronRight size={13} className="text-[#69707d] dark:text-[#a1a1a6]" />
                                </button>
                                <div
                                    className={mobile ? (settingsSubmenu === 'speed' ? mobileSubmenuClass : 'hidden') : desktopSubmenuClass}
                                    style={{ top: settingsSubmenuOffset }}
                                >
                                    <div className="px-2 pb-1 pt-1 text-[12px] font-semibold text-[#69707d] dark:text-[#a1a1a6]">速度</div>
                                    {aiMarkdownSpeeds.map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => changeSpeed(item.id)}
                                            className={`${menuItemClass} items-start ${selectedSpeed.id === item.id ? selectedItemClass : ''}`}
                                        >
                                            <span className="flex min-w-0 flex-col">
                                                <span className="flex items-center gap-1">
                                                    {item.id === 'fast' && <Zap size={12} />}
                                                    {item.label}
                                                </span>
                                                <span className="text-[11px] font-normal text-[#69707d] dark:text-[#a1a1a6]">{item.description}</span>
                                            </span>
                                            {selectedSpeed.id === item.id && <Check size={13} className="mt-0.5 shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    const renderActions = ({ compact = false }: { compact?: boolean } = {}) => {
        const gb = compact ? compactGhostButton : ghostButton;
        const pb = compact ? compactPrimaryButton : primaryButton;

        return (
            <>
                <button onClick={onClose} className={gb}>取消</button>
                <button onClick={() => void generate()} disabled={!canGenerate} className={pb}>
                    生成 Markdown
                </button>
            </>
        );
    };

    const renderSourceTools = (mobile: boolean) => {
        const toolIconSize = 12;
        const toolButtonClass = `${sourceToolButton} h-6 w-6 ${mobile
            ? 'active:bg-black/[0.08] dark:active:bg-white/[0.12]'
            : 'hover:bg-black/[0.06] hover:text-[#242a32] dark:hover:bg-white/[0.09] dark:hover:text-white'}`;
        return (
            <div
                role="toolbar"
                aria-label="纯文本工具"
                className="flex shrink-0 items-center gap-px rounded-md bg-[#eef0f4] p-0.5 dark:bg-[#2c2c2e]"
            >
                <button
                    type="button"
                    aria-label="粘贴纯文本"
                    title="粘贴"
                    onClick={() => void pasteSourceText()}
                    className={toolButtonClass}
                >
                    <Clipboard aria-hidden="true" size={toolIconSize} strokeWidth={1.8} />
                </button>
                <button
                    type="button"
                    aria-label={copiedSource ? '已复制纯文本' : '复制纯文本'}
                    title={copiedSource ? '已复制' : '复制'}
                    disabled={copiedSource || !hasSourceText}
                    onClick={() => void copySourceText()}
                    className={toolButtonClass}
                >
                    {copiedSource
                        ? <Check aria-hidden="true" size={toolIconSize} strokeWidth={2} className="text-[#008847] dark:text-[#5de086]" />
                        : <Copy aria-hidden="true" size={toolIconSize} strokeWidth={1.8} />}
                </button>
                <button
                    type="button"
                    aria-label="清除纯文本格式"
                    title="清除格式"
                    disabled={!hasSourceText}
                    onClick={clearSourceFormatting}
                    className={toolButtonClass}
                >
                    <RemoveFormatting aria-hidden="true" size={toolIconSize} strokeWidth={1.8} />
                </button>
                <button
                    type="button"
                    aria-label="清空纯文本"
                    title="清空"
                    disabled={!hasSourceText}
                    onClick={clearSourceText}
                    className={toolButtonClass}
                >
                    <Eraser aria-hidden="true" size={toolIconSize} strokeWidth={1.8} />
                </button>
            </div>
        );
    };

    const renderInputPane = () => (
        <section className="min-h-[260px] flex-1 overflow-hidden" aria-label="纯文本输入区域">
            <textarea
                ref={sourceTextareaRef}
                data-testid="ai-source-text"
                aria-label="纯文本内容"
                defaultValue={sourceTextRef.current}
                onInput={(event) => syncSourceText(event.currentTarget.value)}
                placeholder="粘贴或输入需要排版的正文…"
                autoComplete="off"
                className={`${sourceInputClass} pt-3`}
            />
        </section>
    );

    return createPortal(
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                    <motion.div
                        data-testid="ai-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: isFullscreen ? 0 : 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0.1 : 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                        onClick={() => !isFullscreen && onClose()}
                        className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-sm dark:bg-black/50"
                        style={{ pointerEvents: isFullscreen ? 'none' : 'auto' }}
                    />

                    {isDesktop ? (
                        <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
                            <motion.div
                                data-testid="ai-desktop-modal"
                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                                transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                                className="h-[min(96vh,860px)] w-[900px] grid max-w-[calc(100vw-32px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg bg-[#fbfcfe] shadow-[0_28px_80px_rgba(15,23,42,0.22)] dark:bg-[#1c1c1e]"
                            >
                                <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        {renderWorkflowTabs(false)}
                                        {renderSettingsControl()}
                                    </div>
                                    <button onClick={onClose} className="rounded-md p-1.5 text-[#69707d] hover:bg-black/[0.05] dark:text-[#a1a1a6] dark:hover:bg-white/[0.08]">
                                        <X size={18} />
                                    </button>
                                </header>
                                <main className="flex min-h-0 flex-col overflow-hidden">
                                    {renderWorkflowContent()}
                                </main>
                                <footer data-testid="ai-desktop-footer" className="flex items-center justify-between gap-2 px-5 pb-5 pt-1">
                                    {activeTab === 'format' && renderSourceTools(false)}
                                    <div className="ml-auto flex items-center gap-2">{renderActions()}</div>
                                </footer>
                            </motion.div>
                        </div>
                    ) : (
                        <motion.div
                            data-testid="ai-mobile-sheet"
                            initial={{ opacity: 0, y: '100%' }}
                            animate={{
                                opacity: 1,
                                y: 0,
                                bottom: keyboardHeight,
                                height: keyboardActive ? `calc(100vh - ${keyboardHeight}px)` : (isFullscreen ? '100vh' : `${sheetHeight}vh`),
                                borderTopLeftRadius: isFullscreen ? 0 : 14,
                                borderTopRightRadius: isFullscreen ? 0 : 14,
                            }}
                            exit={{ opacity: 0, y: '100%' }}
                            transition={isDragging || keyboardActive
                                ? { duration: 0 }
                                : isFullscreen
                                    ? {
                                        duration: prefersReducedMotion ? 0.1 : 0.4,
                                        ease: [0.32, 0.72, 0, 1],
                                        height: { duration: prefersReducedMotion ? 0.1 : 0.4, ease: [0.32, 0.72, 0, 1] },
                                        borderTopLeftRadius: { duration: prefersReducedMotion ? 0.1 : 0.3, ease: 'easeOut' },
                                        borderTopRightRadius: { duration: prefersReducedMotion ? 0.1 : 0.3, ease: 'easeOut' },
                                    }
                                    : { duration: prefersReducedMotion ? 0.05 : 0.12, ease: [0.25, 0.1, 0.25, 1] }
                            }
                            className="fixed inset-x-0 z-[201] grid overflow-hidden bg-[#fbfcfe] shadow-[0_-22px_64px_rgba(15,23,42,0.2)] dark:bg-[#1c1c1e] will-change-transform"
                            style={{
                                gridTemplateRows: 'auto minmax(0, 1fr) auto',
                                '--sh': keyboardActive ? `calc(100vh - ${keyboardHeight}px)` : (isFullscreen ? '100vh' : `${sheetHeight}vh`),
                            } as React.CSSProperties}
                        >
                            <header className={`px-4 pb-2 ${isFullscreen ? 'pt-[max(env(safe-area-inset-top),16px)]' : 'pt-2'}`}>
                                {!isFullscreen && (
                                    <div className="flex touch-none justify-center pb-2" onPointerDown={handleSheetPointerDown}>
                                        <span className="h-1.5 w-12 cursor-row-resize rounded bg-[#b7bcc5] dark:bg-[#5a5a5f]" />
                                    </div>
                                )}
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                        {renderSettingsControl({ mobile: true })}
                                        {renderWorkflowTabs(true)}
                                    </div>
                                    <button onClick={onClose} className="rounded-md p-1.5 text-[#69707d] active:bg-black/[0.06] dark:text-[#a1a1a6] dark:active:bg-white/[0.08]">
                                        <X size={20} />
                                    </button>
                                </div>
                            </header>
                            <main
                                className="flex min-h-0 flex-col overflow-y-auto overscroll-contain"
                                onFocus={(e) => {
                                    const target = e.target;
                                    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
                                        window.setTimeout(() => {
                                            target.scrollIntoView({ block: 'center', behavior: 'instant' });
                                        }, 360);
                                    }
                                }}
                            >
                                {renderWorkflowContent()}
                            </main>
                            <footer data-testid="ai-mobile-footer" className={`flex items-center justify-between gap-[clamp(2px,calc(var(--sh)*0.006),6px)] bg-[#fbfcfe]/96 px-[clamp(8px,calc(var(--sh)*0.012),12px)] py-[clamp(2px,calc(var(--sh)*0.006),6px)] shadow-[0_-14px_26px_rgba(15,23,42,0.06)] backdrop-blur dark:bg-[#1c1c1e]/95 dark:shadow-[0_-14px_26px_rgba(0,0,0,0.18)] ${isFullscreen ? 'pb-[max(env(safe-area-inset-bottom),3px)]' : ''}`}>
                                {activeTab === 'format' && renderSourceTools(true)}
                                <div className="ml-auto flex items-center gap-[clamp(2px,calc(var(--sh)*0.006),6px)]">{renderActions({ compact: true })}</div>
                            </footer>
                        </motion.div>
                    )}
                    </>
                )}
            </AnimatePresence>
        </>,
        document.body
    );
}
