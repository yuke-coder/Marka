export function getTextOffsetFromPoint(root: HTMLElement, x: number, y: number) {
    const doc = root.ownerDocument;
    const pointDoc = doc as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const caret = pointDoc.caretPositionFromPoint?.(x, y);
    const range = caret ? doc.createRange() : pointDoc.caretRangeFromPoint?.(x, y);
    if (!range) return root.textContent?.length ?? 0;
    if (caret) {
        range.setStart(caret.offsetNode, caret.offset);
        range.collapse(true);
    }
    if (!root.contains(range.startContainer)) return root.textContent?.length ?? 0;

    const before = doc.createRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length;
}

export function buildVisibleIndex(text: string, sourceMode = false) {
    let value = '';
    const positions = [0];
    let atLineStart = true;
    let inFence = false;

    const push = (char: string, offset: number) => {
        const next = /\s/.test(char) ? ' ' : char.toLowerCase();
        if (next === ' ' && value.endsWith(' ')) return;
        value += next;
        positions.push(offset);
    };

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const rest = text.slice(i);

        if (sourceMode && atLineStart && /^(```|~~~)/.test(rest)) {
            inFence = !inFence;
            const end = text.indexOf('\n', i);
            if (end === -1) break;
            i = end;
            atLineStart = true;
            continue;
        }

        if (sourceMode && !inFence) {
            if (char === '<') {
                const end = text.indexOf('>', i + 1);
                if (end !== -1) {
                    i = end;
                    continue;
                }
            }
            if (char === '\\' && text[i + 1]) continue;
            if (atLineStart) {
                const match = rest.match(/^(\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+)/);
                if (match) {
                    i += match[1].length - 1;
                    atLineStart = false;
                    continue;
                }
            }
            if (char === ']' && text[i + 1] === '(') {
                const end = text.indexOf(')', i + 2);
                if (end !== -1) {
                    i = end;
                    continue;
                }
            }
            if ('#*_~`[]'.includes(char)) {
                atLineStart = false;
                continue;
            }
        }

        push(char, i + 1);
        atLineStart = char === '\n';
    }

    return { value: value.trimEnd(), positions };
}

export function getVisiblePosition(text: string, rawOffset: number) {
    return buildVisibleIndex(text.slice(0, rawOffset)).value.length;
}

export function mapRenderedPointToSource(root: HTMLElement, markdown: string, x: number, y: number) {
    const renderedText = root.textContent ?? '';
    const renderedOffset = getTextOffsetFromPoint(root, x, y);
    const renderedIndex = buildVisibleIndex(renderedText);
    const sourceIndex = buildVisibleIndex(markdown, true);
    const renderedPosition = getVisiblePosition(renderedText, renderedOffset);
    if (!renderedIndex.value || !sourceIndex.value) return markdown.length;

    for (const radius of [28, 20, 14, 9, 5]) {
        let start = Math.max(0, renderedPosition - radius);
        let end = Math.min(renderedIndex.value.length, renderedPosition + radius);
        while (start < renderedPosition && renderedIndex.value[start] === ' ') start += 1;
        while (end > renderedPosition && renderedIndex.value[end - 1] === ' ') end -= 1;
        const needle = renderedIndex.value.slice(start, end);
        if (needle.length < 2) continue;

        const matches: number[] = [];
        for (let index = sourceIndex.value.indexOf(needle); index !== -1; index = sourceIndex.value.indexOf(needle, index + 1)) {
            matches.push(index);
        }
        if (!matches.length) continue;

        const caretInNeedle = Math.max(0, renderedPosition - start);
        const expected = Math.round((renderedPosition / renderedIndex.value.length) * sourceIndex.value.length);
        const match = matches.reduce((best, current) =>
            Math.abs(current + caretInNeedle - expected) < Math.abs(best + caretInNeedle - expected) ? current : best
        );
        return sourceIndex.positions[Math.min(match + caretInNeedle, sourceIndex.positions.length - 1)] ?? markdown.length;
    }

    const fallback = Math.round((renderedPosition / renderedIndex.value.length) * sourceIndex.value.length);
    return sourceIndex.positions[Math.min(fallback, sourceIndex.positions.length - 1)] ?? markdown.length;
}
