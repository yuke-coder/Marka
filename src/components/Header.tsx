import { useState, useEffect } from 'react';
import { Moon, Sparkles, Sun } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
    themeMode: 'light' | 'dark';
    onToggleTheme: () => void;
    onOpenAi: () => void;
}

function formatDateTime(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const w = weekdays[date.getDay()];
    return {
        date: `${y}-${m}-${d} ${w}`,
        time: `${h}:${min}:${s}`,
    };
}

export default function Header({ themeMode, onToggleTheme, onOpenAi }: HeaderProps) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const { date, time } = formatDateTime(now);

    return (
        <header className="glass flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-[100]">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] flex items-center justify-center bg-black dark:bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_12px_rgba(255,255,255,0.15)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5 7.5L5 19H10.5C13.5376 19 16 16.5376 16 13.5C16 10.4624 13.5376 8 10.5 8H8.5V11.5L16.5 7.5Z" fill="var(--color-fg)" className="fill-white dark:fill-black" />
                        <path d="M8.5 4H10.5C15.7467 4 20 8.25329 20 13.5C20 18.7467 15.7467 23 10.5 23H4V4H8.5Z" fill="none" strokeWidth="2.5" stroke="currentColor" className="text-white dark:text-black" />
                        <path d="M4 11.5H8.5" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor" className="text-white dark:text-black" />
                    </svg>
                </div>
                <span className="font-bold text-lg tracking-tight text-black dark:text-white">Marka<span className="hidden sm:inline"> - 排版君</span></span>
            </div>

            <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-black/50 dark:text-white/50 tabular-nums">
                    <span className="hidden lg:inline text-xs">{date}</span>
                    <span className="text-xs font-mono font-medium text-black/70 dark:text-white/70">{time}</span>
                </div>
                <button
                    data-testid="ai-markdown-open"
                    onClick={onOpenAi}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-md border border-[#00000012] dark:border-[#ffffff16] text-[12px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] bg-white/45 dark:bg-white/[0.06] hover:bg-white/70 dark:hover:bg-white/[0.1] transition-colors active:scale-[0.97]"
                    title="AI 优化 Markdown"
                >
                    <Sparkles size={14} className="text-[#0066cc] dark:text-[#0a84ff]" />
                    <span className="hidden sm:inline">AI 优化</span>
                    <span className="sm:hidden">AI</span>
                </button>
                <div className="w-px h-4 bg-black/10 dark:bg-white/10 hidden sm:block" />
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onToggleTheme}
                    className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                    {themeMode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </motion.button>
            </div>
        </header>
    );
}
