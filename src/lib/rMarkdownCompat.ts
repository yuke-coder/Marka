import {
    isRMarkdownBlockComponent,
    isRMarkdownSelfClosingComponent,
} from './rMarkdownSyntax';

export interface RMarkdownCompatOptions {
    /** Render ordinary Markdown using Marka's existing renderer. */
    readonly renderMarkdown: (source: string) => string;
}

interface TagMatch {
    readonly tag: string;
    readonly attributes: string;
    readonly inlineContent: string | null;
    readonly selfClosing: boolean;
}

interface ImageSpec {
    readonly alt: string;
    readonly src: string;
    readonly width?: string;
    readonly height?: string;
}

const NAMED_COLORS: Record<string, string> = {
    blue: '#2563eb',
    green: '#16a34a',
    red: '#dc2626',
    yellow: '#d97706',
    purple: '#7c3aed',
    accent: '#4f46e5',
    dark: '#1f2937',
};

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(value: string): string {
    const trimmed = value.trim();
    if (/^(?:https?:|data:image\/)/i.test(trimmed)) return escapeHtml(trimmed);
    return '';
}

function safeDimension(value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    const normalized = value.trim();
    return /^\d+(?:\.\d+)?(?:px|%|rem|em|vh|vw)?$/i.test(normalized)
        ? normalized
        : fallback;
}

function getAttribute(attributes: string, name: string): string | undefined {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
        .exec(attributes);
    return match?.[1] ?? match?.[2] ?? match?.[3];
}

function parseTag(line: string): TagMatch | null {
    const match = /^\s*<([a-z][\w-]*)\b([^>]*)>([\s\S]*?)<\/\1>\s*$/i.exec(line);
    if (match) {
        return {
            tag: match[1].toLowerCase(),
            attributes: match[2],
            inlineContent: match[3],
            selfClosing: false,
        };
    }

    const opening = /^\s*<([a-z][\w-]*)\b([^>]*)>\s*$/i.exec(line);
    if (!opening) return null;
    return {
        tag: opening[1].toLowerCase(),
        attributes: opening[2],
        inlineContent: null,
        selfClosing: /\/\s*$/.test(opening[2]),
    };
}

function isFence(line: string): boolean {
    return /^\s*(?:`{3,}|~{3,})/.test(line);
}

function color(value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    const normalized = value.trim().toLowerCase();
    if (NAMED_COLORS[normalized]) return NAMED_COLORS[normalized];
    return /^#[0-9a-f]{3,8}$/i.test(normalized) ? normalized : fallback;
}

function parseImage(markdown: string): ImageSpec | null {
    const match = /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)(?:\[([^\]\s]+)\s+([^\]]+)\])?$/.exec(markdown.trim());
    if (!match) return null;
    return {
        alt: match[1],
        src: match[2],
        width: match[3],
        height: match[4],
    };
}

function imageHtml(image: ImageSpec, options?: { readonly className?: string; readonly height?: string }): string {
    const width = safeDimension(image.width, '100%');
    const height = safeDimension(options?.height ?? image.height, 'auto');
    const src = safeUrl(image.src);
    const attributes = src ? ` src="${src}"` : '';
    return `<img${attributes} alt="${escapeHtml(image.alt)}" class="${options?.className ?? 'rmarkdown-image'}" style="display:block;width:${width};max-width:100%;height:${height};object-fit:cover;border-radius:12px;box-shadow:0 10px 28px rgba(15,23,42,.14)">`;
}

function renderSizedImage(image: ImageSpec): string {
    const height = safeDimension(image.height, 'auto');
    const hasWindow = height !== 'auto';
    return [
        `<figure data-rmarkdown-component="sized-image" style="margin:24px 0;${hasWindow ? `max-height:${height};overflow:auto;` : ''}">`,
        imageHtml({ ...image, height: hasWindow ? 'auto' : height }),
        image.alt ? `<figcaption style="margin-top:8px;text-align:center;font-size:13px;color:#64748b">${escapeHtml(image.alt)}</figcaption>` : '',
        '</figure>',
    ].join('');
}

function renderImageRow(source: string): string | null {
    const match = /^\s*<\s*(.*?)\s*>\s*$/.exec(source);
    if (!match) return null;
    const images = match[1].split(/\s*,\s*/).map(parseImage);
    if (images.length < 2 || images.some((image) => !image)) return null;
    return `<div data-rmarkdown-component="image-row" style="display:flex;gap:12px;overflow-x:auto;margin:24px 0;padding:2px">${images.map((image) => imageHtml(image!, { className: 'rmarkdown-image-row-item' })).join('')}</div>`;
}

function renderTitle(attributes: string, content: string): string {
    const badge = getAttribute(attributes, 'badge');
    const subtitle = getAttribute(attributes, 'subtitle');
    const chips = (getAttribute(attributes, 'chips') ?? '').split('|').map((chip) => chip.trim()).filter(Boolean);
    const accent = color(getAttribute(attributes, 'color'), '#4f46e5');
    return [
        `<section data-rmarkdown-component="title" style="margin:32px 0 28px;padding:32px 26px;border-radius:22px;background:linear-gradient(135deg,${accent},#0f172a);color:#fff;box-shadow:0 16px 38px rgba(30,41,59,.22)">`,
        badge ? `<p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.14em;opacity:.82">${escapeHtml(badge)}</p>` : '',
        `<h1 style="margin:0;font-size:30px;line-height:1.3;color:inherit">${escapeHtml(content)}</h1>`,
        subtitle ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.7;opacity:.86">${escapeHtml(subtitle)}</p>` : '',
        chips.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:20px">${chips.map((chip) => `<span style="padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:12px">${escapeHtml(chip)}</span>`).join('')}</div>` : '',
        '</section>',
    ].join('');
}

