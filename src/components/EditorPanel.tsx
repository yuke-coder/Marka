import React from 'react';
import { handleSmartPaste } from '../lib/htmlToMarkdown';

interface EditorPanelProps {
    markdownInput: string;
    onInputChange: (value: string) => void;
    editorScrollRef: React.RefObject<HTMLTextAreaElement>;
    onEditorScroll: () => void;
    scrollSyncEnabled: boolean;
    onSelectAll?: () => void;
    onClearRequest?: () => void;
}

export default function EditorPanel({ markdownInput, onInputChange, editorScrollRef, onEditorScroll, scrollSyncEnabled, onSelectAll, onClearRequest }: EditorPanelProps) {
    const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        handleSmartPaste(e, onInputChange);
    };

    return (
        <div className="border-r border-[#00000015] dark:border-[#ffffff15] flex flex-col relative z-30 bg-transparent flex-1 min-h-0">
            <textarea
                ref={editorScrollRef}
                data-testid="editor-input"
                className="w-full flex-1 p-6 sm:p-8 md:p-10 pb-14 sm:pb-16 resize-none bg-transparent outline-none font-mono text-[15px] md:text-[16px] leading-[1.8] no-scrollbar text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] dark:placeholder-[#6e6e73] scroll-touch"
                value={markdownInput}
                onChange={(e) => onInputChange(e.target.value)}
                onPaste={onPaste}
                onScroll={scrollSyncEnabled ? onEditorScroll : undefined}
                placeholder="在这里输入 Markdown 内容..."
                spellCheck={false}
            />

            {/* Bottom Action / Info Bar for Editor */}
            <div className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#00000010] dark:border-[#ffffff10] bg-[#fbfbfd]/70 dark:bg-[#1c1c1e]/70 backdrop-blur-md shadow-sm">
                {onClearRequest ? (
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
        </div>
    );
}
