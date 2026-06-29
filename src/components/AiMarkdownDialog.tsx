import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clipboard, Copy, Eraser, Loader2, RefreshCcw, RemoveFormatting, Sparkles, Wand2, X } from 'lucide-react';
import {
    cleanAiMarkdown,
    streamAiMarkdown,
    type AiApplyMode,
    type AiMarkdownMode,
    type AiMarkdownTask,
} from '../lib/aiMarkdown';

interface AiMarkdownDialogProps {
    isOpen: boolean;
    isDesktop: boolean;
    currentMarkdown: string;
    onClose: () => void;
    onApply: (markdown: string, mode: AiApplyMode) => void;
    onStreamReplace: (request: { mode: AiMarkdownMode; task: 'generate'; sourceText: string; extraInstruction: string }) => void;
    showNotice: (title: string, description: string, tone: 'success' | 'download' | 'error') => void;
}

const modes: Array<{ id: AiMarkdownMode; label: string }> = [
    { id: 'format', label: '排版模式' },
    { id: 'rewrite', label: '改写模式' },
];

const applyModes: Array<{ id: AiApplyMode; label: string }> = [
    { id: 'replace', label: '替换' },
    { id: 'insert', label: '插入到光标处' },
    { id: 'append', label: '追加到末尾' },
];

const modeTips: Record<AiMarkdownMode, { title: string; body: string }> = {
    format: {
        title: '排版模式',
        body: '完全保留原文内容，只整理层级、标题、列表、引用和重点，让纯文本变成规范 Markdown。',
    },
    rewrite: {
        title: '改写模式',
        body: '在不编造事实的前提下优化表达、语气和组织方式，更适合发布或继续编辑。',
    },
};

const MODE_TIP_DURATION = 3200;

const fieldClass = 'w-full resize-none rounded-md bg-white px-3 py-2.5 text-[13px] leading-6 text-[#1d1d1f] shadow-[inset_0_0_0_1px_rgba(29,29,31,0.1)] outline-none transition placeholder-[#9a9aa0] focus:shadow-[inset_0_0_0_1px_#0a84ff,0_0_0_3px_rgba(10,132,255,0.14)] dark:bg-[#171719] dark:text-[#f5f5f7] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] disabled:opacity-70';
const ghostButton = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#eef0f4] px-3 text-[12px] font-medium text-[#4b5563] transition-colors hover:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:hover:bg-[#3a3a3c]';
const compactFieldButton = 'inline-flex h-7 items-center justify-center gap-1 rounded-md bg-[#eef0f4] px-2 text-[11px] font-medium text-[#4b5563] transition-colors active:bg-[#e4e7ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] dark:active:bg-[#3a3a3c]';
const primaryButton = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#1d1d1f] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2f3137] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-[#f5f5f7] dark:text-black';
const labelClass = 'text-[12px] font-semibold text-[#4f5866] dark:text-[#c7c7cc]';
const iconButton = 'inline-flex h-5 w-5 items-center justify-center rounded-[4px] bg-transparent text-[#86868b] transition-colors hover:bg-black/[0.06] hover:text-[#4b5563] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/30 disabled:cursor-not-allowed disabled:opacity-30 dark:text-[#8e8e93] dark:hover:bg-white/[0.07] dark:hover:text-[#c7c7cc]';

// 通过临时 offscreen 元素执行 execCommand('paste')，不污染目标输入框
function readClipboardViaTempElement(tag: 'textarea' | 'div'): string | null {
    const el = document.createElement(tag);
    if (tag === 'div') (el as HTMLDivElement).contentEditable = 'true';
    Object.assign(el.style, {
        position: 'fixed', left: '0', top: '0', opacity: '0',
        pointerEvents: 'none', zIndex: '-1',
    });
    el.setAttribute('tabindex', '-1');
    document.body.appendChild(el);
    el.focus();

    let text: string | null = null;
    try {
        if (document.execCommand('paste')) {
            text = tag === 'textarea'
                ? (el as HTMLTextAreaElement).value
                : (el as HTMLDivElement).innerText;
        }
    } finally {
        document.body.removeChild(el);
    }
    return text || null;
}

