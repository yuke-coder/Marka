# MarkaDocument 双文档模型

`MarkaDocument` 是 Marka 编辑器唯一的正文状态：

```ts
type MarkaDocument = MarkdownDocument | HtmlDocument;
```

## 不变量

1. 文档类型只有 `markdown` 和 `html`，类型与 `source` 必须原子更新。
2. 一个文档只包含一种源码。AI 产出的 Markdown 应用于 HTML 时，结果是新的 Markdown 文档，禁止混写。
3. 文档差异由 `getMarkaDocumentDefinition()` 的能力描述和领域操作集中处理，UI 不维护额外模式状态。
4. HTML 预览必须经过净化并在隔离 iframe 中渲染；Markdown 预览使用主题和源码定位管线。

## 模块边界

- `markaDocument.ts`：类型、能力、构造器、类型守卫和编辑操作。
- `markaDocumentStorage.ts`：v2 存储协议及旧格式迁移。
- `markaDocumentRender.ts`：双文档预览、HTML 导出和公众号剪贴板管线。
- `fileImport.ts`：只负责把外部文件解析为导入结果，不决定当前文档的编辑语法。
- `clipboardImport.ts`：识别 HTML 文件、明确的 HTML 源码和带签名的 Skill 富文本。

普通网页、Word、飞书等没有 HTML 文档签名的富文本不会切换文档类型，仍由智能粘贴转换为 Markdown。HTML 文档中粘贴 HTML 片段时按当前光标插入。

## 持久化

当前存储键为 `marka:document`，协议版本为 2：

```json
{
  "version": 2,
  "document": {
    "kind": "html",
    "source": "<section>...</section>"
  }
}
```

加载器兼容：

- v1 的 `kind: "wechat-html"`；
- 旧 `marka:content + marka:documentMode` 双键。

下一次正常保存会统一写为 v2，并移除旧双键。

## 扩展规则

增加新的文档能力时，先扩展 `MarkaDocumentCapabilities`，再由 App 或组件消费能力；不要新增与文档类型平行的布尔状态。增加第三种文档类型时，必须同时补齐类型定义、能力描述、存储解析、渲染管线和契约测试。
