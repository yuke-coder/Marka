import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { md } from '../lib/markdown';
import { Check, ChevronDown, ChevronRight, Clipboard, Copy, Eraser, Loader2, RefreshCcw, RemoveFormatting, Sparkles, Wand2, X, Zap } from 'lucide-react';
import {
    DEFAULT_AI_MARKDOWN_MODEL,
    DEFAULT_AI_MARKDOWN_SPEED,
    DEFAULT_AI_REASONING_EFFORT,
    aiMarkdownModels,
    aiMarkdownSpeeds,
    aiReasoningEfforts,
    cleanAiMarkdown,
    fetchAiMarkdownModels,
    streamAiMarkdown,
    type AiApplyMode,
    type AiMarkdownModel,
    type AiMarkdownModelOption,
    type AiMarkdownRequest,
    type AiMarkdownMode,
    type AiMarkdownTask,
    type AiMarkdownSpeed,
    type AiReasoningEffort,
} from '../lib/aiMarkdown';
import { ZHOUZUOLUO_PROMPT } from '../lib/prompts/zhouZuoluo';
import { readClipboardText } from '../lib/clipboard';
import { removeMarkdownFormatting } from '../lib/markdownUtils';
import { mapRenderedPointToSource } from '../lib/promptCaret';

interface AiMarkdownDialogProps {
    isOpen: boolean;
    isDesktop: boolean;
    currentMarkdown: string;
    onClose: () => void;
    onApply: (markdown: string, mode: AiApplyMode) => void;
    onStreamReplace: (request: AiMarkdownRequest) => void;
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

const OFFICIAL_MODEL_ICON_PATHS = {
    openai: 'M249.176 323.434V298.276C249.176 296.158 249.971 294.569 251.825 293.509L302.406 264.381C309.29 260.409 317.5 258.555 325.973 258.555C357.75 258.555 377.877 283.185 377.877 309.399C377.877 311.253 377.877 313.371 377.611 315.49L325.178 284.771C322.001 282.919 318.822 282.919 315.645 284.771L249.176 323.434ZM367.283 421.415V361.301C367.283 357.592 365.694 354.945 362.516 353.092L296.048 314.43L317.763 301.982C319.617 300.925 321.206 300.925 323.058 301.982L373.639 331.112C388.205 339.586 398.003 357.592 398.003 375.069C398.003 395.195 386.087 413.733 367.283 421.412V421.415ZM233.553 368.452L211.838 355.742C209.986 354.684 209.19 353.095 209.19 350.975V292.718C209.19 264.383 230.905 242.932 260.301 242.932C271.423 242.932 281.748 246.641 290.49 253.26L238.321 283.449C235.146 285.303 233.555 287.951 233.555 291.659V368.455L233.553 368.452ZM280.292 395.462L249.176 377.985V340.913L280.292 323.436L311.407 340.913V377.985L280.292 395.462ZM300.286 475.968C289.163 475.968 278.837 472.259 270.097 465.64L322.264 435.449C325.441 433.597 327.03 430.949 327.03 427.239V350.445L349.011 363.155C350.865 364.213 351.66 365.802 351.66 367.922V426.179C351.66 454.514 329.679 475.965 300.286 475.965V475.968ZM237.525 416.915L186.944 387.785C172.378 379.31 162.582 361.305 162.582 343.827C162.582 323.436 174.763 305.164 193.563 297.485V357.861C193.563 361.571 195.154 364.217 198.33 366.071L264.535 404.467L242.82 416.915C240.967 417.972 239.377 417.972 237.525 416.915ZM234.614 460.343C204.689 460.343 182.71 437.833 182.71 410.028C182.71 407.91 182.976 405.792 183.238 403.672L235.405 433.863C238.582 435.715 241.763 435.715 244.938 433.863L311.407 395.466V420.622C311.407 422.742 310.612 424.331 308.758 425.389L258.179 454.519C251.293 458.491 243.083 460.343 234.611 460.343H234.614ZM300.286 491.854C332.329 491.854 359.073 469.082 365.167 438.892C394.825 431.211 413.892 403.406 413.892 375.073C413.892 356.535 405.948 338.529 391.648 325.552C392.972 319.991 393.766 314.43 393.766 308.87C393.766 271.003 363.048 242.666 327.562 242.666C320.413 242.666 313.528 243.723 306.644 246.109C294.725 234.457 278.307 227.042 260.301 227.042C228.258 227.042 201.513 249.815 195.42 280.004C165.761 287.685 146.694 315.49 146.694 343.824C146.694 362.362 154.638 380.368 168.938 393.344C167.613 398.906 166.819 404.467 166.819 410.027C166.819 447.894 197.538 476.231 233.024 476.231C240.172 476.231 247.058 475.173 253.943 472.788C265.859 484.441 282.278 491.854 300.286 491.854Z',
    deepseek: 'M26.5174 3.39471C26.235 3.2567 26.1137 3.52006 25.9487 3.65346C25.8923 3.69659 25.8446 3.75294 25.7969 3.80469C25.3846 4.24516 24.9027 4.53439 24.2737 4.49989C23.3536 4.44814 22.5682 4.73737 21.8735 5.44119C21.7258 4.57349 21.2353 4.0554 20.4889 3.72304C20.0985 3.55054 19.7034 3.37746 19.4297 3.00197C19.2388 2.73459 19.1865 2.43673 19.091 2.14289C19.0301 1.96579 18.9697 1.78466 18.7656 1.75418C18.5442 1.71968 18.4574 1.90541 18.3705 2.06067C18.0232 2.69549 17.8887 3.39471 17.9019 4.10313C17.9324 5.6965 18.6051 6.96556 19.9421 7.86834C20.0939 7.97184 20.133 8.07535 20.0852 8.22658C19.9938 8.53766 19.8857 8.83955 19.7903 9.15063C19.7293 9.34901 19.6384 9.39271 19.4257 9.30588C18.692 8.9994 18.0583 8.54571 17.4982 7.99772C16.5477 7.07827 15.6881 6.06336 14.6162 5.26869C14.3644 5.08296 14.1125 4.91045 13.8521 4.746C12.7584 3.68394 13.9952 2.81164 14.2816 2.70814C14.5812 2.60003 14.3857 2.22857 13.4179 2.23317C12.4502 2.2372 11.5646 2.56151 10.4359 2.99335C10.2708 3.05832 10.0972 3.10547 9.91951 3.14457C8.8954 2.95022 7.83162 2.90709 6.72069 3.03245C4.62877 3.26533 2.95777 4.25436 1.72954 5.94261C0.254043 7.97184 -0.0932678 10.2777 0.33167 12.6824C0.778458 15.2171 2.07225 17.3153 4.06008 18.9558C6.12152 20.6567 8.49577 21.4905 11.2047 21.3306C12.8498 21.2358 14.6812 21.0155 16.7473 19.2669C17.2682 19.5262 17.8151 19.6297 18.7219 19.7074C19.4205 19.7723 20.0933 19.6729 20.6143 19.5648C21.4302 19.3923 21.3739 18.6367 21.0789 18.4981C18.6874 17.3843 19.2124 17.8374 18.7351 17.4706C19.9501 16.033 21.8063 13.4776 22.379 9.99821C22.4353 9.61409 22.5072 9.073 22.4986 8.76192C22.494 8.57216 22.5377 8.49856 22.7545 8.47671C23.3536 8.40771 23.935 8.24383 24.4692 7.94999C26.0188 7.10357 26.6439 5.71318 26.7911 4.04678C26.8129 3.79204 26.7865 3.52869 26.5174 3.39471ZM13.0143 18.3946C10.6964 16.5724 9.5722 15.9726 9.10816 15.9985C8.67402 16.0244 8.75222 16.5212 8.84768 16.8449C8.94773 17.1646 9.07768 17.3849 9.25996 17.6655C9.38589 17.8512 9.47272 18.1272 9.13404 18.3348C8.38766 18.7965 7.08985 18.1796 7.0289 18.1491C5.51833 17.2595 4.25559 16.0853 3.36546 14.4793C2.50581 12.9337 2.0067 11.2753 1.92447 9.50542C1.90262 9.07818 2.02855 8.92695 2.45406 8.84932C3.01413 8.74582 3.59144 8.72397 4.15093 8.80619C6.51656 9.15178 8.53027 10.2092 10.2185 11.8848C11.1822 12.8388 11.9114 13.979 12.6623 15.0929C13.461 16.2757 14.3201 17.4027 15.4144 18.3268C15.8008 18.6505 16.109 18.8966 16.404 19.0783C15.5144 19.1778 14.0297 19.1991 13.0143 18.3958V18.3946ZM14.1252 11.2489C14.1252 11.0591 14.277 10.9079 14.4679 10.9079C14.511 10.9079 14.5501 10.9165 14.5852 10.9292C14.6329 10.9464 14.6766 10.9723 14.7111 11.0114C14.7721 11.0718 14.8066 11.158 14.8066 11.2489C14.8066 11.4386 14.6548 11.5899 14.4639 11.5899C14.273 11.5899 14.1252 11.4386 14.1252 11.2489ZM17.5759 13.0188C17.3545 13.1096 17.1331 13.1873 16.9203 13.1959C16.5903 13.2131 16.2303 13.0791 16.0348 12.9153C15.7312 12.6605 15.5139 12.5179 15.423 12.0734C15.3839 11.8837 15.4057 11.5899 15.4402 11.4214C15.5185 11.0585 15.4316 10.8257 15.1757 10.614C14.9676 10.4415 14.7025 10.3938 14.4115 10.3938C14.3029 10.3938 14.2034 10.3461 14.1292 10.3076C14.0079 10.2472 13.9078 10.096 14.0033 9.91023C14.0338 9.84985 14.1815 9.70322 14.216 9.67734C14.6111 9.45251 15.0665 9.52612 15.488 9.6946C15.8784 9.85445 16.174 10.1477 16.5989 10.5623C17.033 11.0631 17.1112 11.2011 17.3585 11.5772C17.554 11.871 17.7317 12.1729 17.8536 12.5185C17.9272 12.7341 17.8317 12.9107 17.5759 13.0188Z',
} as const;

const DOUBAO_ICON_PATHS: Array<{ d: string; opacity?: string }> = [
    { d: 'M5.31 15.756c.172-3.75 1.883-5.999 2.549-6.739-3.26 2.058-5.425 5.658-6.358 8.308v1.12C1.501 21.513 4.226 24 7.59 24a6.59 6.59 0 002.2-.375c.353-.12.7-.248 1.039-.378.913-.899 1.65-1.91 2.243-2.992-4.877 2.431-7.974.072-7.763-4.5l.002.001z', opacity: '.5' },
    { d: 'M22.57 10.283c-1.212-.901-4.109-2.404-7.397-2.8.295 3.792.093 8.766-2.1 12.773a12.782 12.782 0 01-2.244 2.992c3.764-1.448 6.746-3.457 8.596-5.219 2.82-2.683 3.353-5.178 3.361-6.66a2.737 2.737 0 00-.216-1.084v-.002zM14.303 1.867C12.955.7 11.248 0 9.39 0 7.532 0 5.883.677 4.545 1.807 2.791 3.29 1.627 5.557 1.5 8.125v9.201c.932-2.65 3.097-6.25 6.357-8.307.5-.318 1.025-.595 1.569-.829 1.883-.801 3.878-.932 5.746-.706-.222-2.83-.718-5.002-.87-5.617h.001z' },
    { d: 'M17.305 4.961a199.47 199.47 0 01-1.08-1.094c-.202-.213-.398-.419-.586-.622l-1.333-1.378c.151.615.648 2.786.869 5.617 3.288.395 6.185 1.898 7.396 2.8-1.306-1.275-3.475-3.487-5.266-5.323z', opacity: '.5' },
];

function ModelIcon({ modelId }: { modelId: AiMarkdownModel }) {
    const id = modelId.toLowerCase();
    const isOpenAI = /^(gpt-|o\d|chatgpt)/.test(id);
    const isDeepSeek = id.startsWith('deepseek-');
    const isDoubao = id.startsWith('doubao-') || id.startsWith('ark-');

    if (!isOpenAI && !isDeepSeek && !isDoubao) {
        return <span className="h-4 w-4 shrink-0" aria-hidden="true" />;
    }

    return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#5f6672] dark:text-[#d8d8dc]" aria-hidden="true">
            <svg viewBox={isDoubao ? '0 0 24 24' : isDeepSeek ? '0 0 27 22' : '146 227 268 265'} className="h-3.5 w-3.5" fill="currentColor">
                {isDoubao
                    ? DOUBAO_ICON_PATHS.map((path, index) => <path key={index} d={path.d} fillOpacity={path.opacity} />)
                    : <path d={isDeepSeek ? OFFICIAL_MODEL_ICON_PATHS.deepseek : OFFICIAL_MODEL_ICON_PATHS.openai} />}
            </svg>
        </span>
    );
}

