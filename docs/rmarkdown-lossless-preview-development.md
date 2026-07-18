# R-Markdown 无损预览与高效预设开发方案

状态：第一阶段已启动；已实现方言识别与“停止伪预览”保护，尚未接入官方 renderer  
目标版本：兼容 R-Markdown Web v0.3.1 的公开语法；只有在获得完整且可再分发的官方渲染核心后，才承诺“无损”。

## 1. 结论先行

用户下载的 R-Markdown 示例文件不是通用 Markdown，而是一种带组件标签的 Markdown 方言。当前 Marka 将它作为普通 Markdown 交给 markdown-it，因此标准段落能显示，而组件块内部的 Markdown 被当作原始文本显示。

要让“直接导入 .md 后的 Marka 预览”与 R-Markdown 网站一致，正确路线是：

1. 保留原始 R-Markdown 源码，不做不可逆转换。
2. 在 Marka 中识别该方言，并交给与上游版本绑定的 R-Markdown 渲染适配器。
3. 将上游产生的 HTML 放入隔离预览面，使用只覆盖已验证输出的安全白名单。
4. 所有预设、AI 指令、导入检测和渲染器共用同一份版本化语法清单。

不能把“正则替换一批标签”称为无损预览。它可以作为降级模式，但不能作为本项目的承诺。

### 1.1 当前实施记录

2026-07-18 已先落地最小且可逆的安全切片：

- 新增 [`src/lib/rMarkdownDialect.ts`](../src/lib/rMarkdownDialect.ts)，在不改写原始源码的前提下识别 R-Markdown 专有组件、图片布局和行内修饰。
- `src/lib/markdownRuntime.ts` 会在普通 Markdown 渲染**之前**拦截已识别文档；预览改为明确状态卡，不再把 `<steps>`、`<compare>` 等源码显示成“预览成功”。
- 导入、编辑和持久化仍保留原始 `.md`；没有向上游网站发送文章，也没有复制私有组件实现。

这个切片解决的是当前“预览区铺满源码且用户误以为已渲染”的问题，并为官方 adapter 留出稳定入口。它不是无损 renderer，不能替代第 4 节的授权与完整实现条件。

## 2. 范围与验收定义

### 2.1 本期目标

- 将 R-Markdown 的 .md 文件直接拖入或选择导入后，自动识别为 R-Markdown 文档。
- 编辑器始终保留用户原始源码；切换预览、主题、设备尺寸不会改写源码。
- 在接入官方渲染核心的前提下，标题、图片窗口、横向图片、卡片、步骤流、对比、时间线、公式、徽章、SVG 轮播和结尾互动的效果与指定上游版本一致。
- 预设示例按需加载；不把完整示例和全部组件实现塞进首次加载包。
- AI 排版预设只生成当前渲染器版本明确支持的语法。

### 2.2 “无损”的具体含义

无损不是“看起来差不多”，而是同时满足：

| 维度 | 要求 |
| --- | --- |
| 语义 | 所有已支持组件、属性及其嵌套关系保持一致 |
| 静态视觉 | 在约定浏览器、字体、设备宽度下的视觉回归截图通过 |
| 动态行为 | SVG 轮播、公式和可滚动图片窗口可工作 |
| 源码 | 导入、编辑、保存、重载后仍是原始 R-Markdown 源码 |
| 安全 | 不执行导入文档中的脚本、事件处理器或未授权外部代码 |
| 性能 | 输入时不重复解析，预设和大型示例不会阻塞首屏 |

如上游只公开静态 HTML、没有可用的渲染器代码或授权，则只能提供“HTML 快照预览”，不得标记为无损。

### 2.3 非目标

- 不反编译、复制或内嵌未授权的线上构建产物。
- 不通过隐藏 iframe 自动把用户文章上传到第三方网站转换。
- 不把 R-Markdown 组件语法静默转换成普通 Markdown。
- 不为了支持 SVG 动画而放宽为“允许任意 SVG、任意属性、任意样式”。

## 3. 已确认的现状