function renderPTitle(attributes: string): string {
    const level = Math.min(4, Math.max(1, Number(getAttribute(attributes, 'level') ?? '2')));
    const tag = `h${level}`;
    const title = getAttribute(attributes, 'title') ?? '';
    const subtitle = getAttribute(attributes, 'subtitle');
    const number = getAttribute(attributes, 'num');
    const accent = color(getAttribute(attributes, 'color') ?? getAttribute(attributes, 'num-color'), '#4f46e5');
    const prefix = getAttribute(attributes, 'prefix') ?? '';
    const suffix = getAttribute(attributes, 'suffix') ?? '';
    const size = getAttribute(attributes, 'size');
    const fontSize = level === 1 && size === 'small' ? '24px' : level === 1 && size === 'medium' ? '28px' : `${Math.max(18, 29 - level * 3)}px`;
    return [
        `<section data-rmarkdown-component="p-title" style="margin:30px 0 18px">`,
        '<div style="display:flex;gap:11px;align-items:flex-start">',
        number ? `<span style="flex:0 0 auto;margin-top:4px;padding:3px 8px;border-radius:999px;background:${accent};color:#fff;font-size:12px;font-weight:800;letter-spacing:.06em">${escapeHtml(number)}</span>` : '',
        '<div>',
        `<${tag} style="margin:0;color:#172033;font-size:${fontSize};line-height:1.42">${escapeHtml(prefix)}${escapeHtml(title)}${escapeHtml(suffix)}</${tag}>`,
        subtitle ? `<p style="margin:5px 0 0;color:#64748b;font-size:12px;letter-spacing:.08em">${escapeHtml(subtitle)}</p>` : '',
        '</div></div></section>',
    ].join('');
}

function renderSlider(attributes: string): string {
    const images = (getAttribute(attributes, 'images') ?? '')
        .split(',')
        .map((src, index) => ({ alt: `轮播图 ${index + 1}`, src: src.trim() }))
        .filter((image) => Boolean(image.src));
    const height = safeDimension(getAttribute(attributes, 'height'), 'auto');
    if (!images.length) return unsupported('slider', '未提供可显示的图片');
    return `<section data-rmarkdown-component="slider" aria-label="图片轮播" style="display:flex;gap:12px;overflow-x:auto;margin:24px 0;padding:2px;scroll-snap-type:x mandatory">${images.map((image) => `<div style="min-width:88%;scroll-snap-align:start">${imageHtml({ ...image, width: '100%', height }, { className: 'rmarkdown-slider-image', height })}</div>`).join('')}</section>`;
}

