import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AI_FORMATTING_PRESET as SERVER_DEFAULT_AI_FORMATTING_PRESET,
    buildAiFormattingInstructions,
    isAiFormattingPresetId,
} from '../../server/aiFormattingPresets';
import {
    DEFAULT_AI_FORMATTING_PRESET as CLIENT_DEFAULT_AI_FORMATTING_PRESET,
} from './aiFormattingPresets';

describe('AI formatting system prompts', () => {
    it('defaults to the R-Markdown preset and embeds its formatting specification', () => {
        const instructions = buildAiFormattingInstructions(SERVER_DEFAULT_AI_FORMATTING_PRESET);

        expect(SERVER_DEFAULT_AI_FORMATTING_PRESET).toBe('rmarkdown');
        expect(instructions).toContain('加载格式规范 → `references/`');
        expect(instructions).toContain('<p-title>');
        expect(instructions).toContain('<steps direction="horizontal">');
        expect(instructions).toContain('<compare>');
        expect(instructions).toContain('<reading-path>');
        expect(instructions).toContain('==渐变背景==');
        expect(instructions).toContain('最多保留 1 个空行');
        expect(instructions).toContain('保留原文信息');
        expect(instructions).toContain('输出后使用 yyb-product 卡片声明产物');
        expect(instructions).not.toContain('直接插入 Marka 编辑器');
        expect(instructions).not.toContain('Additional user requirements');
        expect(instructions).not.toContain('Task: revise');
        expect(instructions).not.toContain('Task: continue');
    });

    it('accepts only the fixed R-Markdown format id', () => {
        expect(SERVER_DEFAULT_AI_FORMATTING_PRESET).toBe(CLIENT_DEFAULT_AI_FORMATTING_PRESET);
        expect(isAiFormattingPresetId('rmarkdown')).toBe(true);
        expect(isAiFormattingPresetId('standard-markdown')).toBe(false);
        expect(isAiFormattingPresetId('rewrite')).toBe(false);
    });
});
