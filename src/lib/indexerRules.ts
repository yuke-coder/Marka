/**
 * 中央索引规则定义
 *
 * 统一管理两套规则：
 * 1. HTML 打标规则 (markdownIndexer.ts)
 * 2. Markdown 反查规则 (markdownLocator.ts)
 *
 * 确保类型名称、索引粒度、跳过逻辑完全一致
 */

/**
 * 元素类型定义
 */
export type ElementType = 'heading' | 'paragraph' | 'list' | 'quote' | 'code' | 'table' | 'hr' | 'image';

/**
 * 所有元素类型列表
 */
const ELEMENT_TYPES: readonly ElementType[] = [
  'heading',
  'paragraph',
  'list',
  'quote',
  'code',
  'table',
  'hr',
  'image'
];

/**
 * Markdown 检测规则
 * 用于 markdownLocator.ts 从文本反查
 */
export const MARKDOWN_RULES: Readonly<Record<ElementType, {
  /** 检测当前行是否是该类型 */
  match: (trimmed: string) => boolean;
  /** 是否跳过分隔符行（可选） */
  skip?: (trimmed: string) => boolean;
}>> = Object.freeze({
  heading: Object.freeze({
    match: (trimmed: string) => /^#{1,6}\s/.test(trimmed),
  }),

  paragraph: Object.freeze({
    match: (trimmed: string) => {
      if (!trimmed) return false;
      // 非块级元素的普通文本行
      if (trimmed.startsWith('#')) return false;
      if (trimmed.startsWith('>')) return false;
      if (trimmed.startsWith('```')) return false;
      if (trimmed.startsWith('|')) return false;
      if (/^[-*+]\s/.test(trimmed)) return false;
      if (/^\d+\.\s/.test(trimmed)) return false;
      if (/^[-*_]{3,}$/.test(trimmed)) return false;
      return true;
    },
  }),

  list: Object.freeze({
    match: (trimmed: string) => /^\s*[-*+]\s+/.test(trimmed) || /^\s*\d+\.\s+/.test(trimmed),
  }),

  quote: Object.freeze({
    match: (trimmed: string) => /^>\s/.test(trimmed),
  }),

  code: Object.freeze({
    match: (trimmed: string) => trimmed.startsWith('```'),
  }),

  table: Object.freeze({
    match: (trimmed: string) => trimmed.startsWith('|'),
    // 跳过分隔符行，如 |---|---| 或 |:---|:---|
    skip: (trimmed: string) => {
      // 匹配分隔符行：全是 -:|= 和空格
      const cleaned = trimmed.replace(/[\s|:|-]/g, '');
      return cleaned === '' && trimmed.includes('-');
    },
  }),

  hr: Object.freeze({
    match: (trimmed: string) => /^[-*_]{3,}$/.test(trimmed),
  }),

  image: Object.freeze({
    match: (_trimmed: string) => false, // 图片不在行级别处理
  }),
});

/**
 * 检查元素类型是否有效
 */
export function isValidElementType(type: string): type is ElementType {
  return (ELEMENT_TYPES as readonly string[]).includes(type);
}

/**
 * 检测 Markdown 行是否应该跳过（不计入索引）
 * @param trimmed 去掉首尾空白后的行
 * @param type 元素类型
 * @returns 是否跳过
 */
export function shouldSkipMarkdownLine(trimmed: string, type: ElementType): boolean {
  const rule = MARKDOWN_RULES[type];
  return rule.skip ? rule.skip(trimmed) : false;
}