function renderExtendedImage(attributes: string): string {
    const src = getAttribute(attributes, 'src') ?? '';
    const alt = getAttribute(attributes, 'alt') ?? '';
    const image: ImageSpec = {
        alt,
        src,
        width: getAttribute(attributes, 'width'),
        height: getAttribute(attributes, 'height'),
    };
    const fit = getAttribute(attributes, 'fit');
    const objectFit = fit && /^(?:cover|contain|fill|none|scale-down)$/.test(fit) ? fit : 'cover';
    const radius = safeDimension(getAttribute(attributes, 'radius'), '12px');
    const safeSrc = safeUrl(image.src);
    return `<figure data-rmarkdown-component="img" style="margin:24px 0;overflow:hidden;border-radius:${radius};box-shadow:0 12px 30px rgba(15,23,42,.16)"><img${safeSrc ? ` src="${safeSrc}"` : ''} alt="${escapeHtml(image.alt)}" style="display:block;width:${safeDimension(image.width, '100%')};max-width:100%;height:${safeDimension(image.height, 'auto')};object-fit:${objectFit}"></figure>`;
}

function unsupported(component: string, reason = '该组件暂未提供可兼容的展示方式'): string {
    return `<aside data-rmarkdown-component="${component}" data-rmarkdown-state="degraded" style="margin:20px 0;padding:15px 17px;border-radius:14px;background:#fff7ed;color:#9a3412;line-height:1.65"><strong>R-Markdown：${escapeHtml(component)}</strong><br>${escapeHtml(reason)}</aside>`;
}

function renderBreaking(attributes: string, body: string, options: RMarkdownCompatOptions): string {
    const accent = color(getAttribute(attributes, 'color'), '#e11d48');
    const badge = getAttribute(attributes, 'badge');
    const title = getAttribute(attributes, 'title');
    const subtitle = getAttribute(attributes, 'subtitle');
    const chips = (getAttribute(attributes, 'chips') ?? '').split('|').filter(Boolean);
    return [
        `<section data-rmarkdown-component="breaking" style="margin:26px 0;padding:24px;border-radius:20px;background:linear-gradient(135deg,${accent},#7f1d1d);color:#fff;box-shadow:0 14px 32px rgba(127,29,29,.2)">`,
        badge ? `<span style="display:inline-block;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.18);font-size:11px;font-weight:800;letter-spacing:.08em">${escapeHtml(badge)}</span>` : '',
        title ? `<h2 style="margin:12px 0 0;color:inherit;font-size:24px">${escapeHtml(title)}</h2>` : '',
        subtitle ? `<p style="margin:7px 0 0;color:inherit;opacity:.86">${escapeHtml(subtitle)}</p>` : '',
        `<div style="margin-top:14px;color:inherit">${renderRMarkdown(body, options)}</div>`,
        chips.length ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:14px">${chips.map((chip) => `<span style="padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.16);font-size:12px">${escapeHtml(chip)}</span>`).join('')}</div>` : '',
        '</section>',
    ].join('');
}

function parsePipeItems(body: string): Array<{ readonly label: string; readonly detail: string }> {
    return body.split(/\r?\n/)
        .map((line) => /^\s*-\s+(.*)$/.exec(line)?.[1])
        .filter((line): line is string => Boolean(line))
        .map((line) => {
            const [label, ...rest] = line.split('|');
            return { label: label.trim(), detail: rest.join('|').trim() };
        });
}

