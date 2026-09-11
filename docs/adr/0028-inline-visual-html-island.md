# ADR 0028：行内视觉是对话列里的 HTML 岛，不是行内图，不是交互产物

- **Status:** Accepted
- **Date:** 2026-09-11
- **Scope:** Agent Workbench Timeline 助手正文与 Document Markdown 预览里的 **行内视觉**；不改 Board / 行内图消毒白名单
- **Spec:** [workbench-agent-initiated-visualization](../plans/workbench-agent-initiated-visualization.md)
- **Research:** [20260911-inline-visual-html-vs-svg](../research/20260911-inline-visual-html-vs-svg.md)
- **Amends:** 根 `CONTEXT.md`（行内视觉）；ADR-0026「HTML 岛只在 Interactive Surface」对这条对话列卡不再成立
- **Does not amend:** ADR-0027（mermaid 行内图仍插入宿主同源 DOM）

## Context

用户要的对比卡（双色栏、要点列表、标题栏）是 **对话里的 HTML 视觉块**，对标 Claude Custom visuals / WorkBuddy Visualizer 的职责。它不是 mermaid 流程图，也不是旁路 Interactive Artifact。

已有两条邻居不要并：

- **行内图（ADR-0027）**：闭合 mermaid → 消毒 SVG 插入宿主。白名单罩不住任意 HTML。
- **交互产物（ADR-0026）**：Task 级 HTML 岛，画在对话旁的 Interactive Surface，聊天只留指针。

把对比卡画成 mermaid subgraph 会得到灰框分组，不是用户要的卡。把对比卡升级成交互产物会打开右侧面，离开气泡。

## Decision

1. **行内视觉是助手 `prose` 里的 HTML 岛。** 源只有闭合 ` ```visual ` 围栏。语言 `html` / `svg` 仍是代码块。
2. **安全边界是 ADR-0021 子文档政策，不是 ADR-0027 白名单。** `sandbox="allow-scripts"`、不加 `allow-same-origin`、子文档 CSP 含 `connect-src 'none'`。作者 `<script>` 剥掉；只有宿主高度上报脚本带 nonce。
3. **宿主提供卡槽 chrome**（标题、折叠）。点卡不打开 Interactive Surface，不新造协议事件。
4. **谁出卡：Agent 写作约定。** 对比 / 讲解走 `visual`；流程 / 时序走 mermaid；可筛选应用走 `interactive_*`。用户提示词不点名格式。
5. **高度用宿主拥有的 `postMessage`。** 不是 Board Widget 握手，不是交互产物桥。父页只接受 `event.source === iframe.contentWindow` 且 `type` 对得上的消息。

## Considered options

- **mermaid subgraph 冒充对比卡：** 做不出双色栏排版。出局。
- **HTML 消毒后插宿主：** XSS 面比 SVG 白名单大一个数量级。出局。
- **新工具 `show_widget`：** 和交互产物写入通道重复；围栏已够把 HTML 放进 `prose`。首版不做。
- **语言用 `html`：** 代码样本会被画成卡。出局。

## Consequences

- Timeline 与 Document 共用同一套 `visual` renderer。用户气泡 / Composer / 旁白仍是字。
- 交互产物岛政策字面与行内视觉共用 `src/lib/html-island/child-iframe-policy.ts`，禁止两边各改各的 sandbox。
- 模型 `visual` 围栏是第三条不可信 HTML 路径。宿主 CSP 仍是后盾。
