import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AI_FORMATTING_PRESET,
    aiFormattingPresets,
    getAiFormattingPreset,
    isAiFormattingPresetId,
} from './aiFormattingPresets';

describe('AI formatting presets', () => {
    it('uses the R-Markdown WeChat preset by default', () => {
        expect(DEFAULT_AI_FORMATTING_PRESET).toBe('rmarkdown');
        expect(getAiFormattingPreset(DEFAULT_AI_FORMATTING_PRESET).label).toBe('R-Markdown 公众号排版');
    });

    it('keeps preset ids unique and rejects unknown values', () => {
        const ids = aiFormattingPresets.map(preset => preset.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(isAiFormattingPresetId('standard-markdown')).toBe(true);
        expect(isAiFormattingPresetId('rewrite')).toBe(false);
    });
});