export default function AiMarkdownDialog(props: AiMarkdownDialogProps) {
    const { isOpen, isDesktop, currentMarkdown, onClose, onApply, onStreamReplace, showNotice } = props;
    const [mode, setMode] = useState<AiMarkdownMode>('format');
    const [model, setModel] = useState<AiMarkdownModel>(DEFAULT_AI_MARKDOWN_MODEL);
    const [reasoningEffort, setReasoningEffort] = useState<AiReasoningEffort>(DEFAULT_AI_REASONING_EFFORT);
    const [speed, setSpeed] = useState<AiMarkdownSpeed>(DEFAULT_AI_MARKDOWN_SPEED);
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
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsSubmenu, setSettingsSubmenu] = useState<null | 'model' | 'speed'>(null);
    const [settingsSubmenuOffset, setSettingsSubmenuOffset] = useState(-10);
    const [modelOptions, setModelOptions] = useState<AiMarkdownModelOption[]>(aiMarkdownModels);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [sheetHeight, setSheetHeight] = useState(88);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [modeDrag, setModeDrag] = useState(0);
    const [isModeDragging, setIsModeDragging] = useState(false);
    const [isPromptRendered, setIsPromptRendered] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const streamedRef = useRef('');
    const settingsDetailsRef = useRef<HTMLDivElement>(null);
    const sourceTextRef = useRef('');
    const hasSourceTextRef = useRef(false);
    const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
    const sourceLengthRef = useRef<HTMLSpanElement>(null);
    const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
    const promptOverlayRef = useRef<HTMLDivElement>(null);
    const promptScrollTopRef = useRef(0);
    const modeTipTimerRef = useRef<number | null>(null);
    const modeTipStartedAtRef = useRef(0);
    const modeTipRemainingRef = useRef(MODE_TIP_DURATION);
    const modeSwipeRef = useRef<{ startX: number; startY: number; locked: false | 'h' | 'v' }>({ startX: 0, startY: 0, locked: false });
    const showNoticeRef = useRef(showNotice);

    const isGenerating = phase === 'generating';
    const canGenerate = hasSourceText && !isGenerating;
    const showOutput = phase !== 'idle' || Boolean(result);
    const prefersReducedMotion = useReducedMotion();

    useEffect(() => {
        showNoticeRef.current = showNotice;
    }, [showNotice]);

    useEffect(() => {
        if (!isOpen) {
            abortRef.current?.abort();
            setConfirmingReplace(false);
            setSettingsOpen(false);
            setSettingsSubmenu(null);
            setSettingsSubmenuOffset(-10);
            setModeTip(null);
            setIsFullscreen(false);
            setSheetHeight(88);
            if (modeTipTimerRef.current) window.clearTimeout(modeTipTimerRef.current);
            setIsModeTipPaused(false);
            setIsPromptRendered(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let alive = true;
        setIsLoadingModels(true);

        fetchAiMarkdownModels()
            .then((models) => {
                if (!alive) return;
                if (!models.length) {
                    showNoticeRef.current('模型列表为空', '当前 OpenAI 账号没有返回可用于文本生成的模型', 'error');
                    return;
                }
                setModelOptions(models);
                setModel(current => models.some(item => item.id === current) ? current : models[0].id);
            })
            .catch((err) => {
                if (!alive) return;
                showNoticeRef.current('模型列表获取失败', err instanceof Error ? err.message : '请检查网络、代理或 API Key', 'error');
            })
            .finally(() => {
                if (alive) setIsLoadingModels(false);
            });

        return () => {
            alive = false;
        };
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
        setExtraInstruction(prev => prev ? `${prev}\n${text}` : text);
        showNotice('已粘贴', '剪贴板内容已粘贴到 Prompt 输入框', 'success');
    }, [showNotice]);

    const syncPromptScroll = useCallback((scrollTop: number) => {
        promptScrollTopRef.current = scrollTop;
        if (promptOverlayRef.current) promptOverlayRef.current.scrollTop = scrollTop;
    }, []);

    const clearExtraInstruction = useCallback(() => {
        setExtraInstruction('');
        setIsPromptRendered(false);
        syncPromptScroll(0);
        showNotice('已清除', 'Prompt 输入框已清空', 'success');
    }, [showNotice, syncPromptScroll]);

    const handleZhouZuoluoClick = useCallback(() => {
        setExtraInstruction(ZHOUZUOLUO_PROMPT);
        setIsPromptRendered(true);
        syncPromptScroll(0);
    }, [syncPromptScroll]);

    const clearExtraFormatting = useCallback(() => {
        setExtraInstruction(prev => removeMarkdownFormatting(prev));
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

    useEffect(() => {
        if (isPromptRendered && promptOverlayRef.current) {
            promptOverlayRef.current.scrollTop = promptScrollTopRef.current;
        } else if (promptTextareaRef.current) {
            promptTextareaRef.current.scrollTop = promptScrollTopRef.current;
        }
    }, [isPromptRendered]);

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
                { mode, model, reasoningEffort, speed, task, sourceText: text, extraInstruction: instruction },
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
    }, [currentMarkdown, extraInstruction, followup, mode, model, onApply, reasoningEffort, result, showNotice, speed]);

    const startStreamReplace = useCallback(() => {
        onStreamReplace({
            mode,
            model,
            reasoningEffort,
            speed,
            task: 'generate',
            sourceText: sourceTextareaRef.current?.value ?? sourceTextRef.current,
            extraInstruction,
        });
    }, [extraInstruction, mode, model, onStreamReplace, reasoningEffort, speed]);

    const askConfirm = useCallback(() => {
        if (!canGenerate) return;
        if (!currentMarkdown.trim()) {
            startStreamReplace();
            return;
        }
        setConfirmingReplace(true);
    }, [canGenerate, currentMarkdown, startStreamReplace]);

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

    const changeReasoningEffort = (next: AiReasoningEffort) => {
        const item = aiReasoningEfforts.find(option => option.id === next);
        if (!item) {
            showNotice('修改失败', '未找到对应的推理等级', 'error');
            return;
        }
        if (reasoningEffort === item.id) {
            closeSettingsMenu();
            return;
        }
        setReasoningEffort(item.id);
        closeSettingsMenu();
        showNotice('修改成功', `推理等级已切换为 ${item.label}`, 'success');
    };

    const changeModel = (next: AiMarkdownModel) => {
        const item = modelOptions.find(option => option.id === next);
        if (!item) {
            showNotice('修改失败', '未找到对应的模型配置', 'error');
            return;
        }
        if (model === item.id) {
            closeSettingsMenu();
            return;
        }
        setModel(item.id);
        closeSettingsMenu();
        showNotice('修改成功', `模型已切换为 ${item.label}`, 'success');
    };

    const changeSpeed = (next: AiMarkdownSpeed) => {
        const item = aiMarkdownSpeeds.find(option => option.id === next);
        if (!item) {
            showNotice('修改失败', '未找到对应的速度配置', 'error');
            return;
        }
        if (speed === item.id) {
            closeSettingsMenu();
            return;
        }
        setSpeed(item.id);
        closeSettingsMenu();
        showNotice('修改成功', `速度已切换为 ${item.label}`, 'success');
    };

    const handlePromptOverlayPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (isGenerating || event.button !== 0) return;
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
    }, [extraInstruction, isGenerating]);

    const renderPromptField = (mobile: boolean) => (
        <div className={mobile ? 'relative flex min-h-0 flex-1 flex-col' : 'relative min-h-0 flex-1'}>
            <textarea
                ref={promptTextareaRef}
                data-testid="ai-extra-instruction"
                value={extraInstruction}
                onChange={(e) => setExtraInstruction(e.target.value)}
                onScroll={(e) => syncPromptScroll(e.currentTarget.scrollTop)}
                onFocus={() => setIsPromptRendered(false)}
                onBlur={(e) => {
                    syncPromptScroll(e.currentTarget.scrollTop);
                    if (extraInstruction.trim()) setIsPromptRendered(true);
                }}
                className={`${promptFieldClass} ${mobile ? 'h-full min-h-[72px] flex-1' : 'h-full min-h-[160px] flex-1'} ${isPromptRendered && extraInstruction ? 'text-transparent caret-transparent' : ''}`}
                placeholder={mode === 'format' ? '' : '例如：改成更适合公众号发布的表达，但不要加入新事实'}
                disabled={isGenerating}
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
            {mode === 'format' && !extraInstruction && (
                <div className="pointer-events-none absolute left-3 top-2.5 flex flex-wrap items-center gap-1 text-[13px] text-[#9a9aa0]">
                    <span>例如：保留原文顺序，适当加标题和重点加粗</span>
                    <button
                        type="button"
                        onClick={handleZhouZuoluoClick}
                        className={`pointer-events-auto inline-flex items-center rounded-[4px] bg-[#eef0f4] px-1.5 py-0.5 text-[11px] font-medium text-[#4b5563] transition-colors active:scale-95 dark:bg-[#2c2c2e] dark:text-[#d1d1d6] ${mobile ? 'active:bg-[#e4e7ec] dark:active:bg-[#3a3a3c]' : 'hover:bg-[#e4e7ec] dark:hover:bg-[#3a3a3c]'}`}
                    >
                        粥左罗
                    </button>
                </div>
            )}
        </div>
    );

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
                    disabled={isGenerating}
                    onClick={() => setSettingsOpen(open => {
                        const next = !open;
                        if (!next) setSettingsSubmenu(null);
                        return next;
                    })}
                    className={`flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md bg-[#eef0f4] px-2.5 text-[12px] font-medium text-[#1d1d1f] shadow-[inset_0_0_0_1px_rgba(29,29,31,0.08)] transition-colors ${mobile ? 'active:bg-[#e4e7ec] dark:active:bg-[#3b3b3e]' : 'hover:bg-[#e4e7ec] dark:hover:bg-[#3b3b3e]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:bg-[#303033] dark:text-[#f5f5f7] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] ${isGenerating ? 'cursor-not-allowed opacity-55' : ''}`}
                >
                    <ModelIcon modelId={selectedModel.id} />
                    <span>{selectedModel.label}</span>
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
                                        <span>{selectedModel.label}</span>
                                    </span>
                                    <ChevronRight size={13} className="text-[#69707d] dark:text-[#a1a1a6]" />
                                </button>
                                <div
                                    className={mobile ? (settingsSubmenu === 'model' ? mobileSubmenuClass : 'hidden') : desktopSubmenuClass}
                                    style={{ top: settingsSubmenuOffset }}
                                >
                                    <div className="px-2 pb-1 pt-1 text-[12px] font-semibold text-[#69707d] dark:text-[#a1a1a6]">模型</div>
                                    {isLoadingModels ? (
                                        <div className="px-2 py-1.5 text-[12px] font-medium text-[#69707d] dark:text-[#a1a1a6]">正在获取模型...</div>
                                    ) : modelOptions.map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => changeModel(item.id)}
                                            className={`${menuItemClass} ${model === item.id ? selectedItemClass : ''}`}
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                <ModelIcon modelId={item.id} />
                                                <span>{item.label}</span>
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
        const iconSize = compact ? Math.max(10, Math.min(14, Math.round(sheetHeight * 0.15))) : 13;
        if (isGenerating) {
            return (
                <>
                    <button onClick={onClose} disabled className={gb}>取消</button>
                    <button
                        onClick={stopGenerating}
                        aria-label="打断输出"
                        data-tooltip="打断输出"
                        className={`inline-flex items-center justify-center rounded-md bg-[#1d1d1f] text-white transition-colors hover:bg-[#2f3137] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:bg-[#f5f5f7] ${compact ? 'h-[clamp(20px,calc(var(--sh)*0.03),28px)] w-[clamp(20px,calc(var(--sh)*0.03),28px)]' : 'h-8 w-8'}`}
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
                        <button onClick={() => void run('continue', applyMode)} className={pb}>
                            <Sparkles size={iconSize} />
                            继续生成
                        </button>
                    )}
                    <button onClick={() => void run('generate', applyMode)} className={gb}>
                        <RefreshCcw size={iconSize} />
                        重新生成
                    </button>
                    <button onClick={() => void run('revise', applyMode)} disabled={!followup.trim()} className={pb}>
                        <Wand2 size={iconSize} />
                        继续优化
                    </button>
                </>
            );
        }

        return (
            <>
                <button onClick={onClose} className={gb}>取消</button>
                <button onClick={askConfirm} disabled={!canGenerate} className={pb}>
                    生成 Markdown
                </button>
            </>
        );
    };

    const inputPane = (
        <section className="flex min-h-0 flex-col gap-3">
            <div className="shrink-0">{renderModeSwitch()}</div>
            <div className="flex min-h-0 flex-[1.6] flex-col">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                        <span className={labelClass}>纯文本内容</span>
                        <button
                            type="button"
                            aria-label="复制纯文本内容"
                            disabled={copiedFields.source || !hasSourceText}
                            onClick={() => void copyField('source', sourceTextareaRef.current?.value ?? sourceTextRef.current)}
                            className={iconButton}
                        >
                            {copiedFields.source ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                        </button>
                        <span ref={sourceLengthRef} className="text-[11px] text-[#86868b] dark:text-[#8e8e93]">{sourceTextRef.current.length} 字</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <button type="button" onClick={() => void pasteSourceText()} disabled={isGenerating} className={desktopFieldButton}>
                            <Clipboard size={11} />
                            粘贴
                        </button>
                        {hasSourceText && (
                            <>
                                <button type="button" onClick={clearSourceFormatting} disabled={isGenerating} className={desktopFieldButton}>
                                    <RemoveFormatting size={11} />
                                    清除格式
                                </button>
                                <button type="button" onClick={clearSourceText} disabled={isGenerating} className={desktopFieldButton}>
                                    <Eraser size={11} />
                                    清除
                                </button>
                            </>
                        )}
                    </span>
                </div>
                <textarea
                    ref={sourceTextareaRef}
                    data-testid="ai-source-text"
                    aria-label="纯文本内容"
                    defaultValue={sourceTextRef.current}
                    onInput={(e) => syncSourceText(e.currentTarget.value)}
                    className={`${fieldClass} h-full min-h-[360px] flex-1`}
                    placeholder="粘贴需要转换的纯文本..."
                    disabled={isGenerating}
                />
            </div>

            <div className="flex min-h-0 flex-[1.1] flex-col">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                        <span className={labelClass}>Prompt</span>
                        <button
                            type="button"
                            aria-label="复制 Prompt"
                            disabled={copiedFields.extra || !extraInstruction}
                            onClick={() => void copyField('extra', extraInstruction)}
                            className={iconButton}
                        >
                            {copiedFields.extra ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                        </button>
                        <span className="text-[11px] text-[#86868b] dark:text-[#8e8e93]">{extraInstruction.length} 字</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <button type="button" onClick={() => void pasteExtraInstruction()} disabled={isGenerating} className={desktopFieldButton}>
                            <Clipboard size={11} />
                            粘贴
                        </button>
                        {extraInstruction && (
                            <>
                                <button type="button" onClick={clearExtraFormatting} disabled={isGenerating} className={desktopFieldButton}>
                                    <RemoveFormatting size={11} />
                                    清除格式
                                </button>
                                <button type="button" onClick={clearExtraInstruction} disabled={isGenerating} className={desktopFieldButton}>
                                    <Eraser size={11} />
                                    清除
                                </button>
                            </>
                        )}
                    </span>
                </div>
                {renderPromptField(false)}
            </div>
        </section>
    );

    const mobileInputPane = (
        <section className="flex min-h-0 flex-1 flex-col gap-3" style={{ minHeight: '260px' }}>
            <div className="flex min-h-0 flex-[2] flex-col">
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                        <span className={labelClass}>纯文本内容</span>
                        <button
                            type="button"
                            aria-label="复制纯文本内容"
                            disabled={copiedFields.source || !hasSourceText}
                            onClick={() => void copyField('source', sourceTextareaRef.current?.value ?? sourceTextRef.current)}
                            className={iconButton}
                        >
                            {copiedFields.source ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                        </button>
                        <span ref={sourceLengthRef} className="text-[11px] text-[#86868b] dark:text-[#8e8e93]">{sourceTextRef.current.length} 字</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <button type="button" onClick={() => void pasteSourceText()} disabled={isGenerating} className={compactFieldButton}>
                            <Clipboard size={11} />
                            粘贴
                        </button>
                        {hasSourceText && (
                            <>
                                <button type="button" onClick={clearSourceFormatting} disabled={isGenerating} className={compactFieldButton}>
                                    <RemoveFormatting size={11} />
                                    清除格式
                                </button>
                                <button type="button" onClick={clearSourceText} disabled={isGenerating} className={compactFieldButton}>
                                    <Eraser size={11} />
                                    清除
                                </button>
                            </>
                        )}
                    </span>
                </div>
                <textarea
                    ref={sourceTextareaRef}
                    data-testid="ai-source-text"
                    aria-label="纯文本内容"
                    defaultValue={sourceTextRef.current}
                    onInput={(e) => syncSourceText(e.currentTarget.value)}
                    className={`${fieldClass} h-full min-h-[120px] flex-1`}
                    placeholder="粘贴需要转换的纯文本..."
                    disabled={isGenerating}
                />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                        <span className={labelClass}>Prompt</span>
                        <button
                            type="button"
                            aria-label="复制 Prompt"
                            disabled={copiedFields.extra || !extraInstruction}
                            onClick={() => void copyField('extra', extraInstruction)}
                            className={iconButton}
                        >
                            {copiedFields.extra ? <Check size={11} className="text-[#008847] dark:text-[#5de086]" /> : <Copy size={11} />}
                        </button>
                        <span className="text-[11px] text-[#86868b] dark:text-[#8e8e93]">{extraInstruction.length} 字</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <button type="button" onClick={() => void pasteExtraInstruction()} disabled={isGenerating} className={compactFieldButton}>
                            <Clipboard size={11} />
                            粘贴
                        </button>
                        {extraInstruction && (
                            <>
                                <button type="button" onClick={clearExtraFormatting} disabled={isGenerating} className={compactFieldButton}>
                                    <RemoveFormatting size={11} />
                                    清除格式
                                </button>
                                <button type="button" onClick={clearExtraInstruction} disabled={isGenerating} className={compactFieldButton}>
                                    <Eraser size={11} />
                                    清除
                                </button>
                            </>
                        )}
                    </span>
                </div>
                {renderPromptField(true)}
            </div>
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
                            startStreamReplace();
                        }}
                        className={primaryButton}
                    >
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
                    onClick={(event) => { event.stopPropagation(); setModeTip(null); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0 rounded-md p-1 text-[#86868b] transition-colors hover:bg-black/[0.06] hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/35 dark:text-[#a1a1a6] dark:hover:bg-white/[0.08] dark:hover:text-[#f5f5f7]"
                >
                    <X size={14} />
                </button>
                <div
                    className="mode-tip-progress absolute bottom-0 left-0 right-0 h-0.5 bg-[#0a84ff] dark:bg-[#64aaff]"
                    style={{ animationDuration: `${MODE_TIP_DURATION}ms` }}
                />
            </motion.div>
        )
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
                        onClick={() => !isGenerating && !isFullscreen && onClose()}
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
                                className={`${showOutput ? 'h-[min(96vh,920px)] w-[1500px]' : 'h-[min(96vh,860px)] w-[900px]'} grid max-w-[calc(100vw-32px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg bg-[#fbfcfe] shadow-[0_28px_80px_rgba(15,23,42,0.22)] dark:bg-[#1c1c1e]`}
                            >
                                <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        {renderSettingsControl()}
                                        <h2 className="truncate text-[16px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">AI 优化 Markdown</h2>
                                    </div>
                                    <button onClick={onClose} disabled={isGenerating} className="rounded-md p-1.5 text-[#69707d] hover:bg-black/[0.05] disabled:opacity-50 dark:text-[#a1a1a6] dark:hover:bg-white/[0.08]">
                                        <X size={18} />
                                    </button>
                                </header>
                                <main className={`grid min-h-0 ${showOutput ? 'grid-cols-[0.95fr_1.05fr] gap-6' : 'grid-cols-1'} overflow-hidden px-7 py-4`}>
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
                            animate={{
                                opacity: 1,
                                y: 0,
                                top: isFullscreen ? 0 : 'auto',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: isFullscreen ? '100vh' : `${sheetHeight}vh`,
                                borderTopLeftRadius: isFullscreen ? 0 : 14,
                                borderTopRightRadius: isFullscreen ? 0 : 14,
                            }}
                            exit={{ opacity: 0, y: '100%' }}
                            transition={isDragging
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
                            className={`fixed z-[201] grid overflow-hidden bg-[#fbfcfe] shadow-[0_-22px_64px_rgba(15,23,42,0.2)] dark:bg-[#1c1c1e] will-change-transform`}
                            style={{
                                gridTemplateRows: 'auto minmax(0, 1fr) auto',
                                '--sh': isFullscreen ? '100vh' : `${sheetHeight}vh`,
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
                                            <h2 className="text-[20px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">AI 优化</h2>
                                        </div>
                                        <p className="mt-0.5 truncate text-[12px] text-[#69707d] dark:text-[#a1a1a6]">{status}</p>
                                    </div>
                                    <button onClick={onClose} disabled={isGenerating} className="rounded-md p-1.5 text-[#69707d] active:bg-black/[0.06] disabled:opacity-50 dark:text-[#a1a1a6] dark:active:bg-white/[0.08]">
                                        <X size={20} />
                                    </button>
                                </div>
                                {renderModeSwitch(true)}
                            </header>
                            <main className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
                                {mobileInputPane}
                                {showOutput && renderOutputPane()}
                            </main>
                            <footer className={`flex items-center justify-end gap-[clamp(2px,calc(var(--sh)*0.006),6px)] bg-[#fbfcfe]/96 px-[clamp(8px,calc(var(--sh)*0.012),12px)] py-[clamp(2px,calc(var(--sh)*0.006),6px)] shadow-[0_-14px_26px_rgba(15,23,42,0.06)] backdrop-blur dark:bg-[#1c1c1e]/95 dark:shadow-[0_-14px_26px_rgba(0,0,0,0.18)] ${isFullscreen ? 'pb-[max(env(safe-area-inset-bottom),3px)]' : ''}`}>
                                {renderActions({ compact: true })}
                            </footer>
                        </motion.div>
                    )}
                        <AnimatePresence>{confirmReplaceDialog}</AnimatePresence>
                    </>
                )}
            </AnimatePresence>
            <AnimatePresence>{modeTipNotice}</AnimatePresence>
        </>,
        document.body
    );
}
