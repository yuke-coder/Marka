import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import EditorPanel from './EditorPanel';
import { AI_CONNECTION_GATE_MS, type AiGenerationPhase } from '../lib/aiMarkdown';

const phaseLabels: Array<[Exclude<AiGenerationPhase, 'idle' | 'connecting'>, string, string]> = [
    ['processing', '处理中', '处理中'],
    ['thinking', '正在思考', '正在思考…'],
    ['finalizing', '生成最终结果', '生成最终结果'],
    ['completed', '完成回答', '完成回答'],
    ['interrupted', '已停止生成', '已停止生成'],
];

function renderPhase(phase: AiGenerationPhase, aiThinking = '', isAiThinkingExpanded = false) {
    const html = renderToStaticMarkup(createElement(EditorPanel, {
        source: phase === 'finalizing' || phase === 'completed' || phase === 'interrupted' ? '# AI output' : '',
        onSourceChange: () => undefined,
        editorScrollRef: createRef<HTMLTextAreaElement>(),
        onEditorScroll: () => undefined,
        scrollSyncEnabled: false,
        aiThinking,
        isAiThinkingExpanded,
        onToggleAiThinkingExpanded: () => undefined,
        aiMainTextStarted: phase === 'finalizing' || phase === 'completed' || phase === 'interrupted',
        aiGenerationPhase: phase,
    }));

    return new DOMParser().parseFromString(html, 'text/html');
}