| 位置 | 当前行为 | 对本需求的影响 |
| --- | --- | --- |
| src/lib/fileImport.ts | .md 文件被读取为普通文本 | 导入阶段没有方言信息 |
| src/App.tsx | 文本导入后直接创建 Markdown 文档 | R-Markdown 与普通 Markdown 被混为一类 |
| src/lib/markdown.ts | 使用基础 markdown-it，并允许 HTML | 自定义块被保留为原始 HTML，而不是组件 |
| src/lib/markaDocumentRender.ts | Markdown 直接经 markdown-it 和主题处理 | 没有可插入方言渲染器的边界 |
| src/lib/htmlDocument.ts | HTML 进入 DOMPurify 后隔离 iframe 预览 | 适合 HTML 快照，但默认会移除 SVG animate |
| src/lib/aiFormattingPresets.ts | 默认预设是 R-Markdown | AI 已可能生成当前预览器无法渲染的语法 |
| server/aiFormattingPresets.ts | R-Markdown 指令与组件清单手工维护 | 生成能力与渲染能力会随时间漂移 |
| src/defaultContent.ts | 欢迎示例作为大字符串同步进入首包 | 预设内容无法按需加载，也难以版本化 |

R-Markdown 网站的“复制 HTML”功能会复制预览 DOM 的内联 HTML。它是很好的人工兜底路径，但 HTML 中存在 CSS 变量和 SVG animate；当前 Marka 的默认净化策略会删除 animate，因此该路径只能视作接近无损的临时方案。

## 4. 关键前置条件与决策门

公开资料核验后的准确表述是：R-Markdown 的主仓库是公开可访问的，README 也标注为 MIT；但当前可公开取得的仓库并不是一个可独立构建出完整组件效果的渲染器。它通过 Git 子模块引用 `r-markdown-extension` 和 `r-markdown-views`，构建配置把前者称为“闭源 extension”、把后者称为“私有 views”；子模块不可用时会改用 `extension-stubs`，其中组件 `render` 返回空字符串。因此，不能把“主仓库公开”直接等同于“完整渲染核心已可集成”。

此外，公开仓库根目录当前没有可找到的 `LICENSE` / `COPYING` 文件，GitHub API 的 license 字段也为空，而 README 的 MIT 声明存在。这不是对该声明效力的法律判断；工程上只是不应把 README 的主仓库声明推定为同时覆盖访问不到的 extension 子模块、其视觉组件实现或其再分发权。

因此，在进入“官方无损适配器”前，必须满足下列任一条件：

1. 作者发布可安装、可再分发的**完整**渲染包，并附带许可证、版本号和兼容性说明。
2. 作者公开 extension 源码，并明确允许将其集成、修改和分发到 Marka。
3. 作者提供稳定的本地优先渲染 API，支持版本锁定、离线策略和明确的数据边界。

若三者均不满足，本项目只实施“R-Markdown 检测 + HTML 快照导入”能力，并在 UI 中明确说明它不是交互式无损渲染。

## 5. 推荐架构

### 5.1 总体数据流

~~~mermaid
flowchart LR
    A[".md / 粘贴文本"] --> B["方言检测：一次扫描"]
    B --> C{"文档方言"}
    C -->|"commonmark"| D["Marka CommonMark 渲染器"]
    C -->|"rmarkdown"| E["版本锁定的 R-Markdown 适配器"]
    C -->|"不确定"| F["用户确认，不静默转换"]
    D --> G["RenderOutput"]
    E --> G
    G --> H["净化策略 / 隔离预览"]
    H --> I["预览、复制、导出"]
    J["预设清单 / AI 语法清单"] --> B
    J --> E
    J --> K["AI 指令生成器"]
~~~

核心原则：检测、预设、AI 指令和渲染器都依赖同一份“语法清单”，而不是各自手工列标签。

### 5.2 扩展现有双文档模型，而不是新建平行布尔状态

现有文档模型的 kind 继续保持 markdown 与 html。R-Markdown 是 markdown 的一种 sourceDialect，而不是第三种 HTML 文档，也不是一组散落在 App 中的状态。

~~~ts
export type MarkdownDialect = "commonmark" | "rmarkdown";

export interface RenderProfile {
  dialect: MarkdownDialect;
  rendererId: "marka-commonmark" | "rmarkdown-official";
  rendererVersion: string;
}

export interface MarkdownDocument {
  readonly kind: "markdown";
  readonly source: string;
  readonly renderProfile: RenderProfile;
}
~~~

这样仍满足现有“一个文档只有一种源码”的不变量。存储协议应从 v2 升级为 v3，并将旧 Markdown 文档迁移为 commonmark。导入时设置方言；用户也可以在导入后手动切换方言，避免误判造成不可用。

### 5.3 渲染器适配器边界

~~~ts
export interface RenderRequest {
  readonly source: string;
  readonly themeId: string;
  readonly viewport: "mobile" | "tablet" | "pc";
  readonly signal?: AbortSignal;
}

