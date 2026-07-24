export type AiFormattingPresetId = 'rmarkdown' | 'standard-markdown';

export interface AiFormattingPresetOption {
    id: AiFormattingPresetId;
    label: string;
    description: string;
    highlights: readonly string[];
}

export const AI_FORMATTING_PRESETS: readonly AiFormattingPresetOption[] = [
    {
        id: 'rmarkdown',
        label: 'R-Markdown',
        description: '用克制的标题层级、醒目的引用与舒展的图文节奏，营造公众号原生阅读感',
        highlights: ['标题层级', '引用样式', '图文节奏'],
    },
    {
        id: 'standard-markdown',
        label: '标准 Markdown',
        description: '用暖橙强调、居中章节与金句卡片，突出实操内容和核心观点',
        highlights: ['暖橙强调', '居中章节', '金句卡片'],
    },
];

export const DEFAULT_AI_FORMATTING_PRESET: AiFormattingPresetId = 'rmarkdown';

export function isAiFormattingPresetId(value: unknown): value is AiFormattingPresetId {
    return AI_FORMATTING_PRESETS.some(preset => preset.id === value);
}
