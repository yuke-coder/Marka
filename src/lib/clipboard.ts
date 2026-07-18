// 三级剪贴板读取策略：ClipboardItem（保留富 HTML）→ 纯文本 → execCommand 降级

export interface ClipboardContent {
    readonly text: string | null;
    readonly html: string | null;
}

export type ClipboardReader = Pick<Clipboard, 'read' | 'readText'>;

export function readClipboardViaTempElement(tag: 'textarea' | 'div'): string | null {
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

export async function readClipboardContent(
    clipboard: ClipboardReader | undefined = navigator.clipboard,
): Promise<ClipboardContent> {
    if (clipboard) {
        try {
            const items = await clipboard.read();
            let text: string | null = null;
            let html: string | null = null;
            for (const item of items) {
                if (text === null && item.types.includes('text/plain')) {
                    text = await (await item.getType('text/plain')).text();
                }
                if (html === null && item.types.includes('text/html')) {
                    html = await (await item.getType('text/html')).text();
                }
                if (text !== null && html !== null) break;
            }
            if (text !== null || html !== null) return { text, html };
        } catch { /* 降级 */ }

        try {
            const text = await clipboard.readText();
            if (text) return { text, html: null };
        } catch { /* 降级 */ }
    }
    let text = readClipboardViaTempElement('textarea');
    if (!text) text = readClipboardViaTempElement('div');
    return { text, html: null };
}

export async function readClipboardText(): Promise<string | null> {
    return (await readClipboardContent()).text;
}

export function decodeHtmlEntities(text: string) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

export function isInIframe(): boolean {
    try { return typeof window !== 'undefined' && window.self !== window.top; } catch { return true; }
}

export function fallbackCopyText(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
}

export function fallbackCopyHtml(html: string): void {
    const listener = (e: ClipboardEvent) => {
        e.clipboardData?.setData('text/html', html);
        e.clipboardData?.setData('text/plain', html.replace(/<[^>]*>/g, ''));
        e.preventDefault();
    };
    document.addEventListener('copy', listener);
    document.execCommand('copy');
    document.removeEventListener('copy', listener);
}