export interface RenderDiagnostic {
  readonly level: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly start?: number;
  readonly end?: number;
}

export interface RenderOutput {
  readonly html: string;
  readonly diagnostics: readonly RenderDiagnostic[];
  readonly rendererId: string;
  readonly rendererVersion: string;
}

export interface DocumentRenderer {
  readonly id: string;
  readonly version: string;
  render(request: RenderRequest): Promise<RenderOutput>;
}
~~~

普通 Markdown 可以由同步适配器包装；R-Markdown 必须通过异步接口，以便按需加载官方包、加载数学引擎和支持取消过时任务。App 只依赖 DocumentRenderer，不知道任何组件标签细节。

## 6. 高效预设代码规范

### 6.1 将“预设”拆成三种概念

不要让一个大字符串同时承担欢迎文档、组件代码片段和 AI 提示词。它们的加载时机、版本和性能需求不同。

| 类型 | 例子 | 加载方式 |
| --- | --- | --- |
| 元数据预设 | 名称、图标、描述、方言、语法版本 | 首包同步加载，体积必须很小 |
| 编辑器片段 | 插入 title、steps、compare 的源码 | 点击后按需加载 |
| 完整示例 | R-Markdown 功能全集 | 用户选择“加载示例”后按需加载 |
| AI 格式预设 | AI 可生成的组件和约束 | 服务端按语法版本生成 |

### 6.2 预设注册表只加载元数据

~~~ts
export interface PresetMeta {
  readonly id: string;
  readonly label: string;
  readonly dialect: MarkdownDialect;
  readonly grammarVersion: string;
  readonly description: string;
  readonly loadSource: () => Promise<string>;
}

const presetSourceCache = new Map<string, Promise<string>>();

function lazySource(id: string, loader: () => Promise<{ source: string }>) {
  return () => {
    let pending = presetSourceCache.get(id);
    if (!pending) {
      pending = loader().then(module => module.source);
      presetSourceCache.set(id, pending);
    }
    return pending;
  };
}

export const presets: readonly PresetMeta[] = [
  {
    id: "rmarkdown-feature-tour",
    label: "R-Markdown 功能全集",
    dialect: "rmarkdown",
    grammarVersion: "0.3.1",
    description: "图片、流程、对比、公式与互动组件",
    loadSource: lazySource(
      "rmarkdown-feature-tour",
      () => import("./sources/rmarkdownFeatureTour")
    ),
  },
];
~~~

要求：

- 首包只包含注册表，不包含 9 KB 以上的完整示例、图片描述或组件实现。
- 每个 source loader 的 Promise 必须缓存，连续点击不会重复发起动态 import。
- 示例源码采用独立模块导出，不再挤在 App 或 defaultContent 中。
- 预设 id 和 grammarVersion 必须稳定；名称可以改，id 不可重用。
- 完整示例必须显式加载，不应成为每个新用户的默认正文。

### 6.3 组件片段采用构造器，不复制巨型模板

预设片段只负责生成用户可编辑的最小合法源码。动态字段通过参数传入，并在构造器中进行属性转义和默认值控制。

~~~ts
export interface RMarkdownSnippetContext {
  readonly title?: string;
  readonly subtitle?: string;
  readonly color?: string;
}

export interface ComponentSnippet {
  readonly id: string;
  readonly grammarVersion: string;
  build(context: RMarkdownSnippetContext): string;
}

export const leadSnippet: ComponentSnippet = {
  id: "lead",
  grammarVersion: "0.3.1",
  build: ({ title = "引言" }) =>
    "<lead>\\n" + title + "\\n</lead>",
};
~~~

构造器不得：

- 为了“好看”凭空生成图片 URL、颜色、标签、时间或事实。
- 在每次渲染时重新构建所有片段。
- 混入 JSX、DOM 操作或渲染副作用。

### 6.4 AI 预设必须由语法清单生成

当前前端和服务端各自维护 R-Markdown 预设信息，容易出现“AI 生成了标签，但当前 renderer 不支持”的问题。应新增共享的只读语法清单：

~~~ts
export interface GrammarComponent {
  readonly tag: string;
  readonly attributes: readonly string[];
  readonly body: "text" | "markdown-list" | "columns" | "timeline";
  readonly aiAllowed: boolean;
  readonly previewSupported: boolean;
}

export interface GrammarManifest {
  readonly dialect: "rmarkdown";
  readonly version: string;
  readonly components: readonly GrammarComponent[];
}
~~~

