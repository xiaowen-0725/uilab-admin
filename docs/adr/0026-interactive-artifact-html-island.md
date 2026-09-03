# ADR 0026：交互产物是 Task 级 HTML 岛，不是看板、不是文件预览

- **Status:** Accepted
- **Date:** 2026-08-27
- **Scope:** Agent Workbench 对话旁 Interactive Artifact / Interactive Surface；不改 Board 合同
- **Map:** [#167](https://github.com/xiaowen-0725/uilab-admin/issues/167)
- **Spec:** [workbench-interactive-artifact-spec](../plans/workbench-interactive-artifact-spec.md) · [规格票 #181](https://github.com/xiaowen-0725/uilab-admin/issues/181)
- **Amends:** 根 `CONTEXT.md`（Interactive Artifact / Interactive Surface）；ADR-0009（HTML 交互不再只有 Browser Surface 这一条）

## Context

用户要的是 Cursor Canvas 那种职责：Agent 为**本次 Task** 生成可交互视图，在对话旁边打开，聊天只留指针。本仓已有三条容易认错的邻居：

- **Board / Board Widget**：应用级网格 + `widget.ready` / `widget.data` 合同（ADR-0021 / 0022）。`Canvas` 是 Board 的 Avoid 词，`BoardCanvas` 已占用。
- **Document / Browser**：打开工作区文件或 URL。`.html` 今天当源码；WorkBuddy 的报告是写文件 + 本机 `static-html`。
- **AG-UI ACTIVITY / CUSTOM**：协议槽已留，AG-UI 地图已关；无一等 Canvas 事件。

大字节不能一次塞进 tool input 或事件流（#113）。Board 已证明可行的是：侧车 staging + client-side 小提交。

## Decision

1. **交互产物是 Artifact 的一种**，不是新的一等实体。标识 `interactive`。对话旁用新的 Work Surface kind **Interactive Surface** 渲染。
2. **隶属于产生它的 Task**，跟 Task 级联删除；跨 Task 不可见；不进 Board IDB。
3. **本体走「内容面 / 控制面」分离**：侧车 staging 持大字节；client-side 小提交写入渲染层 **Task 级产物库**；事件只运 `artifact.created` / `artifact.updated` 指针。不复活 `work_surface.open_requested`。
4. **Interactive Surface 是放宽的 HTML 岛**：复用 ADR-0021 的子文档收紧（srcdoc、不透明源、`sandbox="allow-scripts"`、不加 `allow-same-origin`、`connect-src 'none'`）。**不**走 Board Widget 脚本合同。岛内无网、无桥、无存储。数据嵌在 HTML 里。
5. **创建或更新后渲染层自动开面**（闯入）；关掉从该 Task 指针重开。用户不手改源、不导出、不分享。首版不挂 AG-UI 槽，不在宿主里编译 React，不复刻 `cursor/canvas`。

## Considered options

- **新的一等实体（像 Board）**：没有事实逼着再造一套全局 store / 生命周期。
- **写工作区文件 + Document / Browser**：和「不是打开文件 / URL」冲突；别的 Task 也能看见文件。
- **原样复用 Board Widget 合同**：分析表若不绑取数作业过不了 `validateWidgetSource`；CONTEXT 禁止把 Widget 叫 Artifact。
- **宿主编译 React island**：更靠近 Cursor，首版要上编译链，且地图禁止复刻其 SDK。
- **事件或 `work_surface.open_requested` 运本体 / 开面**：产品 Runtime 不发射后者；事件不该运大字节。

## Consequences

- ADR-0009「HTML 源码走 Document、交互走 Browser」对**工作区文件 / URL** 仍成立。Task 生成的交互产物走第三条面，不把 `.html` 文件当岛。
- 写入形状对齐 ADR-0022 方案 D，但落点是 Task 产物库，不是 `boards` / `boardWidgets`。不得复用 `board_commit`。
- 子文档 CSP 与 Board 共用收紧，不另写更松的政策；安全预期与看板一致，脚本合同不同。
