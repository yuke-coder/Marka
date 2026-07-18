// PNG 长图导出：直接复制自 lengyi-markdown-editor 的 renderExportImagePreview / downloadExportImage / prepareExportImages
// 用 dom-to-image-more 对克隆的预览 DOM 渲染为 PNG dataURL，支持 5 种宽高比

import domtoimage from 'dom-to-image-more';

export interface RatioPreset {
    id: string;
    label: string;
    desc: string;
    width: number;
    height: number;
}

// 5 种比例预设，宽固定 1080（16:9 为 1920）
export const RATIO_PRESETS: RatioPreset[] = [
    { id: '9:16', label: '9:16', desc: '手机竖屏/故事', width: 1080, height: 1920 },
    { id: '4:5', label: '4:5', desc: '小红书/IG', width: 1080, height: 1350 },
    { id: '3:4', label: '3:4', desc: '竖图', width: 1080, height: 1440 },
    { id: '1:1', label: '1:1', desc: '方形', width: 1080, height: 1080 },
    { id: '16:9', label: '16:9', desc: '横图', width: 1920, height: 1080 },
];

const IMAGE_PLACEHOLDER =
    'data:image/svg+xml;base64,' +
    btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">' +
            '<rect width="120" height="80" fill="#e9ecef"/>' +
            '<text x="60" y="44" text-anchor="middle" font-size="12" fill="#6c757d">Image unavailable</text>' +
            '</svg>',
    );

// 对外部的 <img> 尝试 CORS 重新加载，失败时替换为占位 SVG，避免 toPng 报错
function prepareExportImages(root: HTMLElement): Promise<void[]> {
    const imgs = Array.from(root.querySelectorAll('img'));
    return Promise.all(
        imgs.map(
            (img) =>
                new Promise<void>((resolve) => {
                    if (!img.src || img.src.startsWith('data:')) {
                        resolve();
                        return;
                    }
                    const test = new Image();
                    test.crossOrigin = 'anonymous';
                    test.onload = () => {
                        img.crossOrigin = 'anonymous';
                        img.src = test.src;
                        resolve();
                    };
                    test.onerror = () => {
                        img.src = IMAGE_PLACEHOLDER;
                        resolve();
                    };
                    const sep = img.src.includes('?') ? '&' : '?';
                    test.src = img.src + sep + '_cors=' + Date.now();
                }),
        ),
    );
}

export interface RenderResult {
    dataUrl: string;
    captureWidth: number;
    captureHeight: number;
}

// 渲染预览 DOM 克隆为 PNG dataURL
// cropFit=true 时按预设高度裁切；false 时按内容自然高度（长图）
export async function renderPreviewToPng(
    previewEl: HTMLElement,
    preset: RatioPreset,
    cropFit: boolean,
    isDark: boolean,
): Promise<RenderResult> {
    const clone = document.createElement('div');
    clone.className = 'preview-content';
    clone.innerHTML = previewEl.innerHTML;
    clone.style.width = preset.width + 'px';
    clone.style.padding = `${Math.round(preset.width * 0.04)}px ${Math.round(preset.width * 0.045)}px`;
    clone.style.fontSize = Math.round(preset.width / 36) + 'px';
    clone.style.lineHeight = '1.7';
    clone.style.boxSizing = 'border-box';
    clone.style.background = isDark ? '#000000' : '#ffffff';
    clone.style.color = isDark ? '#f5f5f7' : '#1d1d1f';
    clone.style.overflow = 'visible';
    clone.style.maxWidth = 'none';
    clone.style.margin = '0';

    // 离屏 stage 容器
    const stage = document.createElement('div');
    stage.style.position = 'fixed';
    stage.style.left = '-99999px';
    stage.style.top = '0';
    stage.style.pointerEvents = 'none';
    stage.style.zIndex = '-1';
    stage.style.width = preset.width + 'px';
    stage.appendChild(clone);
    document.body.appendChild(stage);

    // 移除 index 标记，避免 data-* 属性污染导出
    clone.querySelectorAll('*').forEach((el) => {
        el.removeAttribute('data-md-type');
        el.removeAttribute('data-md-index');
    });

    const markdownBody = clone.querySelector('.markdown-body') as HTMLElement | null;
    if (markdownBody) {
        markdownBody.style.maxWidth = 'none';
        markdownBody.style.width = '100%';
        markdownBody.style.margin = '0';
    }

    await prepareExportImages(clone);

    const targetHeight = preset.height;
    const naturalHeight = clone.scrollHeight;

    let captureHeight: number;
    if (naturalHeight < targetHeight) {
        clone.style.minHeight = targetHeight + 'px';
        clone.style.height = targetHeight + 'px';
        captureHeight = targetHeight;
    } else if (cropFit) {
        clone.style.height = targetHeight + 'px';
        clone.style.overflow = 'hidden';
        captureHeight = targetHeight;
    } else {
        clone.style.height = 'auto';
        captureHeight = naturalHeight;
    }

    stage.style.height = captureHeight + 'px';

    try {
        const dataUrl = await domtoimage.toPng(clone, {
            width: preset.width,
            height: captureHeight,
            bgcolor: isDark ? '#000000' : '#ffffff',
            cacheBust: true,
            imagePlaceholder: IMAGE_PLACEHOLDER,
        });
        return { dataUrl, captureWidth: preset.width, captureHeight };
    } finally {
        stage.remove();
    }
}

export function dataUrlToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) {
        u8[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8], { type: mime });
}
