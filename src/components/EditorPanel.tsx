import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { handleSmartPaste } from '../lib/htmlToMarkdown';

interface EditorPanelProps {
    markdownInput: string;
    onInputChange: (value: string) => void;
    editorScrollRef: React.RefObject<HTMLTextAreaElement>;
    onEditorScroll: () => void;
    scrollSyncEnabled: boolean;
    onSelectAll?: () => void;
    onClearRequest?: () => void;
    onAbortStream?: () => void;
    onRegenerateStream?: () => void;
    thinkingConnectionMs?: number;
    immersive?: boolean;
}

function formatConnectionTime(ms?: number) {
    if (typeof ms !== 'number') return '';
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function EditorPanel({ markdownInput, onInputChange, editorScrollRef, onEditorScroll, scrollSyncEnabled, onSelectAll, onClearRequest, onAbortStream, onRegenerateStream, thinkingConnectionMs, immersive }: EditorPanelProps) {
    const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        handleSmartPaste(e, onInputChange);
    };
    const isThinking = typeof thinkingConnectionMs === 'number';

    return (
        <div className="border-r border-[#00000015] dark:border-[#ffffff15] flex flex-col relative z-30 bg-transparent flex-1 min-h-0">
            <textarea
                ref={editorScrollRef}
                data-testid="editor-input"
                data-swipe-ignore="true"
                className="w-full flex-1 p-6 sm:p-8 md:p-10 pb-14 sm:pb-16 resize-none bg-transparent outline-none font-mono text-[15px] md:text-[16px] leading-[1.8] no-scrollbar text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] dark:placeholder-[#6e6e73] scroll-touch"
                value={markdownInput}
                onChange={(e) => onInputChange(e.target.value)}
                onPaste={onPaste}
                onScroll={scrollSyncEnabled ? onEditorScroll : undefined}
                placeholder={isThinking ? '' : '在这里输入 Markdown 内容...'}
                spellCheck={false}
            />
            {isThinking && (
                <div className="pointer-events-none absolute left-6 top-6 sm:left-8 sm:top-8 md:left-10 md:top-10">
                    <div className="ai-thinking-shimmer font-mono text-[15px] font-semibold leading-[1.8] md:text-[16px]" data-text="正在思考">
                        正在思考
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-[#86868b] dark:text-[#8e8e93]">
                        已连接模型 · {formatConnectionTime(thinkingConnectionMs)}
                    </div>
                </div>
            )}

            {/* Bottom Action / Info Bar for Editor */}
            {immersive ? (
                <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-sm">
                    <span className="text-[10px] font-mono text-[#86868b] dark:text-[#a1a1a6]">
                        {markdownInput.length}
                    </span>
                </div>
            ) : (
                <div className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#00000010] dark:border-[#ffffff10] bg-[#fbfbfd]/70 dark:bg-[#1c1c1e]/70 backdrop-blur-md shadow-sm">
                    {onAbortStream ? (
                        <button
                            onClick={onAbortStream}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#1d1d1f] bg-transparent text-[#1d1d1f] transition-all hover:bg-black/[0.06] active:scale-95 dark:border-[#f5f5f7] dark:text-[#f5f5f7] dark:hover:bg-white/[0.08]"
                            title="终止生成"
                            aria-label="终止生成"
                        >
                            <span className="h-2 w-2 rounded-[1px] bg-current" />
                        </button>
                    ) : onRegenerateStream ? (
                        <button
                            onClick={onRegenerateStream}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#1d1d1f] bg-transparent text-[#1d1d1f] transition-all hover:bg-black/[0.06] active:scale-95 dark:border-[#f5f5f7] dark:text-[#f5f5f7] dark:hover:bg-white/[0.08]"
                            title="重新生成"
                            aria-label="重新生成"
                        >
                            <RefreshCcw size={14} />
                        </button>
                    ) : onClearRequest ? (
                        <button
                            onClick={onClearRequest}
                            className="inline-flex h-6 items-center justify-center rounded-md border border-[#00000012] px-2 text-[11px] font-medium text-[#d70015] transition-all hover:bg-[#d70015]/8 active:scale-95 dark:border-[#ffffff16] dark:text-[#ff6961] dark:hover:bg-[#ff6961]/10"
                            title="清除"
                        >
                            清除
                        </button>
                    ) : onSelectAll && (
                        <button
                            onClick={onSelectAll}
                            className="inline-flex items-center justify-center h-6 px-2 rounded-md text-[11px] font-medium border border-[#00000012] dark:border-[#ffffff16] text-[#5e5e63] dark:text-[#98989d] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-95 transition-all select-none"
                            title="全选"
                        >
                            全选
                        </button>
                    )}
                    <span className="text-[12px] font-mono text-[#86868b] dark:text-[#a1a1a6]">
                        {markdownInput.length} 字
                    </span>
                </div>
            )}
        </div>
    );
}
