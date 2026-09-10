# Spec: Workbench 行内图（Inline Figure）首版

**Status:** ready for tickets（可施工规格已发布，未实施）
**Tracker:** [规格：Workbench 行内图（Inline Figure）首版](https://github.com/xiaowen-0725/uilab-admin/issues/197)（`ready-for-agent`）
**Map:** [Wayfinder 地图：Workbench 助手正文行内图（SVG / mermaid）首版规格](https://github.com/xiaowen-0725/uilab-admin/issues/187)
**ADR:** [0027-inline-figure-same-origin-sanitized-svg](../adr/0027-inline-figure-same-origin-sanitized-svg.md)
**Vocabulary:** 根 [`CONTEXT.md`](../../CONTEXT.md)（行内图 / Inline Figure、Interactive Artifact、旁白 / `prose`）
**Research:**

- [20260910-workbuddy-inline-mermaid-svg](https://github.com/xiaowen-0725/uilab-admin/blob/research/workbuddy-inline-mermaid-svg/docs/research/20260910-workbuddy-inline-mermaid-svg.md)（#188）
- [20260910-mainstream-inline-figures](https://github.com/xiaowen-0725/uilab-admin/blob/research/mainstream-inline-figures/docs/research/20260910-mainstream-inline-figures.md)（#189）
- [20260910-inline-svg-xss](https://github.com/xiaowen-0725/uilab-admin/blob/research/inline-svg-xss/docs/research/20260910-inline-svg-xss.md)（#190）
- [20260910-streamdown-mermaid-svg](https://github.com/xiaowen-0725/uilab-admin/blob/research/streamdown-mermaid-svg/docs/research/20260910-streamdown-mermaid-svg.md)（#191）

**Prototype:** `output/inline-figure-prototype/`（#195 选「浅框」）
**Related (do not reinvent):** [workbench-interactive-artifact-spec](./workbench-interactive-artifact-spec.md)、ADR-0021 / 0026、[agent-event-stream-and-projection §6.1](../architecture/agent-event-stream-and-projection.md)
**诚实边界:** 本文是可施工规格，不是已交付功能。实施走 [#197](https://github.com/xiaowen-0725/uilab-admin/issues/197) 的子票（#198 → #200 → #199），不要直接 `/implement` 本规格整张。不要改系统提示词去教模型画图。

---

## Problem Statement

用户要在 Timeline **助手正文**里看见图：模型写出闭合的 ` ```svg ` 或 ` ```mermaid ` 围栏后，图就嵌在那段 `prose` 里。对标 WorkBuddy / Codex 的行内效果，不是对话旁的交互产物，也不是工作区 `.svg` 交付卡。

今天同一套 Streamdown 把这两种围栏都画成代码块。裸 `<svg>` 会被默认 schema 剥掉。出图必须另接编译，并且一旦插入宿主 DOM，就踩上 ADR-0021 岛专门用 iframe sandbox 买掉的那条 XSS 面。

## Solution

行内图是 TimelineItem 正文的一部分。只画已晋升的助手 `prose`，以及同一套 Document `.md` 预览。围栏未闭合当代码；闭合后取出源码 → 体积闸 →（mermaid 先编译，关掉 HTML 标签）→ 白名单消毒 → **浅框**静图。失败一律回退普通代码块。不新造协议事件，不点开 Work Surface，无工具栏。

## User Stories

1. As a 用户, I want 助手回答里闭合的 mermaid 围栏画成流程图, so that 我不必把源码抄去别处预览。
2. As a 用户, I want 闭合的 ` ```svg ` 围栏画成图, so that 模型给的示意图就在正文里。
3. As a 用户, I want 图跟正文一个流、套浅框、没有工具栏, so that 它读起来是段落里的图，不是一张卡片应用。
4. As a 用户, I want 同一气泡里多张图各套一框, so that 两张图不会粘成一块。
5. As a 用户, I want 围栏还在流、还没闭合时仍是代码块, so that 不会对着半截源闪一张破图。
6. As a 用户, I want 围栏一闭合就切成图, so that 不用等整段回答结束才看见。
7. As a 用户, I want 打开工作区 `.md` 时看到同一套图, so that Timeline 和文档预览不会各画各的。
8. As a 用户, I want 过程折里的围栏仍是字, so that 旁白不会突然出图。
9. As a 用户, I want 自己的气泡里贴围栏仍是字, so that 输入框不是画图器。
10. As a 用户, I want 正文里的裸 `<svg>` 不要出图, so that 只有围栏这一种入口。
11. As a 用户, I want 画不出来时看到原来的代码块, so that 源还在，也没有「无法绘制」第二条卡。
12. As a 用户, I want 超大的源码不要被截成半张图, so that 失败形态只有一种。
13. As a 用户, I want 深色主题下 mermaid 跟着工作台变色, so that 不会嵌一张白底图。
14. As a 用户, I want SVG 围栏里的红绿作者色保持原样, so that 「超额标红」不会被主题洗掉。
15. As a 用户, I want 点行内图不要打开 Work Surface, so that 静图不会被当成交互产物。
16. As a 用户, I want 行内图不要升级成交互产物指针, so that 两条水管不会混。
17. As a 实施者, I want 消毒函数能在无 React 的测试里跑, so that 白名单回归不靠点页面。
18. As a 实施者, I want Timeline 的文件路径芯片仍可用, so that 改 `inlineCode` 让路插件时不丢掉现有芯片。

## Implementation Decisions

### 领域与命名

- 正式名：**行内图 / Inline Figure**。不是 Artifact，不是 Interactive Artifact，不是 Board Widget。
- 两种源不要合成一个词：闭合 ` ```svg `（信息串第一个 token，大小写等同），闭合 ` ```mermaid `。
- 不认：裸 `<svg>`、` ```xml `、HTML 混排、` ```svg.xml ` 这类第二 token。
- 用户可见中文「行内图」。不要在 UI 里写 Canvas / 图表 / 行内可视化。

### 谁画、谁不画

- **画：** §6.1 的助手 `prose`（含流式已闭合围栏）；Document Surface 对工作区 `.md` 的预览。
- **不画：** `working` 旁白与过程折；用户气泡；Composer 输入；HITL `inline` 卡。
- Composer 贴围栏：发出去仍是用户消息明文。组件以后若给用户消息接 Markdown，必须走同一套消毒与失败语义；首版不接。

### 模块与装配

- 继续 Streamdown，不换 Markdown 引擎。
- Timeline 与 Document **共用一份**插件 / renderer / 消毒配置。禁止两边各写一套白名单。
- Timeline 现有 `components.code` 会拆掉 mermaid 与 `renderers` 管线，必须改成 `inlineCode`（文件路径芯片只接管行内 code）。
- 装 `@streamdown/mermaid`，版本与当前 `streamdown` 匹配（调研时对照 `streamdown@2.5.0` 的 `@streamdown/mermaid@1.0.2`）。**mermaid 运行时钉在该插件声明的依赖上**，升级走插件升级，不要单独漂 `mermaid`。
- ` ```svg ` 无官方插件：用 `plugins.renderers` 按 language `svg` 接管。
- `controls={false}` 保持关掉（无下载 / 全屏 / 源码切换）。
- 消毒与体积闸是无 React 的纯函数，可单测。插入 DOM 用 SVG 命名空间的 React 节点（或等价 `importNode`），不要把未消毒字符串写进 `svg.innerHTML`。

### 流式

- 未闭合围栏：当普通代码块。接 Streamdown 的 `isIncomplete` / `useIsCodeFenceIncomplete`。
- 闭合后编译一次，不要每个 chunk 都 `mermaid.render()`。官方 mermaid UI 默认不会等闭合，产品必须自己接钩子，不要假定装上插件就符合本条。
- 过程旁白里的围栏从未晋升为 `prose`，本条管线碰不到它们。

### 体积

- 每张图的**围栏源码**上限约 **64 KiB**（UTF-8 字节，数量级合同）。
- 可另加防御性嵌套深度上限（建议 32），不当产品档。
- 超限：整段当代码块；不截断、不画半张、不空白。

### mermaid

- `htmlLabels: false`（含 flowchart 等子图配置）。输出走 SVG `text`，不要 `foreignObject`。
- 主题：跟工作台 CSS 变量对齐前景 / 背景 / 边线。不要默认浅色白底。
- 画出 SVG 后**剥掉 mermaid 注入的 `<style>` / `class`**，把主题写进 `fill` / `stroke` 等属性，再走同一套白名单。
- 语法失败、运行时 throw、输出过不了白名单：当代码块。
- mermaid `securityLevel: "strict"` 可开，**不是**合同。

### 呈现（#195 浅框）

- 成功画出的图：与 `prose` 同宽；1px `border`；约 12px 圆角；约 16px 内边距；框外上约 8px、下约 20px。用工作台 token，不要另造一套色。
- 多张各套一框。
- 失败回退的代码块**不**套浅框，沿用现有 `pre` 样式。
- 无工具栏、无源码/预览切换、不可点开 Work Surface、气泡里不出现「请改用交互产物」。
- SVG 围栏：作者 `fill` / `stroke` 原样；`currentColor` 才继承正文色。
- 无障碍：浅框容器 `role="img"`；`aria-label` 取消毒后 `<title>` 的纯文本，没有则用「行内图」。不要可见图题条 / figcaption（那会像第二套 chrome）。`<title>` / `<desc>` 只保留文本子节点。

### 消毒白名单（合同）

政策以本表为准。DOMPurify / rehype-sanitize / mermaid strict **都不得**原样当政策。

**允许的元素：** `svg`、`g`、`defs`、`clipPath`、`linearGradient`、`radialGradient`、`stop`、`path`、`circle`、`ellipse`、`rect`、`line`、`polyline`、`polygon`、`text`、`tspan`、`title`、`desc`。

**禁止的元素（出现即失败或剥掉后若根不成立则失败）：** `script`、`foreignObject`、`iframe`、`object`、`embed`、`use`、`image`、`a`、`style`、`animate`、`set`、`animateTransform`、`animateMotion`、`handler`、以及未列入允许表的任何标签。

**允许的属性（仅这些；其余剥掉）：**

| 作用 | 属性 |
| --- | --- |
| 画布 | `viewBox`、`preserveAspectRatio`、`xmlns`、`width`、`height` |
| 几何 | `x`、`y`、`x1`、`y1`、`x2`、`y2`、`cx`、`cy`、`r`、`rx`、`ry`、`dx`、`dy`、`d`、`points`、`transform` |
| 描边填充 | `fill`、`fill-opacity`、`fill-rule`、`stroke`、`stroke-width`、`stroke-opacity`、`stroke-linecap`、`stroke-linejoin`、`stroke-miterlimit`、`stroke-dasharray`、`stroke-dashoffset`、`opacity` |
| 文字 | `font-size`、`font-family`、`font-weight`、`font-style`、`text-anchor`、`dominant-baseline`、`alignment-baseline` |
| 渐变 / 裁剪 | `offset`、`stop-color`、`stop-opacity`、`gradientUnits`、`gradientTransform`、`spreadMethod`、`clipPathUnits`、`clip-path` |
| 身份 | `id`（必须加前缀，见下） |

**禁止的属性：** 全部 `on*`（含 `onbegin` / `onend`）；`href`、`xlink:href`、`src`；`style`；`class`；`tabindex`。禁止任何 URL 属性。

**属性值：**

- `fill` / `stroke` / `stop-color`：颜色字面量、`none`、`currentColor`、或 `url(#` + **已加前缀的同文档 id** + `)`。
- `clip-path`：只允许 `url(#` + 已加前缀 id + `)`。
- 其余长度 / 路径 / 数字按 SVG 字面量；含 `javascript:`、`data:`、`http:`、`https:`、`//` 的值视为失败。

**id：** 消毒后改写为稳定前缀（例如 `if-` + 源码短哈希 + 原 id 的 `[A-Za-z0-9_-]` 过滤）。所有 `url(#…)` 同步改写。禁止 clobber 宿主 id。

**失败：** 根不是 `svg`、允许集之外仍留下可执行面、URL 闸命中、体积超限 → 整段回退代码块。不要留下空白框。

### 协议与 Runtime

- 纯渲染层。不新增 TimelineItem 种类，不新增 Runtime 事件，不复活 `work_surface.open_requested`。
- 不改系统提示词。模型会不会吐围栏是运气；渲染器只负责画已写出的源。
- 过大或可交互的视图：Agent 应走交互产物水管。渲染器不跳转、不提示换管。

## Testing Decisions

好测试只锁外在行为：这段 Markdown 是图还是代码块、DOM 里有没有禁止标签、文件芯片还在不在。不锁函数名、CSS class、mermaid 内部 theme 键。

### 主缝：围栏 → 图或代码块

同一套函数 / 装配，Timeline 与 Document 都要覆盖：

- 闭合 ` ```mermaid ` → 浅框内有 SVG，源码围栏不再当代码展示。
- 闭合 ` ```svg ` → 同上。
- 未闭合围栏（流式最后一块）→ 代码块，不调用 mermaid 编译。
- 信息串大小写（`SVG` / `Mermaid`）同等。
- 裸 `<svg>` → 不出图。
- 用户气泡 / 过程项夹具 → 不出图。

### 主缝：消毒与失败

- 源码含 `script` / `on*` / `foreignObject` / `use` / `href` → 代码块。
- mermaid 输出若带 `foreignObject` → 代码块（不要为它放宽白名单）。
- 源码 > 约 64 KiB → 代码块，全文仍在。
- mermaid 语法失败 → 代码块。
- 合法几何 SVG（`path` / `rect` / `text`）→ 图；作者 `fill="#dc2626"` 仍在。

### 沿用缝：文件路径芯片

改 `inlineCode` 之后，行内 `` `src/foo.ts` `` 仍是芯片；围栏代码块仍可高亮。前车：`simple-markdown` 现有测试。

### 明确不测

- 新协议事件、提示词、点图开 Work Surface、工具栏。
- 像素对齐原型；token 允许 ± 实现差异。
- 远程 mermaid CDN、外链图。
- 把 Board Widget / 交互产物岛拿来画行内图。

## Out of Scope

首版不做：

- 交互产物 / Interactive Surface / Board Widget。
- 工作区 `.svg` 当行内图（仍走 Document / 交付卡）。
- 正文裸 `<svg>`、KaTeX、HTML 岛、可点图表。
- 过程旁白出图；边流边编译。
- 工具栏、源码切换、可见图题条、导向交互产物的文案。
- 新 TimelineItem / Runtime 事件；改系统提示词。
- 用户消息 Markdown 出图。
- 本规格范围内的功能实施（见子票 #198 / #200 / #199）。

## Further Notes

- 地图 [#187](https://github.com/xiaowen-0725/uilab-admin/issues/187) 决策票 #188–#195 已关。不要重开「这是不是 Artifact」或「能不能套 iframe sandbox」。
- 词表真源在 `CONTEXT.md`。ADR-0027 已接受。ADR-0026 仍只管交互产物岛。
- 本规格是从地图收拢的可施工计划。实施票：[#198](https://github.com/xiaowen-0725/uilab-admin/issues/198) → [#200](https://github.com/xiaowen-0725/uilab-admin/issues/200) → [#199](https://github.com/xiaowen-0725/uilab-admin/issues/199)。不要直接 `/implement` 本规格整张。
- 人眼验收（实施之后）：`pnpm dev:workbench` 与 `pnpm dev:workbench-runtime` 必须同时开。本规格本身不要求跑侧车。
