# 调研：WorkBuddy 桌面聊天如何渲染 mermaid / SVG

> **票**：[调研：WorkBuddy 聊天里如何渲染 mermaid / SVG](https://github.com/xiaowen-0725/uilab-admin/issues/188)
> **地图**：[Wayfinder 地图：Workbench 助手正文行内图（SVG / mermaid）首版规格](https://github.com/xiaowen-0725/uilab-admin/issues/187)
> **调研日**：2026-09-10
> **分支**：`research/workbuddy-inline-mermaid-svg`
> **非目标**：不改产品代码；不更新地图 187 正文；不猜远程 system prompt；不装 HTTPS 代理；不读账号数据库。
> **领域词（仅作对照，不在本票里设计产品）**：行内图 Inline Figure ≠ Artifact / Interactive Artifact。

---

## 0. 证据范围

| 来源 | 用了什么 | 没用什么 |
|---|---|---|
| 官方说明 | [任务对话](https://www.workbuddy.cn/docs/workbuddy/Conversation)、[结果查看](https://www.workbuddy.cn/docs/workbuddy/Results)、[内容管理（资料库 Markdown 编辑器）](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Library/Content-Management)、[微信文件打开](https://www.workbuddy.cn/docs/workbuddyapp/features/WeChat-Open) | CLI Web UI / MCP Apps 文档（那是 CodeBuddy CLI，不是桌面聊天主路径） |
| 本仓库 dump | 工作区 `output/workbuddy-desktop-research/`（`DESIGN.md` 记 5.3.14；`live-dump.json` 含 `--cb-mermaid-*` 与 `--sc-mermaid-*`；`chat-probe-thread.json` 有 `cb-markdown` / `wb-cb-chat`） | dump 里**没有**一张实际 mermaid/SVG 对话截图 |
| 本机 App（已授权静态阅读） | `/Applications/WorkBuddy.app` **5.5.3**（`app.asar` 渲染器 JS/CSS） | 未开 CDP、未发消息、未读 `~/Library/Application Support/WorkBuddy` |

**客户端默认聊天渲染层**：`agent-ui` 的 `CBChat`，WorkBuddy 加 class `wb-cb-chat`。`useConversationRenderEnabled()` 注释写明「仅本地 dev 覆盖，**默认 false**」。因此下文「桌面聊天」以 **`cb-chat-ui`（`cb-markdown`）** 为准；同包里的 `conversation-render`（`cr-mermaid-block`）只作旁注。

---

## 1. 先答票上的 Question

桌面聊天里，「模型回答过程中画出一张图」**不是一条水管**。客户端至少接两条互不合并的源，外加一条资料库编辑器专线（不是聊天）：

| 水管 | 源 | 画在哪 | 流式未闭合 | 工具栏 | 与另一条是否同一种东西 |
|---|---|---|---|---|---|
| **A. Markdown ` ```mermaid `** | 语言标识必须是 `mermaid`（围栏） | **助手正文里**的代码块壳（`cb-markdown-pre-*`），不是右侧产物预览 | 消息 `complete === false` 时**当代码**，且 **不**调用 `mermaid.render`；切「图表」按钮 `disabled` | 有：代码/图表切换；图表态有主题、缩放、下载 SVG/PNG。点图放大取决于宿主有没有注入 `onPreviewMermaid`（见 §4） | **否**，专管 mermaid 语法 |
| **B. Visualizer / `show_widget`** | 围栏 `` ```show_widget `` / `show-widget`（JSON：`title` + `widget_code`）或 `` ```widget `` / `visualizer_widget`（原始 HTML）；也可是工具名 `show_widget` / `visualize:show_widget` / `visualizer:show_widget` | **对话列里的 widget 卡**（沙箱 iframe，注释写明可承载「纯 SVG」）。工具调用还会 **hoist** 到该轮结果正文下方，不当过程折。不是右侧 BrowserPreview | **会尝试出图**：流式解析半截 JSON/`widget_code`，截掉未闭合 `<script>` 后 `widget:update` 进 iframe | 有：查看代码 / 显示 UI、复制、下载图等 | **否**。源是 HTML（常内嵌 SVG），不是 mermaid 编译器 |
| **C. 资料库本地 Markdown 编辑器** | 输入规则 `` ```mermaid `` → smart-doc `mermaid` 块 | 文档编辑器卡片（`--sc-mermaid-*`），**不是聊天气泡** | 编辑器预览：空代码显示「输入代码即可展示图表」；这不是聊天流式 | 官方写了：AI 编辑、切换视图、复制代码、下载图表 | 与聊天 A 不是同一套组件 |
| **` ```svg ` 围栏** | 普通代码块语言 `svg` | **代码块**，无 mermaid 专用组件 | 与其它代码块相同（unknown：未在 dump 里抓到实例子） | 普通代码块操作，不是图表工具栏 | 不是 A，也不是 B |
| **裸 `<svg>`** | Markdown HTML | `rehype-sanitize` 默认 `tagNames` **不含 `svg`**，会被剥掉 | 不适用 | 无 | 不是图 |
| **写成 `.svg` 文件再预览** | 文件产物 / 附件 | 官方只保证：**移动端「微信打开」**把 `.svg` 渲成矢量预览。桌面聊天附件把 `image/svg+xml` **排除**出普通图片预览。右侧栏官方说的是产物/工作空间/浏览器，没有写「聊天围栏出图」 | unknown（未做实机点文件） | unknown | 与 A/B 都不同 |

**一句话**：若模型「边答边画」的是 **Visualizer HTML/SVG**，走 **B（`show_widget` 围栏或工具）**，图在对话列 widget 卡里，流式会灌 iframe。若吐的是 **` ```mermaid `**，走 **A**，在助手 Markdown 正文里编译，流式阶段先当代码。两条不是同一种东西。` ```svg ` / 裸 svg **不是**出图路径。`.svg` 文件是另一条「文件预览」线，不是聊天 Markdown 行内图。

---

## 2. 官方说明（聊天 vs 编辑器 vs 文件）

- **任务对话**：只说中间区看回复、过程、结果摘要；**没有** mermaid / SVG / 代码围栏出图。
- **结果查看 / 右侧边栏**：右侧是产物、工作空间文件、变更、内置浏览器。适合网页/文件，**不是**「气泡里的 mermaid 围栏」。
- **内容管理 → 本地 Markdown 编辑器**：悬浮菜单把 **「Mermaid 图表」** 和「代码块」「图片」并列；操作是 AI 编辑、**切换视图**、复制代码、下载图表。这是 **资料库文档编辑器**，对应 asar 里 `@tencent/smart-doc-plugin-mermaid`（`--sc-mermaid-*`）。
- **微信文件打开（移动端）**：`.svg` **文件**在 App 预览页渲成矢量图。这是「用其他应用打开文件」，不是桌面聊天围栏。

官方**没有**写：桌面聊天里 ` ```mermaid ` 怎么流式、裸 `<svg>` 行不行、和 `show_widget` 什么关系。那些以 asar 为准。

---

## 3. 水管 A：聊天 Markdown ` ```mermaid `

**位置（源码）**

- `cb-chat-ui` → `markdown-renderer.tsx`：`language === "mermaid"` 才挂 `MarkdownPreMermaid`，`latex` 另走，其余语言走普通 `MarkdownPre`。
- 语言来自 `rehype-code-block`：code 的 `language-*` class。
- 运行时：`mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, securityLevel: "strict", ... })` 后 `mermaid.render(id, content)`，把返回的 SVG 塞进块内容器。
- 依赖：asar `vendor-mermaid-*.js` 来自 `mermaid@11.15.0`。

**画在哪**

- 助手 text 块：`AssistantWidgetContent` → `MarkdownRenderer` → `div.assistantTextContent`。
- 活 DOM dump（5.3.14）：助手正文是 `cb-markdown cb-font-size-fixed`，包在 `_assistantTextContent_*` 里，位于 `.main-content--chat` / `_cbChat_* wb-cb-chat`。
- CSS：`--cb-mermaid-block-height: 360px`；图区域 `_cb-mermaid-diagram_*`（白/暗底、居中、可滚）。这是聊天列里的块，不是右侧预览。

**流式**

- `MarkdownPreMermaid`：`complete` 默认 true；聊天传入 `complete: message.complete`。
- `complete === false`：`render()` 直接 return；初始 `viewMode` 为 `"code"`；切换按钮 `disabled`。
- `complete === true` 且 `viewMode === "diagram"` 才 `mermaid.render`。
- 源码**没有** `complete` 从 false→true 时自动 `setViewMode("diagram")` 的 effect。历史回放（挂载时已 complete）默认图表。流式结束后若组件未重挂载，是否自动切图：**运行时 unknown**（静态只能保证：未 complete 一定是代码）。
- 围栏未闭合但消息已 complete：会按不完整 mermaid 去 compile，失败走语法错误 UI（可复制错误文本）。

**工具栏（图表态，且 complete 且无渲染错误）**

- 头：`mermaid.code` / `mermaid.diagram`（中文 **「代码」「图表」**）。
- 代码态：普通代码块操作（复制/展开/apply 等，视宿主 `codeBlockActions`）。
- 图表态 `MermaidActions`：亮/暗主题、放大、缩小、下载 SVG、下载 PNG。
- 点击 SVG：仅当 `config.onPreviewMermaid` 有值才 `cursor: pointer` 并回调。asar 里该回调是 Markdown config 可选项；**本轮未在 WorkBuddy 宿主里找到注入点** → 桌面聊天点图是否打开更大预览 = **unknown**。无回调时点击无预览。

**错误**

- 编译失败：块内错误标题 + 消息 + 复制。样式 token `--cb-mermaid-error-*`。

---

## 4. 水管 B：`show_widget`（Visualizer HTML / 内联 SVG）

**源（客户端识别，不是 prompt）**

- 文本围栏：`` ```(show_widget|show-widget|widget|visualizer_widget) ``。
- `show_widget` / `show-widget`：围栏内 JSON，字段 `widget_code`（必有才算解析成功），可选 `title`、`loading_messages`。
- `widget` / `visualizer_widget`：围栏内 **整段当 HTML**（`widget_code: content.trim()`）。
- 工具调用：名字集合含 `show_widget`、`visualize:show_widget`、`visualizer:show_widget`；时间线图标把 `ShowWidget` 与 `ReadMe` 归为一组。

**画在哪**

- 文本围栏：从助手正文切开，widget 段用 `WidgetRenderer`，夹在 Markdown 段之间 → **仍在对话列**。
- 工具调用：`isShowWidgetContent` → **不可折叠**；`linkShowWidgetPresentationGroups` 把 widget 绑到「它前面最近一段正文」，结束态 **常显在结果正文下方**，不进过程折。
- 实现：沙箱 iframe + `widget:update` / `widget:finalize`。iframe 模板注释：**「纯 SVG/透明 widget 未自绘背景时，由 #root 提供与对话面板一致的底色」**。
- WorkBuddy 宿主给 widget 配了本地图解析（Desktop `local-file://`），说明这张卡可以引用本地资源，但仍是 **聊天列 iframe**，不是右侧 BrowserPreview。

**流式**

- `extractStreamingWidget`：已闭合围栏出完整 widget；**最后一个未闭合围栏**走 `streamingWidget`（JSON 半解析，或原始 HTML 去掉未闭合 `<script>`）。
- 流式中 `postMessage({ type: "widget:update", html })`，会尝试出图，不是干等围栏闭合。
- 消息结束后若围栏仍未闭合：`parseAllShowWidgets` 把残段当 **text** 交给 Markdown（通常变成代码字），不再当 widget。

**工具栏**

- `WidgetRenderer`：`showActions` 默认 true。菜单含 **查看代码 / 显示 UI**（`widget.viewCode` / `widget.showUI`）、复制代码、下载图等。
- `chromeless` 时藏传统顶栏；聊天这条默认不是 chromeless。

这与水管 A 的「代码/图表」toggle **不是同一套 UI**。

---

## 5. 资料库 `--sc-mermaid-*`（不要当成聊天）

`live-dump.json` 里的 `--sc-mermaid-toolbar-*` / `--sc-mermaid-card-*` 来自 `@tencent/smart-doc-plugin-mermaid@2.129.0`（`markdown-editor-component`）。输入规则：行匹配 `` ```mermaid `` 变成 `blockType: mermaid`。

那是 **本地 Markdown 编辑器** 的卡片：源码/预览/分栏、全屏 lightbox、复制、下载 PNG。官方「切换视图、下载图表」对得上这条。

主窗 CSS 会带上这些变量，**不等于聊天在用 smart-doc**。聊天 mermaid 的 token 是 `--cb-mermaid-*` 与 `_cb-mermaid-*`。

---

## 6. SVG 三件套：围栏 / 裸标签 / 文件

1. **` ```svg `**：没有 `language === "svg"` 分支 → 普通代码块。不会 compile 成图。
2. **裸 `<svg>`**：`hast-util-sanitize` 默认 `tagNames` 无 `svg`；聊天 Markdown 的 sanitize 只**追加了 KaTeX 数学标签**，没有放行 SVG。裸 svg **不会**留在助手正文里当矢量图。
3. **`.svg` 文件**：
   - `isImagePath()` 把 `.svg` 算进「图片路径」（产物/URI 判断）。
   - 上传/附件预览：`mimeType !== "image/svg+xml"` 才当普通图 → **排除 SVG 文件当聊天气泡里的 `<img>`**。
   - 官方移动端预览页可以把 `.svg` 当矢量图。桌面右侧点开 `.svg` 文件长什么样：**本轮未点实机，unknown**。
4. **DOMPurify `sanitizeSvg`**：注释写明给 IconProvider / `kind: "inline-svg"` 的图标 payload，**不是**助手 Markdown 行内图。

---

## 7. mermaid 与 SVG 是不是同一种东西

**不是。**

| | mermaid | SVG（widget 里的） | SVG（Markdown） |
|---|---|---|---|
| 源 | ` ```mermaid ` 语法 | `widget_code` HTML，常含 `<svg>` | ` ```svg ` 或裸标签 |
| 编译 | `mermaid.render` → 生成 SVG | 不经 mermaid；当 HTML 灌 iframe | 围栏当代码；裸标签被 sanitize 掉 |
| UI | `MarkdownPreMermaid` | `WidgetRenderer` | 普通 `MarkdownPre` / 被剥掉 |
| 流式 | 未 complete 当代码 | 半截 HTML 也 update | 无出图 |

mermaid **输出**是 SVG，但产品对象是「mermaid 代码块」。Visualizer 的对象是「HTML widget」。资料库 mermaid 又是第三套（smart-doc）。

---

## 8. 旁注：默认关掉的 `conversation-render`

同包 `conversation-render` 另有 `MermaidBlock`：`language-mermaid` → 默认 `viewMode: "svg"`；`isRendering` 为 true 时 **不** `drawMermaid`（流式该块当未画完）；工具栏主题/缩放/适应/下载。这是 **dev `localStorage.__force_conversation_render=1`** 才进主聊天的路径。5.3.14 dump 与 5.5.3 默认都是 `cb-markdown`，不是这条。

---

## 9. unknown

- 远程模型被要求吐 ` ```mermaid ` 还是 `show_widget`（禁止猜 system prompt）。
- 流式结束后 `MarkdownPreMermaid` 是否靠重挂载自动切到「图表」。
- WorkBuddy 是否给聊天注入 `onPreviewMermaid`（点图放大）。
- 桌面右侧点工作空间 `.svg` 文件的预览形态。
- dump 没有真实 mermaid/widget 对话帧，无法用截图复核工具栏文案。
- `conversation-render` 若将来服务端灰度打开，聊天 mermaid 会换成 `cr-*` 实现（当前默认关）。

---

## 10. 对地图 187 的对照（不改地图）

本票只提供 WorkBuddy 事实，**不**把下列写成我们的规格：

- WorkBuddy 聊天 mermaid **有**代码/图表工具栏；地图 187 草稿写「首版无工具栏」——那是我们的取舍，不是 WorkBuddy 现状。
- WorkBuddy 对 mermaid 流式是「未 complete 当代码、不边流边 compile」；`show_widget` 则**会**边流边出图。对标时必须先说清要对标 A 还是 B。
- WorkBuddy **不**把 mermaid 与 SVG 合成一个词。
- `--sc-mermaid-*` 不能当聊天行内图证据。