服务端根据 manifest 中同时满足 aiAllowed 和 previewSupported 的组件构造指令；前端根据同一 manifest 显示组件面板和预设。若官方适配器未加载或版本不匹配，R-Markdown AI 预设不可选，默认回落到标准 Markdown，而不是生成无法预览的源码。

## 7. 高性能渲染策略

### 7.1 单次检测、单次解析、可取消渲染

导入时进行一次方言检测，返回方言、置信度、命中特征和源码位置。后续输入只在源码变化时重新检测；设备切换、滚动、缩放不能触发解析。

检测算法采用单遍扫描，复杂度为 O(n)：

- 强特征：title、p-title、steps、compare、slider、case-flow、timeline、engage 等组件标签。
- 中特征：图片尺寸后缀、横向图片语法、TIP 或 NOTE、专用行内强调。
- 只有中特征时不自动切换，要求用户确认。
- 发现未闭合标签时给诊断，不把后续全文错误地判为代码。

禁止用全文件多轮 replace 作为解析主路径；它会造成嵌套组件、转义、代码块和大文档性能问题。

### 7.2 分离解析缓存与最终 HTML 缓存

理想的官方适配器应暴露 parse 和 render 两层：

~~~text
source + rendererVersion  -> AST
AST + theme + viewport    -> HTML
~~~

这样主题、设备尺寸或预览缩放变化时可以复用 AST。若上游只能提供单个 render 函数，至少缓存完整 RenderOutput。

缓存规则：

- 缓存键包含 rendererId、rendererVersion、source、themeId、viewport。
- 不用短 hash 作为唯一正确性键，避免碰撞；可用 hash 仅作 LRU 索引优化。
- LRU 同时限制条目数和估算字节数，建议初始上限为 8 条或 2 MB，以先到者为准。
- 文本输入使用 100 至 150 ms 防抖；文件导入、手动加载预设和主题切换立即渲染。
- 每次请求分配 generationId 与 AbortController；返回时只接受仍是最新 generationId 的结果。

### 7.3 取消 App 中的派生 HTML 状态双渲染

当前 App 通过 effect 调用 setRenderedHtml。这会在源码变化后至少再触发一次 React 渲染。新实现使用一个 useDocumentPreview hook 统一管理异步渲染状态和缓存，向 PreviewPanel 暴露：

~~~ts
{
  status: "idle" | "rendering" | "ready" | "error",
  output: RenderOutput | null,
  diagnostics: readonly RenderDiagnostic[],
}
~~~

PreviewPanel 只接收已完成 HTML；缩放和滚动仅影响外层容器，绝不能重新调用 renderer。

### 7.4 图片、公式与动画

- 图片应保留原 URL，不在预览阶段转 Base64；复制到公众号时才执行已有的兼容处理。
- 非首屏图片加 loading="lazy" 和 decoding="async"，并保留确定的尺寸，减少布局抖动。
- 数学、SVG 和轮播只允许官方 renderer 已输出、并被回归测试覆盖的元素与属性。
- HTML 快照模式在 iframe 根节点设置上游需要的 CSS 变量，例如 --text-primary 与 --text-secondary。
- SVG animate 不能因“无损”而放开所有 SVG。允许列表必须由已审计的上游输出生成，并禁止 script、on* 事件、foreignObject、未允许的 URL 协议和可执行 SVG 入口。

## 8. 导入与用户体验

### 8.1 导入决策

~~~mermaid
flowchart TD
    A["选择 .md 文件"] --> B["读取原文，不改写"]
    B --> C["detectDialect"]
    C -->|"高置信 R-Markdown"| D["创建 markdown/rmarkdown 文档"]
    C -->|"普通 Markdown"| E["创建 markdown/commonmark 文档"]
    C -->|"不确定"| F["展示非阻塞选择：标准 / R-Markdown"]
    D --> G["加载官方适配器并预览"]
    G -->|"适配器不可用"| H["保留源码，显示可操作说明"]
~~~

适配器不可用时不得显示大片源码作为“预览成功”。应显示明确状态：

> 已识别为 R-Markdown v0.3.1 源文件。此安装未包含经授权的官方渲染器，因此无法保证无损预览。源码没有被修改。

用户可选择保留源码、以标准 Markdown 尽力预览，或导入上游复制的 HTML 快照。最后两项都必须标记为降级模式。

### 8.2 HTML 快照兜底

