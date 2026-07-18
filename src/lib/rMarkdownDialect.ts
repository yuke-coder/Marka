export type RMarkdownFeatureKind = 'component' | 'image-layout' | 'inline-style';

export interface RMarkdownFeature {
    readonly kind: RMarkdownFeatureKind;
    readonly name: string;
    readonly line: number;
}

export interface RMarkdownDetection {
    readonly detected: boolean;
    readonly features: readonly RMarkdownFeature[];
}

// These are R-Markdown-specific component tags. Generic HTML elements such as
// <img> and <title> are deliberately excluded unless their R-Markdown-only
// attributes are present; that keeps ordinary Markdown/HTML imports from being
// misclassified.
const R_MARKDOWN_TITLE_ATTRIBUTES = /\b(?:type|badge|subtitle|chips|num-color|subtitle-color|prefix|suffix|size)\s*=/i;
const R_MARKDOWN_IMAGE_ATTRIBUTES = /\b(?:fit|radius|position|offset)\s*=/i;
const SIZED_IMAGE = /^\s*!\[[^\]]*\]\([^\n)]+\)\s*\[[^\]\s]+\s+[^\]]+\]\s*$/;
const IMAGE_ROW = /^\s*<\s*!\[[^\]]*\]\([^\n)]+\)\s*,\s*!\[/;

function isFence(line: string): boolean {
    return /^\s*(?:`{3,}|~{3,})/.test(line);
}

function addFeature(
    features: RMarkdownFeature[],
    kind: RMarkdownFeatureKind,
    name: string,
    line: number,
): void {
    if (features.some((feature) => feature.kind === kind && feature.name === name && feature.line === line)) {
        return;
    }
    features.push({ kind, name, line });
}

/**
 * Detect the public R-Markdown dialect without rewriting the source.
 *
 * A proprietary component is enough to classify the document. Visual-only
 * extensions are weaker evidence, so at least two distinct weak features are
 * needed before classifying a document as R-Markdown.
 */
export function detectRMarkdown(source: string): RMarkdownDetection {
    const features: RMarkdownFeature[] = [];
    let insideFence = false;

    source.split(/\r?\n/).forEach((line, index) => {
        if (isFence(line)) {
            insideFence = !insideFence;
            return;
        }
        if (insideFence) return;

        for (const match of line.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
            const tag = match[1].toLowerCase();
            const attributes = match[2];
            // `title` and `img` are ordinary HTML tags too. They only become
            // R-Markdown components when their extension-specific attributes
            // are present below.
            if (R_MARKDOWN_COMPONENT_TAGS.has(tag) && tag !== 'title' && tag !== 'img') {
                addFeature(features, 'component', tag, index + 1);
                continue;
            }
            if (tag === 'title' && R_MARKDOWN_TITLE_ATTRIBUTES.test(attributes)) {
                addFeature(features, 'component', 'title', index + 1);
                continue;
            }
            if (tag === 'img' && R_MARKDOWN_IMAGE_ATTRIBUTES.test(attributes)) {
                addFeature(features, 'component', 'img', index + 1);
            }
        }

        if (SIZED_IMAGE.test(line)) {
            addFeature(features, 'image-layout', 'sized-image', index + 1);
        }
        if (IMAGE_ROW.test(line)) {
            addFeature(features, 'image-layout', 'image-row', index + 1);
        }
        if (/==[^=\n]+==/.test(line)) addFeature(features, 'inline-style', 'gradient', index + 1);
        if (/!![^!\n]+!!/.test(line)) addFeature(features, 'inline-style', 'pill', index + 1);
        if (/\^\^[^^\n]+\^\^/.test(line)) addFeature(features, 'inline-style', 'emphasis', index + 1);
        if (/::[^:\n]+::/.test(line)) addFeature(features, 'inline-style', 'soft-highlight', index + 1);
    });

    const hasComponent = features.some((feature) => feature.kind === 'component');
    const weakFeatureKinds = new Set(features
        .filter((feature) => feature.kind !== 'component')
        .map((feature) => feature.name));

    return {
        detected: hasComponent || weakFeatureKinds.size >= 2,
        features,
    };
}

export function isRMarkdownSource(source: string): boolean {
    return detectRMarkdown(source).detected;
}
import { R_MARKDOWN_COMPONENT_TAGS } from './rMarkdownSyntax';
