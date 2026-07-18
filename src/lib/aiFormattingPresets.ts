export type AiFormattingPresetId = 'rmarkdown' | 'standard-markdown';

export interface AiFormattingPreset {
    id: AiFormattingPresetId;
    label: string;
    shortLabel: string;
    description: string;
}

export const DEFAULT_AI_FORMATTING_PRESET: AiFormattingPresetId = 'rmarkdown';
export const AI_FORMATTING_PRESET_STORAGE_KEY = 'marka:aiFormattingPreset';

export const aiFormattingPresets: AiFormattingPreset[] = [
    {
        id: 'rmarkdown',
        label: 'R-Markdown 公众号排版',
        shortLabel: 'R-Markdown',
        description: '扩展组件与重点样式，适合公众号深度排版',
    },
    {
        id: 'standard-markdown',
        label: '标准 Markdown 排版',
        shortLabel: '标准 Markdown',
        description: '标题、列表、引用与表格，兼容通用编辑器',
    },
];

export function isAiFormattingPresetId(value: unknown): value is AiFormattingPresetId {
    return aiFormattingPresets.some(preset => preset.id === value);
}

export function getAiFormattingPreset(id: AiFormattingPresetId): AiFormattingPreset {
    return aiFormattingPresets.find(preset => preset.id === id) ?? aiFormattingPresets[0];
}
