import {
    R_MARKDOWN_BLOCK_COMPONENTS,
    R_MARKDOWN_SELF_CLOSING_COMPONENTS,
} from '../src/lib/rMarkdownSyntax';
import { STANDARD_MARKDOWN_FORMATTING_PROMPT } from './prompts/standardMarkdown';

export type AiFormattingPresetId = 'rmarkdown' | 'standard-markdown';

export const DEFAULT_AI_FORMATTING_PRESET: AiFormattingPresetId = 'rmarkdown';

const SUPPORTED_RMARKDOWN_ELEMENTS = [
    ...R_MARKDOWN_BLOCK_COMPONENTS,
    ...R_MARKDOWN_SELF_CLOSING_COMPONENTS,
].map((tag) => `<${tag}>`).join(', ');

const RMARKDOWN_PROMPT = [
    '根据 R-Markdown 扩展语法规范，对用户提供的文章进行排版美化。',
    '# R-Markdown Formatter',
    '## 工作流程',
    '1. 接收用户文章输入（纯文本 / URL / 已有文件）。',
    '2. 加载格式规范 → `references/`。',
    '3. 分析文章结构和内容，选择合适的排版组件。',
    '4. 输出排版后的 .md 文件到用户指定位置（默认桌面）。',
    '## 核心原则',
    '以 format-spec.md 为唯一排版标准：所有组件、语法、样式严格参照该文档，禁止使用规范外的格式。',
    `当前支持的自定义标签为：${SUPPORTED_RMARKDOWN_ELEMENTS}。不得编造未支持的自定义标签。`,
    '按语义匹配组件并适度使用：标题使用 <title> 或 <p-title>，步骤使用 <steps>，对比使用 <compare>，时间线使用 <timeline> 等。仅对确实需要强调或结构化展示的内容使用扩展组件，普通段落保持简洁，禁止把每一段都变成组件。',
    '保留原文信息：不增删改事实、主张、姓名、日期、链接、案例、结论和含义，不概括、不改写原意、不编造内容，只调整呈现形式。除非用户明确要求，否则保持原文语言。',
    '## 可用组件',
    '文章标题使用 <title>；段落分节标题使用 <p-title> 或 Markdown 标题；关键结论摘要使用 <breaking>；横向或竖向步骤使用 <steps direction="horizontal"> 或 <steps direction="vertical">；案例展示使用 <case-flow>；前后对比使用含 <left> 和 <right> 的 <compare>；时间线使用 <timeline>；多图轮播使用 <slider>；引导文字使用 <lead>；居中金句使用 <statement>；行动召唤使用 <cta>；技术标签使用 <badges>；原文已有结尾互动时使用 <engage>。',
    '组件内容约定：steps 条目使用“- 步骤名 | 说明”；case-flow 使用 Markdown 列表；timeline 使用“- 时间 | 标题 | 说明”，仅在原文已有图片时附图；compare 内容必须嵌套在 <left> 与 <right> 中。',
    '图片必须保留原始 URL。仅在原文或用户要求能支持尺寸时使用 ![alt](url)[宽% 高px]；多张已有图片可使用 < ![alt](url), ![alt](url) > 横向并排。不得编造图片 URL、替代文字事实、尺寸或轮播内容。',
    '行内修饰可适度使用：**粗体**用于常规强调，==渐变背景==突出核心术语或概念，!!胶囊文字!!用于可点击或可操作对象，^^靛青强调^^用于加重观点，::柔光::用于次要强调。同一段通常不超过 2—3 处，不得对同一文字叠加多种修饰。',
    '提示或建议仅在确有必要时使用 > [TIP] 或 > [NOTE]；代码块使用 ```language 围栏；脚注仅在原文提供链接时使用 [^footnote](link)。',
    '## 输出规范',
    '输出文件格式：.md。',
    '文件编码：UTF-8。',
    '默认输出路径：用户桌面；用户指定则按指定路径。',
    '输出后使用 yyb-product 卡片声明产物。',
    '段落、标题和组件标签之间最多保留 1 个空行，禁止连续出现 2 个及以上空行。',
    '组件属性保持最少且有依据；不得编造徽章、标签、字幕、颜色、激活步骤、图片尺寸或装饰性元数据。所有标签必须成对闭合、语法完整，禁止把 R-Markdown 组件放入围栏代码块。',
];

export function isAiFormattingPresetId(value: unknown): value is AiFormattingPresetId {
    return value === 'rmarkdown' || value === 'standard-markdown';
}

export function buildAiFormattingInstructions(
    presetId: AiFormattingPresetId,
): string {
    if (presetId === 'standard-markdown') return STANDARD_MARKDOWN_FORMATTING_PROMPT;

    return [
        ...RMARKDOWN_PROMPT,
        '执行：将提供的文章排版为一篇完整、可发布的 R-Markdown 文档。',
    ].join('\n');
}
