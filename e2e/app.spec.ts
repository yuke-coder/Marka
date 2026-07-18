import { expect, test } from '@playwright/test';

function buildLongMarkdown() {
    return Array.from({ length: 120 }, (_, index) => `## Section ${index + 1}\n\n这是第 ${index + 1} 段内容，用来验证编辑器和预览区的滚动同步是否稳定。\n\n`).join('');
}

async function waitForScrollableArea(page: import('@playwright/test').Page, testId: string) {
    await expect
        .poll(
            async () =>
                page.evaluate((id) => {
                    const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
                    if (!element) return -1;
                    return element.scrollHeight - element.clientHeight;
                }, testId),
            {
                timeout: 8000,
                intervals: [100, 150, 250]
            }
        )
        .toBeGreaterThan(200);
}

async function setScrollRatio(page: import('@playwright/test').Page, testId: string, ratio: number) {
    await page.evaluate(
        ([id, nextRatio]) => {
            const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
            if (!element) return;

            const maxScroll = element.scrollHeight - element.clientHeight;
            if (maxScroll <= 0) {
                element.scrollTop = 0;
                return;
            }

            element.scrollTop = maxScroll * nextRatio;
            element.dispatchEvent(new Event('scroll'));
        },
        [testId, ratio] as const
    );
}

async function scrollAndWaitForSync(
    page: import('@playwright/test').Page,
    sourceTestId: string,
    targetTestId: string,
    targetRatio: number
) {
    await expect
        .poll(
            async () => {
                await setScrollRatio(page, sourceTestId, targetRatio);

                return page.evaluate(([sourceId, targetId, expectedRatio]) => {
                    const source = document.querySelector(`[data-testid="${sourceId}"]`) as HTMLElement | null;
                    const target = document.querySelector(`[data-testid="${targetId}"]`) as HTMLElement | null;
                    if (!source || !target) return Number.POSITIVE_INFINITY;

                    const sourceMax = source.scrollHeight - source.clientHeight;
                    const targetMax = target.scrollHeight - target.clientHeight;
                    if (sourceMax <= 0 || targetMax <= 0) return Number.POSITIVE_INFINITY;

                    const sourceRatio = source.scrollTop / sourceMax;
                    const targetRatio = target.scrollTop / targetMax;

                    if (Math.abs(sourceRatio - expectedRatio) >= 0.06 || target.scrollTop <= 0) {
                        return Number.POSITIVE_INFINITY;
                    }

                    return Math.abs(targetRatio - expectedRatio);
                }, [sourceTestId, targetTestId, targetRatio] as const);
            },
            {
                timeout: 8000,
                intervals: [100, 150, 250]
            }
        )
        .toBeLessThan(0.12);
}

test('renders bold text with punctuation without leaking markdown markers', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-input');
    await editor.fill('2025年初，伦敦黄金市场的一个月拆借利率一度升至**5%**。');

    const preview = page.getByTestId('preview-content');
    await expect(preview.locator('strong')).toHaveText('5%');
    await expect(preview).not.toContainText('**5%**');
    await expect(preview).toContainText('2025年初，伦敦黄金市场的一个月拆借利率一度升至5%。');
});

test('opens AI Markdown as a desktop modal from the header', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByTestId('ai-markdown-open').click();

    await expect(page.getByTestId('ai-desktop-modal')).toBeVisible();
    await expect(page.getByTestId('ai-source-text')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成 Markdown' })).toBeDisabled();
    await expect(page.getByText('改写模式', { exact: true })).toHaveCount(0);

    const presetTrigger = page.getByTestId('ai-formatting-preset-trigger');
    await expect(presetTrigger).toContainText('R-Markdown');
    await presetTrigger.click();
    await expect(page.getByTestId('ai-formatting-preset-menu')).toBeVisible();
    await expect(page.getByTestId('ai-formatting-preset-rmarkdown')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('ai-formatting-preset-standard-markdown').click();
    await expect(presetTrigger).toContainText('标准 Markdown');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('marka:aiFormattingPreset'))).toBe('standard-markdown');

    await page.reload();
    await page.getByTestId('ai-markdown-open').click();
    await expect(page.getByTestId('ai-formatting-preset-trigger')).toContainText('标准 Markdown');
});

