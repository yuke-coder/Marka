import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Clipboard, Loader2, RefreshCcw, Sparkles, Square, Wand2, X } from 'lucide-react';
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
    showNotice: (title: string, description: string, tone: 'success' | 'download' | 'error') => void;
}

const modes: Array<{ id: AiMarkdownMode; label: string; desc: string }> = [
    { id: 'format', label: '排版模式', desc: '保留原文，只做 Markdown 化' },
    { id: 'rewrite', label: '改写模式', desc: '可调整表达，但不编造事实' },
];

const applyModes: Array<{ id: AiApplyMode; label: string }> = [
    { id: 'replace', label: '替换' },
    { id: 'insert', label: '插入到光标处' },
    { id: 'append', label: '追加到末尾' },
];

const fieldClass = 'w-full resize-none rounded-lg border border-[#00000012] dark:border-[#ffffff16] bg-white/80 dark:bg-[#1c1c1e]/80 px-3 py-2.5 outline-none text-[13px] leading-6 text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#9a9aa0] focus:border-[#0066cc]/50 dark:focus:border-[#0a84ff]/60';
const subtleButton = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-medium transition-colors border border-[#00000012] dark:border-[#ffffff16] text-[#5e5e63] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed';
const primaryButton = 'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md text-[12px] font-semibold transition-colors bg-[#1d1d1f] dark:bg-[#f5f5f7] text-white dark:text-black hover:opacity-90 disabled:opacity-55 disabled:cursor-not-allowed';

export default function AiMarkdownDialog(props: AiMarkdownDialogProps) {
    const { isOpen, isDesktop, currentMarkdown, onClose, onApply, showNotice } = props;
    const [mode, setMode] = useState<AiMarkdownMode>('format');
    const [sourceText, setSourceText] = useState('');
    const [extraInstruction, setExtraInstruction] = useState('');
    const [followup, setFollowup] = useState('');
    const [result, setResult] = useState('');
    const [applyMode, setApplyMode] = useState<AiApplyMode>('replace');
    const [phase, setPhase] = useState<'idle' | 'confirm' | 'generating' | 'done'>('idle');
    const [status, setStatus] = useState('等待输入');
    const [interrupted, setInterrupted] = useState(false);
    const [sheetHeight, setSheetHeight] = useState(88);
    const [modeDrag, setModeDrag] = useState(0);
    const [isModeDragging, setIsModeDragging] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const streamedRef = useRef('');
    const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
    const modeSwipeRef = useRef<{ startX: number; startY: number; locked: boolean | 'h' | 'v' }>({ startX: 0, startY: 0, locked: false });

    const isGenerating = phase === 'generating';
    const canGenerate = sourceText.trim().length > 0 && !isGenerating;

    useEffect(() => {
        if (!isOpen) abortRef.current?.abort();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isDesktop && !isGenerating) onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, isDesktop, isGenerating, onClose]);

    const stopGenerating = () => {
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
    };

    const insertSourceText = (text: string) => {
        const textarea = sourceTextareaRef.current;
        if (textarea) {
            const start = textarea.selectionStart ?? sourceText.length;
            const end = textarea.selectionEnd ?? sourceText.length;
            setSourceText(sourceText.slice(0, start) + text + sourceText.slice(end));
            setTimeout(() => {
                const pos = start + text.length;
                textarea.focus();
                textarea.setSelectionRange(pos, pos);
            }, 0);
        } else {
            setSourceText(text);
        }
    };

    const pasteSourceText = async () => {
        sourceTextareaRef.current?.focus();

        const readViaClipboardApi = async (): Promise<string | null> => {
            if (!navigator.clipboard?.readText) return null;
            try {
                return await navigator.clipboard.readText();
            } catch {
                return null;
            }
        };

        const readViaExecCommand = (): string | null => {
            const textarea = sourceTextareaRef.current;
            if (!textarea) return null;
            const original = textarea.value;
            const start = textarea.selectionStart ?? original.length;
            textarea.focus();
            if (!document.execCommand('paste')) return null;
            const pasted = textarea.value.slice(start);
            return pasted || (textarea.value !== original ? textarea.value : null);
        };

        try {
            const text = (await readViaClipboardApi()) ?? readViaExecCommand();
            if (!text) {
                showNotice('粘贴失败', '未获得剪贴板权限或剪贴板为空', 'error');
                return;
            }
            insertSourceText(text);
            showNotice('已粘贴', '剪贴板内容已粘贴到纯文本输入框', 'success');
        } catch {
            showNotice('粘贴失败', '读取剪贴板失败', 'error');
        }
    };

    const handleSheetPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        const startY = event.clientY;
        const startHeight = sheetHeight;
        const viewportHeight = window.innerHeight || 1;
        event.currentTarget.setPointerCapture?.(event.pointerId);

        const onMove = (moveEvent: PointerEvent) => {
            const delta = startY - moveEvent.clientY;
            const next = startHeight + (delta / viewportHeight) * 100;
            setSheetHeight(Math.min(96, Math.max(58, next)));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    const handleModeTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0];
        modeSwipeRef.current = { startX: touch.clientX, startY: touch.clientY, locked: false };
        setModeDrag(0);
    };

    const handleModeTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
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
    };

    const handleModeTouchEnd = () => {
        const threshold = 42;
        if (modeSwipeRef.current.locked === 'h') {
            if (mode === 'format' && modeDrag < -threshold) setMode('rewrite');
            if (mode === 'rewrite' && modeDrag > threshold) setMode('format');
        }
        modeSwipeRef.current.locked = false;
        setModeDrag(0);
        setIsModeDragging(false);
    };

    const run = async (task: AiMarkdownTask, nextApplyMode: AiApplyMode) => {
        const partial = result || currentMarkdown;
        const text = task === 'revise' || task === 'continue' ? partial : sourceText;
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
    };

    const askConfirm = () => {
        if (!canGenerate) return;
        setPhase('confirm');
        setStatus('请确认替换当前编辑区内容');
    };

    const ModeSwitch = ({ compact = false }: { compact?: boolean }) => {
        if (compact) {
            const activeIndex = mode === 'format' ? 0 : 1;
            const dragOffset = modeDrag / 2;

            return (
                <div
                    className="relative overflow-hidden rounded-lg bg-[#eef1f5] dark:bg-[#2c2c2e] p-1 shadow-inner touch-pan-y"
                    onTouchStart={handleModeTouchStart}
                    onTouchMove={handleModeTouchMove}
                    onTouchEnd={handleModeTouchEnd}
                    onTouchCancel={handleModeTouchEnd}
                >
                    <div
                        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-white dark:bg-[#111113] shadow-[0_2px_10px_rgba(0,0,0,0.10)]"
                        style={{
                            left: `calc(${activeIndex * 50}% + 4px)`,
                            transform: `translateX(${dragOffset}px)`,
                            transition: isModeDragging ? 'none' : 'left 0.22s ease, transform 0.22s ease',
                        }}
                    />
                    <div className="relative grid grid-cols-2 gap-1">
                        {modes.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setMode(item.id)}
                                className={`h-10 rounded-md text-[15px] font-semibold transition-colors ${mode === item.id
                                    ? 'text-[#1d1d1f] dark:text-[#f5f5f7]'
                                    : 'text-[#73737a] dark:text-[#98989d]'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        return (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.07] p-1">
            {modes.map(item => (
                <button
                    key={item.id}
                    onClick={() => setMode(item.id)}
                    className={`rounded-md px-3 py-2 text-left transition-colors ${mode === item.id
                        ? 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] shadow-sm'
                        : 'text-[#727278] dark:text-[#a1a1a6] hover:bg-white/45 dark:hover:bg-white/[0.06]'
                    }`}
                >
                    <span className="block text-[12px] font-semibold">{item.label}</span>
                    <span className="block text-[11px] leading-4 opacity-75">{item.desc}</span>
                </button>
            ))}
        </div>
        );
    };

    const ApplyModeSwitch = () => (
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.07] p-1">
            {applyModes.map(item => (
                <button
                    key={item.id}
                    onClick={() => setApplyMode(item.id)}
                    className={`h-8 rounded-md text-[12px] font-medium transition-colors ${applyMode === item.id
                        ? 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] shadow-sm'
                        : 'text-[#727278] dark:text-[#a1a1a6] hover:bg-white/45 dark:hover:bg-white/[0.06]'
                    }`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );

    const InputFields = ({ compact = false }: { compact?: boolean }) => (
        <div className="space-y-4">
            {!compact && <ModeSwitch />}
            <label className={`block ${compact ? 'rounded-xl border border-[#0000000f] dark:border-[#ffffff12] bg-white/72 dark:bg-[#242426]/72 p-3 shadow-sm' : ''}`}>
                <span className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">纯文本内容</span>
                    <button
                        type="button"
                        onClick={() => void pasteSourceText()}
                        disabled={isGenerating}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[#00000012] dark:border-[#ffffff16] px-2 text-[11px] font-medium text-[#0066cc] dark:text-[#0a84ff] transition-colors hover:bg-[#0066cc]/8 dark:hover:bg-[#0a84ff]/10 disabled:opacity-50"
                    >
                        <Clipboard size={12} />
                        粘贴
                    </button>
                </span>
                <textarea
                    ref={sourceTextareaRef}
                    data-testid="ai-source-text"
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    className={`${fieldClass} ${compact ? 'h-44 bg-[#fbfbfd] dark:bg-[#18181a]' : 'h-72'}`}
                    placeholder="粘贴需要转换的纯文本..."
                    disabled={isGenerating}
                />
            </label>
            <label className={`block ${compact ? 'rounded-xl border border-[#0000000f] dark:border-[#ffffff12] bg-white/72 dark:bg-[#242426]/72 p-3 shadow-sm' : ''}`}>
                <span className="block mb-1.5 text-[12px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">额外要求</span>
                <textarea
                    data-testid="ai-extra-instruction"
                    value={extraInstruction}
                    onChange={(e) => setExtraInstruction(e.target.value)}
                    className={`${fieldClass} h-24 ${compact ? 'bg-[#fbfbfd] dark:bg-[#18181a]' : ''}`}
                    placeholder={mode === 'format' ? '例如：保留原文顺序，适当加标题和重点加粗' : '例如：改成更适合公众号发布的表达，但不要加入新事实'}
                    disabled={isGenerating}
                />
            </label>
            {!compact && (
                <p className="text-[11px] leading-5 text-[#86868b] dark:text-[#a1a1a6]">
                    {mode === 'format' ? '排版模式会完整保留原文，只做结构和 Markdown 格式处理。' : '改写模式会按要求优化表达，但不会编造原文没有的信息。'}
                </p>
            )}
        </div>
    );

    const OutputPanel = ({ compact = false }: { compact?: boolean }) => (
        <div className={`flex flex-col min-h-0 h-full ${compact ? 'rounded-xl border border-[#0000000f] dark:border-[#ffffff12] bg-white/72 dark:bg-[#242426]/72 p-3 shadow-sm' : ''}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                    {isGenerating ? <Loader2 size={14} className="animate-spin text-[#0066cc] dark:text-[#0a84ff]" /> : <Sparkles size={14} className="text-[#0066cc] dark:text-[#0a84ff]" />}
                    <span className="truncate text-[12px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{status}</span>
                </div>
                {isGenerating && (
                    <button onClick={stopGenerating} className={subtleButton}>
                        <Square size={12} />
                        打断输出
                    </button>
                )}
            </div>

            <pre className={`${compact ? 'min-h-[180px]' : 'min-h-[220px]'} flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-[#00000012] dark:border-[#ffffff16] bg-[#f7f7f9] dark:bg-[#111113] p-3 text-[12px] leading-6 text-[#1d1d1f] dark:text-[#f5f5f7]`}>
                {result || '生成时会在这里实时显示 Markdown 源码...'}
            </pre>

            {phase === 'done' && (
                <div className="mt-3 space-y-3">
                    <ApplyModeSwitch />
                    <label className="block">
                        <span className="block mb-1.5 text-[12px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">继续更改和优化</span>
                        <textarea
                            value={followup}
                            onChange={(e) => setFollowup(e.target.value)}
                            className={`${fieldClass} h-20`}
                            placeholder="例如：标题更克制一些，表格改成列表，减少加粗..."
                        />
                    </label>
                </div>
            )}
        </div>
    );

    const PrimaryActions = () => {
        if (phase === 'confirm') {
            return (
                <>
                    <button onClick={() => setPhase('idle')} className={subtleButton}>返回</button>
                    <button onClick={() => void run('generate', 'replace')} className={primaryButton}>
                        <Sparkles size={13} />
                        替换当前内容
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
                    <button onClick={() => void run('generate', applyMode)} className={subtleButton}>
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
                <button onClick={onClose} disabled={isGenerating} className={subtleButton}>取消</button>
                <button onClick={askConfirm} disabled={!canGenerate} className={primaryButton}>
                    <Sparkles size={13} />
                    生成 Markdown
                </button>
            </>
        );
    };

    const DesktopDialog = () => (
        <motion.div
            data-testid="ai-desktop-modal"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className="relative w-[900px] max-w-[calc(100vw-48px)] max-h-[84vh] overflow-hidden rounded-2xl border border-[#00000015] dark:border-[#ffffff15] bg-white dark:bg-[#1c1c1e] shadow-apple-lg"
        >
            <div className="flex items-center justify-between gap-3 border-b border-[#00000010] dark:border-[#ffffff10] px-5 py-4">
                <div>
                    <h2 className="text-[16px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">AI 优化 Markdown</h2>
                    <p className="mt-0.5 text-[12px] text-[#86868b] dark:text-[#a1a1a6]">输入纯文本和要求，生成后自动应用到编辑区</p>
                </div>
                <button onClick={onClose} disabled={isGenerating} className="rounded-md p-1.5 text-[#86868b] transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08] disabled:opacity-50">
                    <X size={18} />
                </button>
            </div>

            <div className="grid max-h-[calc(84vh-128px)] grid-cols-[0.88fr_1.12fr] gap-0 overflow-hidden">
                <div className="overflow-auto border-r border-[#00000010] dark:border-[#ffffff10] p-5">
                    <InputFields />
                </div>
                <div className="min-h-0 overflow-hidden p-5">
                    <OutputPanel />
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#00000010] dark:border-[#ffffff10] px-5 py-3">
                <PrimaryActions />
            </div>
        </motion.div>
    );

    const MobileSheet = () => (
        <motion.div
            data-testid="ai-mobile-sheet"
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-x-0 bottom-0 z-[210] flex overflow-hidden rounded-t-2xl border-t border-[#00000012] dark:border-[#ffffff14] bg-[#f6f7f9] dark:bg-[#1c1c1e] shadow-apple-lg"
            style={{ height: `${sheetHeight}vh` }}
        >
            <div className="flex min-h-0 w-full flex-col">
                <div
                    className="flex touch-none justify-center px-4 pb-2 pt-2"
                    onPointerDown={handleSheetPointerDown}
                    title="拖动调整面板高度"
                >
                    <div className="h-1.5 w-12 cursor-row-resize rounded bg-black/22 dark:bg-white/28" />
                </div>
                <div className="mx-3 rounded-xl border border-white/70 dark:border-white/[0.08] bg-white/78 dark:bg-[#242426]/78 px-3 py-3 shadow-sm backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-[17px] font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">AI 优化</h2>
                            <p className="mt-0.5 truncate text-[12px] text-[#73737a] dark:text-[#a1a1a6]">{status}</p>
                        </div>
                        <button onClick={onClose} disabled={isGenerating} className="rounded-md p-1.5 text-[#86868b] transition-colors active:bg-black/[0.06] dark:active:bg-white/[0.08] disabled:opacity-50">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="mt-3">
                        <ModeSwitch compact />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-4 pb-28 scroll-touch">
                    <div className="space-y-4">
                        <InputFields compact />
                        <OutputPanel compact />
                    </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 border-t border-[#00000010] dark:border-[#ffffff10] bg-white/92 dark:bg-[#1c1c1e]/92 px-4 py-3 backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <PrimaryActions />
                    </div>
                </div>
            </div>
        </motion.div>
    );

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[205] bg-black/25 dark:bg-black/50"
                        onClick={() => !isGenerating && onClose()}
                    />
                    <div className={`fixed inset-0 z-[210] ${isDesktop ? 'flex items-center justify-center p-6' : 'pointer-events-none'}`}>
                        <div className={isDesktop ? '' : 'pointer-events-auto'}>
                            {isDesktop ? DesktopDialog() : MobileSheet()}
                        </div>
                    </div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
