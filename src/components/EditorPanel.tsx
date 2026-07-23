import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { handleSmartPaste, insertAtSelection } from '../lib/htmlToMarkdown';
import { readClipboardContent } from '../lib/clipboard';
import {
    detectClipboardDocumentImport,
    detectHtmlDocumentSource,
} from '../lib/clipboardImport';
import { isAiGenerationActive, type AiGenerationPhase } from '../lib/aiMarkdown';
import {
    getMarkaDocumentDefinition,
    type MarkaDocumentKind,
} from '../lib/markaDocument';
import { isDocumentFeatureEnabled } from '../lib/documentRuntime';
import { renderThinkingMarkdown } from '../lib/thinkingMarkdown';

interface EditorPanelProps {
    source: string;
    onSourceChange: (value: string) => void;
    editorScrollRef: React.RefObject<HTMLTextAreaElement>;
    onEditorScroll: () => void;
    scrollSyncEnabled: boolean;
    onSelectAll?: () => void;
    onClearRequest?: () => void;
    onAbortStream?: () => void;
    immersive?: boolean;
    aiThinking?: string;
    isAiThinkingExpanded?: boolean;
    onToggleAiThinkingExpanded?: () => void;
    aiMainTextStarted?: boolean;
    aiGenerationPhase?: AiGenerationPhase;
    borderSide?: 'left' | 'right' | string;
    zoom?: number;
    documentKind?: MarkaDocumentKind;
    onHtmlDocumentPaste?: (source: string) => void;
    onPasteFile?: (file: File) => void;
}

const editorIconButton = 'inline-flex h-5 w-5 items-center justify-center rounded-[4px] bg-transparent text-[#86868b] transition-colors hover:bg-black/[0.06] hover:text-[#4b5563] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/30 disabled:cursor-not-allowed disabled:opacity-30 dark:text-[#8e8e93] dark:hover:bg-white/[0.07] dark:hover:text-[#c7c7cc]';
const roundIconButton = 'inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#1d1d1f] bg-transparent text-[#1d1d1f] transition-all hover:bg-black/[0.06] active:scale-95 dark:border-[#f5f5f7] dark:text-[#f5f5f7] dark:hover:bg-white/[0.08]';
const textActionButton = 'inline-flex items-center justify-center h-6 px-2 rounded-md text-[11px] font-medium border transition-all active:scale-95 select-none';

const AI_GENERATION_LABELS: Partial<Record<AiGenerationPhase, string>> = {
    processing: '处理中',
    thinking: '正在思考…',
    finalizing: '生成最终结果',
    completed: '完成回答',
    interrupted: '已停止生成',
};

function StatusShimmerLabel({ children, once, phase }: { children: string; once: boolean; phase: AiGenerationPhase }) {
    return (
        <span
            className={`ai-generation-label ${once ? 'ai-generation-label--once' : ''}`}
            data-testid="ai-generation-shimmer"
            data-phase={phase}
        >
            <span className="ai-generation-label__base" data-testid="ai-generation-status">
                {children}
            </span>
            <span className="ai-generation-label__sweep" aria-hidden="true">
                <span className="ai-generation-label__highlight" />
                <span className="ai-generation-label__ghost">{children}</span>
            </span>
        </span>
    );
}

