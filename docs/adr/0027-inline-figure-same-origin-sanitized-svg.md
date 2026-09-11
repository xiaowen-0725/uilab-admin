# ADR 0027：行内图是同源消毒后的静态 SVG，不是 iframe 岛

- **Status:** Accepted
- **Date:** 2026-09-10
- **Amended:** 2026-09-11 — 产品源只认闭合 mermaid 围栏；` ```svg ` 不是行内图源。消毒器仍处理 mermaid 编译出的 SVG。对比 / 讲解卡是 **行内视觉**（ADR-0028），不是本 ADR。见 [Agent 主动可视化](../plans/workbench-agent-initiated-visualization.md)
- **Scope:** Agent Workbench Timeline 助手正文与 Document Markdown 预览里的 **行内图**；不改 Board / Interactive Artifact
- **Map:** [#187](https://github.com/xiaowen-0725/uilab-admin/issues/187)
- **Spec:** [workbench-inline-figure-spec](../plans/workbench-inline-figure-spec.md) · [规格票 #197](https://github.com/xiaowen-0725/uilab-admin/issues/197) · 汇编 [#196](https://github.com/xiaowen-0725/uilab-admin/issues/196)
- **Amends:** 根 `CONTEXT.md`（行内图）；ADR-0021「宿主侧无渲染不可信 HTML 的路径」对这条插入不再成立
- **Does not amend:** ADR-0026（交互产物仍是岛）；行内视觉另见 [ADR-0028](./0028-inline-visual-html-island.md)，不走本消毒路径

## Context

用户要 Timeline **助手正文**里把闭合的 Markdown ` ```mermaid ` 画成静图，跟字一个流。这不是 Artifact，也不开 Work Surface。` ```svg ` 围栏不是产品出图源。

对照邻居已经锁死另一条水管：Board Widget 与 Interactive Artifact 把不可信 HTML 放进 `srcdoc` iframe，`sandbox="allow-scripts"` 且 **不加** `allow-same-origin`，子文档 CSP 把 `connect-src` 收到 `'none'`（ADR-0021 / 0026）。`sandbox` 只作用于 iframe 的 nested browsing context。`<svg>` 没有等价属性；行内节点的 browsing context 就是宿主文档。

行内图要的正是宿主排印（`currentColor`、主题变量、浅框跟 `prose` 同宽）。把图再塞进 iframe 就变成岛，产品句子就破了。

ADR-0021 曾写：本机桌面应用「宿主侧无渲染不可信 HTML 的路径」，所以静态打包下 nonce 退化为构建期常量可以接受。行内图会把模型输出变成这样一条路径。

调研：[#190](https://github.com/xiaowen-0725/uilab-admin/issues/190) / [`docs/research/20260910-inline-svg-xss.md`](https://github.com/xiaowen-0725/uilab-admin/blob/research/inline-svg-xss/docs/research/20260910-inline-svg-xss.md)。

## Decision

1. **行内图插入宿主同源 DOM。** 不套 iframe、不复用 ADR-0021 的 `sandbox` / 子文档 `csp=`、不走 Interactive Surface。
2. **安全边界是白名单消毒，不是隔离。** 政策以 [规格白名单](../plans/workbench-inline-figure-spec.md) 为准，不得「跟 DOMPurify 默认 SVG profile」或「跟 Streamdown 默认 schema」当合同。宿主 CSP 是后盾，不能替代消毒。
3. **源只来自闭合 mermaid 围栏。** 取出代码字符串 → 体积闸 → 编译 → 消毒 → 浅框插入。` ```svg ` 与正文裸 `<svg>` 都不是行内图源；裸 `<svg>` 继续被现有 Markdown HTML schema 剥掉。
4. **mermaid 画出的 SVG 过同一套白名单。** 关掉 HTML labels；不为 mermaid 放行 `foreignObject`。插件自带的 `securityLevel: "strict"` 只是加一层，不是合同。
5. **失败回退代码块。** 消毒失败、超限、mermaid 失败都不在宿主里留下半张图。

## Considered options

- **套 ADR-0021 岛：** 能买到不透明源和独立 CSP，但图不再是 `prose` 的一部分，也吃不到宿主 `currentColor`。出局。
- **当 `<img src="data:image/svg+xml">`：** 图像语境脚本不跑，但不是行内 DOM，主题/无障碍都弱一档。出局。
- **扩大 Streamdown `allowedTags` 让裸 `<svg>` 过 rehype：** 打开无界 HTML 入口（CommonMark 切块、流式半截标签、与 `<file-ref>` 叠加）。#192 已否。
- **只靠宿主 CSP：** 无 nonce 的 `<script>` / `on*` 会被拦，但拦不住 `use` 克隆、集成点再入、`style-src 'unsafe-inline'` 下的作者样式，以及脚本一旦跑起来打侧车。出局。

## Consequences

- 模型 mermaid 输出（编译后的 SVG）是宿主上的不可信 HTML 路径。ADR-0021 的 CSP 后盾仍在；「无不可信 HTML 路径」这条前提对行内图作废。
- 实施必须把 Timeline 现有 `components.code` 让路（改 `inlineCode`），否则 mermaid / `renderers` 进不去；Document 与 Timeline 共用同一套管线。
- 交互产物、看板小组件、工作区 `.svg` 文件预览合同不动。大图、可交互视图继续走交互产物，不走这条。
