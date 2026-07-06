// 三级剪贴板读取策略：navigator.clipboard → items 遍历 → execCommand 降级

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

export async function readClipboardText(): Promise<string | null> {
    if (navigator.clipboard) {
        try { return await navigator.clipboard.readText(); } catch { /* 降级 */ }
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                if (item.types.includes('text/plain')) {
                    return await (await item.getType('text/plain')).text();
                }
            }
        } catch { /* 降级 */ }
    }
    let text = readClipboardViaTempElement('textarea');
    if (!text) text = readClipboardViaTempElement('div');
    return text;
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