function StatusSparkleIcon({ active }: { active: boolean }) {
    return (
        <svg
            className={active ? 'ai-status-sparkle ai-status-sparkle--active' : 'ai-status-sparkle'}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
        >
            <path
                d="M9.4268 14.2562L8.93364 15.3876C8.57274 16.2158 7.42714 16.2158 7.06624 15.3876L6.57312 14.2562C5.69412 12.2389 4.1109 10.6328 2.13534 9.75416L0.616093 9.07844C-0.205364 8.71306 -0.205364 7.51762 0.616093 7.15224L2.0504 6.51428C4.07676 5.61302 5.68834 3.94746 6.55224 1.86165L7.05864 0.639067C7.41156 -0.213022 8.58834 -0.213022 8.94126 0.639067L9.44764 1.86165C10.3115 3.94746 11.9232 5.61302 13.9496 6.51428L15.3838 7.15224C16.2054 7.51762 16.2054 8.71306 15.3838 9.07844L13.8646 9.75416C11.889 10.6328 10.3058 12.2389 9.4268 14.2562Z"
                fill="url(#ai-status-sparkle-gradient)"
            />
            <defs>
                <linearGradient id="ai-status-sparkle-gradient" x1="0" y1="8" x2="16" y2="8" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#3B88FD" />
                    <stop offset="1" stopColor="#49F2D1" />
                </linearGradient>
            </defs>
        </svg>
    );
}

