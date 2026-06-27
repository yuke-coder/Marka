import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { THEMES, THEME_GROUPS, type Theme } from '../lib/themes';

interface ThemeSelectorProps {
    activeTheme: string;
    onThemeChange: (themeId: string) => void;
}

function extractStyle(styleStr: string, prop: string): string | null {
    const regex = new RegExp(`${prop}\\s*:\\s*([^;!]+)`, 'i');
    const match = styleStr.match(regex);
    return match ? match[1].trim() : null;
}

function ThemeSwatch({ styles }: { styles: Record<string, string> }) {
    const bg = extractStyle(styles.container || '', 'background-color') || '#fff';
    const textColor = extractStyle(styles.p || '', 'color') || '#333';
    const h1Color = extractStyle(styles.h1 || '', 'color') || textColor;
    const accentColor = extractStyle(styles.a || styles.blockquote || '', 'color') || h1Color;

    return (
        <div className="flex gap-[2px] h-4 rounded overflow-hidden border border-[#00000015] dark:border-[#ffffff15]" style={{ width: '40px' }}>
            <div className="flex-1" style={{ backgroundColor: bg }} />
            <div className="flex-1" style={{ backgroundColor: h1Color }} />
            <div className="flex-1" style={{ backgroundColor: accentColor }} />
            <div className="flex-1" style={{ backgroundColor: textColor }} />
        </div>
    );
}

const tbH = 'inline-flex items-center justify-center h-7 rounded-md text-[12px] font-medium transition-all duration-150 border select-none shrink-0 whitespace-nowrap';
const idleStyle = 'border-[#00000010] dark:border-[#ffffff16] text-[#5e5e63] dark:text-[#98989d] bg-transparent hover:border-[#00000025] dark:hover:border-[#ffffff28] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/[0.03] dark:hover:bg-white/[0.05] active:scale-[0.96]';

const segWrap = 'inline-flex items-center p-0.5 rounded-lg bg-black/[0.035] dark:bg-white/[0.055] border border-[#0000000c] dark:border-[#ffffff12] shrink-0 max-w-full overflow-x-auto no-scrollbar';
const pillBtn = 'inline-flex items-center justify-center h-6 px-3 rounded-[5px] text-[12px] font-medium transition-all duration-200 select-none whitespace-nowrap';
const pillOn = 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] shadow-[0_1px_2px_rgba(0,0,0,0.07)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)]';
const pillOff = 'text-[#8e8e93] dark:text-[#8a8a8f] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-95';

