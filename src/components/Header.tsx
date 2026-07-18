import { useState, useEffect } from 'react';
import { Moon, Sun, Maximize2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { ChatGPTIcon } from '../lib/modelIcons';

interface HeaderProps {
    themeMode: 'light' | 'dark';
    onToggleTheme: () => void;
    onOpenAi: () => void;
    onEnterImmersive: () => void;
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

export default function Header({ themeMode, onToggleTheme, onOpenAi, onEnterImmersive }: HeaderProps) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const { date, time } = formatDateTime(now);

    return (
        <header className="glass flex items-center justify-between px-4 sm:px-6 py-1.5 sm:py-2 sticky top-0 z-[100]">
            <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-white dark:bg-white">
                    <img
                        src="/marka-logo.png"
                        alt=""
                        className="h-8 w-8 object-contain"
                        draggable={false}
                    />
                </span>
                <span className="text-lg font-bold tracking-normal text-black dark:text-white">Marka<span className="hidden sm:inline"> - 排版君</span></span>
            </div>

            <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-black/50 dark:text-white/50 tabular-nums">
                    <span className="hidden lg:inline text-xs">{date}</span>
                    <span className="text-xs font-mono font-medium text-black/70 dark:text-white/70">{time}</span>
                </div>
                <button
                    data-testid="ai-markdown-open"
                    onClick={onOpenAi}
                    aria-label="AI 优化"
                    title="AI 优化"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#00000012] bg-white/45 text-[#1d1d1f] transition-colors hover:bg-white/70 active:scale-[0.97] dark:border-[#ffffff16] dark:bg-white/[0.06] dark:text-[#f5f5f7] dark:hover:bg-white/[0.1]"
                >
                    <ChatGPTIcon className="h-[18px] w-[18px]" />
                </button>
                <button
                    data-testid="immersive-toggle"
                    onClick={onEnterImmersive}
                    aria-label="沉浸编辑"
                    title="沉浸编辑"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#00000012] bg-white/45 text-[#1d1d1f] transition-colors hover:bg-white/70 active:scale-[0.97] dark:border-[#ffffff16] dark:bg-white/[0.06] dark:text-[#f5f5f7] dark:hover:bg-white/[0.1]"
                >
                    <Maximize2 size={17} />
                </button>
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
