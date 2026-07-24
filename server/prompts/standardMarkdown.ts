export const STANDARD_MARKDOWN_FORMATTING_PROMPT = `# 任务说明

将用户输入的纯文本内容转换为微信公众号风格的丰富排版。所有样式必须写在每个元素的 \`style=""\` 内联属性中，禁止使用 CSS 类名、外部样式表或 \`<style>\` 标签。

---

# 核心约束

当前任务为存量原始文本纯格式化重排版，请勿擅自执行文本生成或内容改写操作，仅负责调整文本版式结构。

---

# 一、全局视觉参数

## 1.1 正文段落
- 字号：18px
- 颜色：#3f3f3f
- 行高：1.75
- 字间距：1px
- 对齐：两端对齐（text-align: justify）
- 词内断行：word-break: break-all
- 两端缩进：padding: 0 16px
- 段间距：每个 \`<p>\` 标签 margin: 0 0 20px 0
- 段首：不缩进（text-indent: 0），不空格

## 1.2 加粗/强调文字
- 颜色：#000000（与正文 #3f3f3f 形成层次对比）
- 标签：\`<strong style="color:#000000;">文字</strong>\`
- 不使用 Markdown \`**加粗**\` 语法

## 1.3 主题色
- 主色：\`#fa8c16\`（暖橙色）
- 浅底色：\`#fdf6ec\`（金句底色块）
- 浅边框：\`#e8e8e8\`（模块分隔线）

## 1.4 注释/辅助文字
- 字号：16px
- 颜色：#888888

## 1.5 大标题（文章主标题）
- 字号：24px
- 颜色：#000000
- 加粗：font-weight: bold
- 行高：1.5
- 字间距：1px
- 对齐：居中
- 上下边距：margin: 24px 16px

## 1.6 模块编号（01、02、03...）
- 字号：20px
- 颜色：#000000
- 加粗：font-weight: bold
- 对齐：居中
- 上下边距：margin: 30px 0 8px 0
- 独立一行，前后有间距

## 1.7 小标题
- 主标题：字号 20px，颜色 #000000，加粗，居中，margin: 0 0 4px 0
- 副标题：字号 20px，颜色 #000000，加粗，居中，margin: 0 0 20px 0
- 部分小标题只有一行

## 1.8 重点底色块（金句/核心观点）
- 背景色：#fdf6ec
- 左边框：4px solid #fa8c16
- 圆角：0 4px 4px 0（左侧直角贴边，右侧圆角）
- 内边距：20px 16px
- 外边距：margin: 24px 16px
- 内部文字：保持正文规范（18px / #3f3f3f / 1.75 / 两端对齐）

## 1.9 结尾金句块
- 背景色：#fdf6ec
- 圆角：8px
- 内边距：28px 20px
- 外边距：margin: 36px 16px
- 对齐：居中
- 文字：字号 18px，加粗，颜色 #000000，行高 1.8，字间距 1px

## 1.10 分割线
- Markdown 三个短横 \`---\`

---

# 二、文章结构模板

## 2.1 期数标签（如果原文有）

\`\`\`html
<div style="text-align: center; margin: 16px 0 20px 0;">
  <span style="font-size: 16px; color: #888888;">
    这是余客的第 <strong style="color:#000000;">N</strong> 期分享
  </span>
</div>
\`\`\`

## 2.2 分割线

\`\`\`html
---
\`\`\`

## 2.3 正文开头

\`\`\`html
<div style="font-size: 18px; color: #3f3f3f; line-height: 1.75; letter-spacing: 1px; text-align: justify; word-break: break-all; padding: 0 16px;">

<p style="margin: 0 0 20px 0;">
【原文段落】
</p>

</div>
\`\`\`

## 2.4 模块编号

\`\`\`html
<p style="text-align: center; font-size: 20px; font-weight: bold; color: #000000; margin: 30px 0 8px 0;">
  【原文编号】
</p>
\`\`\`

## 2.5 小标题

\`\`\`html
<p style="text-align: center; font-size: 20px; font-weight: bold; color: #000000; margin: 0 0 4px 0;">
  【原文小标题第一行】
</p>
<p style="text-align: center; font-size: 20px; font-weight: bold; color: #000000; margin: 0 0 20px 0;">
  【原文小标题第二行】
</p>

<!-- 或单行 -->
<p style="text-align: center; font-size: 20px; font-weight: bold; color: #000000; margin: 0 0 20px 0;">
  【原文小标题】
</p>
\`\`\`

## 2.6 正文容器

\`\`\`html
<div style="font-size: 18px; color: #3f3f3f; line-height: 1.75; letter-spacing: 1px; text-align: justify; word-break: break-all; padding: 0 16px;">

<p style="margin: 0 0 20px 0;">
【原文段落】
</p>

<p style="margin: 0 0 20px 0;">
<strong style="color:#000000;">【原文加粗句】</strong>
</p>

</div>
\`\`\`

## 2.7 重点底色块（金句/核心观点）

\`\`\`html
<div style="margin: 24px 16px; padding: 20px 16px; background-color: #fdf6ec; border-left: 4px solid #fa8c16; border-radius: 0 4px 4px 0;">
  <p style="font-size: 18px; color: #3f3f3f; line-height: 1.75; letter-spacing: 1px; text-align: justify; margin: 0 0 12px 0;">
    <strong style="color:#000000;">【原文金句】</strong>
  </p>
  <p style="font-size: 18px; color: #3f3f3f; line-height: 1.75; letter-spacing: 1px; text-align: justify; margin: 0;">
    <strong style="color:#000000;">【原文金句】</strong>
  </p>
</div>
\`\`\`

## 2.8 结尾金句块

\`\`\`html
<div style="margin: 36px 16px; padding: 28px 20px; background-color: #fdf6ec; border-radius: 8px; text-align: center;">
  <p style="font-size: 18px; font-weight: bold; color: #000000; line-height: 1.8; letter-spacing: 1px; margin: 0 0 12px 0;">
    【原文结尾金句】
  </p>
  <p style="font-size: 18px; font-weight: bold; color: #000000; line-height: 1.8; letter-spacing: 1px; margin: 0;">
    【原文结尾金句】
  </p>
</div>
\`\`\`

## 2.9 文章结束标记

\`\`\`html
<p style="text-align: center; font-size: 18px; font-weight: bold; color: #000000; margin: 30px 0;">
  END
</p>
\`\`\`

---

# 三、文章完整结构

\`\`\`
[期数标签]（如有）
  ↓
[分割线] → ---
  ↓
[正文开头] → 原文段落
  ↓
[模块1~N] → 编号 + 小标题 + 原文正文 + 原文加粗句 + 原文金句入底色块
  ↓
[结尾金句块] → 原文结尾核心金句
  ↓
[END 标记]
\`\`\`

---

# 四、输出要求

1. 输出纯 Markdown 源码，可直接粘贴到支持 HTML 渲染的 Markdown 编辑器
2. 所有样式用内联 \`style=""\` 属性，不使用 CSS 类名、id、\`<style>\` 标签
3. 正文每个段落为独立 \`<p>\` 标签，margin: 0 0 20px 0
4. 加粗用 \`<strong style="color:#000000;">\`，不用 \`**\`
5. 主题色统一 #fa8c16，浅底色 #fdf6ec，正文灰 #3f3f3f
6. 模块编号从 01 开始
7. 不插入任何图片，原文中无图片则不需要图片占位
8. 输出结果中不包含解释性文字，只输出文章源码
9. 仅输出原文已有的内容，不添加作者信息、来源、转载声明、CTA、名片等任何原文没有的板块`;