function DesktopThemeDropdown({
    isOpen,
    onClose,
    activeTheme,
    onThemeChange,
    buttonRef,
}: {
    isOpen: boolean;
    onClose: () => void;
    activeTheme: string;
    onThemeChange: (id: string) => void;
    buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
    const [showBottomFade, setShowBottomFade] = useState(true);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const scrollRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        setShowBottomFade(scrollHeight - scrollTop - clientHeight > 20);
    };

    useEffect(() => {
        if (isOpen && scrollRef.current) {
            handleScroll();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const updatePosition = () => {
                const rect = buttonRef.current!.getBoundingClientRect();
                setPosition({ top: rect.bottom + 6, left: rect.left });
            };
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [isOpen, buttonRef]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    const panel = (
        <AnimatePresence>
        {isOpen && (
            <motion.div
                ref={panelRef}
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                className="fixed z-[96] w-[580px] md:w-[640px] bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-apple-lg border border-[#00000015] dark:border-[#ffffff15] overflow-hidden"
                style={{
                    top: position.top,
                    left: position.left,
                    maxHeight: 'min(70vh, 560px)',
                    transformOrigin: 'top left',
                }}
            >
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <span className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">选择排版风格 · {THEMES.length} 款</span>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-[#00000008] dark:hover:bg-[#ffffff10] active:bg-[#00000012] dark:active:bg-[#ffffff18] transition-colors"
                    >
                        <X size={16} className="text-[#86868b]" />
                    </button>
                </div>

                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="overflow-y-auto px-5 pb-5"
                    style={{ maxHeight: 'min(calc(70vh - 56px), 504px)', WebkitOverflowScrolling: 'touch' }}
                >
                    {THEME_GROUPS.map((group, groupIdx) => (
                        <div key={group.label}>
                            <div className={`flex items-center gap-2 ${groupIdx > 0 ? 'mt-4 pt-4 border-t border-[#00000010] dark:border-[#ffffff10]' : 'mt-1'}`}>
                                <span className="text-[12px] font-semibold text-[#86868b] dark:text-[#a1a1a6] uppercase tracking-widest">{group.label}</span>
                                <span className="text-[11px] text-[#b0b0b5] dark:text-[#666]">{group.themes.length} 款</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                                {group.themes.map(theme => (
                                    <button
                                        key={theme.id}
                                        onClick={() => {
                                            onThemeChange(theme.id);
                                            onClose();
                                        }}
                                        className={`relative flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all
                                                ${activeTheme === theme.id
                                                ? 'bg-[#0066cc]/8 dark:bg-[#0a84ff]/10 ring-2 ring-[#0066cc] dark:ring-[#0a84ff]'
                                                : 'bg-[#f5f5f7] dark:bg-[#2c2c2e] hover:bg-[#ebebed] dark:hover:bg-[#3a3a3c] active:bg-[#ebebed] dark:active:bg-[#3a3a3c]'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between w-full">
                                            <ThemeSwatch styles={theme.styles} />
                                            {activeTheme === theme.id && <Check size={14} className="text-[#0066cc] dark:text-[#0a84ff]" />}
                                        </div>
                                        <span className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] leading-tight">{theme.name}</span>
                                        <span className="text-[11px] text-[#86868b] dark:text-[#8a8a8f] leading-snug line-clamp-2">{theme.description}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div
                    className={`pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-[#1c1c1e] to-transparent transition-opacity duration-200 rounded-b-2xl ${showBottomFade ? 'opacity-100' : 'opacity-0'}`}
                />
            </motion.div>
        )}
        </AnimatePresence>
    );

    return createPortal(panel, document.body);
}

export default function ThemeSelector({ activeTheme, onThemeChange }: ThemeSelectorProps) {
    const [isThemeOpen, setIsThemeOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const selectedThemeName = THEMES.find(t => t.id === activeTheme)?.name;

    const pillThemeIds = ['apple', 'claude', 'wechat', 'sspai'];
    const pillThemes: Theme[] = pillThemeIds
        .map(id => THEMES.find(theme => theme.id === id))
        .filter((theme): theme is Theme => Boolean(theme));
    const isInDropdown = !pillThemes.some(theme => theme.id === activeTheme);

    return (
        <div className="flex items-center gap-2 px-3 lg:px-4 py-2 min-w-0 shrink-0">
            <div className={segWrap} role="group" aria-label="排版风格">
                {pillThemes.map(theme => (
                    <button
                        key={theme.id}
                        onClick={() => onThemeChange(theme.id)}
                        className={`${pillBtn} ${activeTheme === theme.id ? pillOn : pillOff}`}
                    >
                        {theme.name.split(' ')[0]}
                    </button>
                ))}
            </div>

            <div className="relative shrink-0">
                <button
                    ref={buttonRef}
                    onClick={() => setIsThemeOpen(!isThemeOpen)}
                    className={`${tbH} gap-1 px-2.5 ${isInDropdown
                        ? 'border-[#0066cc]/35 dark:border-[#0a84ff]/35 text-[#0066cc] dark:text-[#0a84ff] bg-[#0066cc]/7 dark:bg-[#0a84ff]/10'
                        : idleStyle
                        }`}
                >
                    <span className="hidden sm:inline">{isInDropdown ? selectedThemeName : `全部 ${THEMES.length} 款`}</span>
                    <span className="sm:hidden">全部</span>
                    <ChevronDown size={12} className={`transition-transform duration-300 ${isThemeOpen ? 'rotate-180' : ''}`} />
                </button>

                <DesktopThemeDropdown
                    isOpen={isThemeOpen}
                    onClose={() => setIsThemeOpen(false)}
                    activeTheme={activeTheme}
                    onThemeChange={onThemeChange}
                    buttonRef={buttonRef}
                />
            </div>

            <div className="hidden 2xl:flex items-center ml-1 pl-3 border-l border-[#00000010] dark:border-[#ffffff12] min-w-0">
                <p className="text-[12px] text-[#86868b] dark:text-[#8a8a8f] font-medium tracking-wide truncate max-w-[360px]">
                    <span className="text-[#1d1d1f] dark:text-[#f5f5f7] font-semibold mr-1">{THEMES.find(t => t.id === activeTheme)?.name}</span>
                    <span className="text-[#8e8e93] dark:text-[#6c6c70]">{THEMES.find(t => t.id === activeTheme)?.description}</span>
                </p>
            </div>
        </div>
    );
}