describe('EditorPanel AI generation status', () => {
    it('caps the Atom connection card at 750ms when no model delta arrives', () => {
        expect(AI_CONNECTION_GATE_MS).toBe(750);
    });

    it.each(phaseLabels)('renders the %s phase in the shared shimmer surface', (phase, visibleLabel, announcedLabel) => {
        const doc = renderPhase(phase);
        const visibleStatus = doc.querySelector('[data-testid="ai-generation-status"]');
        const shimmer = doc.querySelector('[data-testid="ai-generation-shimmer"]');
        const panel = doc.querySelector('[data-ai-generation-phase]');
        const icon = doc.querySelector('.ai-status-sparkle');

        expect(visibleStatus?.textContent).toBe(visibleLabel);
        expect(shimmer?.classList.contains('ai-generation-label')).toBe(true);
        expect(shimmer?.querySelector('.ai-generation-label__ghost')?.textContent).toBe(visibleLabel);
        expect(shimmer?.querySelector('.ai-generation-label__sweep')?.getAttribute('aria-hidden')).toBe('true');
        expect(panel?.getAttribute('data-ai-generation-phase')).toBe(phase);
        expect(doc.querySelector('[role="status"]')?.textContent).toBe(announcedLabel);
        expect(icon).not.toBeNull();
        const terminal = phase === 'completed' || phase === 'interrupted';
        expect(icon?.classList.contains('ai-status-sparkle--active')).toBe(!terminal);
        expect(shimmer?.classList.contains('ai-generation-label--once')).toBe(terminal);
    });

    it('uses the DeepSeek shimmer instead of the old three-dot loader', () => {
        const thinking = renderPhase('thinking');

        expect(thinking.querySelector('.ai-generation-label__sweep')).not.toBeNull();
        expect(thinking.querySelector('.ai-thinking-dots')).toBeNull();
    });

    it('renders streamed thinking content in the borderless DeepSeek surface', () => {
        const expanded = renderPhase('thinking', '先分析 **结构**，再生成正文。', true);
        const collapsed = renderPhase('completed', '先分析结构，再生成正文。', false);
        const surface = expanded.querySelector('[data-ai-generation-phase="thinking"]');

        expect(surface?.classList.contains('ai-thinking-surface')).toBe(true);
        expect(surface?.querySelector('[data-testid="ai-thinking-content"]')?.textContent)
            .toBe('先分析 结构，再生成正文。\n');
        expect(surface?.querySelector('[data-testid="ai-thinking-content"] strong')?.textContent).toBe('结构');
        expect(surface?.querySelector('[data-testid="ai-thinking-content"]')?.innerHTML).not.toContain('**');
        expect(expanded.querySelector('[data-testid="ai-thinking-toggle"]')?.getAttribute('aria-expanded')).toBe('true');
        expect(collapsed.querySelector('[data-testid="ai-thinking-content"]')).toBeNull();
        expect(collapsed.querySelector('[data-testid="ai-thinking-toggle"]')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps incomplete thinking and main text visible after interruption', () => {
        const interrupted = renderPhase('interrupted', '尚未完成的 **思考', true);

        expect(interrupted.querySelector('[data-ai-generation-phase="interrupted"]')).not.toBeNull();
        expect(interrupted.querySelector('[data-testid="ai-thinking-content"]')?.textContent)
            .toContain('尚未完成的 **思考');
        expect(interrupted.querySelector('[data-testid="editor-input"]')?.textContent).toBe('# AI output');
        expect(interrupted.querySelector('[aria-busy="false"]')).not.toBeNull();
    });

    it('keeps connecting out of the gray status surface', () => {
        const doc = renderPhase('connecting');

        expect(doc.querySelector('[data-testid="ai-generation-status"]')).toBeNull();
        expect(doc.querySelector('[data-ai-generation-phase]')).toBeNull();
        expect(doc.querySelector('[data-testid="editor-input"]')).toBeNull();
    });

    it('does not retain the old thought-process surface while idle', () => {
        const doc = renderPhase('idle');

        expect(doc.querySelector('[data-testid="ai-generation-status"]')).toBeNull();
        expect(doc.querySelector('[data-ai-generation-phase]')).toBeNull();
        expect(doc.querySelector('[data-testid="editor-input"]')).not.toBeNull();
    });

    it('hides the editor only while an active stream has not produced its main text', () => {
        const active = renderPhase('processing');
        const idle = renderPhase('idle');

        expect(active.querySelector('[data-testid="editor-input"]')).toBeNull();
        expect(idle.querySelector('[data-testid="editor-input"]')).not.toBeNull();
    });

    it('keeps status announcements outside the busy content subtree', () => {
        const doc = renderPhase('processing');
        const liveStatus = doc.querySelector('[role="status"]');
        const busyContent = doc.querySelector('[aria-busy="true"]');

        expect(liveStatus).not.toBeNull();
        expect(busyContent).not.toBeNull();
        expect(busyContent?.contains(liveStatus)).toBe(false);
    });

    it('places the status surface inside the textarea scroll coordinate space', () => {
        const doc = renderPhase('completed');
        const content = doc.querySelector('.ai-editor-content');
        const panel = doc.querySelector('[data-ai-generation-phase]');
        const editor = doc.querySelector('[data-testid="editor-input"]');

        expect(content?.classList.contains('relative')).toBe(true);
        expect(content?.classList.contains('overflow-hidden')).toBe(true);
        expect(panel?.classList.contains('absolute')).toBe(true);
        expect(editor?.classList.contains('ai-editor-input--with-status')).toBe(true);
    });

    it('uses the DeepSeek shimmer, a one-shot completion, and reduced-motion fallback', () => {
        const css = readFileSync('src/index.css', 'utf8');
        const component = readFileSync('src/components/EditorPanel.tsx', 'utf8');

        expect(css).toContain('animation: atom-spinner-animation-1 1s linear infinite');
        expect(css).toContain('animation: ai-status-sparkle-rotate 3s linear infinite');
        expect(css).toContain('animation: 2s ease-out infinite ai-generation-deepseek-shimmer');
        expect(css).toContain('rgba(255, 255, 255, 0.7) 54.51%');
        expect(css).toMatch(/@keyframes ai-generation-deepseek-shimmer\s*{[\s\S]*?0%\s*{\s*transform: translate\(-100%\);\s*}[\s\S]*?90%, 100%\s*{\s*transform: translate\(100%\);/);
        expect(css).toMatch(/\.ai-generation-label--once \.ai-generation-label__sweep\s*{\s*animation-iteration-count: 1;/);
        expect(css).toMatch(/\.ai-thinking-surface\s*{[\s\S]*?background: transparent;/);
        expect(css).toMatch(/\.ai-thinking-content\s*{[\s\S]*?max-width: none;/);
        expect(css).toContain('padding-top: calc(var(--ai-status-height) + var(--ai-status-offset))');
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.atom-spinner \.spinner-line,[\s\S]*?\.ai-status-sparkle--active,[\s\S]*?\.ai-generation-label__sweep\s*{\s*animation: none;/);
        expect(component).not.toContain('CODEX_SHIMMER');
        expect(css).not.toContain('ai-generation-codex');
    });
});
