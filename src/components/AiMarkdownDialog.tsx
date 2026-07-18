import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { md } from '../lib/markdown';
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
    DEFAULT_AI_FORMATTING_PRESET,
} from '../lib/aiFormattingPresets';
import { readClipboardText } from '../lib/clipboard';
import { removeMarkdownFormatting } from '../lib/markdownUtils';
import { ModelIcon } from '../lib/modelIcons';
import { mapRenderedPointToSource } from '../lib/promptCaret';
import { ZHOUZUOLUO_PROMPT } from '../lib/prompts/zhouZuoluo';

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

const fieldClass = 'w-full resize-none rounded-md bg-white px-3 py-2.5 text-[13px] leading-6 text-[#1d1d1f] shadow-[inset_0_0_0_1px_rgba(29,29,31,0.1)] outline-none transition placeholder-[#9a9aa0] focus:shadow-[inset_0_0_0_1px_#0a84ff,0_0_0_3px_rgba(10,132,255,0.14)] dark:bg-[#171719] dark:text-[#f5f5f7] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] disabled:opacity-70';
const ghostButton = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#eef0f4] px-3 text-[12px] font-medium text-[#4b5563] transition-colors hover:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:hover:bg-[#3a3a3c]';
const desktopFieldButton = 'inline-flex h-7 items-center justify-center gap-1 rounded-md bg-[#eef0f4] px-2 text-[11px] font-medium text-[#4b5563] transition-colors hover:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:hover:bg-[#3a3a3c]';
const compactGhostButton = 'inline-flex h-[clamp(20px,calc(var(--sh)*0.03),28px)] items-center justify-center gap-1 rounded-md bg-[#eef0f4] px-[clamp(6px,calc(var(--sh)*0.012),12px)] py-0 text-[clamp(10px,calc(var(--sh)*0.012),12px)] font-medium text-[#4b5563] transition-colors active:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:active:bg-[#3a3a3c]';
const compactFieldButton = 'inline-flex h-7 items-center justify-center gap-1 rounded-md bg-[#eef0f4] px-2 text-[11px] font-medium text-[#4b5563] transition-colors active:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:active:bg-[#3a3a3c]';
const primaryButton = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#1d1d1f] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2f3137] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-[#f5f5f7] dark:text-black';
const compactPrimaryButton = 'inline-flex h-[clamp(20px,calc(var(--sh)*0.03),28px)] items-center justify-center gap-1 rounded-md bg-[#1d1d1f] px-[clamp(6px,calc(var(--sh)*0.014),14px)] py-0 text-[clamp(10px,calc(var(--sh)*0.012),12px)] font-semibold text-white transition-colors active:bg-[#2f3137] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-[#f5f5f7] dark:text-black';
const labelClass = 'text-[12px] font-semibold text-[#4f5866] dark:text-[#c7c7cc]';
const iconButton = 'inline-flex h-5 w-5 items-center justify-center rounded-[4px] bg-transparent text-[#86868b] transition-colors hover:bg-black/[0.06] hover:text-[#4b5563] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/30 disabled:cursor-not-allowed disabled:opacity-30 dark:text-[#8e8e93] dark:hover:bg-white/[0.07] dark:hover:text-[#c7c7cc]';
const promptSurfaceClass = 'rounded-md bg-white px-3 py-2.5 text-[13px] leading-6 text-[#1d1d1f] shadow-[inset_0_0_0_1px_rgba(29,29,31,0.1)] outline-none [scrollbar-gutter:stable] dark:bg-[#171719] dark:text-[#f5f5f7] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]';
const promptFieldClass = `w-full resize-none placeholder-[#9a9aa0] focus-visible:shadow-[inset_0_0_0_1px_#0a84ff] disabled:opacity-70 ${promptSurfaceClass}`;
const promptOverlayClass = `absolute inset-0 overflow-auto ${promptSurfaceClass} [&_*]:text-[inherit] [&_*]:leading-[inherit] [&_h1]:my-0 [&_h1]:text-[15px] [&_h1]:font-bold [&_h2]:my-0 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h3]:my-0 [&_h3]:font-semibold [&_p]:my-0 [&_ul]:my-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-0 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0 [&_blockquote]:my-0 [&_blockquote]:border-l-2 [&_blockquote]:border-[#d0d7de] [&_blockquote]:pl-2 [&_pre]:my-0 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-[#f5f5f7] [&_pre]:p-2 dark:[&_pre]:bg-[#262628] [&_code]:font-inherit`;