test('keeps Atom for 750ms and displays backend AI chunks without a frontend typing queue', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
        localStorage.setItem('marka:scrollSync', 'false');
        const values: string[] = [];
        const phaseTimes: Record<string, number> = {};
        const phaseLabels: Record<string, string> = {};
        (window as any).__aiEditorValues = values;
        (window as any).__aiPhaseTimes = phaseTimes;
        (window as any).__aiPhaseLabels = phaseLabels;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        if (descriptor?.get && descriptor.set) {
            Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
                configurable: true,
                get: descriptor.get,
                set(value: string) {
                    if (this.dataset.testid === 'editor-input') values.push(String(value));
                    descriptor.set?.call(this, value);
                },
            });
        }

        const observePhases = () => {
            const record = () => {
                if (document.querySelector('[data-testid="ai-connection-notice"]') && phaseTimes.connecting == null) {
                    phaseTimes.connecting = performance.now();
                }
                const phaseElement = document.querySelector('[data-ai-generation-phase]');
                const phase = phaseElement?.getAttribute('data-ai-generation-phase');
                if (phase && phaseTimes[phase] == null) {
                    phaseTimes[phase] = performance.now();
                    phaseLabels[phase] = phaseElement?.querySelector('[data-testid="ai-generation-status"]')?.textContent ?? '';
                }
            };
            new MutationObserver(record).observe(document, { attributes: true, childList: true, characterData: true, subtree: true });
            record();
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', observePhases, { once: true });
        } else {
            observePhases();
        }
    });
    await page.goto('/');
    await page.evaluate(() => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.href
                    : input.url;
            if (!url.includes('/api/ai-markdown')) return originalFetch(input, init);

            (window as any).__aiRequestBody = JSON.parse(String(init?.body || '{}'));
            const encoder = new TextEncoder();
            const body = new ReadableStream({
                start(controller) {
                    (window as any).__pushAiDelta = (text: string) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n`));
                    };
                    (window as any).__pushAiReasoning = (text: string, summaryIndex = 0) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.reasoning_summary_text.delta', item_id: 'rs-test', summary_index: summaryIndex, delta: text })}\n\n`));
                    };
                    (window as any).__finishAiReasoning = (parts: string[]) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.output_item.done', item: { id: 'rs-test', type: 'reasoning', summary: parts.map(text => ({ type: 'summary_text', text })) } })}\n\n`));
                    };
                    (window as any).__finishAiStream = () => {
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();
                    };
                },
            });
            return new Response(body, {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' },
            });
        };
    });

    await page.getByTestId('ai-markdown-open').click();
    await page.getByTestId('ai-source-text').fill('验证 AI 状态显示顺序。');
    await page.getByRole('button', { name: '生成 Markdown', exact: true }).click();

    await page.getByRole('button', { name: '确认生成', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__aiRequestBody?.presetId)).toBe('rmarkdown');
    const connectionNotice = page.getByTestId('ai-connection-notice');

    await expect(connectionNotice.locator('span.mt-1')).toHaveText('正在连接大模型');
    await expect(connectionNotice.locator('.atom-spinner')).toHaveCount(1);

    const processing = page.locator('[data-ai-generation-phase="processing"]');
    await expect(processing).toBeVisible({ timeout: 2000 });
    await expect(connectionNotice).toBeHidden();
    await expect(page.locator('.atom-spinner')).toHaveCount(0);
    await expect(processing.getByTestId('ai-generation-status')).toHaveText('处理中');

    await page.waitForTimeout(250);
    await expect(processing).toBeVisible();

    const reasoningParts = ['先分析整体结构，再核对标题与段落。', '最后确认重点与正文组织。', '补充最终校验。'];
    const streamedReasoningText = reasoningParts.slice(0, 2).join('\n\n');
    const reasoningText = reasoningParts.join('\n\n');
    await page.evaluate((text) => {
        (window as any).__firstAiOutputAt = performance.now();
        (window as any).__pushAiReasoning(text, 0);
    }, reasoningParts[0]);

    const thinking = page.locator('[data-ai-generation-phase="thinking"]');
    await expect(thinking).toBeVisible({ timeout: 1000 });
    await expect(thinking.getByTestId('ai-generation-status')).toHaveText('正在思考');
    await expect(thinking.locator('.ai-thinking-dots > span')).toHaveCount(3);
    await expect(thinking.getByTestId('ai-thinking-content')).toHaveText(reasoningParts[0], { timeout: 250 });

    await page.evaluate((text) => (window as any).__pushAiReasoning(text, 1), reasoningParts[1]);
    await expect(thinking.getByTestId('ai-thinking-content')).toHaveText(streamedReasoningText, { timeout: 250 });

    const timing = await page.evaluate(() => ({
        phaseTimes: (window as any).__aiPhaseTimes as Record<string, number>,
        firstOutputAt: (window as any).__firstAiOutputAt as number,
    }));
    const phaseTimes = timing.phaseTimes;
    const phaseLabels = await page.evaluate(() => (window as any).__aiPhaseLabels as Record<string, string>);
    expect(phaseLabels.processing).toBe('处理中');
    expect(phaseTimes.processing - phaseTimes.connecting).toBeGreaterThanOrEqual(700);
    expect(phaseTimes.processing - phaseTimes.connecting).toBeLessThan(1200);
    expect(phaseTimes.thinking - timing.firstOutputAt).toBeLessThan(250);
    const finalizing = page.locator('[data-ai-generation-phase="finalizing"]');
    await expect(finalizing).toHaveCount(0);
    await page.evaluate((parts) => (window as any).__finishAiReasoning(parts), reasoningParts);
    await expect(thinking.getByTestId('ai-thinking-content')).toHaveText(reasoningText, { timeout: 250 });
    await expect(finalizing).toHaveCount(0);

    const answerChunks = ['甲乙丙', '丁戊己'];
    const answerText = answerChunks.join('');
    const preview = page.getByTestId('preview-content');
    await page.evaluate((text) => {
        (window as any).__firstAiBodyAt = performance.now();
        (window as any).__pushAiDelta(text);
    }, answerChunks[0]);
    await expect(finalizing).toBeVisible();
    await expect(finalizing.getByTestId('ai-generation-status')).toHaveText('生成最终结果');
    await expect(page.getByTestId('editor-input')).toHaveValue(answerChunks[0], { timeout: 250 });
    expect(await page.evaluate(() => (window as any).__aiPhaseTimes.finalizing - (window as any).__firstAiBodyAt)).toBeLessThan(250);
    await expect(preview).not.toContainText(answerChunks[0]);

    await page.evaluate((text) => (window as any).__pushAiDelta(text), answerChunks[1]);
    await expect(page.getByTestId('editor-input')).toHaveValue(answerText, { timeout: 250 });
    await expect(preview).not.toContainText(answerText);
    await page.waitForTimeout(100);
    await expect(page.locator('[data-ai-generation-phase="completed"]')).toHaveCount(0);
    await page.evaluate(() => (window as any).__finishAiStream());

    const completed = page.locator('[data-ai-generation-phase="completed"]');
    await expect(completed).toBeVisible();
    const completedStatus = completed.getByTestId('ai-generation-status');
    const completedShimmer = completed.getByTestId('ai-generation-shimmer');
    await expect(completedStatus).toHaveText('完成回答');
    await expect(completedShimmer).toHaveClass(/ai-generation-label--once/);
    await expect(completedShimmer).toHaveClass(/ai-generation-label--active/, { timeout: 2000 });

    const completedAnimation = await completedShimmer.locator('.ai-generation-label__sweep').evaluate((element) => {
        const animation = element.getAnimations()[0];
        const timing = animation?.effect?.getTiming();
        return timing ? { duration: timing.duration, iterations: timing.iterations } : null;
    });
    expect(completedAnimation).toMatchObject({ duration: 1000, iterations: 1 });
    await expect(completedShimmer).not.toHaveClass(/ai-generation-label--active/, { timeout: 2000 });
    await page.waitForTimeout(4200);
    await expect(completedShimmer).not.toHaveClass(/ai-generation-label--active/);
    await expect(page.getByTestId('editor-input')).toHaveValue(answerText);
    await expect(preview).toContainText(answerText);

    const values = await page.evaluate(() => (window as any).__aiEditorValues as string[]);
    expect(values.some(value => value.includes(reasoningText.slice(0, 8)))).toBe(false);
    expect(values).toContain(answerChunks[0]);
    expect(values).toContain(answerText);
    expect(values).not.toContain('甲');
    expect(values).not.toContain('甲乙');
    expect(values).not.toContain('甲乙丙丁');
    expect(values).not.toContain('甲乙丙丁戊');

    const scrollMetrics = await page.evaluate(() => {
        const editor = document.querySelector<HTMLTextAreaElement>('[data-testid="editor-input"]');
        const status = document.querySelector<HTMLElement>('[data-ai-generation-phase="completed"]');
        if (!editor || !status) throw new Error('Missing completed editor status');

        editor.style.flex = 'none';
        editor.style.height = '140px';
        editor.value = Array.from({ length: 100 }, (_, index) => `第 ${index + 1} 行`).join('\n');
        const before = status.getBoundingClientRect().top;
        editor.scrollTop = 80;
        editor.dispatchEvent(new Event('scroll', { bubbles: true }));

        return {
            before,
            after: status.getBoundingClientRect().top,
            scrollTop: editor.scrollTop,
        };
    });
    expect(scrollMetrics.scrollTop).toBeGreaterThan(0);
    expect(scrollMetrics.before - scrollMetrics.after).toBeCloseTo(scrollMetrics.scrollTop, 0);
});

