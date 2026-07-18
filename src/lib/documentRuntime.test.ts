import { describe, expect, it } from 'vitest';
import {
    getDocumentFeatureAvailability,
    isDocumentFeatureEnabled,
} from './documentRuntime';

describe('document runtime feature protocol', () => {
    it('keeps the shared shell on one feature contract while runtimes retain their own support matrix', () => {
        expect(isDocumentFeatureEnabled('markdown', 'theme.select')).toBe(true);
        expect(isDocumentFeatureEnabled('markdown', 'export.word')).toBe(true);
        expect(isDocumentFeatureEnabled('html', 'scroll.sync')).toBe(true);
        expect(isDocumentFeatureEnabled('html', 'export.html')).toBe(true);

        expect(getDocumentFeatureAvailability('html', 'theme.select')).toEqual({
            state: 'disabled',
            reason: 'HTML 文档保留原始样式，无法应用 Marka 排版主题',
        });
        expect(getDocumentFeatureAvailability('html', 'export.word')).toEqual({
            state: 'disabled',
            reason: 'HTML Word 导出将在统一导出管线中启用',
        });
    });
});
