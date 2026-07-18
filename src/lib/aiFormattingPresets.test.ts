import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AI_FORMATTING_PRESET,
    isAiFormattingPresetId,
} from './aiFormattingPresets';

describe('AI formatting preset', () => {
    it('fixes output to the R-Markdown WeChat format', () => {
        expect(DEFAULT_AI_FORMATTING_PRESET).toBe('rmarkdown');
        expect(isAiFormattingPresetId('rmarkdown')).toBe(true);
    });

    it('rejects the removed and unknown format ids', () => {
        expect(isAiFormattingPresetId('standard-markdown')).toBe(false);
        expect(isAiFormattingPresetId('rewrite')).toBe(false);
    });
});
