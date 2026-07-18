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
];

function renderPhase(phase: AiGenerationPhase, aiThinking = '', isAiThinkingExpanded = false) {
    const html = renderToStaticMarkup(createElement(EditorPanel, {
        source: phase === 'finalizing' || phase === 'completed' ? '# AI output' : '',
        onSourceChange: () => undefined,
        editorScrollRef: createRef<HTMLTextAreaElement>(),
        onEditorScroll: () => undefined,
        scrollSyncEnabled: false,
        aiThinking,
        isAiThinkingExpanded,
        onToggleAiThinkingExpanded: () => undefined,
        aiMainTextStarted: phase === 'finalizing' || phase === 'completed',
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
        expect(shimmer?.querySelector('.ai-generation-label__highlight')?.textContent).toBe(visibleLabel);
        expect(shimmer?.querySelector('.ai-generation-label__sweep')?.getAttribute('aria-hidden')).toBe('true');
        expect(panel?.getAttribute('data-ai-generation-phase')).toBe(phase);
        expect(doc.querySelector('[role="status"]')?.textContent).toBe(announcedLabel);
        expect(icon).not.toBeNull();
        expect(icon?.classList.contains('ai-status-sparkle--active')).toBe(phase !== 'completed');
        expect(shimmer?.classList.contains('ai-generation-label--once')).toBe(phase === 'completed');
    });

    it('renders three animated dots only while the model is thinking', () => {
        const thinking = renderPhase('thinking');
        const finalizing = renderPhase('finalizing');

        expect(thinking.querySelectorAll('.ai-thinking-dots > span')).toHaveLength(3);
        expect(finalizing.querySelector('.ai-thinking-dots')).toBeNull();
    });

    it('keeps streamed thinking content inside the gray status surface', () => {
        const expanded = renderPhase('thinking', '先分析结构，再生成正文。', true);
        const collapsed = renderPhase('completed', '先分析结构，再生成正文。', false);

        expect(expanded.querySelector('[data-ai-generation-phase="thinking"] [data-testid="ai-thinking-content"]')?.textContent)
            .toBe('先分析结构，再生成正文。');
        expect(expanded.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
        expect(collapsed.querySelector('[data-testid="ai-thinking-content"]')).toBeNull();
        expect(collapsed.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
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

    it('uses the Codex shimmer cadence, a one-shot completion, and reduced-motion fallback', () => {
        const css = readFileSync('src/index.css', 'utf8');
        const component = readFileSync('src/components/EditorPanel.tsx', 'utf8');

        expect(css).toContain('animation: atom-spinner-animation-1 1s linear infinite');
        expect(css).toContain('animation: ai-status-sparkle-rotate 3s linear infinite');
        expect(css).toContain('animation: ai-thinking-dot 1.18s ease-in-out infinite');
        expect(component).toContain('const CODEX_SHIMMER_SWEEP_MS = 1000');
        expect(component).toContain('const CODEX_SHIMMER_CADENCE_MS = 4000');
        expect(component).toContain('const CODEX_SHIMMER_INITIAL_DELAY_MS = 600');
        expect(css).toContain('-webkit-mask-image: linear-gradient(90deg, transparent 0%, black 20% 30%, transparent 50% 100%)');
        expect(css).toContain('animation-duration: 1s');
        expect(css).toContain('animation-timing-function: steps(48, end)');
        expect(css).toContain('animation-iteration-count: 1');
        expect(css).toMatch(/@keyframes ai-generation-codex-sweep\s*{[\s\S]*?from\s*{\s*transform: translateX\(-50%\);\s*}[\s\S]*?to\s*{\s*transform: translateX\(125%\);/);
        expect(css).toMatch(/@keyframes ai-generation-codex-highlight\s*{[\s\S]*?from\s*{\s*transform: translateX\(50%\);\s*}[\s\S]*?to\s*{\s*transform: translateX\(-125%\);/);
        expect(css).not.toContain('background-clip: text');
        expect(css).toContain('padding-top: calc(var(--ai-status-height) + var(--ai-status-offset))');
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ai-generation-label--active \.ai-generation-label__sweep,[\s\S]*?\.ai-generation-label--active \.ai-generation-label__highlight\s*{\s*animation: none;/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.atom-spinner \.spinner-line,[\s\S]*?\.ai-thinking-dots span,[\s\S]*?\.ai-status-sparkle--active\s*{\s*animation: none;/);
    });
});