“R-Markdown 网站 → 复制 HTML → Marka 粘贴”是人工兜底路径，适合当前立即查看静态排版。它不替代直接渲染器：

- 可保留大部分已经内联的样式和结构。
- 当前 HTML sanitizer 需要补充经过审计的 SVG 动画白名单才能保留轮播。
- HTML 文档模式不具备 Markdown 源码定位、主题切换等能力。
- 该路径不应自动把用户文章发送给远端网站；是否使用由用户主动决定。

## 9. 文件与模块落点

| 模块 | 计划责任 |
| --- | --- |
| src/lib/markaDocument.ts | 增加 renderProfile，不新增平行模式状态 |
| src/lib/markaDocumentStorage.ts | 存储 v3、旧文档迁移 |
| src/lib/rmarkdown/detect.ts | 单遍方言检测、证据和诊断 |
| src/lib/renderers/types.ts | DocumentRenderer、RenderOutput 契约 |
| src/lib/renderers/commonmarkRenderer.ts | 包装现有 markdown-it 逻辑 |
| src/lib/renderers/rmarkdownOfficialRenderer.ts | 仅在获授权后接入的官方适配器 |
| src/lib/renderers/registry.ts | 动态 import、版本检查、Promise 缓存 |
| src/lib/useDocumentPreview.ts | 防抖、取消、LRU、状态机 |
| src/lib/rmarkdown/grammarManifest.ts | 版本化组件/属性/能力清单 |
| src/presets/ | 元数据、按需源码、片段构造器 |
| src/lib/htmlDocument.ts | HTML 快照的严格净化配置 |
| src/App.tsx | 导入后设置 renderProfile；使用 useDocumentPreview |
| src/components/PreviewPanel.tsx | 只呈现 RenderOutput，不承担解析 |
| server/aiFormattingPresets.ts | 从共享 grammar manifest 生成 AI 指令 |
| docs/ | 语法版本变更记录、授权来源、兼容矩阵 |

## 10. 测试与性能验收

### 10.1 契约测试

- R-Markdown 示例文件被识别为 rmarkdown，普通 Markdown 不误判。
- 标签、代码围栏、转义文本和未闭合组件产生正确诊断。
- 导入后源码字节级不变。
- rendererVersion 不匹配时不假装无损。
- AI 预设不会列出 previewSupported 为 false 的组件。
- HTML 快照 sanitizer 保留已批准的 SVG 片段，移除脚本、事件属性和非批准标签。

### 10.2 视觉回归

为每个语法版本固定以下资产：

- 官方输入 .md。
- 官方版本、字体、浏览器和 viewport。
- 上游批准的基准截图。
- Marka 输出截图。

至少覆盖：标题、长图窗口、横向图片、slider、breaking、steps 两种方向、case-flow、compare 两种方向、timeline、公式、badges、代码块、statement、lead、任务列表、engage。

视觉比较必须区分“静态像素比较”和“动画行为测试”。动画可在固定时间点截图，并额外验证 animate 节点与关键属性存在。

### 10.3 初始性能目标

以下目标以现有 9 KB R-Markdown 功能全集为基准，最终用 CI 基准数据校准：

| 指标 | 目标 |
| --- | --- |
| 方言检测 | p95 小于 5 ms |
| 预设元数据初始载入 | 不包含完整示例源码 |
| 首次官方 renderer 加载与首帧 | p95 小于 500 ms（不含网络图片） |
| 已缓存同源码重渲染 | p95 小于 80 ms |
| 连续输入 | 最多一个在途任务；旧任务结果不能覆盖新结果 |
| 设备切换、缩放、滚动 | 0 次 parser 调用 |
| 完整示例重复打开 | 0 次重复动态 import |

性能测试还应使用 50 KB 合成文档验证缓存上限、取消逻辑和长文档响应。

## 11. 分阶段交付

### 阶段 0：授权与版本基线

- 明确可使用的官方 renderer 来源、许可证和目标版本。
- 保存官方示例、截图和输出 HTML 作为仅用于测试的基线。
- 若未满足授权条件，停止“无损”主线，转入 HTML 快照兜底。

### 阶段 1：数据模型与识别

- 实现 renderProfile、v3 存储迁移和方言检测。
- 只显示识别结果和诊断，不修改现有 CommonMark 渲染。
- 补齐单元测试和迁移测试。

### 阶段 2：官方渲染适配器

- 实现 renderer registry、懒加载、版本锁定和 useDocumentPreview。
- 接入上游 renderer，完成基本组件的 HTML 输出。
- 首先验证静态组件，再验证数学、SVG 和动画。

