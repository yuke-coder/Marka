export type AiFormattingPresetId = 'rmarkdown';

export const DEFAULT_AI_FORMATTING_PRESET: AiFormattingPresetId = 'rmarkdown';

export function isAiFormattingPresetId(value: unknown): value is AiFormattingPresetId {
    return value === DEFAULT_AI_FORMATTING_PRESET;
}