export default function EditorPanel({ source, onSourceChange, editorScrollRef, onEditorScroll, scrollSyncEnabled, onSelectAll, onClearRequest, onAbortStream, immersive, aiThinking, isAiThinkingExpanded, onToggleAiThinkingExpanded, aiMainTextStarted, aiGenerationPhase = 'idle', borderSide = 'right', zoom = 1, documentKind = 'markdown', onHtmlDocumentPaste, onPasteFile }: EditorPanelProps) {
    const [copied, setCopied] = useState(false);
    const contentAreaRef = useRef<HTMLDivElement>(null);
    const statusPanelRef = useRef<HTMLDivElement>(null);
    const documentDefinition = getMarkaDocumentDefinition(documentKind);
    const supportsSmartPaste = isDocumentFeatureEnabled(documentKind, 'smartPaste');
    const editsNativeHtmlSource = !supportsSmartPaste;

    const handleCopy = useCallback(async () => {
        if (copied || !source) return;
        try {
            await navigator.clipboard.writeText(source);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // ignore
        }
    }, [copied, source]);

    const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const documentImport = detectClipboardDocumentImport(e.clipboardData);
        if (documentImport?.kind === 'html-file' && onPasteFile) {
            e.preventDefault();
            onPasteFile(documentImport.file);
            return;
        }
        if (documentImport?.kind === 'html-source') {
            if (editsNativeHtmlSource) {
                e.preventDefault();
                insertAtSelection(e.currentTarget, documentImport.source, onSourceChange);
                return;
            }
            if (onHtmlDocumentPaste) {
                e.preventDefault();
                onHtmlDocumentPaste(documentImport.source);
                return;
            }
        }
        if (supportsSmartPaste) handleSmartPaste(e, onSourceChange);
    };

    const handlePasteButton = useCallback(async () => {
        try {
            const clipboardContent = await readClipboardContent();
            const htmlImport = detectHtmlDocumentSource(
                clipboardContent.text ?? '',
                clipboardContent.html ?? '',
            );
            if (htmlImport && editsNativeHtmlSource) {
                onSourceChange(htmlImport.source);
            } else if (htmlImport && onHtmlDocumentPaste) {
                onHtmlDocumentPaste(htmlImport.source);
            } else if (clipboardContent.text !== null) {
                onSourceChange(clipboardContent.text);
            } else {
                return;
            }
            editorScrollRef.current?.focus();
        } catch {
            // ignore
        }
    }, [editsNativeHtmlSource, onHtmlDocumentPaste, onSourceChange, editorScrollRef]);

    const isAiStreaming = isAiGenerationActive(aiGenerationPhase);
    const showStatusPanel = aiGenerationPhase !== 'idle' && aiGenerationPhase !== 'connecting';
    const statusLabel = showStatusPanel ? AI_GENERATION_LABELS[aiGenerationPhase] ?? '' : '';
    const hasThinkingContent = Boolean(aiThinking?.trim());
    const canShowThinkingContent = hasThinkingContent && aiGenerationPhase !== 'processing';
    const isHidingEditorInput = isAiStreaming && !aiMainTextStarted;
    const isTerminalPhase = aiGenerationPhase === 'completed' || aiGenerationPhase === 'interrupted';
    const renderedThinking = useMemo(
        () => hasThinkingContent ? renderThinkingMarkdown(aiThinking ?? '') : '',
        [aiThinking, hasThinkingContent],
    );

    const syncStatusPosition = useCallback((scrollTop: number) => {
        if (!statusPanelRef.current) return;
        statusPanelRef.current.style.transform = `translate3d(0, -${Math.max(0, scrollTop)}px, 0)`;
    }, []);

    const handleEditorScroll = useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
        syncStatusPosition(event.currentTarget.scrollTop);
        if (scrollSyncEnabled) onEditorScroll();
    }, [onEditorScroll, scrollSyncEnabled, syncStatusPosition]);

    useEffect(() => {
        const contentArea = contentAreaRef.current;
        const statusPanel = statusPanelRef.current;
        if (!showStatusPanel || !contentArea || !statusPanel) return;

        const syncStatusMetrics = () => {
            contentArea.style.setProperty('--ai-status-height', `${statusPanel.offsetHeight}px`);
            syncStatusPosition(editorScrollRef.current?.scrollTop ?? 0);
        };

        syncStatusMetrics();
        if (typeof ResizeObserver === 'undefined') {
            return () => {
                contentArea.style.removeProperty('--ai-status-height');
            };
        }

        const observer = new ResizeObserver(syncStatusMetrics);
        observer.observe(statusPanel);
        return () => {
            observer.disconnect();
            contentArea.style.removeProperty('--ai-status-height');
        };
    }, [editorScrollRef, showStatusPanel, syncStatusPosition]);

    const statusContent = (
        <>
            <span className="ai-thinking-header__main">
                <StatusSparkleIcon active={!isTerminalPhase} />
                <StatusShimmerLabel
                    key={isTerminalPhase ? aiGenerationPhase : 'active'}
                    once={isTerminalPhase}
                    phase={aiGenerationPhase}
                >
                    {aiGenerationPhase === 'thinking' ? '正在思考' : statusLabel}
                </StatusShimmerLabel>
            </span>
            {canShowThinkingContent && onToggleAiThinkingExpanded && (
                <ChevronDown
                    size={14}
                    className={`ai-thinking-chevron ${isAiThinkingExpanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                />
            )}
        </>
    );

    const borderClass = borderSide === 'left' ? 'border-l' : 'border-r';
    return (
        <div
            className={`${borderClass} border-[#00000015] dark:border-[#ffffff15] flex flex-col relative z-30 bg-transparent flex-1 min-h-0 overflow-hidden`}
        >
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {aiGenerationPhase === 'idle' ? '' : statusLabel}
            </span>
            <div
                ref={contentAreaRef}
                className="ai-editor-content relative flex flex-col flex-1 min-h-0 overflow-hidden"
                aria-busy={isAiStreaming}
                style={{ zoom, transition: 'zoom 0.4s cubic-bezier(0.32, 0.72, 0, 1)' }}
            >
                {showStatusPanel && (
                    <div
                        ref={statusPanelRef}
                        className="ai-thinking-surface absolute left-4 right-4 top-4 z-10 flex max-h-[calc(100%-2rem)] flex-col overflow-hidden sm:left-6 sm:right-6 sm:top-6 sm:max-h-[calc(100%-3rem)] md:left-8 md:right-8 md:top-8 md:max-h-[calc(100%-4rem)]"
                        data-ai-generation-phase={aiGenerationPhase}
                    >
                        {canShowThinkingContent && onToggleAiThinkingExpanded ? (
                            <button
                                type="button"
                                className="ai-thinking-header"
                                data-testid="ai-thinking-toggle"
                                aria-expanded={isAiThinkingExpanded}
                                onClick={onToggleAiThinkingExpanded}
                            >
                                {statusContent}
                            </button>
                        ) : (
                            <div className="ai-thinking-header">
                                {statusContent}
                            </div>
                        )}
                        {canShowThinkingContent && isAiThinkingExpanded && (
                            <div
                                className="ai-thinking-content"
                                data-testid="ai-thinking-content"
                                role="region"
                                aria-label="思考内容"
                                dangerouslySetInnerHTML={{ __html: renderedThinking }}
                            />
                        )}
                    </div>
                )}
                {!isHidingEditorInput && (
                    <textarea
                        ref={editorScrollRef}
                        data-testid="editor-input"
                        className={`w-full flex-1 resize-none bg-transparent pb-14 font-mono text-[15px] leading-[1.8] text-[#1d1d1f] outline-none no-scrollbar placeholder-[#86868b] scroll-touch sm:pb-16 md:text-[16px] dark:text-[#f5f5f7] dark:placeholder-[#6e6e73] ${showStatusPanel ? 'ai-editor-input--with-status px-6 sm:px-8 md:px-10 md:pb-10' : 'p-6 sm:p-8 md:p-10'}`}
                        value={source}
                        onChange={(e) => onSourceChange(e.target.value)}
                        onPaste={onPaste}
                        onScroll={handleEditorScroll}
                        placeholder={documentDefinition.editorPlaceholder}
                        spellCheck={false}
                    />
                )}
            </div>

            {/* Bottom Action / Info Bar for Editor */}
            <div className={`absolute ${immersive ? 'bottom-3 right-3' : 'bottom-3 sm:bottom-4 right-3 sm:right-4'} flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#00000010] dark:border-[#ffffff10] bg-[#fbfbfd]/70 dark:bg-[#1c1c1e]/70 backdrop-blur-md shadow-sm`}>
                {onAbortStream && (
                    <button
                        onClick={onAbortStream}
                        className={roundIconButton}
                        data-tooltip="终止生成"
                        aria-label="终止生成"
                    >
                        <span className="h-2 w-2 rounded-[1px] bg-current" />
                    </button>
                )}
                {onClearRequest && (
                    <button
                        onClick={onClearRequest}
                        className={`${textActionButton} border-[#00000012] text-[#d70015] hover:bg-[#d70015]/8 dark:border-[#ffffff16] dark:text-[#ff6961] dark:hover:bg-[#ff6961]/10`}
                    >
                        清除
                    </button>
                )}
                {source.length === 0 && !showStatusPanel && !onAbortStream && !onClearRequest && (
                    <button
                        type="button"
                        onClick={() => void handlePasteButton()}
                        className={`${textActionButton} border-[#00000012] text-[#5e5e63] hover:bg-black/[0.04] dark:border-[#ffffff16] dark:text-[#98989d] dark:hover:bg-white/[0.06]`}
                        data-tooltip="粘贴"
                        aria-label="粘贴"
                    >
                        粘贴
                    </button>
                )}
                {onSelectAll && !onClearRequest && source.length > 0 && (
                    <button
                        onClick={onSelectAll}
                        className={`${textActionButton} border-[#00000012] dark:border-[#ffffff16] text-[#5e5e63] dark:text-[#98989d] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]`}
                    >
                        全选
                    </button>
                )}
                <span className="text-[12px] font-mono text-[#86868b] dark:text-[#a1a1a6]">
                    {source.length}{immersive ? '' : ' 字'}
                </span>
                <button
                    type="button"
                    data-tooltip="复制全部"
                    disabled={copied || !source}
                    onClick={() => void handleCopy()}
                    className={editorIconButton}
                >
                    {copied ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] border border-[#008847]/15 dark:border-[#5de086]/20">
                            <Check size={13} className="text-[#008847] dark:text-[#5de086]" />
                        </span>
                    ) : (
                        <Copy size={11} />
                    )}
                </button>
            </div>
        </div>
    );
}