export default function AiMarkdownDialog(props: AiMarkdownDialogProps) {
    const { isOpen, isDesktop, onClose, onApply, onStreamOutput, onThinkingDelta, onGenerationPhaseChange, showNotice } = props;
    const [model, setModel] = useState<AiMarkdownModel>(DEFAULT_AI_MARKDOWN_MODEL);
    const [reasoningEffort, setReasoningEffort] = useState<AiReasoningEffort>(DEFAULT_AI_REASONING_EFFORT);
    const [speed, setSpeed] = useState<AiMarkdownSpeed>(DEFAULT_AI_MARKDOWN_SPEED);
    const [hasSourceText, setHasSourceText] = useState(false);
    const [extraInstruction, setExtraInstruction] = useState('');
    const [copiedSource, setCopiedSource] = useState(false);
    const [copiedExtra, setCopiedExtra] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsSubmenu, setSettingsSubmenu] = useState<null | 'model' | 'speed'>(null);
    const [settingsSubmenuOffset, setSettingsSubmenuOffset] = useState(-10);
    const modelOptions: AiMarkdownModelOption[] = aiMarkdownModels;
    const [sheetHeight, setSheetHeight] = useState(88);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isPromptRendered, setIsPromptRendered] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    const abortRef = useRef<AbortController | null>(null);
    const isStreamingRef = useRef(false);
    const settingsDetailsRef = useRef<HTMLDivElement>(null);
    const sourceTextRef = useRef('');
    const sourceLengthRef = useRef<HTMLSpanElement>(null);
    const hasSourceTextRef = useRef(false);
    const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
    const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
    const promptOverlayRef = useRef<HTMLDivElement>(null);
    const promptScrollTopRef = useRef(0);

    const canGenerate = hasSourceText;
    const prefersReducedMotion = useReducedMotion();
    const keyboardActive = keyboardHeight > 0;

    useEffect(() => {
        if (!isOpen) {
            if (!isStreamingRef.current) abortRef.current?.abort();
            setSettingsOpen(false);
            setSettingsSubmenu(null);
            setSettingsSubmenuOffset(-10);
            setIsFullscreen(false);
            setSheetHeight(88);
            setIsPromptRendered(false);
            setKeyboardHeight(0);
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
        if (sourceLengthRef.current) sourceLengthRef.current.textContent = `${text.length} 字`;

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

    const pasteExtraInstruction = useCallback(async () => {
        const text = await readClipboardText();
        if (!text) {
            showNotice('粘贴失败', '未获得剪贴板权限或剪贴板为空', 'error');
            return;
        }
        setExtraInstruction(current => current ? `${current}\n${text}` : text);
        showNotice('已粘贴', '剪贴板内容已粘贴到补充要求', 'success');
    }, [showNotice]);

    const syncPromptScroll = useCallback((scrollTop: number) => {
        promptScrollTopRef.current = scrollTop;
        if (promptOverlayRef.current) promptOverlayRef.current.scrollTop = scrollTop;
    }, []);

    const clearExtraInstruction = useCallback(() => {
        setExtraInstruction('');
        setIsPromptRendered(false);
        syncPromptScroll(0);
        showNotice('已清除', '补充要求已清空', 'success');
    }, [showNotice, syncPromptScroll]);

    const applyExtraInstructionExample = useCallback(() => {
        setExtraInstruction(ZHOUZUOLUO_PROMPT);
        setIsPromptRendered(true);
        syncPromptScroll(0);
    }, [syncPromptScroll]);

    const clearExtraFormatting = useCallback(() => {
        setExtraInstruction(current => removeMarkdownFormatting(current));
        showNotice('已清除格式', '已移除所有格式标记，仅保留纯文本', 'success');
    }, [showNotice]);

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

    const copyExtraInstruction = useCallback(async () => {
        if (copiedExtra || !extraInstruction) return;
        try {
            await navigator.clipboard.writeText(extraInstruction);
            setCopiedExtra(true);
            window.setTimeout(() => {
                setCopiedExtra(false);
            }, 2000);
        } catch {
            showNotice('复制失败', '无法写入剪贴板', 'error');
        }
    }, [copiedExtra, extraInstruction, showNotice]);

    useEffect(() => {
        if (isPromptRendered && promptOverlayRef.current) {
            promptOverlayRef.current.scrollTop = promptScrollTopRef.current;
        } else if (promptTextareaRef.current) {
            promptTextareaRef.current.scrollTop = promptScrollTopRef.current;
        }
    }, [isPromptRendered]);

    const generate = useCallback(async () => {
        const text = sourceTextareaRef.current?.value ?? sourceTextRef.current;
        const instruction = extraInstruction;

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
                { presetId: DEFAULT_AI_FORMATTING_PRESET, model, reasoningEffort, speed, sourceText: text, extraInstruction: instruction },
                {
                    signal: controller.signal,
                    onThinkingDelta: (delta) => {
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
            setPhase('idle');
            if (err instanceof DOMException && err.name === 'AbortError') return;
            showNotice('生成失败', err instanceof Error ? err.message : 'AI 生成失败，请稍后重试', 'error');
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                isStreamingRef.current = false;
            }
        }
    }, [extraInstruction, model, onApply, onClose, onStreamOutput, onThinkingDelta, onGenerationPhaseChange, reasoningEffort, showNotice, speed]);

    const renderFormattingPresetControl = (mobile = false) => (
        <div
            className="inline-flex h-7 items-center rounded-full bg-[#f0f1f4] p-0.5 dark:bg-[#2c2c2e]"
            role="radiogroup"
            aria-label="输出格式"
        >
            <label
                data-testid="ai-formatting-preset-rmarkdown"
                className={`inline-flex h-6 cursor-not-allowed items-center whitespace-nowrap rounded-full bg-white px-2 font-semibold text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-[#3a3a3c] dark:text-[#f5f5f7] ${mobile ? 'text-[12px]' : 'text-[11px]'}`}
            >
                <input
                    type="radio"
                    name="ai-formatting-preset"
                    checked
                    disabled
                    readOnly
                    className="sr-only"
                />
                R-Markdown
            </label>
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

    const handlePromptOverlayPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();

        const offset = mapRenderedPointToSource(event.currentTarget, extraInstruction, event.clientX, event.clientY);
        const scrollTop = event.currentTarget.scrollTop;
        promptScrollTopRef.current = scrollTop;
        setIsPromptRendered(false);

        requestAnimationFrame(() => {
            const textarea = promptTextareaRef.current;
            if (!textarea) return;
            const nextOffset = Math.min(offset, textarea.value.length);
            textarea.focus({ preventScroll: true });
            textarea.setSelectionRange(nextOffset, nextOffset);
            textarea.scrollTop = scrollTop;
        });
    }, [extraInstruction]);

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

    const renderPromptField = (mobile: boolean) => (
        <div className={mobile ? 'relative flex min-h-0 flex-1 flex-col' : 'relative min-h-0 flex-1'}>
            <textarea
                ref={promptTextareaRef}
                data-testid="ai-extra-instruction"
                aria-label="补充要求"
                value={extraInstruction}
                onChange={(event) => setExtraInstruction(event.target.value)}
                onScroll={(event) => syncPromptScroll(event.currentTarget.scrollTop)}
                onFocus={() => setIsPromptRendered(false)}
                onBlur={(event) => {
                    syncPromptScroll(event.currentTarget.scrollTop);
                    if (extraInstruction.trim()) setIsPromptRendered(true);
                }}
                className={`${promptFieldClass} ${mobile ? 'h-full min-h-[104px] flex-1' : 'h-full min-h-[160px] flex-1'} ${isPromptRendered && extraInstruction ? 'text-transparent caret-transparent' : ''}`}
                placeholder=""
            />
            {isPromptRendered && extraInstruction && (
                <div
                    ref={promptOverlayRef}
                    aria-hidden="true"
                    onPointerDown={handlePromptOverlayPointerDown}
                    onScroll={(event) => { promptScrollTopRef.current = event.currentTarget.scrollTop; }}
                    className={promptOverlayClass}
                    dangerouslySetInnerHTML={{ __html: md.render(extraInstruction) }}
                />
            )}
            {!extraInstruction && (
                <div className="pointer-events-none absolute left-3 top-2.5 flex flex-wrap items-center gap-1 text-[13px] text-[#9a9aa0]">
                    <span>例如：重点突出实操步骤，整体表达简洁</span>
                    <button
                        type="button"
                        onClick={applyExtraInstructionExample}
                        className="pointer-events-auto rounded px-1 text-[12px] font-medium text-[#0a84ff] transition-colors hover:bg-[#0a84ff]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:text-[#64aaff]"
                    >
                        示例
                    </button>
                </div>
            )}
        </div>
    );

    const renderInputPane = (mobile: boolean) => {
        const fb = mobile ? compactFieldButton : desktopFieldButton;
        const btnGap = mobile ? 'gap-1' : 'gap-1.5';
        const headerCls = `mb-2 flex ${mobile ? 'shrink-0 ' : ''}items-center justify-between gap-2`;
        return (
            <section
                className={`flex min-h-0 ${mobile ? 'flex-1 ' : ''}flex-col gap-3`}
                style={mobile ? { minHeight: '260px' } : undefined}
            >
                <div className={`flex min-h-0 ${mobile ? 'flex-[2]' : 'flex-[1.6]'} flex-col`}>
                    <div className={headerCls}>
                        <span className="flex items-center gap-1">
                            <span className={labelClass}>纯文本内容</span>
                            <button
                                type="button"
                                aria-label="复制纯文本内容"
                                disabled={copiedSource || !hasSourceText}
                                onClick={() => void copySourceText()}
                                className={iconButton}
                            >
                                {copiedSource ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                            </button>
                            <span ref={sourceLengthRef} className="text-[11px] text-[#86868b] dark:text-[#8e8e93]">{sourceTextRef.current.length} 字</span>
                        </span>
                        {hasSourceText && (
                            <span className={`flex items-center ${btnGap}`}>
                                <button type="button" onClick={() => void pasteSourceText()} className={fb}>
                                    <Clipboard size={11} />
                                    粘贴
                                </button>
                                <button type="button" onClick={clearSourceFormatting} className={fb}>
                                    <RemoveFormatting size={11} />
                                    清除格式
                                </button>
                                <button type="button" onClick={clearSourceText} className={fb}>
                                    <Eraser size={11} />
                                    清除
                                </button>
                            </span>
                        )}
                    </div>
                    <div className="relative flex min-h-0 flex-1">
                        <textarea
                            ref={sourceTextareaRef}
                            data-testid="ai-source-text"
                            aria-label="纯文本内容"
                            defaultValue={sourceTextRef.current}
                            onInput={(e) => syncSourceText(e.currentTarget.value)}
                            className={`${fieldClass} h-full ${mobile ? 'min-h-[120px]' : 'min-h-[360px]'} flex-1`}
                        />
                        {!hasSourceText && (
                            <button
                                type="button"
                                onClick={() => void pasteSourceText()}
                                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-black/[0.08] bg-[#f5f5f7]/60 px-5 py-4 text-[#86868b] shadow-sm backdrop-blur-sm transition-colors hover:border-[#0a84ff]/30 hover:text-[#0a84ff] active:scale-95 dark:border-white/[0.1] dark:bg-[#2c2c2e]/60 dark:hover:border-[#64aaff]/30 dark:hover:text-[#64aaff]"
                                aria-label="粘贴纯文本内容"
                                title="粘贴纯文本内容"
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0f4]/90 dark:bg-[#3a3a3c]/90">
                                    <Clipboard size={15} />
                                </span>
                                <span className="text-[12px] font-medium">粘贴内容</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className={`flex min-h-0 ${mobile ? 'flex-1' : 'flex-[1.1]'} flex-col`}>
                    <div className={headerCls}>
                        <span className="flex items-center gap-1">
                            <span className={labelClass}>补充要求</span>
                            <button
                                type="button"
                                aria-label="复制补充要求"
                                disabled={copiedExtra || !extraInstruction}
                                onClick={() => void copyExtraInstruction()}
                                className={iconButton}
                            >
                                {copiedExtra ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                            </button>
                            <span className="text-[11px] text-[#86868b] dark:text-[#8e8e93]">{extraInstruction.length} 字</span>
                        </span>
                        <span className={`flex items-center ${btnGap}`}>
                            <button type="button" onClick={() => void pasteExtraInstruction()} className={fb}>
                                <Clipboard size={11} />
                                粘贴
                            </button>
                            {extraInstruction && (
                                <>
                                    <button type="button" onClick={clearExtraFormatting} className={fb}>
                                        <RemoveFormatting size={11} />
                                        清除格式
                                    </button>
                                    <button type="button" onClick={clearExtraInstruction} className={fb}>
                                        <Eraser size={11} />
                                        清除
                                    </button>
                                </>
                            )}
                        </span>
                    </div>
                    {renderPromptField(mobile)}
                </div>
            </section>
        );
    };

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
                                        {renderFormattingPresetControl()}
                                        {renderSettingsControl()}
                                    </div>
                                    <button onClick={onClose} className="rounded-md p-1.5 text-[#69707d] hover:bg-black/[0.05] dark:text-[#a1a1a6] dark:hover:bg-white/[0.08]">
                                        <X size={18} />
                                    </button>
                                </header>
                                <main className="grid min-h-0 grid-cols-1 overflow-hidden px-7 py-4">
                                    {renderInputPane(false)}
                                </main>
                                <footer className="flex justify-end gap-2 px-5 pb-5 pt-1">
                                    {renderActions()}
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
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 items-center gap-2">
                                            {renderSettingsControl({ mobile: true })}
                                            {renderFormattingPresetControl(true)}
                                        </div>
                                    </div>
                                    <button onClick={onClose} className="rounded-md p-1.5 text-[#69707d] active:bg-black/[0.06] dark:text-[#a1a1a6] dark:active:bg-white/[0.08]">
                                        <X size={20} />
                                    </button>
                                </div>
                            </header>
                            <main
                                className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3"
                                onFocus={(e) => {
                                    const target = e.target;
                                    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
                                        window.setTimeout(() => {
                                            target.scrollIntoView({ block: 'center', behavior: 'instant' });
                                        }, 360);
                                    }
                                }}
                            >
                                {renderInputPane(true)}
                            </main>
                            <footer className={`flex items-center justify-end gap-[clamp(2px,calc(var(--sh)*0.006),6px)] bg-[#fbfcfe]/96 px-[clamp(8px,calc(var(--sh)*0.012),12px)] py-[clamp(2px,calc(var(--sh)*0.006),6px)] shadow-[0_-14px_26px_rgba(15,23,42,0.06)] backdrop-blur dark:bg-[#1c1c1e]/95 dark:shadow-[0_-14px_26px_rgba(0,0,0,0.18)] ${isFullscreen ? 'pb-[max(env(safe-area-inset-bottom),3px)]' : ''}`}>
                                {renderActions({ compact: true })}
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
