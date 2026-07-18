import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AI_FORMATTING_PRESET as SERVER_DEFAULT_AI_FORMATTING_PRESET,
    buildAiFormattingInstructions,
    isAiFormattingPresetId,
} from '../../server/aiFormattingPresets';
import {
    DEFAULT_AI_FORMATTING_PRESET as CLIENT_DEFAULT_AI_FORMATTING_PRESET,
    aiFormattingPresets,
} from './aiFormattingPresets';

describe('AI formatting system prompts', () => {
    it('defaults to the R-Markdown preset and embeds its formatting specification', () => {
        const instructions = buildAiFormattingInstructions(SERVER_DEFAULT_AI_FORMATTING_PRESET, 'generate');

        expect(SERVER_DEFAULT_AI_FORMATTING_PRESET).toBe('rmarkdown');
        expect(instructions).toContain('R-Markdown WeChat article formatting engine');
        expect(instructions).toContain('<p-title>');
        expect(instructions).toContain('<steps direction="horizontal">');
        expect(instructions).toContain('<compare>');
        expect(instructions).toContain('==gradient background==');
        expect(instructions).toContain('at most one blank line');
        expect(instructions).toContain('Preserve every fact');
        expect(instructions).toContain('Return only raw R-Markdown source');
    });

    it('keeps standard Markdown as a separate selectable fallback', () => {
        const instructions = buildAiFormattingInstructions('standard-markdown', 'generate');

        expect(instructions).toContain('Markdown transformation engine inside Marka');
        expect(instructions).toContain('Use tables for genuine comparisons');
        expect(instructions).not.toContain('<p-title>');
    });

    it('accepts only registered preset ids', () => {
        expect(SERVER_DEFAULT_AI_FORMATTING_PRESET).toBe(CLIENT_DEFAULT_AI_FORMATTING_PRESET);
        for (const preset of aiFormattingPresets) {
            expect(isAiFormattingPresetId(preset.id)).toBe(true);
        }
        expect(isAiFormattingPresetId('rewrite')).toBe(false);
    });
});