function decodeHtmlEntities(text: string) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function removeMarkdownFormatting(markdown: string) {
    let text = markdown.replace(/\r\n?/g, '\n');

    text = text.replace(/```[^\n]*\n([\s\S]*?)\n?```/g, '$1');
    text = text.replace(/~~~[^\n]*\n([\s\S]*?)\n?~~~/g, '$1');
    text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
    text = text.replace(/^\s{0,3}>\s?/gm, '');
    text = text.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '');
    text = text.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    text = text.replace(/^\s*\|?[\s:-]{3,}\|[\s|:-]*$/gm, '');
    text = text.replace(/^\s*\|(.+)\|\s*$/gm, (_, cells: string) => cells.split('|').map(cell => cell.trim()).filter(Boolean).join('  '));
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
    text = text.replace(/^\s{0,3}\[[^\]]+\]:\s+\S+.*$/gm, '');
    text = text.replace(/`{1,2}([^`]+)`{1,2}/g, '$1');
    text = text.replace(/~~([^~]+)~~/g, '$1');

    for (let i = 0; i < 2; i += 1) {
        text = text
            .replace(/(\*\*\*|___)(.*?)\1/g, '$2')
            .replace(/(\*\*|__)(.*?)\1/g, '$2')
            .replace(/(^|[^\w])([*_])([^*_]+)\2(?=[^\w]|$)/g, '$1$3');
    }

    text = text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(?:p|div|h[1-6]|li|blockquote)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '');

    return decodeHtmlEntities(text)
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export default function AiMarkdownDialog(props: AiMarkdownDialogProps) {
    const { isOpen, isDesktop, currentMarkdown, onClose, onApply, onStreamReplace, showNotice } = props;
    const [mode, setMode] = useState<AiMarkdownMode>('format');
    const [hasSourceText, setHasSourceText] = useState(false);
    const [extraInstruction, setExtraInstruction] = useState('');
    const [followup, setFollowup] = useState('');
    const [result, setResult] = useState('');
    const [applyMode, setApplyMode] = useState<AiApplyMode>('replace');
    const [phase, setPhase] = useState<'idle' | 'generating' | 'done'>('idle');
    const [status, setStatus] = useState('');
    const [interrupted, setInterrupted] = useState(false);
    const [confirmingReplace, setConfirmingReplace] = useState(false);
    const [modeTip, setModeTip] = useState<{ mode: AiMarkdownMode; id: number } | null>(null);
    const [isModeTipPaused, setIsModeTipPaused] = useState(false);
    const [copiedFields, setCopiedFields] = useState({ source: false, extra: false, followup: false });
    const [sheetHeight, setSheetHeight] = useState(88);
    const [modeDrag, setModeDrag] = useState(0);
    const [isModeDragging, setIsModeDragging] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const streamedRef = useRef('');
    const sourceTextRef = useRef('');
    const hasSourceTextRef = useRef(false);
    const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
    const sourceLengthRef = useRef<HTMLSpanElement>(null);
    const modeTipTimerRef = useRef<number | null>(null);
    const modeTipStartedAtRef = useRef(0);
    const modeTipRemainingRef = useRef(MODE_TIP_DURATION);
    const modeSwipeRef = useRef<{ startX: number; startY: number; locked: false | 'h' | 'v' }>({ startX: 0, startY: 0, locked: false });

    const isGenerating = phase === 'generating';
    const canGenerate = hasSourceText && !isGenerating;
    const showOutput = phase !== 'idle' || Boolean(result);

    useEffect(() => {
        if (!isOpen) {
            abortRef.current?.abort();
            setConfirmingReplace(false);
            setModeTip(null);
            if (modeTipTimerRef.current) window.clearTimeout(modeTipTimerRef.current);
            setIsModeTipPaused(false);
        }
    }, [isOpen]);

    useEffect(() => () => {
        if (modeTipTimerRef.current) window.clearTimeout(modeTipTimerRef.current);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isDesktop && !isGenerating) onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, isDesktop, isGenerating, onClose]);

    const stopGenerating = useCallback(() => {
        const partial = streamedRef.current || result;
        abortRef.current?.abort();
        abortRef.current = null;
        if (partial.trim()) {
            setResult(partial);
            setInterrupted(true);
            setStatus(`已打断输出，保留 ${partial.length} 字`);
            setPhase('done');
        } else {
            setStatus('已打断输出');
            setPhase('idle');
        }
    }, [result]);

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
        let text: string | null = null;

        // 1. Clipboard API — 用户点击触发时会弹出浏览器权限授权
        if (navigator.clipboard) {
            try { text = await navigator.clipboard.readText(); } catch { /* 降级 */ }
            if (!text) {
                try {
                    const items = await navigator.clipboard.read();
                    for (const item of items) {
                        if (item.types.includes('text/plain')) {
                            text = await (await item.getType('text/plain')).text();
                            break;
                        }
                    }
                } catch { /* 降级 */ }
            }
        }

        // 2. 临时 offscreen textarea execCommand 降级，不污染目标输入框
        if (!text) text = readClipboardViaTempElement('textarea');

        // 3. 临时 offscreen contenteditable execCommand 降级
        if (!text) text = readClipboardViaTempElement('div');

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
        showNotice('已清除格式', '已移除 Markdown 标记，仅保留纯文本', 'success');
    }, [showNotice, syncSourceText]);

    const handleSheetPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const startY = event.clientY;
        const startHeight = sheetHeight;

        const onMove = (moveEvent: PointerEvent) => {
            const next = startHeight + ((startY - moveEvent.clientY) / window.innerHeight) * 100;
            setSheetHeight(Math.max(50, Math.min(94, next)));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [sheetHeight]);

    const startModeTipTimer = useCallback((id: number, delay: number) => {
        if (modeTipTimerRef.current) window.clearTimeout(modeTipTimerRef.current);
        modeTipStartedAtRef.current = Date.now();
        modeTipRemainingRef.current = delay;
        modeTipTimerRef.current = window.setTimeout(() => {
            setModeTip(current => current?.id === id ? null : current);
            setIsModeTipPaused(false);
        }, delay);
    }, []);

    const showModeTip = useCallback((nextMode: AiMarkdownMode) => {
        const id = Date.now();
        setIsModeTipPaused(false);
        setModeTip({ mode: nextMode, id });
        startModeTipTimer(id, MODE_TIP_DURATION);
    }, [startModeTipTimer]);

    const copyField = useCallback(async (key: 'source' | 'extra' | 'followup', text: string) => {
        if (copiedFields[key] || !text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedFields(prev => ({ ...prev, [key]: true }));
            window.setTimeout(() => {
                setCopiedFields(prev => ({ ...prev, [key]: false }));
            }, 2000);
        } catch {
            showNotice('复制失败', '无法写入剪贴板', 'error');
        }
    }, [copiedFields, showNotice]);

    const pauseModeTip = useCallback(() => {
        if (!modeTip || isModeTipPaused) return;
        if (modeTipTimerRef.current) window.clearTimeout(modeTipTimerRef.current);
        modeTipTimerRef.current = null;
        modeTipRemainingRef.current = Math.max(300, modeTipRemainingRef.current - (Date.now() - modeTipStartedAtRef.current));
        setIsModeTipPaused(true);
    }, [isModeTipPaused, modeTip]);

    const resumeModeTip = useCallback(() => {
        if (!modeTip || !isModeTipPaused) return;
        setIsModeTipPaused(false);
        startModeTipTimer(modeTip.id, modeTipRemainingRef.current);
    }, [isModeTipPaused, modeTip, startModeTipTimer]);

    const switchMode = useCallback((nextMode: AiMarkdownMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        showModeTip(nextMode);
    }, [mode, showModeTip]);

    const handleModeTouchStart = useCallback((event: ReactTouchEvent) => {
        const touch = event.touches[0];
        modeSwipeRef.current = { startX: touch.clientX, startY: touch.clientY, locked: false };
        setModeDrag(0);
    }, []);

    const handleModeTouchMove = useCallback((event: ReactTouchEvent) => {
        const touch = event.touches[0];
        const state = modeSwipeRef.current;
        const dx = touch.clientX - state.startX;
        const dy = touch.clientY - state.startY;

        if (!state.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            state.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
            if (state.locked === 'h') setIsModeDragging(true);
        }

        if (state.locked === 'h') {
            event.preventDefault();
            setModeDrag(Math.max(-80, Math.min(80, dx)));
        }
    }, []);

    const handleModeTouchEnd = useCallback(() => {
        if (modeSwipeRef.current.locked === 'h') {
            if (mode === 'format' && modeDrag < -42) switchMode('rewrite');
            if (mode === 'rewrite' && modeDrag > 42) switchMode('format');
        }
        modeSwipeRef.current.locked = false;
        setModeDrag(0);
        setIsModeDragging(false);
    }, [mode, modeDrag, switchMode]);

    const run = useCallback(async (task: AiMarkdownTask, nextApplyMode: AiApplyMode) => {
        const partial = result || currentMarkdown;
        const text = task === 'revise' || task === 'continue' ? partial : (sourceTextareaRef.current?.value ?? sourceTextRef.current);
        const instruction = task === 'revise' ? followup.trim() || extraInstruction : extraInstruction;

        if (!text.trim()) {
            showNotice(task === 'generate' ? '缺少内容' : '没有可继续处理的 Markdown', task === 'generate' ? '请输入纯文本内容后再生成' : '请检查输入内容后重试', 'error');
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setPhase('generating');
        setInterrupted(false);
        streamedRef.current = task === 'continue' ? partial : '';
        if (task !== 'continue') setResult('');
        setStatus(task === 'continue' ? '正在接着生成...' : task === 'revise' ? '正在继续优化...' : '正在生成 Markdown...');

        try {
            const markdown = await streamAiMarkdown(
                { mode, task, sourceText: text, extraInstruction: instruction },
                {
                    signal: controller.signal,
                    onDelta: (delta) => {
                        streamedRef.current += delta;
                        setResult(streamedRef.current);
                        setStatus(`正在生成，已收到 ${streamedRef.current.length} 字`);
                    },
                }
            );
            const cleaned = cleanAiMarkdown(task === 'continue' ? streamedRef.current : markdown);
            if (!cleaned) throw new Error('模型没有返回 Markdown 内容');
            setResult(cleaned);
            setPhase('done');
            setStatus(`生成完成，共 ${cleaned.length} 字`);
            setFollowup('');
            onApply(cleaned, nextApplyMode);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            showNotice('生成失败', err instanceof Error ? err.message : 'AI 生成失败，请稍后重试', 'error');
            setStatus('生成失败');
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    }, [currentMarkdown, extraInstruction, followup, mode, onApply, result, showNotice]);

    const askConfirm = useCallback(() => {
        if (!canGenerate) return;
        setConfirmingReplace(true);
    }, [canGenerate]);

    const renderModeSwitch = (mobile = false) => {
        const activeIndex = mode === 'format' ? 0 : 1;
        const dragOffset = mobile ? modeDrag / 2 : 0;

        return (
            <div
                className="relative grid grid-cols-2 gap-0.5 rounded-md bg-[#eef0f4] p-0.5 dark:bg-[#262628]"
                onTouchStart={mobile ? handleModeTouchStart : undefined}
                onTouchMove={mobile ? handleModeTouchMove : undefined}
                onTouchEnd={mobile ? handleModeTouchEnd : undefined}
                onTouchCancel={mobile ? handleModeTouchEnd : undefined}
            >
                <span
                    className="absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] rounded bg-white shadow-sm dark:bg-[#3a3a3c]"
                    style={{
                        left: '2px',
                        transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 2}px)) translateX(${dragOffset}px)`,
                        transition: isModeDragging ? 'none' : 'transform 0.2s ease',
                    }}
                />
                {modes.map(item => (
                    <button
                        key={item.id}
                        onClick={() => switchMode(item.id)}
                        className={`relative rounded px-3 py-2 ${mobile ? 'text-[16px]' : 'text-[12px]'} font-semibold transition-colors ${mode === item.id ? 'text-[#1d1d1f] dark:text-[#f5f5f7]' : 'text-[#69707d] dark:text-[#a1a1a6]'}`}
                    >
                        <span className="block">{item.label}</span>
                    </button>
                ))}
            </div>
        );
    };

    const renderApplySwitch = () => (
        <div className="grid grid-cols-3 gap-0.5 rounded-md bg-[#eef0f4] p-0.5 dark:bg-[#262628]">
            {applyModes.map(item => (
                <button
                    key={item.id}
                    onClick={() => setApplyMode(item.id)}
                    className={`h-8 rounded text-[12px] font-medium transition-colors ${applyMode === item.id ? 'bg-white text-[#1d1d1f] shadow-sm dark:bg-[#3a3a3c] dark:text-[#f5f5f7]' : 'text-[#69707d] dark:text-[#a1a1a6]'}`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );

    const renderActions = () => {
        if (isGenerating) {
            return (
                <>
                    <button onClick={onClose} disabled className={ghostButton}>取消</button>
                    <button
                        onClick={stopGenerating}
                        aria-label="打断输出"
                        title="打断输出"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#1d1d1f] text-white transition-colors hover:bg-[#2f3137] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:bg-[#f5f5f7]"
                    >
                        <span className="h-2.5 w-2.5 rounded-[2px] bg-white dark:bg-black" />
                    </button>
                </>
            );
        }

        if (phase === 'done') {
            return (
                <>
                    {interrupted && (
                        <button onClick={() => void run('continue', applyMode)} className={primaryButton}>
                            <Sparkles size={13} />
                            继续生成
                        </button>
                    )}
                    <button onClick={() => void run('generate', applyMode)} className={ghostButton}>
                        <RefreshCcw size={13} />
                        重新生成
                    </button>
                    <button onClick={() => void run('revise', applyMode)} disabled={!followup.trim()} className={primaryButton}>
                        <Wand2 size={13} />
                        继续优化
                    </button>
                </>
            );
        }

        return (
            <>
                <button onClick={onClose} disabled={isGenerating} className={ghostButton}>取消</button>
                <button onClick={askConfirm} disabled={!canGenerate} className={primaryButton}>
                    <Sparkles size={13} />
                    生成 Markdown
                </button>
            </>
        );
    };

    const inputPane = (
        <section className={`${isDesktop ? 'min-h-0 overflow-auto' : ''} space-y-3`}>
            {isDesktop && renderModeSwitch()}
            <div className="block">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                        <span className={labelClass}>纯文本内容</span>
                        <button
                            type="button"
                            aria-label="复制纯文本内容"
                            title="复制"
                            disabled={copiedFields.source || !hasSourceText}
                            onClick={() => void copyField('source', sourceTextareaRef.current?.value ?? sourceTextRef.current)}
                            className={iconButton}
                        >
                            {copiedFields.source ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                        </button>
                        <span ref={sourceLengthRef} className="text-[11px] text-[#86868b] dark:text-[#8e8e93]">{sourceTextRef.current.length} 字</span>
                    </span>
                    <span className={`flex items-center ${isDesktop ? 'gap-1.5' : 'gap-1'}`}>
                        <button type="button" onClick={() => void pasteSourceText()} disabled={isGenerating} className={isDesktop ? ghostButton : compactFieldButton}>
                            <Clipboard size={isDesktop ? 12 : 11} />
                            粘贴
                        </button>
                        <button type="button" onClick={clearSourceFormatting} disabled={isGenerating || !hasSourceText} className={isDesktop ? ghostButton : compactFieldButton}>
                            <RemoveFormatting size={isDesktop ? 12 : 11} />
                            清除格式
                        </button>
                        <button type="button" onClick={clearSourceText} disabled={isGenerating || !hasSourceText} className={isDesktop ? ghostButton : compactFieldButton}>
                            <Eraser size={isDesktop ? 12 : 11} />
                            清除
                        </button>
                    </span>
                </div>
                <textarea
                    ref={sourceTextareaRef}
                    data-testid="ai-source-text"
                    aria-label="纯文本内容"
                    defaultValue={sourceTextRef.current}
                    onInput={(e) => syncSourceText(e.currentTarget.value)}
                    className={`${fieldClass} ${isDesktop ? 'h-[238px]' : 'h-36'}`}
                    placeholder="粘贴需要转换的纯文本..."
                    disabled={isGenerating}
                />
            </div>

            <label className="block">
                <div className="mb-2 flex items-center gap-1">
                    <span className={labelClass}>额外要求</span>
                    <button
                        type="button"
                        aria-label="复制额外要求"
                        title="复制"
                        disabled={copiedFields.extra || !extraInstruction}
                        onClick={() => void copyField('extra', extraInstruction)}
                        className={iconButton}
                    >
                        {copiedFields.extra ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                    </button>
                </div>
                <textarea
                    data-testid="ai-extra-instruction"
                    value={extraInstruction}
                    onChange={(e) => setExtraInstruction(e.target.value)}
                    className={`${fieldClass} h-24`}
                    placeholder={mode === 'format' ? '例如：保留原文顺序，适当加标题和重点加粗' : '例如：改成更适合公众号发布的表达，但不要加入新事实'}
                    disabled={isGenerating}
                />
            </label>
        </section>
    );

    const renderOutputPane = () => (
        <section className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    {isGenerating ? <Loader2 size={14} className="shrink-0 animate-spin text-[#0066cc] dark:text-[#64aaff]" /> : <Sparkles size={14} className="shrink-0 text-[#0066cc] dark:text-[#64aaff]" />}
                    <span className="truncate text-[12px] font-semibold text-[#4b5563] dark:text-[#c7c7cc]">{status}</span>
                </div>
            </div>

            <pre className={`${isDesktop ? 'min-h-[310px]' : 'min-h-[168px]'} flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 font-mono text-[12px] leading-6 text-[#253041] shadow-[inset_0_0_0_1px_rgba(29,29,31,0.09)] dark:bg-[#111113] dark:text-[#e5e5ea] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]`}>
                {result}
            </pre>

            {phase === 'done' && (
                <div className="mt-3 space-y-3">
                    {renderApplySwitch()}
                    <label className="block">
                        <div className="mb-2 flex items-center gap-1">
                            <span className={labelClass}>继续更改和优化</span>
                            <button
                                type="button"
                                aria-label="复制继续更改和优化"
                                title="复制"
                                disabled={copiedFields.followup || !followup}
                                onClick={() => void copyField('followup', followup)}
                                className={iconButton}
                            >
                                {copiedFields.followup ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                            </button>
                        </div>
                        <textarea
                            value={followup}
                            onChange={(e) => setFollowup(e.target.value)}
                            className={`${fieldClass} h-20`}
                            placeholder="例如：标题更克制一些，表格改成列表，减少加粗..."
                        />
                    </label>
                </div>
            )}
        </section>
    );

    const confirmReplaceDialog = confirmingReplace && (
        <motion.div
            data-testid="ai-replace-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[230] grid place-items-center bg-black/18 px-5 backdrop-blur-[2px] dark:bg-black/34"
            onClick={() => setConfirmingReplace(false)}
        >
            <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="w-full max-w-[340px] rounded-lg bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.24)] dark:bg-[#242426]"
                onClick={(event) => event.stopPropagation()}
            >
                <h3 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">替换当前编辑区内容？</h3>
                <p className="mt-2 text-[13px] leading-5 text-[#69707d] dark:text-[#a1a1a6]">
                    AI 生成完成后会覆盖当前 Markdown，可通过成功提示里的撤销按钮恢复。
                </p>
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={() => setConfirmingReplace(false)} className={ghostButton}>取消</button>
                    <button
                        onClick={() => {
                            setConfirmingReplace(false);
                            onStreamReplace({ mode, task: 'generate', sourceText: sourceTextareaRef.current?.value ?? sourceTextRef.current, extraInstruction });
                        }}
                        className={primaryButton}
                    >
                        <Sparkles size={13} />
                        确认生成
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );

    const modeTipNotice = modeTip && (
        isDesktop ? (
            <motion.div
                key={modeTip.id}
                initial={{ opacity: 0, x: '110%', scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: '110%', scale: 0.98 }}
                transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                onMouseEnter={pauseModeTip}
                onMouseLeave={resumeModeTip}
                className="fixed right-6 top-6 z-[240] w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)] ring-1 ring-black/[0.06] dark:bg-[#242426] dark:ring-white/[0.08]"
            >
                <div className="flex items-start gap-3 p-3.5 pr-10">
                    <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{modeTips[modeTip.mode].title}</p>
                        <p className="mt-0.5 text-[12px] leading-5 text-[#5f6875] dark:text-[#c7c7cc]">{modeTips[modeTip.mode].body}</p>
                    </div>
                </div>
                <div className="pointer-events-none absolute inset-y-0 right-8 w-10 bg-gradient-to-r from-transparent to-white dark:to-[#242426]" />
                <button
                    type="button"
                    aria-label="关闭提示"
                    title="关闭提示"
                    onClick={(event) => { event.stopPropagation(); setModeTip(null); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#86868b] transition-colors hover:bg-black/[0.06] hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:text-[#a1a1a6] dark:hover:bg-white/[0.08] dark:hover:text-[#f5f5f7]"
                >
                    <X size={14} />
                </button>
                <div
                    className={`mode-tip-progress h-1 bg-[#0a84ff] dark:bg-[#64aaff] ${isModeTipPaused ? 'mode-tip-progress-paused' : ''}`}
                    style={{ animationDuration: `${MODE_TIP_DURATION}ms` }}
                />
            </motion.div>
        ) : (
            <motion.div
                key={modeTip.id}
                initial={{ opacity: 0.5, x: '110%', scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: '110%', scale: 0.96 }}
                transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                onMouseEnter={pauseModeTip}
                onMouseLeave={resumeModeTip}
                className="fixed right-4 top-4 z-[240] flex w-auto max-w-[min(88vw,280px)] items-start gap-2.5 rounded-lg bg-white px-3 py-2.5 shadow-[0_3px_10px_rgba(0,0,0,0.1),0_3px_3px_rgba(0,0,0,0.05)] will-change-transform dark:bg-[#242426]"
            >
                <div className="relative min-w-0 flex-1 overflow-hidden pr-4">
                    <span className="block text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{modeTips[modeTip.mode].title}</span>
                    <span className="block text-[11px] text-[#6b7280] dark:text-[#9ca3af]">{modeTips[modeTip.mode].body}</span>
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-white dark:to-[#242426]" />
                </div>
                <button
                    type="button"
                    aria-label="关闭提示"
                    title="关闭提示"
                    onClick={(event) => { event.stopPropagation(); setModeTip(null); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0 rounded-md p-1 text-[#86868b] transition-colors hover:bg-black/[0.06] hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:text-[#a1a1a6] dark:hover:bg-white/[0.08] dark:hover:text-[#f5f5f7]"
                >
                    <X size={14} />
                </button>
                <motion.div
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: isModeTipPaused ? 1 : 0 }}
                    transition={{ duration: MODE_TIP_DURATION / 1000, ease: 'linear' }}
                    className="absolute bottom-0 left-0 right-0 h-0.5 origin-left bg-[#0a84ff] dark:bg-[#64aaff]"
                />
            </motion.div>
        )
    );

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        data-testid="ai-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={() => !isGenerating && onClose()}
                        className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-sm dark:bg-black/50"
                    />

                    {isDesktop ? (
                        <div className="fixed inset-0 z-[201] flex items-center justify-center p-6">
                            <motion.div
                                data-testid="ai-desktop-modal"
                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                                transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                                className={`${showOutput ? 'w-[860px]' : 'w-[460px]'} grid max-h-[84vh] max-w-[calc(100vw-48px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg bg-[#fbfcfe] shadow-[0_28px_80px_rgba(15,23,42,0.22)] dark:bg-[#1c1c1e]`}
                            >
                                <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
                                    <div className="min-w-0">
                                        <h2 className="truncate text-[16px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">AI 优化 Markdown</h2>
                                    </div>
                                    <button onClick={onClose} disabled={isGenerating} className="rounded-md p-1.5 text-[#69707d] hover:bg-black/[0.05] disabled:opacity-50 dark:text-[#a1a1a6] dark:hover:bg-white/[0.08]">
                                        <X size={18} />
                                    </button>
                                </header>
                                <main className={`grid min-h-0 ${showOutput ? 'grid-cols-[0.86fr_1.14fr] gap-4' : 'grid-cols-1'} overflow-hidden px-5 py-3`}>
                                    {inputPane}
                                    {showOutput && renderOutputPane()}
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
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: '100%' }}
                            transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
                            className="fixed inset-x-0 bottom-0 z-[201] grid overflow-hidden rounded-t-lg bg-[#fbfcfe] shadow-[0_-22px_64px_rgba(15,23,42,0.2)] dark:bg-[#1c1c1e]"
                            style={{ height: `${sheetHeight}vh`, gridTemplateRows: 'auto minmax(0, 1fr) auto' }}
                        >
                            <header className="px-4 pb-2 pt-2">
                                <div className="flex touch-none justify-center pb-2" onPointerDown={handleSheetPointerDown}>
                                    <span className="h-1.5 w-12 cursor-row-resize rounded bg-[#b7bcc5] dark:bg-[#5a5a5f]" />
                                </div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 className="text-[20px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">AI 优化</h2>
                                        <p className="mt-0.5 truncate text-[12px] text-[#69707d] dark:text-[#a1a1a6]">{status}</p>
                                    </div>
                                    <button onClick={onClose} disabled={isGenerating} className="rounded-md p-1.5 text-[#69707d] active:bg-black/[0.06] disabled:opacity-50 dark:text-[#a1a1a6] dark:active:bg-white/[0.08]">
                                        <X size={20} />
                                    </button>
                                </div>
                                {renderModeSwitch(true)}
                            </header>
                            <main className="min-h-0 space-y-3 overflow-y-auto px-4 py-3 scroll-touch">
                                {inputPane}
                                {showOutput && renderOutputPane()}
                            </main>
                            <footer className="flex flex-wrap justify-end gap-2 bg-[#fbfcfe]/96 px-4 py-3 shadow-[0_-14px_26px_rgba(15,23,42,0.06)] backdrop-blur dark:bg-[#1c1c1e]/95 dark:shadow-[0_-14px_26px_rgba(0,0,0,0.18)]">
                                {renderActions()}
                            </footer>
                        </motion.div>
                    )}
                    <AnimatePresence>{confirmReplaceDialog}</AnimatePresence>
                    <AnimatePresence>{modeTipNotice}</AnimatePresence>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