function renderSteps(attributes: string, body: string): string {
    const items = parsePipeItems(body);
    const vertical = getAttribute(attributes, 'direction') === 'vertical';
    const title = getAttribute(attributes, 'title');
    const label = getAttribute(attributes, 'label');
    const active = Math.max(1, Number(getAttribute(attributes, 'active') ?? '0'));
    if (!items.length) return unsupported('steps', '未识别到步骤列表');
    return [
        `<section data-rmarkdown-component="steps" style="margin:24px 0;padding:22px;border-radius:18px;background:#f8fafc">`,
        label ? `<p style="margin:0;color:#4f46e5;font-size:11px;font-weight:800;letter-spacing:.12em">${escapeHtml(label)}</p>` : '',
        title ? `<h3 style="margin:7px 0 18px;color:#172033;font-size:20px">${escapeHtml(title)}</h3>` : '',
        `<ol style="display:${vertical ? 'grid' : 'flex'};${vertical ? 'gap:12px' : 'gap:10px;overflow-x:auto'};margin:0;padding:0;list-style:none">`,
        items.map((item, index) => `<li style="${vertical ? '' : 'min-width:180px;flex:1;'}padding:14px;border-radius:14px;background:${index + 1 === active ? '#eef2ff' : '#fff'};color:#172033"><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:${index + 1 === active ? '#4f46e5' : '#e2e8f0'};color:${index + 1 === active ? '#fff' : '#475569'};font-size:12px;font-weight:800">${index + 1}</span><strong style="display:block;margin-top:9px">${escapeHtml(item.label)}</strong>${item.detail ? `<span style="display:block;margin-top:4px;color:#64748b;font-size:13px;line-height:1.55">${escapeHtml(item.detail)}</span>` : ''}</li>`).join(''),
        '</ol></section>',
    ].join('');
}