test('interrupts Atom on an early model delta and preserves manual thinking disclosure state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.href
                    : input.url;
            if (!url.includes('/api/ai-markdown')) return originalFetch(input, init);

            const encoder = new TextEncoder();
            const body = new ReadableStream({
                start(controller) {
                    (window as any).__pushDisclosureReasoning = (text: string, summaryIndex: number) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.reasoning_summary_text.delta', item_id: 'rs-disclosure', summary_index: summaryIndex, delta: text })}\n\n`));
                    };
                    (window as any).__finishDisclosureReasoning = (parts: string[]) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.output_item.done', item: { id: 'rs-disclosure', type: 'reasoning', summary: parts.map(text => ({ type: 'summary_text', text })) } })}\n\n`));
                    };
                    (window as any).__pushDisclosureAnswer = (text: string) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n`));
                    };
                    (window as any).__finishDisclosureStream = () => {
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();
                    };
                },
            });
            return new Response(body, {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' },
            });
        };
    });

    await page.getByTestId('ai-markdown-open').click();
    await page.getByTestId('ai-source-text').fill('验证思考内容折叠控制。');
    await page.getByRole('button', { name: '生成 Markdown', exact: true }).click();
    await page.getByRole('button', { name: '确认生成', exact: true }).click();

    const reasoningParts = ['先检查输入结构。', '再组织最终答案。'];
    const connectionNotice = page.getByTestId('ai-connection-notice');
    await expect(connectionNotice).toBeVisible();
    await page.evaluate((text) => {
        (window as any).__earlyDisclosureOutputAt = performance.now();
        (window as any).__pushDisclosureReasoning(text, 0);
    }, reasoningParts[0]);
    await expect(connectionNotice).toBeHidden({ timeout: 500 });
    await expect(page.locator('[data-ai-generation-phase="thinking"]')).toBeVisible({ timeout: 500 });
    const earlyOutputLag = await page.evaluate(() => performance.now() - (window as any).__earlyDisclosureOutputAt);
    expect(earlyOutputLag).toBeLessThan(500);

    const disclosure = page.locator('[data-ai-generation-phase] button[aria-expanded]');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('ai-thinking-content')).toHaveText(reasoningParts[0]);

    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await page.evaluate((text) => (window as any).__pushDisclosureReasoning(text, 1), reasoningParts[1]);
    await page.waitForTimeout(350);
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('ai-thinking-content')).toHaveText(reasoningParts.join('\n\n'));

    await page.evaluate(({ parts, answer }) => {
        (window as any).__finishDisclosureReasoning(parts);
        (window as any).__pushDisclosureAnswer(answer);
    }, { parts: reasoningParts, answer: '正文第一句。' });
    await expect(page.locator('[data-ai-generation-phase="finalizing"]')).toBeVisible();
    await expect(page.getByTestId('editor-input')).toHaveValue('正文第一句。');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

    await disclosure.click();
    await page.evaluate(() => (window as any).__pushDisclosureAnswer('正文第二句。'));
    await expect(page.getByTestId('editor-input')).toHaveValue('正文第一句。正文第二句。');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    await page.evaluate(() => (window as any).__finishDisclosureStream());
    await expect(page.locator('[data-ai-generation-phase="completed"]')).toBeVisible();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
});

test('opens AI Markdown as a mobile bottom sheet from the header', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByTestId('ai-markdown-open').click();

    await expect(page.getByTestId('ai-mobile-sheet')).toBeVisible();
    await expect(page.getByTestId('ai-source-text')).toBeVisible();
});

test('syncs editor and PC preview scrolling in both directions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const editor = page.getByTestId('editor-input');
    await editor.fill(buildLongMarkdown());
    await waitForScrollableArea(page, 'editor-input');
    await waitForScrollableArea(page, 'preview-outer-scroll');

    await scrollAndWaitForSync(page, 'editor-input', 'preview-outer-scroll', 0.72);
    await scrollAndWaitForSync(page, 'preview-outer-scroll', 'editor-input', 0.28);
});

test('renders the persisted desktop layout in place on refresh and still animates user layout changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
        localStorage.setItem('marka:splitRatio', '38.2');
        localStorage.setItem('marka:editorCollapsed', 'false');
        localStorage.setItem('marka:previewCollapsed', 'false');
        localStorage.setItem('marka:editorOnRight', 'false');

        const frames: Array<{ editorX: number; editorWidth: number; previewX: number; previewWidth: number }> = [];
        (window as any).__initialLayoutFrames = frames;
        const capture = () => {
            const editor = document.querySelector<HTMLElement>('[data-testid="editor-input"]');
            const preview = document.querySelector<HTMLElement>('[data-testid="preview-outer-scroll"]');
            if (editor && preview) {
                const editorRect = editor.getBoundingClientRect();
                const previewRect = preview.getBoundingClientRect();
                frames.push({
                    editorX: editorRect.x,
                    editorWidth: editorRect.width,
                    previewX: previewRect.x,
                    previewWidth: previewRect.width,
                });
            }
            if (frames.length < 24) requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
    });

    await page.goto('/');
    await page.waitForFunction(() => (window as any).__initialLayoutFrames?.length >= 24);

    const initialFrames = await page.evaluate(() => (window as any).__initialLayoutFrames as Array<{
        editorX: number;
        editorWidth: number;
        previewX: number;
        previewWidth: number;
    }>);
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(initialFrames[0].editorWidth).toBeGreaterThan(500);
    expect(initialFrames[0].previewWidth).toBeGreaterThan(800);
    expect(spread(initialFrames.map(frame => frame.editorX))).toBeLessThan(1);
    expect(spread(initialFrames.map(frame => frame.editorWidth))).toBeLessThan(1);
    expect(spread(initialFrames.map(frame => frame.previewX))).toBeLessThan(1);
    expect(spread(initialFrames.map(frame => frame.previewWidth))).toBeLessThan(1);

    await page.evaluate(() => {
        const widths: number[] = [];
        (window as any).__layoutTransitionWidths = widths;
        const capture = () => {
            const preview = document.querySelector<HTMLElement>('[data-testid="preview-outer-scroll"]');
            if (preview) widths.push(preview.getBoundingClientRect().width);
            if (widths.length < 50) requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
    });
    await page.getByTestId('collapse-editor').click();
    await page.waitForFunction(() => (window as any).__layoutTransitionWidths?.length >= 50);

    const transitionWidths = await page.evaluate(() => (window as any).__layoutTransitionWidths as number[]);
    const distinctWidths = new Set(transitionWidths.map(width => Math.round(width * 10))).size;
    expect(spread(transitionWidths)).toBeGreaterThan(400);
    expect(distinctWidths).toBeGreaterThan(3);
});

test('opens the text view menu on hover and switches layout modes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const trigger = page.getByTestId('view-trigger');
    const originalToolbarControls = [
        'collapse-editor',
        'collapse-preview',
        'swap-panels',
        'device-mobile',
        'device-tablet',
        'device-pc',
        'zoom-out',
        'zoom-reset',
        'zoom-in',
        'scroll-sync-toggle',
        'import-button',
        'export-trigger',
        'copy-markdown-button',
        'copy-button',
    ];
    for (const testId of originalToolbarControls) {
        await expect(page.getByTestId(testId)).toBeVisible();
    }

    const collapseEditor = page.getByTestId('collapse-editor');
    const collapsePreview = page.getByTestId('collapse-preview');
    const swapPanels = page.getByTestId('swap-panels');
    await collapseEditor.click();
    await expect(collapseEditor).toHaveAttribute('aria-pressed', 'true');
    await expect(collapsePreview).toBeDisabled();
    await expect(swapPanels).toBeDisabled();
    await collapseEditor.click();
    await expect(collapseEditor).toHaveAttribute('aria-pressed', 'false');
    await expect(collapsePreview).toBeEnabled();
    await expect(swapPanels).toBeEnabled();
    await swapPanels.click();
    await expect(swapPanels).toHaveAttribute('aria-pressed', 'true');
    await swapPanels.click();
    await expect(swapPanels).toHaveAttribute('aria-pressed', 'false');

    await expect(trigger).toHaveText(/视图/);
    await trigger.hover();

    const menu = page.getByTestId('view-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitemradio')).toHaveCount(5);
    await expect(page.getByTestId('view-both')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('view-editor-left')).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('view-edit').click();
    await expect(page.getByTestId('view-menu')).toBeHidden();

    await trigger.hover();
    await expect(page.getByTestId('view-edit')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('view-editor-left')).toHaveCount(0);
    await expect(page.getByTestId('view-editor-right')).toHaveCount(0);

    await page.getByTestId('view-both').click();

    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await page.getByTestId('view-editor-right').click();
    await expect.poll(async () => {
        const editor = await page.getByTestId('editor-input').boundingBox();
        const preview = await page.getByTestId('preview-outer-scroll').boundingBox();
        if (!editor || !preview) return false;
        return editor.x > preview.x;
    }).toBe(true);

    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('view-editor-right')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('view-editor-left').click();
    await expect.poll(async () => {
        const editor = await page.getByTestId('editor-input').boundingBox();
        const preview = await page.getByTestId('preview-outer-scroll').boundingBox();
        if (!editor || !preview) return false;
        return editor.x < preview.x;
    }).toBe(true);

    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await page.getByTestId('view-preview').click();
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('view-editor-left')).toHaveCount(0);
    await expect(page.getByTestId('view-editor-right')).toHaveCount(0);
});

test('enters existing immersive mode from page fullscreen and exits with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByTestId('view-trigger').hover();
    await page.getByTestId('view-page-fullscreen').click();

    await expect(page.getByTestId('view-trigger')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('view-trigger')).toBeVisible();
});

test('supports keyboard navigation in the view menu', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const trigger = page.getByTestId('view-trigger');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('view-both')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('view-edit')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.getByTestId('view-menu')).toBeHidden();
});

test('keeps the simulated device centered when editor and preview swap sides', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('marka:previewZoom', '2'));
    await page.goto('/');
    await page.getByTestId('device-mobile').click();

    const centerOffset = () => page.evaluate(() => {
        const preview = document.querySelector('[data-testid="preview-outer-scroll"]')?.getBoundingClientRect();
        const frame = document.querySelector('[data-testid="preview-device-frame"]')?.getBoundingClientRect();
        if (!preview || !frame) return Number.POSITIVE_INFINITY;
        return Math.abs((preview.left + preview.width / 2) - (frame.left + frame.width / 2));
    });

    await expect.poll(centerOffset).toBeLessThan(1);
    await page.getByTestId('swap-panels').click();
    await expect.poll(centerOffset).toBeLessThan(1);
});

test('renders R-Markdown imports through the compatibility preview', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const source = [
        '<p-title num="01" title="组件演示" level="1"></p-title>',
        '<steps title="流程">',
        '- 输入 | 内容',
        '</steps>',
    ].join('\n');

    await page.getByTestId('import-file-input').setInputFiles({
        name: 'R-Markdown示例.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from(source),
    });

    await expect(page.getByTestId('editor-input')).toHaveValue(source);
    const preview = page.getByTestId('preview-content');
    await expect(preview.locator('[data-rmarkdown-component="p-title"]')).toContainText('组件演示');
    await expect(preview.locator('[data-rmarkdown-component="steps"]')).toContainText('输入');
    await expect(preview).not.toContainText('<p-title');
    await expect(preview).not.toContainText('<steps');
});

test('imports Skill HTML through the isolated fidelity path', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const source = [
        '<section id="skill-root" style="display:flex;color:#059669;margin:7px">',
        '  <span leaf="" style="font-size:23px;font-weight:900">保真排版</span>',
        '  <script>window.__importedScriptRan = true</script>',
        '</section>',
    ].join('\n');

    await page.getByTestId('import-file-input').setInputFiles({
        name: 'skill-output.html',
        mimeType: 'text/html',
        buffer: Buffer.from(source),
    });

    await expect(page.getByTestId('html-mode-badge')).toHaveCount(0);
    await expect(page.getByTestId('copy-markdown-button')).toContainText('复制 HTML');
    await expect(page.getByTestId('editor-input')).toHaveValue(source);
    await expect(page.getByTestId('theme-selector')).toBeVisible();
    await expect(page.getByTestId('theme-apple')).toBeDisabled();
    await expect(page.getByTestId('theme-selector-more')).toBeDisabled();
    await expect(page.getByTestId('scroll-sync-toggle')).toBeVisible();
    await expect(page.getByTestId('scroll-sync-toggle')).toBeEnabled();

    await page.getByTestId('export-trigger').hover();
    await expect(page.getByTestId('export-source')).toBeVisible();
    await expect(page.getByTestId('export-source')).toBeEnabled();
    await expect(page.getByTestId('export-source')).toContainText('HTML 源文件');
    await expect(page.getByTestId('export-doc')).toBeVisible();
    await expect(page.getByTestId('export-doc')).toBeDisabled();
    await expect(page.getByTestId('export-pdf')).toBeVisible();
    await expect(page.getByTestId('export-pdf')).toBeDisabled();
    await expect(page.getByTestId('export-html')).toBeVisible();
    await expect(page.getByTestId('export-html')).toBeEnabled();
    await expect(page.getByTestId('export-png')).toBeVisible();
    await expect(page.getByTestId('export-png')).toBeDisabled();

    const iframe = page.getByTestId('html-preview-frame');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');

    const preview = page.frameLocator('[data-testid="html-preview-frame"]');
    await expect(preview.locator('#skill-root')).toHaveCSS('display', 'flex');
    await expect(preview.locator('#skill-root')).toHaveCSS('color', 'rgb(5, 150, 105)');
    await expect(preview.locator('[leaf]')).toHaveCSS('font-size', '23px');
    await expect(preview.locator('script')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __importedScriptRan?: boolean }).__importedScriptRan))).toBe(false);

    await expect.poll(() => page.evaluate(() => {
        const raw = localStorage.getItem('marka:document');
        return raw ? JSON.parse(raw) : null;
    })).toEqual({
        version: 2,
        document: { kind: 'html', source },
    });
    expect(await page.evaluate(() => localStorage.getItem('marka:content'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('marka:documentMode'))).toBeNull();

    await page.reload();
    await expect(page.getByTestId('html-mode-badge')).toHaveCount(0);
    await expect(page.getByTestId('editor-input')).toHaveValue(source);

    await page.getByTestId('editor-input').evaluate((element: HTMLTextAreaElement) => {
        element.focus();
        element.setSelectionRange(element.value.length, element.value.length);
    });
    await page.getByTestId('import-file-input').setInputFiles({
        name: 'cover.png',
        mimeType: 'image/png',
        buffer: Buffer.from('image'),
    });
    await expect.poll(() => page.getByTestId('editor-input').inputValue()).toContain('<img src="data:image/png;base64,');
    expect(await page.getByTestId('editor-input').inputValue()).not.toContain('![');
});

test('zooms HTML preview and syncs HTML scrolling in both directions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
        localStorage.setItem('marka:scrollSync', 'true');
        localStorage.setItem('marka:editorZoom', '1');
        localStorage.setItem('marka:previewZoom', '1');
    });
    await page.goto('/');

    const source = [
        '<main style="padding:24px">',
        ...Array.from(
            { length: 120 },
            (_, index) => `<section style="min-height:96px"><h2>HTML Section ${index + 1}</h2><p>同步滚动内容 ${index + 1}</p></section>`,
        ),
        '</main>',
    ].join('\n');
    await page.getByTestId('import-file-input').setInputFiles({
        name: 'long-layout.html',
        mimeType: 'text/html',
        buffer: Buffer.from(source),
    });

    const editor = page.getByTestId('editor-input');
    const frameHtml = page.frameLocator('[data-testid="html-preview-frame"]').locator('html');
    await waitForScrollableArea(page, 'editor-input');
    await expect.poll(() => frameHtml.evaluate((element) => {
        const scroller = element.ownerDocument.scrollingElement;
        return scroller ? scroller.scrollHeight - scroller.clientHeight : -1;
    })).toBeGreaterThan(200);

    await setScrollRatio(page, 'editor-input', 0.72);
    await expect.poll(() => frameHtml.evaluate((element) => {
        const scroller = element.ownerDocument.scrollingElement;
        if (!scroller) return -1;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        return maxScroll > 0 ? scroller.scrollTop / maxScroll : 0;
    })).toBeCloseTo(0.72, 1);

    await frameHtml.evaluate((element) => {
        const scroller = element.ownerDocument.scrollingElement;
        if (!scroller) return;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = maxScroll * 0.28;
    });
    await expect.poll(() => editor.evaluate((element: HTMLTextAreaElement) => {
        const maxScroll = element.scrollHeight - element.clientHeight;
        return maxScroll > 0 ? element.scrollTop / maxScroll : 0;
    })).toBeCloseTo(0.28, 1);

    await page.getByTestId('html-preview-frame').hover();
    await page.getByTestId('zoom-in').click();
    await expect(page.getByTestId('zoom-reset')).toHaveText('105%');
    await expect(page.getByTestId('preview-zoom-wrapper')).toHaveAttribute('style', /scale\(1\.05\)/);

    await page.getByTestId('html-preview-frame').hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('zoom-reset')).toHaveText('110%');
});

test('recognizes pasted HTML source without hijacking ordinary rich-text paste', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const editor = page.getByTestId('editor-input');
    await editor.evaluate((element: HTMLTextAreaElement) => {
        const clipboard = new DataTransfer();
        clipboard.setData('text/plain', '普通富文本');
        clipboard.setData('text/html', '<p><strong>普通富文本</strong></p>');
        element.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: clipboard,
            bubbles: true,
            cancelable: true,
        }));
    });

    await expect(editor).toHaveValue(/\*\*普通富文本\*\*/);
    await expect(page.getByTestId('html-mode-badge')).toHaveCount(0);

    const htmlSource = '<section id="pasted-html"><span leaf="" style="color:#059669">粘贴保真</span></section>';
    await editor.evaluate((element: HTMLTextAreaElement, source) => {
        const clipboard = new DataTransfer();
        clipboard.setData('text/plain', source);
        element.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: clipboard,
            bubbles: true,
            cancelable: true,
        }));
    }, htmlSource);

    await expect(page.getByTestId('html-mode-badge')).toHaveCount(0);
    await expect(page.getByTestId('copy-markdown-button')).toContainText('复制 HTML');
    await expect(editor).toHaveValue(htmlSource);
    const preview = page.frameLocator('[data-testid="html-preview-frame"]');
    await expect(preview.locator('#pasted-html')).toContainText('粘贴保真');
    await expect(preview.locator('[leaf]')).toHaveCSS('color', 'rgb(5, 150, 105)');
});
