import { describe, expect, it } from 'vitest';
import {
    AI_FORMATTING_PRESETS,
    DEFAULT_AI_FORMATTING_PRESET,
    isAiFormattingPresetId,
} from './aiFormattingPresets';

describe('AI formatting preset', () => {
    it('fixes output to the R-Markdown WeChat format', () => {
        expect(DEFAULT_AI_FORMATTING_PRESET).toBe('rmarkdown');
        expect(AI_FORMATTING_PRESETS).toEqual([
            expect.objectContaining({
                id: 'rmarkdown',
                label: 'R-Markdown',
                highlights: ['标题层级', '引用样式', '图文节奏'],
            }),
            expect.objectContaining({
                id: 'standard-markdown',
                label: '标准 Markdown',
                highlights: ['暖橙强调', '居中章节', '金句卡片'],
            }),
        ]);
        expect(isAiFormattingPresetId('rmarkdown')).toBe(true);
        expect(isAiFormattingPresetId('standard-markdown')).toBe(true);
    });

    it('rejects the removed and unknown format ids', () => {
        expect(isAiFormattingPresetId('rewrite')).toBe(false);
    });
});