function renderCaseFlow(body: string): string {
    const items = body.split(/\r?\n/)
        .map((line) => /^\s*-\s+(.*)$/.exec(line)?.[1])
        .filter((line): line is string => Boolean(line));
    if (!items.length) return unsupported('case-flow', '未识别到案例条目');
    return `<ol data-rmarkdown-component="case-flow" style="display:grid;gap:12px;margin:24px 0;padding:0;list-style:none">${items.map((item, index) => `<li style="padding:17px 18px;border-radius:15px;background:${index % 2 ? '#f8fafc' : '#eef2ff'};color:#1e293b;line-height:1.7">${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function slotContent(body: string, slot: 'left' | 'right', options: RMarkdownCompatOptions): string | null {
    const match = new RegExp(`<${slot}\\b[^>]*>([\\s\\S]*?)<\\/${slot}>`, 'i').exec(body);
    return match ? renderRMarkdown(match[1].trim(), options) : null;
}

function renderCompare(attributes: string, body: string, options: RMarkdownCompatOptions): string {
    const left = slotContent(body, 'left', options);
    const right = slotContent(body, 'right', options);
    if (left === null || right === null) return unsupported('compare', '需要同时提供 left 与 right 内容');
    const vertical = getAttribute(attributes, 'direction') === 'vertical';
    const renderSide = (side: 'left' | 'right', content: string) => {
        const label = getAttribute(attributes, `${side}-label`);
        const title = getAttribute(attributes, `${side}-title`);
        return `<section style="min-width:0;padding:18px;border-radius:16px;background:${side === 'left' ? '#f8fafc' : '#eef2ff'}"><p style="margin:0;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.1em">${escapeHtml(label ?? side.toUpperCase())}</p>${title ? `<h3 style="margin:7px 0 12px;color:#172033;font-size:18px">${escapeHtml(title)}</h3>` : ''}<div>${content}</div></section>`;
    };
    return `<section data-rmarkdown-component="compare" style="display:${vertical ? 'grid' : 'grid'};grid-template-columns:${vertical ? '1fr' : 'repeat(2,minmax(0,1fr))'};gap:14px;margin:24px 0">${renderSide('left', left)}${renderSide('right', right)}</section>`;
}

function renderCta(attributes: string): string {
    const label = getAttribute(attributes, 'label');
    const title = getAttribute(attributes, 'title') ?? '下一步行动';
    const button = getAttribute(attributes, 'button') ?? '开始';
    return `<section data-rmarkdown-component="cta" style="margin:28px 0;padding:26px;border-radius:20px;background:#111827;color:#fff;text-align:center"><p style="margin:0;font-size:11px;letter-spacing:.12em;color:#a5b4fc;font-weight:800">${escapeHtml(label ?? 'CALL TO ACTION')}</p><h2 style="margin:9px 0 16px;color:inherit;font-size:23px">${escapeHtml(title)}</h2><span style="display:inline-block;padding:10px 16px;border-radius:999px;background:#fff;color:#312e81;font-size:14px;font-weight:800">${escapeHtml(button)}</span></section>`;
}

function renderTimeline(body: string, options: RMarkdownCompatOptions): string {
    const items = parsePipeItems(body);
    if (!items.length) return unsupported('timeline', '未识别到时间线条目');
    return `<ol data-rmarkdown-component="timeline" style="display:grid;gap:14px;margin:24px 0;padding:0;list-style:none">${items.map((item, index) => {
        const parts = [item.label, ...item.detail.split('|')].map((part) => part.trim());
        const [date, title, detail] = parts;
        return `<li style="display:grid;grid-template-columns:88px 1fr;gap:14px;align-items:start"><time style="padding:5px 7px;border-radius:8px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:800;text-align:center">${escapeHtml(date || String(index + 1))}</time><div style="padding:2px 0"><strong style="display:block;color:#172033">${escapeHtml(title ?? '')}</strong>${detail ? `<div style="margin-top:4px;color:#64748b;line-height:1.65">${renderRMarkdown(detail, options)}</div>` : ''}</div></li>`;
    }).join('')}</ol>`;
}

function renderBadges(attributes: string, body: string): string {
    const tone = getAttribute(attributes, 'tone');
    const background = color(getAttribute(attributes, 'bg') ?? tone, tone === 'yellow' ? '#facc15' : '#4f46e5');
    const foreground = color(getAttribute(attributes, 'color'), tone === 'yellow' ? '#422006' : '#fff');
    const badges = body.split('|').map((badge) => badge.trim()).filter(Boolean);
    return `<div data-rmarkdown-component="badges" style="display:flex;flex-wrap:wrap;gap:8px;margin:20px 0">${badges.map((badge) => `<span style="padding:5px 10px;border-radius:999px;background:${background};color:${foreground};font-size:12px;font-weight:700">${escapeHtml(badge)}</span>`).join('')}</div>`;
}

function renderStatement(body: string, options: RMarkdownCompatOptions): string {
    return `<blockquote data-rmarkdown-component="statement" style="margin:28px 0;padding:10px 18px;text-align:center;color:#1e293b;font-size:21px;line-height:1.7;font-weight:800">${renderRMarkdown(body, options)}</blockquote>`;
}

function renderLead(body: string, options: RMarkdownCompatOptions): string {
    return `<section data-rmarkdown-component="lead" style="margin:24px 0;padding:16px 19px;border-radius:15px;background:#f1f5f9;color:#334155;font-size:17px;line-height:1.8">${renderRMarkdown(body, options)}</section>`;
}

function renderEngage(attributes: string): string {
    const title = getAttribute(attributes, 'title') ?? '感谢阅读';
    const subtitle = getAttribute(attributes, 'subtitle');
    const accent = color((getAttribute(attributes, 'color') ?? '').split('|')[0], '#4f46e5');
    return `<section data-rmarkdown-component="engage" style="margin:30px 0;padding:28px 22px;border-radius:22px;background:linear-gradient(135deg,${accent},#0f172a);color:#fff;text-align:center"><h2 style="margin:0;color:inherit;font-size:23px">${escapeHtml(title)}</h2>${subtitle ? `<p style="margin:9px 0 0;color:inherit;opacity:.86">${escapeHtml(subtitle)}</p>` : ''}</section>`;
}

function renderCallout(lines: string[], options: RMarkdownCompatOptions): string {
    const first = lines[0].replace(/^\s*>\s*/, '');
    const match = /^\[(TIP|NOTE)]\s*(.*)$/i.exec(first);
    if (!match) return options.renderMarkdown(lines.join('\n'));
    const rest = [match[2], ...lines.slice(1).map((line) => line.replace(/^\s*>\s?/, ''))]
        .filter(Boolean)
        .join('\n');
    const accent = match[1].toUpperCase() === 'TIP' ? '#0f766e' : '#4f46e5';
    return `<aside data-rmarkdown-component="callout" style="margin:22px 0;padding:16px 18px;border-radius:15px;background:${match[1].toUpperCase() === 'TIP' ? '#f0fdfa' : '#eef2ff'};color:#1e293b"><strong style="display:block;margin-bottom:6px;color:${accent};font-size:12px;letter-spacing:.08em">${match[1].toUpperCase()}</strong><div>${renderRMarkdown(rest, options)}</div></aside>`;
}

function renderMathBlock(lines: string[]): string {
    const content = lines.slice(1, -1).join('\n').trim();
    return `<figure data-rmarkdown-component="math" style="margin:24px 0;padding:17px 20px;border-radius:14px;background:#f8fafc;overflow:auto"><figcaption style="margin-bottom:8px;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.1em">LATEX</figcaption><code style="color:#312e81;white-space:pre;font-family:ui-monospace,SFMono-Regular,Consolas,monospace">${escapeHtml(content)}</code></figure>`;
}

function transformInlineExtensions(source: string): string {
    let insideFence = false;
    return source.split(/\r?\n/).map((line) => {
        if (isFence(line)) {
            insideFence = !insideFence;
            return line;
        }
        if (insideFence) return line;

        const row = renderImageRow(line);
        if (row) return `\n${row}\n`;

        const image = parseImage(line);
        if (image?.height) return `\n${renderSizedImage(image)}\n`;

        let transformed = line
            .replace(/==([^=\n]+)==/g, (_, text: string) => `<span data-rmarkdown-inline="gradient" style="padding:1px 5px;border-radius:5px;background:linear-gradient(90deg,#fde68a,#ddd6fe);color:#312e81">${escapeHtml(text)}</span>`)
            .replace(/!!([^!\n]+)!!/g, (_, text: string) => `<span data-rmarkdown-inline="pill" style="display:inline-block;padding:1px 7px;border-radius:999px;background:#e0e7ff;color:#3730a3;font-size:.92em">${escapeHtml(text)}</span>`)
            .replace(/\^\^([^\n^]+)\^\^/g, (_, text: string) => `<strong data-rmarkdown-inline="emphasis" style="color:#312e81">${escapeHtml(text)}</strong>`)
            .replace(/::([^:\n]+)::/g, (_, text: string) => `<span data-rmarkdown-inline="soft-highlight" style="padding:1px 4px;border-radius:4px;background:#e0f2fe;color:#1d4ed8">${escapeHtml(text)}</span>`)
            .replace(/\$([^$\n]+)\$/g, (_, formula: string) => `<span data-rmarkdown-inline="math" style="padding:1px 5px;border-radius:5px;background:#f1f5f9;color:#4338ca;font-family:ui-monospace,SFMono-Regular,Consolas,monospace">${escapeHtml(formula)}</span>`);

        transformed = transformed.replace(/^([\s]*[-*+]\s+)\[([ xX])\]\s+/u, (_, prefix: string, checked: string) => `${prefix}<span data-rmarkdown-inline="task" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-right:6px;border-radius:4px;background:${checked.toLowerCase() === 'x' ? '#4f46e5' : '#e2e8f0'};color:#fff;font-size:11px">${checked.toLowerCase() === 'x' ? '✓' : ''}</span>`);
        return transformed;
    }).join('\n');
}

function renderBlock(tag: string, attributes: string, body: string, options: RMarkdownCompatOptions): string {
    switch (tag) {
        case 'breaking': return renderBreaking(attributes, body, options);
        case 'steps': return renderSteps(attributes, body);
        case 'case-flow':
        case 'reading-path': return renderCaseFlow(body);
        case 'compare': return renderCompare(attributes, body, options);
        case 'timeline': return renderTimeline(body, options);
        case 'badges': return renderBadges(attributes, body);
        case 'statement': return renderStatement(body, options);
        case 'lead': return renderLead(body, options);
        default: return unsupported(tag);
    }
}

function renderSelfClosing(tag: string, attributes: string, content: string): string {
    switch (tag) {
        case 'title': return renderTitle(attributes, content);
        case 'p-title': return renderPTitle(attributes);
        case 'slider': return renderSlider(attributes);
        case 'img': return renderExtendedImage(attributes);
        case 'cta': return renderCta(attributes);
        case 'engage': return renderEngage(attributes);
        default: return unsupported(tag);
    }
}

/**
 * A deliberately small compatibility parser for the public R-Markdown dialect.
 * It turns R-Markdown extensions into ordinary, self-contained HTML while
 * delegating every normal Markdown fragment back to Marka's established parser.
 */
export function renderRMarkdown(source: string, options: RMarkdownCompatOptions): string {
    const lines = source.split(/\r?\n/);
    const output: string[] = [];
    const markdownBuffer: string[] = [];
    let insideFence = false;

    const flushMarkdown = () => {
        if (!markdownBuffer.length) return;
        const markdown = markdownBuffer.join('\n');
        markdownBuffer.length = 0;
        if (markdown.trim()) output.push(options.renderMarkdown(transformInlineExtensions(markdown)));
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (isFence(line)) {
            insideFence = !insideFence;
            markdownBuffer.push(line);
            continue;
        }
        if (insideFence) {
            markdownBuffer.push(line);
            continue;
        }

        if (/^\s*>\s*\[(?:TIP|NOTE)]\b/i.test(line)) {
            flushMarkdown();
            const calloutLines = [line];
            while (index + 1 < lines.length && /^\s*>/.test(lines[index + 1])) {
                index += 1;
                calloutLines.push(lines[index]);
            }
            output.push(renderCallout(calloutLines, options));
            continue;
        }

        if (/^\s*\$\$\s*$/.test(line)) {
            flushMarkdown();
            const mathLines = [line];
            while (index + 1 < lines.length) {
                index += 1;
                mathLines.push(lines[index]);
                if (/^\s*\$\$\s*$/.test(lines[index])) break;
            }
            output.push(mathLines.length > 1 && /^\s*\$\$\s*$/.test(mathLines[mathLines.length - 1])
                ? renderMathBlock(mathLines)
                : options.renderMarkdown(mathLines.join('\n')));
            continue;
        }

        const tag = parseTag(line);
        if (tag && isRMarkdownSelfClosingComponent(tag.tag) && (tag.inlineContent !== null || tag.selfClosing || tag.tag !== 'title')) {
            flushMarkdown();
            output.push(renderSelfClosing(tag.tag, tag.attributes, tag.inlineContent ?? ''));
            continue;
        }

        if (tag && isRMarkdownBlockComponent(tag.tag)) {
            flushMarkdown();
            if (tag.inlineContent !== null) {
                output.push(renderBlock(tag.tag, tag.attributes, tag.inlineContent, options));
                continue;
            }
            const body: string[] = [];
            const closePattern = new RegExp(`^\\s*<\\/${tag.tag}\\s*>\\s*$`, 'i');
            while (index + 1 < lines.length && !closePattern.test(lines[index + 1])) {
                index += 1;
                body.push(lines[index]);
            }
            if (index + 1 < lines.length) {
                index += 1;
                output.push(renderBlock(tag.tag, tag.attributes, body.join('\n'), options));
            } else {
                output.push(unsupported(tag.tag, '缺少结束标签，原内容已保留在编辑区'));
            }
            continue;
        }

        markdownBuffer.push(line);
    }

    flushMarkdown();
    return output.join('');
}