### 阶段 3：预设与 AI 收敛

- 将完整示例迁移为按需模块。
- 以 grammar manifest 驱动组件片段和 AI 指令。
- 渲染器不可用时禁用对应 AI 预设，避免制造不可预览源码。

### 阶段 4：HTML 快照与导出

- 完善 HTML 快照的安全白名单和根变量注入。
- 明确 Markdown、官方 R-Markdown、HTML 快照三种文档的能力差异。
- 做浏览器和公众号复制回归。

## 12. 需要确认的产品决策

在开始写功能代码前，需要确认以下事项：

1. “无损”是否包含动态轮播、公式动画和交互，还是只要求静态截图一致。
2. 是否可以联系作者索取 extension 的许可证或官方 npm 包；没有该授权不能承诺直接集成。
3. R-Markdown 预设是否在官方 renderer 未安装时完全隐藏，还是显示为“仅源码模式”。
4. 是否接受将现有欢迎文档改为懒加载示例，以换取更小首包和更快启动。
5. 兼容目标是否锁定 v0.3.1，后续上游升级是否采用“手动验收后升级”的策略。

## 13. 实施前检查清单

- [ ] 确认官方 renderer 的许可与分发方式。
- [ ] 确认 R-Markdown 目标版本与示例基线。
- [ ] 确认动态行为属于无损验收范围。
- [ ] 审核 SVG、MathJax 和图片输出的安全白名单。
- [ ] 确认 v3 存储迁移与回退策略。
- [ ] 确认预设的按需加载目录和 chunk 命名规则。
- [ ] 确认视觉回归所用浏览器、字体和截图阈值。

在以上项目确认前，不应开始复制组件、堆叠正则转换或把线上网站当作隐式转换服务。

## 附录 A：公开资料调研记录（2026-07-18）

本附录补充“能公开验证到什么、不能从公开资料推出什么”。检索覆盖用户提供的两个在线站点、作者文章、主 GitHub 仓库及其代码/提交记录、GitHub 公共仓库检索、npm registry 和公开源码中的集成关键字。负向结果只代表本次检索时未发现公开入口，不等于互联网中绝对不存在。

### A.1 证据表

