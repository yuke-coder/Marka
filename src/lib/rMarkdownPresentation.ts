function getDocumentType(source: string): string {
    const match = /<title\b[^>]*\btype\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(source);
    return (match?.[1] ?? match?.[2] ?? match?.[3] ?? 'MARKA').toUpperCase();
}

/**
 * R-Markdown documents carry their own visual system. Applying Marka's chosen
 * Markdown theme on top would overwrite that system and make a valid source
 * look unrelated to its declared document type.
 */
export function presentRMarkdownDocument(source: string, html: string): string {
    const documentType = getDocumentType(source);
    const isDa02 = documentType === 'DA02';
    const background = isDa02 ? '#18181b' : '#ffffff';
    const foreground = isDa02 ? '#f8fafc' : '#172033';
    const muted = isDa02 ? '#a5b4fc' : '#64748b';
    const calloutBackground = isDa02 ? '#f8fafc' : '#f1f5f9';
    const calloutForeground = '#1e293b';

    return [
        // R-Markdown keeps its source-declared visual treatment. Its width is
        // deliberately owned by the shared preview canvas, just like Markdown.
        '<div data-rmarkdown-presentation style="display:flow-root;width:100%;margin:0">',
        `<article data-rmarkdown-document="${documentType}" style="box-sizing:border-box;width:100%;margin:0;padding:18px;background:${background};color:${foreground};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.8">`,
        '<style>',
        '[data-rmarkdown-presentation]{width:100%;margin:0}',
        '[data-rmarkdown-document],[data-rmarkdown-document] *,[data-rmarkdown-document] *::before,[data-rmarkdown-document] *::after{box-sizing:border-box}',
        '[data-rmarkdown-document]{width:100%;margin:0;padding:18px}',
        '[data-rmarkdown-document] p{margin:18px 0;line-height:1.75;color:inherit}',
        '[data-rmarkdown-document] h1,[data-rmarkdown-document] h2,[data-rmarkdown-document] h3,[data-rmarkdown-document] h4{color:inherit}',
        `[data-rmarkdown-document] blockquote{margin:22px 0;padding:18px 20px;background:${calloutBackground};color:${calloutForeground};border-radius:7px;box-shadow:inset 4px 0 #5b6cff}`,
        `[data-rmarkdown-document] blockquote p{margin:0;color:${calloutForeground}}`,
        `[data-rmarkdown-document] a{color:${isDa02 ? '#9db2ff' : '#4f46e5'};text-decoration:none;box-shadow:inset 0 -1px currentColor}`,
        `[data-rmarkdown-document] code{padding:2px 5px;border-radius:4px;background:${isDa02 ? '#27272a' : '#eef2ff'};color:${isDa02 ? '#c7d2fe' : '#4338ca'};font-family:ui-monospace,SFMono-Regular,Consolas,monospace}`,
        `[data-rmarkdown-document] ul,[data-rmarkdown-document] ol{padding-left:24px;color:${foreground}}`,
        `[data-rmarkdown-document] li{margin:7px 0;color:${foreground}}`,
        `[data-rmarkdown-document] pre{padding:18px;border-radius:12px;background:${isDa02 ? '#111827' : '#f8fafc'};overflow:auto}`,
        `[data-rmarkdown-document] pre code{padding:0;background:transparent;color:inherit}`,
        `[data-rmarkdown-document] figcaption{color:${muted}!important}`,
        '</style>',
        html,
        '</article>',
        '</div>',
    ].join('');
}
