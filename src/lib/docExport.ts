// Word (.doc) 导出：使用当前预览的 HTML 并伪装成 .doc 下载。
// 预览已负责 Markdown、R-Markdown 兼容和主题处理，导出不能再单独渲染一次。

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildDocHtml(renderedHtml: string, title: string): string {
    const safeTitle = escapeHtml(title.replace(/\.doc$/i, ''));
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    body { font-family: "Microsoft YaHei", "SimSun", "PingFang SC", sans-serif; font-size: 12pt; line-height: 1.6; color: #000; }
    h1 { font-size: 20pt; font-weight: bold; margin: 18pt 0 10pt; }
    h2 { font-size: 16pt; font-weight: bold; margin: 14pt 0 8pt; }
    h3 { font-size: 14pt; font-weight: bold; margin: 12pt 0 6pt; }
    h4, h5, h6 { font-size: 12pt; font-weight: bold; margin: 10pt 0 6pt; }
    p { margin: 6pt 0; }
    pre, code { font-family: Consolas, "Courier New", monospace; }
    pre { background: #f5f5f5; padding: 8pt; border-radius: 4px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 1pt 3pt; border-radius: 2px; }
    blockquote { border-left: 3px solid #ccc; margin: 6pt 0; padding: 4pt 10pt; color: #555; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
    th, td { border: 1px solid #ccc; padding: 5pt 8pt; }
    th { background: #f5f5f5; font-weight: bold; }
    ul, ol { margin: 6pt 0; padding-left: 24pt; }
    li { margin: 3pt 0; }
    img { max-width: 100%; height: auto; }
    hr { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
    a { color: #0563c1; text-decoration: underline; }
  </style>
</head>
<body>
${renderedHtml}
</body>
</html>`;
}

export function buildDocBlob(renderedHtml: string, title: string): Blob {
    const html = buildDocHtml(renderedHtml, title);
    return new Blob([html], { type: 'application/msword;charset=utf-8' });
}
