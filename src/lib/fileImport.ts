// 拖拽导入：md/txt/html 直接读取为文本，图片读取为 DataURL 后生成对应文档类型的源码
// 直接复制自 lengyi-markdown-editor 的 loadFile / insertImageMarkdown 并做最小 React 适配

const ALLOWED_TEXT_EXT = ['md', 'markdown', 'txt'];
const ALLOWED_HTML_EXT = ['html', 'htm'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB

export type ImportedFile =
    | { kind: 'text'; content: string; filename: string }
    | { kind: 'html'; content: string; filename: string }
    | { kind: 'image'; markdown: string; html: string; filename: string }
    | { kind: 'unsupported'; filename: string }
    | { kind: 'too-large-image'; filename: string };

export function getExt(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function escapeHtmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function readFile(file: File): Promise<ImportedFile> {
    const ext = getExt(file.name);

    // Apache-2.0 source pattern:
    // https://github.com/nexu-io/html-anything/blob/main/next/src/lib/parsers/file.ts
    if (ALLOWED_HTML_EXT.includes(ext)) {
        return file.text()
            .then((content) => ({ kind: 'html' as const, content, filename: file.name }))
            .catch(() => ({ kind: 'unsupported' as const, filename: file.name }));
    }

    if (ALLOWED_TEXT_EXT.includes(ext)) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({ kind: 'text', content: String(e.target?.result ?? ''), filename: file.name });
            };
            reader.onerror = () => resolve({ kind: 'unsupported', filename: file.name });
            reader.readAsText(file);
        });
    }

    if (file.type.startsWith('image/')) {
        if (file.size > IMAGE_MAX_BYTES) {
            return Promise.resolve({ kind: 'too-large-image', filename: file.name });
        }
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const url = String(e.target?.result ?? '');
                const safeAlt = file.name.replace(/\]/g, '\\]');
                const baseName = file.name.replace(/\.[^.]+$/, '');
                const alt = file.name || baseName;
                resolve({
                    kind: 'image',
                    markdown: `![${safeAlt || baseName}](${url})`,
                    html: `<img src="${url}" alt="${escapeHtmlAttribute(alt)}">`,
                    filename: file.name,
                });
            };
            reader.onerror = () => resolve({ kind: 'unsupported', filename: file.name });
            reader.readAsDataURL(file);
        });
    }

    return Promise.resolve({ kind: 'unsupported', filename: file.name });
}
