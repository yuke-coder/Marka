import { decodeHtmlEntities } from './clipboard';

export function removeMarkdownFormatting(markdown: string) {
    let text = markdown.replace(/\r\n?/g, '\n');

    text = text.replace(/```[^\n]*\n([\s\S]*?)\n?```/g, '$1');
    text = text.replace(/~~~[^\n]*\n([\s\S]*?)\n?~~~/g, '$1');
    text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
    text = text.replace(/^\s{0,3}>\s?/gm, '');
    text = text.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '');
    text = text.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    text = text.replace(/^\s*\|?[\s:-]{3,}\|[\s|:-]*$/gm, '');
    text = text.replace(/^\s*\|(.+)\|\s*$/gm, (_, cells: string) => cells.split('|').map(cell => cell.trim()).filter(Boolean).join('  '));
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
    text = text.replace(/^\s{0,3}\[[^\]]+\]:\s+\S+.*$/gm, '');
    text = text.replace(/`{1,3}([^`]+)`{1,3}/g, '$1');
    text = text.replace(/~~([^~]+)~~/g, '$1');

    for (let i = 0; i < 3; i += 1) {
        text = text
            .replace(/(\*\*\*|___)(.*?)\1/g, '$2')
            .replace(/(\*\*|__)(.*?)\1/g, '$2')
            .replace(/(^|[^\w])([*_])([^*_]+)\2(?=[^\w]|$)/g, '$1$3');
    }

    text = text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(?:p|div|h[1-6]|li|blockquote|section|article|header|footer|aside|main|nav|pre|code|table|tr|td|th|thead|tbody|tfoot|ul|ol|dl|dt|dd|figure|figcaption|details|summary)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '');

    text = decodeHtmlEntities(text);

    text = text.replace(/\[\/?(?:b|i|u|s|strike|del|ins|em|strong|code|pre|quote|color|size|font|url|img|email|list|ul|ol|li|table|tr|td|th|align|center|left|right|justify|indent|sub|sup|spoiler|php|html|youtube|media)(?:=[^\]]*)?\]/gi, '');

    text = text.replace(
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u0600-\u0605\u061C\u06DD\u070F\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01-\uDC7F]/g,
        ''
    );

    text = text.replace(
        /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g,
        ' '
    );

    text = text.replace(
        // eslint-disable-next-line no-misleading-character-class
        /[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier_Base}\p{Emoji_Modifier}\p{Emoji_Component}\u{FE0F}\u{200D}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2200}-\u{22FF}\u{25A0}-\u{25FF}\u{2700}-\u{27BF}\u{2900}-\u{297F}\u{2B00}-\u{2BFF}]/gu,
        ''
    );

    text = text.replace(
        // eslint-disable-next-line no-useless-escape
        /(?:[:;=8xX><][\-o\*'"]?[\)\]\(\[dDpP/\\:@|3}><{oO0\*vV]|[\)\]\(\[dDpP/\\:@|3}><{oO0\*vV][\-o\*'"]?[:;=8xX><]|<\/?3|:\*|:-[\/\\]|:\(|\^_\^|\^-\^|T_T|T\.T|-_-|\.-\)|:-[)D]|:-\(|:'-\(|XD|xD|XP|xp|O\.o|o\.O|:3|=\)|=\(|OwO|owo|UwU|uwu|QwQ|qwq|QAQ|qaq)/g,
        ''
    );

    text = text.replace(
        /(?:https?:\/\/|www\.)[^\s<>")\]]+/gi,
        ''
    );

    text = text.replace(/�/g, '');

    return text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .replace(/[^\S\n]{2,}/g, ' ')
        .replace(/^[ \t]+|[ \t]+$/gm, '')
        .trim();
}