| 结论 | 可公开验证的证据 | 对项目的含义 |
| --- | --- | --- |
| 在线版确实能渲染该方言 | [GitHub Pages 版](https://robocopmao.github.io/r-markdown/) 与 [Pages 版](https://r-markdown.pages.dev/) 均提供编辑、导入与“复制 HTML”入口 | 上游行为可作为视觉基准，但线上站点不是给第三方调用的 renderer API |
| 主仓库是公开的，并声明 MIT | [主仓库](https://github.com/RobocopMao/r-markdown) 与 [README 的 License 段](https://github.com/RobocopMao/r-markdown/blob/main/README.md) | 应承认用户所说“已经开源”对主仓库成立；不能据此跳过后续组件来源核验 |
| 公开仓库不是完整的组件实现 | [`.gitmodules`](https://github.com/RobocopMao/r-markdown/blob/main/.gitmodules) 指向 extension/views 子模块；[Vite 配置](https://github.com/RobocopMao/r-markdown/blob/main/vite.config.ts) 明确写有“闭源 extension”“私有 views”及空桩回退 | 不能从主仓库单独拿到与官网一致的全部组件实现 |
| 空桩不是可用渲染器 | [Slider 空桩](https://github.com/RobocopMao/r-markdown/blob/main/src/extension-stubs/Slider_DA01.ts) 的 `render` 直接返回空字符串；其他组件空桩采用同类策略 | 公开构建即使成功，也会缺失 R-Markdown 的关键块级组件 |
| 公开解析器依赖上述组件 | [`markdownParser.ts`](https://github.com/RobocopMao/r-markdown/blob/main/src/utils/markdownParser.ts) 直接 import `@/extension/*` | 可见的解析器壳不能脱离 extension 当作独立 renderer 使用 |
| 官网“复制 HTML”是手动快照出口 | [`Preview.vue`](https://github.com/RobocopMao/r-markdown/blob/main/src/views/editor/components/Preview.vue) 的 `copyHTML()` 复制 `el.innerHTML` | 可做用户主动触发的 HTML 快照兜底；不是从 `.md` 到无损预览的自动接口 |
| 没有发现公开的嵌入契约 | 在当前公开仓库对 `postMessage`、`iframe`、消息监听和渲染 API 进行代码检索，未发现可供第三方传入 Markdown 并取得 HTML 的受支持接口 | 不应把网页塞进 iframe 后再依赖未声明的 DOM/跨域行为；这既不稳定，也无法离线 |
| `awesome-design-md` 不是 R-Markdown 渲染器 | [npm 包](https://www.npmjs.com/package/awesome-design-md) 与 [其源码](https://github.com/VoltAgent/awesome-design-md) 表明它是选择/复制 `DESIGN.md` 的 CLI；R-Markdown [包清单](https://github.com/RobocopMao/r-markdown/blob/main/package.json) 仅把它列为依赖，公开代码没有对应 import | 不要把它接入 Marka，也不要把它列为可替代的官方 renderer；它无法解析 `<steps>`、`<compare>`、`<slider>` 等语法 |
| 上游私有组件仍在变化 | [v0.3.1 记录](https://github.com/RobocopMao/r-markdown/commit/4de8f39e47f505f265229c60008e15b508f0289d)、[extension 更新记录](https://github.com/RobocopMao/r-markdown/commit/e80710231f9d38bb2c5bc6696d9f0b7697f49d4a) | 即使自行仿写，也会产生版本漂移；必须锁定基线并做视觉回归 |
| 作者文章的“完全开源”是公开宣传口径 | [公众号文章](https://mp.weixin.qq.com/s/OEzyTDbKMZWEquqkkFwrrw) | 可作为沟通和协作的积极信号，但不能替代对 extension 子模块、完整授权范围及集成方式的技术确认 |

补充说明：截至本次检索，主仓库根目录未能找到 `LICENSE` / `COPYING` 文件，GitHub API 的仓库 license 字段也为空，而 README 写有 MIT。这里记录的是分发元数据不一致，而不是否定 README 的授权声明。对 Marka 最稳妥的工程处理是：将主仓库和不可访问 extension 的授权视为两件待确认的事，不擅自扩大授权范围。

### A.2 路线比较与推荐顺序

| 路线 | 何时可开始 | 能否称“直接导入 `.md` 无损” | 主要代价 / 风险 | 结论 |
| --- | --- | --- | --- | --- |
| 官方 renderer 适配器 | 取得完整包/源码/API 与明确许可后 | 可以，以锁定版本和回归基线为前提 | 等待上游授权或协作 | **唯一可对外承诺无损的路线** |
| 自研兼容 renderer | 可以立即做语法研究和原始实现 | 不能在覆盖完整组件、SVG 动画和视觉回归前承诺 | 大量长期维护；上游更新会漂移 | 可作为备选产品线，不应伪装成官方无损 |
| HTML 快照导入 | 可以立即做 | 仅静态/有限动态接近；不能从原始 `.md` 直接得到 | 用户需主动在官网复制；需严格净化 SVG/样式 | **当前的高价值兜底方案** |
| iframe / 自动驱动官网 | 不建议开始 | 否 | 没有公开数据契约、跨域限制、隐私与可用性风险 | 明确排除 |

当前推荐不是停止全部工作，而是双轨：

1. 立即可做、不会锁死路线的工作：保存原始源码、方言检测、未支持组件诊断、版本化基线、HTML 快照安全导入、按需预设架构。
2. 只有拿到上游完整 renderer 或明确授权后才做的工作：官方 adapter、HTML/SVG 白名单的最终定稿、动态轮播和公式的“无损”验收。

### A.3 给作者的最小确认清单

为了把第 2 轨真正推进为“无损”，只需请作者明确以下六点：

1. `r-markdown-extension` 是否有可公开安装的仓库、npm 包或 SDK；如有，请给出固定版本。
2. 主仓库 README 的 MIT 是否覆盖 extension、其输出模板和组件样式；若不覆盖，适用许可证是什么。
3. 是否支持本地调用的稳定入口，例如 `render(source, options) -> html`；需要的主题、字体、MathJax 与图片资源如何加载。
4. 版本兼容政策：语法版本、组件属性变更和破坏性更新如何发布。
5. 是否允许第三方应用将 renderer 随安装包离线分发；若允许，需要保留什么 attribution。
6. 能否提供一套官方 `.md` / HTML / 截图 fixture，作为 v0.3.1 的回归基线。

得到上述任意“完整 renderer + 权限 + 版本”组合后，本方案第 11 节的阶段 2 才应开工。否则，产品文案应始终把 HTML 快照称为“兼容预览”而不是“无损预览”。

## 附录 B：泛生态方案检索与无作者协作时的决策（2026-07-18）

本节不再局限于 R-Markdown 作者或仓库，而是比较整个 Markdown / 公众号排版生态中能够解决“自定义 Markdown 方言预览”的路线。检索包含公开 npm/文档、GitHub、现有公众号编辑器和编辑器解析基础设施；没有发现一个可直接读取 `<p-title>`、`<steps>`、`<compare>`、`<slider>` 并输出同等效果的公开通用包。

| 路线 | 泛生态事实 | 对本项目的适配性 | 决定 |
| --- | --- | --- | --- |
| 现成公众号编辑器 | [WeMD](https://wemd.app/) 与 [Doocs MD](https://github.com/doocs/md) 都是成熟的本地/私有化或开源公众号 Markdown 排版方案 | 可借鉴本地优先、内联样式复制和主题体验；均不实现本方言，无法直接导入该示例 | 只作体验/测试基准，不接入为 renderer |
| markdown-it 插件 | [markdown-it API](https://markdown-it.github.io/markdown-it/) 提供 block / inline rule 与自定义 token renderer；Marka 当前已经以它作为基础 renderer | 最低迁移成本；可用结构化 token 处理嵌套标签、代码围栏、属性和源码位置 | **自主兼容 renderer 的首选实现** |
| remark / micromark AST | [remark](https://remark.js.org/) 以插件处理 Markdown AST；[micromark 扩展](https://github.com/micromark/micromark#extensions) 可分别扩展流级和行内 tokenizer | 结构更严谨，但需要替换现有 markdown-it / 主题 / 定位链路，迁移成本高 | 不作为首期；若日后多方言增长再评估 |
| Lezer 增量语法树 | [@lezer/markdown](https://www.npmjs.com/package/@lezer/markdown) 能扩展 Markdown，并针对编辑时增量重解析优化；它只产生语法树，不输出 HTML | 适合将来做编辑器高亮、错误定位和局部重解析，不是渲染器替代品 | 作为第二阶段编辑体验增强 |
| MDX | [MDX](https://mdxjs.com/) 支持在 Markdown 中嵌入组件 | 文件语义会改为 JSX / 可执行表达式；不应把任意导入的 `.md` 当作可执行 MDX | 排除，除非另立受控 `.mdx` 格式 |
| Pandoc 自定义 reader / filter | [Pandoc custom readers/writers](https://pandoc.org/demo/example33/17-custom-readers-and-writers.html) 与 [Lua filters](https://pandoc.org/lua-filters.html) 可解析自定义格式并改写 AST | 适合离线批处理、导出或桌面 sidecar；浏览器输入时逐字实时预览成本和分发复杂度过高 | 只作为未来离线导出备选 |
| 网页自动化 / iframe | 未发现可把源码传给上游站点并取回 HTML 的公开协议 | 跨域、隐私、稳定性与离线性均不满足 | 明确排除 |

### B.1 在“无法联系作者”约束下的推荐方案

采用**独立、可版本化的兼容编译器**，而不是继续堆叠字符串替换：

~~~text
原始 .md
  → rmarkdown grammar parser（block / inline token）
  → 中间表示 IR（组件、属性、子 Markdown、源位置）
  → preview renderer（React/HTML）
  → export renderer（内联样式 HTML）
~~~

具体原则：

1. 基于现有 markdown-it 写插件规则，不以多轮全局正则取代解析；代码围栏、转义、嵌套 `<left>/<right>` 和未闭合标签必须得到确定诊断。
2. 用一份 `grammarManifest` 生成组件 token、预设片段、AI 可用语法、测试 fixture 和兼容矩阵，避免四处复制标签名。
3. 每个组件实现为原创的、可单测的 renderer；不复制官网 bundle、私有子模块或其视觉资源。
4. 已支持组件输出实际预览；未支持组件输出紧凑的“未支持组件”占位和源码位置，不回退成全文源码。
5. 文案固定为“R-Markdown 高保真兼容预览（非官方 renderer）”。只有拿到官方完整 renderer 后才能升级为“无损”。
6. 以用户下载的功能全集作为第一组 fixture，按组件增加输入、期望 HTML 结构、截图和导出回归；不能只验证一张大截图。

这条路线是没有作者协作时，收益、隐私、离线能力和长期可维护性之间最好的平衡。它能逐步把当前示例从“无法预览”推进到“可编辑、可诊断、可复制的高保真预览”，但不会做不真实的无损承诺。
