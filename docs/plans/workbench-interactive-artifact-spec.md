# Spec: Workbench 交互产物（Interactive Artifact）首版

**Status:** ready for tickets（可施工规格已发布，未实施）
**Tracker:** [规格：Workbench 交互产物（Interactive Artifact）首版](https://github.com/xiaowen-0725/uilab-admin/issues/181)（`ready-for-agent`）
**Map:** [Wayfinder 地图：Workbench 对话旁现场产物（Cursor Canvas 职责）首版规格](https://github.com/xiaowen-0725/uilab-admin/issues/167)
**ADR:** [0026-interactive-artifact-html-island](../adr/0026-interactive-artifact-html-island.md)
**Vocabulary:** 根 [`CONTEXT.md`](../../CONTEXT.md)（Interactive Artifact / Interactive Surface / Artifact / Work Surface Host / Board / Board Widget）
**Research:**

- [20260827-cursor-canvas-lifecycle](https://github.com/xiaowen-0725/uilab-admin/blob/research/cursor-canvas-lifecycle/docs/research/20260827-cursor-canvas-lifecycle.md)（#168）
- [20260827-workbench-adjacent-open-channels](https://github.com/xiaowen-0725/uilab-admin/blob/research/workbench-adjacent-open-channels/docs/research/20260827-workbench-adjacent-open-channels.md)（#169）
- [20260827-workbuddy-html-vs-canvas](https://github.com/xiaowen-0725/uilab-admin/blob/research/workbuddy-html-vs-canvas/docs/research/20260827-workbuddy-html-vs-canvas.md)（#174）
- [board-write-channel-client-side-tool-2026-08-15](../research/board-write-channel-client-side-tool-2026-08-15.md)（#113，大字节墙）

**Prototype:** `output/interactive-artifact-prototype/`（#173 选「闯入」）
**Related (do not reinvent):** [workbench-board-spec](./workbench-board-spec.md)、ADR-0006 / 0007 / 0008、ADR-0009、ADR-0021 / 0022
**诚实边界:** 本文是可施工规格，不是已交付功能。下一步是 `/to-tickets`，不要把本票当成一张纵向实施票来做。

---

## Problem Statement

用户要在 Task Surface **旁边**打开 Agent 为**本次 Task** 生成的可交互视图（表、图、清单），对着它继续聊。职责对齐 Cursor Canvas：聊天只留指针，视图在对话旁的独立工作面里。不复刻 `.canvas.tsx`，不接 `cursor/canvas` SDK。

今天对话旁只有 Work Surface Host。会打开的是：工作区文件、URL、本 Turn 的文件型产物卡、`board_commit` 之后的看板预览。没有「本次 Task 的交互产物」这种 Surface kind。工作区 `.html` 当源码预览。`artifact.created` / `artifact.updated` 协议在，产品 Runtime 不发射。大字节不能一次塞进 tool input 或事件流。

## Solution

Interactive Artifact 是 Artifact 的一种（标识 `interactive`）。用户可见中文「交互产物」。本体经侧车 staging + client-side 小提交落入 **Task 级产物库**；聊天只留指针。Interactive Surface 用放宽的 HTML 岛渲染（复用 ADR-0021 子文档收紧，不走 Board Widget 合同）。创建或更新成功后，渲染层自动打开（或切到）那一份。

产品上这不是看板。交货水管的**形状**对齐已落地的看板写入通道：内容面走 staging，控制面走小提交，工具只回摘要，提交成功后开面。不复用看板的提交工具、看板库、小组件合同。

## User Stories

1. As a 用户, I want 在对话里向 Agent 要一份可筛选的表, so that 我能在对话旁边操作这份结果，而不只是读一段文字。
2. As a 用户, I want Agent 提交成功后右侧自动打开 Interactive Surface, so that 我不必先去找一张卡再点开。
3. As a 用户, I want 聊天里只看到指针卡而不是整张表或整页 HTML, so that Timeline 仍可读，事件流也不会被大字节撑爆。
4. As a 用户, I want 关掉 Host 后面指针还在, so that 关闭预览不等于丢掉这份产物。
5. As a 用户, I want 再点这张指针卡时仍打开同一份, so that 我能回到刚才那张表，而不是一份副本。
6. As a 用户, I want 再要一份清单时出现第二张卡并且 Host 切到新的那份, so that 同一 Task 可以有多份交互产物，但面上一次只看一份。
7. As a 用户, I want 旧的那份仍能从它的指针卡重开, so that 切换查看不会丢掉上一份。
8. As a 用户, I want 对 Agent 说「把某行标红」时更新的是同一份而不是第三份, so that 迭代发生在我正在看的那件东西上。
9. As a 用户, I want 更新成功后面上的岛立刻换成新内容, so that 我看见的就是刚改过的那一版。
10. As a 用户, I want 对着打开的面在 Composer 里继续打字发送, so that 「对着面聊」不需要岛内输入框或宿主桥。
11. As a 用户, I want 面开着时对话区仍然在、没有被盖住, so that 我能同时看 Timeline 和交互产物。
12. As a 用户, I want 没有「新建空交互产物」的按钮, so that 空壳不会出现，所有份都由 Agent 为这次任务生成。
13. As a 用户, I want 不能手改岛的源码, so that 我不会把产品用成编辑器；要改就对 Agent 说。
14. As a 用户, I want 首版没有导出或分享入口, so that 我不会以为这份东西已经可以发给别人。
15. As a 用户, I want 这份交互产物只属于当前 Task, so that 换到另一个 Task 时看不见、也打不开它。
16. As a 用户, I want 删除当前 Task 之后再也打不开它的交互产物, so that 硬删是真的级联，不会留下幽灵面。
17. As a 用户, I want 打开工作区里的 `.html` 文件时仍看到源码而不是可执行岛, so that 文件预览和交互产物不会混成一种东西。
18. As a 用户, I want 点一个 URL 时仍走 Browser Surface, so that 外链不会被当成交互产物打开。
19. As a 用户, I want 本回合的 featured 文件产物卡仍按旧规则自动打开, so that 做交互产物不会破坏已有的文件交付体验。
20. As a 用户, I want 交互产物的自动打开只发生在这次提交成功之后, so that 刷新页面或回放历史不会突然把面弹开。
21. As a 用户, I want 关掉面之后 Agent 再次更新同一份时面会再打开, so that 闯入行为在每一次成功提交上都成立，而不是「本回合关过就不再开」。
22. As a 用户, I want 岛里的按钮和筛选能用, so that 这是可交互视图，不只是一张图。
23. As a 用户, I want 岛不能访问网络, so that 我不会在对话旁边跑一个能外传数据的页面。
24. As a 用户, I want 岛不能读写宿主的存储或 cookie, so that 它拿不到工作台里的会话或其它 Task 的数据。
25. As a 用户, I want 岛里发起的 `fetch` / XHR / WebSocket 失败, so that 「无网」是机制，不是约定。
26. As a 用户, I want 岛不能加载外链脚本或 CDN, so that Agent 不能靠远程脚本绕过沙箱。
27. As a 用户, I want 看板上的小组件和取数作业仍按原样工作, so that 交互产物不改看板合同。
28. As a Agent, I want 先把 HTML 分片写进侧车 staging 再发一次小提交, so that 大字节不进事件、也不一次塞进 tool input。
29. As a Agent, I want 小提交只带 id / hash / title 这类标量, so that 控制面保持很小，渲染层自己去拉正文。
30. As a Agent, I want 按同一 id 提交时更新已有记录, so that 迭代不必另建一份。
31. As a Agent, I want 省略 id 或使用新 id 时创建另一份, so that 同一 Task 能并排留下多份指针。
32. As a Agent, I want 相同内容的重复提交不复制出第二份, so that 重放或模型重试不会堆出重复卡。
33. As a Agent, I want 工具回给模型的只是摘要（id、标题、是否更新）, so that 模型上下文里不会出现整页 HTML。
34. As a Agent, I want 提交工具串行而不是并行连发, so that 不会像 #113 那样静默丢掉一次调用。
35. As a Agent, I want 分片写入可续写, so that 一次写不完可以接着写同一个草稿。
36. As a Agent, I want 用现有的 `artifact.created` / `artifact.updated` 宣布指针, so that 不必发明新的一等事件，也不必复活 `work_surface.open_requested`。
37. As a Agent, I want 指针里只有 id / title / kind=`interactive`, so that 事件不运视图本体。
38. As a 用户, I want 指针卡的标题是这份交互产物的标题, so that 多份之间能分辨。
39. As a 用户, I want 指针卡标明这是交互产物而不是一个文件, so that 我不会以为点开会进 Document。
40. As a 用户, I want 点交互产物卡时打开 Interactive Surface 而不是按路径去解析文件, so that 产物 id 不会被当成工作区路径。
41. As a 用户, I want Host 里同时最多一份 Interactive Surface, so that 两份交互产物不会并排占两个 interactive tab。
42. As a 用户, I want 打开交互产物时 Document / Browser / 看板预览仍按各自规则存在, so that 「只开一份」约束的是 Interactive Surface，不是整个 Host。
43. As a 用户, I want 从 Task A 切到 Task B 时看不到 A 的交互产物, so that Task 边界是硬的。
44. As a 用户, I want 回到 Task A 时还能从指针重开 A 的那份, so that 切走不是删除。
45. As a 实施者, I want 测试可以在内存 staging 和内存产物库上跑完整写入通道, so that 默认测试不依赖本机侧车。
46. As a 实施者, I want 人眼验收时仍同时开前端和侧车, so that 真对话路径能走完 staging 和提交。
47. As a 用户, I want 界面文案是「交互产物」而不是 Canvas / 看板 / 小组件, so that 产品语言和 Board 的 Avoid 词不撞车。
48. As a 用户, I want 没有 AG-UI 画布事件出现在产品对话里, so that 首版不假装已经接了 ACTIVITY / CUSTOM。
49. As a 用户, I want 工作台不会在宿主里编译 React 或 TSX 来画这份产物, so that 首版就是 HTML 岛，没有第二条编译链。
50. As a 用户, I want Agent 不会把交互产物写成工作区文件来「打开」, so that 别的 Task 不会因为磁盘上多了一个 `.html` 而看见它。

## Implementation Decisions

### 领域与命名

- Interactive Artifact 是 Artifact 的一种，不是新的一等实体，不是 Board，不是 Board Widget，不是打开工作区文件或 URL。
- 标识 `interactive`。用户可见中文「交互产物」。英文主名禁止 `Canvas`（Board 的 Avoid 词；`BoardCanvas` 已占用）。「现场产物 / live artifact」只作口语。
- Interactive Surface 是新的 Work Surface kind，领域名即此；实施登记名与 kind 字符串用 `interactive`。

### 模块与所有权

- **不要**把交互产物放进 Board 模块，不要复用看板库、看板提交工具、小组件脚本合同。
- Task 模块拥有：Task 级产物库的端口与写入通道、client-side 提交执行器、`artifact.created` / `artifact.updated` 投影，以及 `kind=interactive` 的指针卡呈现。
- Work Surface 模块拥有：Interactive Surface 的登记与岛渲染；开面意图把 `interactive` 当成「id，不是路径 / URL」，形状对齐已有的 `board` 分支。
- Composition 装配：登记 Interactive Surface、把提交成功接到 Host 的打开函数、把删 Task 接到产物库级联删除。
- 侧车拥有：交互产物自己的 staging（与看板 staging 分命名空间）。产品 Runtime Adapter 只把**新的** client-side 工具名交给渲染层执行器。
- 若写入通道把 Task 模块撑到接口不再小，允许抽一个只服务交互产物的窄模块；那不是新的产品实体，也仍禁止叫 Canvas。

### 写入通道（主缝）

- 内容面：模型把 HTML 分片写入侧车 staging。staging 不挂起渲染层，不进事件。
- 控制面：一次 client-side 小提交，参数只含产物 id（创建时可缺，更新时必带）、draft / hash、title 等标量。渲染层拉 staging，校验 hash，写入 Task 级产物库。
- 工具名实施期自定。禁止复用看板提交 / 状态工具名。
- 必须：按产物 id 幂等；可续写同一个草稿；串行调用（#113：并行 client-side 工具会静默丢调用）；回给模型的输出只有摘要，不得含 HTML 或源。
- 创建：库中新增一条，属当前 Task。更新：同一 id 覆盖正文与标题，仍属原 Task。相同 hash 的重复提交不复制记录。
- 提交成功后的开面是渲染层副作用，和看板预览同类，**不是** Runtime 事件。不要发射或复活 `work_surface.open_requested`。
- 开面守卫：只为**当前选中的** Task 打开。用户已经切走则写入仍成功，但不要把面开到别人的 Task 上。
- 关掉面后再一次成功提交：仍然打开或切到那一份。不要复用看板预览「本回合用户关过就不再开」的策略。
- 回放 / 水合已有事件：画出指针卡，**不**自动开面。自动开只绑现场提交成功。

### 产物库

- 记录至少包含：产物 id、所属 Task id、title、HTML 正文、content hash、更新时间。
- 查询与打开必须带 Task id。跨 Task 读取视为不存在。
- 持久化走工作台已有的统一 IndexedDB 壳，另开自己的 store，additive schema bump。测试默认 Memory。
- 删 Task 必须级联删该 Task 的全部交互产物。接到现有硬删级联，不要另做一条「用户可恢复」的软删。
- 不写工作区文件。不进看板库。

### 指针与 Timeline

- 指针走已有 `artifact.created` / `artifact.updated`。payload 只运稳定产物 id、title、`kind=interactive`。不要把工作区路径或 `.html` 文件名当作这份东西的身份。
- 投影继续把这类事件收成 Artifact / Deliverable。呈现必须看 `kind=interactive`：文案是交互产物，打开走 Interactive Surface，**不要**按路径扩展名把它分类成 Document 预览。
- 文件型 featured 自动开（回合结束、`file.changed`）保持旧行为。交互产物**不**走那条门。
- 「查看所有产物」若列出交互产物，点它也必须按 kind 打开，不得把 id 当作文件路径解析。

### Interactive Surface

- 几何：旁路 Work Surface Host（ADR-0006 / 0008）。不要内嵌回气泡，不要做成盖住对话的模态。
- 同一时刻只打开一份 Interactive Surface；用指针切换就是改当前这份的 id。Host 里其它 kind（Document / Browser / 看板预览）不受这条「只开一份」约束。
- 执行环境：srcdoc iframe；`sandbox="allow-scripts"`；**不加** `allow-same-origin`；不加 forms / downloads / popups / modals / top-navigation。宿主给脚本盖当次 nonce。
- 子文档 CSP **复用 ADR-0021 收紧**（`connect-src 'none'`、无 storage、无 `frame-src`、`object-src 'none'`）。不另写更松政策。可与看板共用收紧手段，不共用小组件脚本合同。
- **不**强制 `widget.ready` / `widget.data`，不跑看板源码校验，不装宿主桥，不在宿主里编译 React。
- 数据嵌在提交的 HTML 里。要刷新内容，靠 Agent 更新同一份。
- ADR-0009 对工作区文件 / URL 仍成立：文件型 `.html` 走 Document 源码；URL 走 Browser。ADR-0026 把交互产物定为第三条面。

### 侧车与 Runtime

- 交互产物 staging 与看板 staging 分通道，避免草稿和工具混用。
- 默认包级测试不打真侧车。人眼验收必须前端 + 侧车双进程。
- 首版不挂 AG-UI ACTIVITY / CUSTOM。槽继续留着，不重开 AG-UI 接入。

### 原型里已经锁死的行为

#173 低保真原型在「打开时机 / 和对话怎么占地方」上试了旁路、闯入、内嵌。选定**闯入**：

- 几何仍是旁路 Host。
- 创建或更新成功后渲染层自动开面（或切到那一份）。
- 关掉后从该 Task 的指针重开。

## Testing Decisions

好测试只锁外在行为：库里有没有这一份、工具结果有没有 HTML、哪张面被打开、聊天里是不是指针、工作区 `.html` 是不是仍走 Document。不锁函数名、组件树、CSS class、工具的最终英文名。

### 主缝：交互产物写入通道

新建一条与看板 client-side 提交执行器**同层**的缝，但独立的库与工具。覆盖：

- 创建后库中有记录，工具结果不含 HTML / 源。
- 按 id 更新仍是同一份。
- 相同提交不复制。
- 提交成功触发开面（或切到那一份）；关掉后再提交仍开。
- 删 Task 之后不可再开。
- 其它 Task 不可见、不可开。
- 当前选中 Task 已切走时：写入成功，不开到错误的 Task。

前车：看板写入通道测试、client-side 工具执行器、提交后预览。不要调用看板提交工具来冒充本缝。

### 沿用缝 1：开面意图

扩展现有开面意图：`kind = interactive` + 产物 id → Interactive Surface。工作区路径仍走 Document；URL 仍走 Browser；`kind = board` 仍走看板预览。未登记 `interactive` 时不得回退成 Document。

前车：现有开面意图测试、Surface 装配测试。

### 沿用缝 2：`artifact.created` / `artifact.updated` 投影 + 产物卡

`kind=interactive` 的指针出现在 Timeline / 产物区；点击按交互产物打开，不按文件路径打开。文件型 featured 自动开不被这些指针触发。回放只出卡、不开面。

前车：现有 artifact 投影测试、产物卡测试、产物呈现测试。

### 岛约束（不是第三条产品缝）

Interactive Surface 的 iframe 必须是 `sandbox="allow-scripts"` 且不含 `allow-same-origin`；子文档 CSP 含 `connect-src 'none'`。不测 `widget.ready`、不跑看板源码校验。可复用 ADR-0021 的收紧断言方式。

### 明确不测

- 复活 `work_surface.open_requested` 当产品开面通道。
- 用文件 featured 自动开（回合结束 / `file.changed`）来开交互产物。
- Board IDB、Widget 桥、取数作业。
- AG-UI ACTIVITY / CUSTOM。
- 用户改源、导出、分享、空件、多份 Interactive Surface 并排。

## Out of Scope

首版不做：

- Board 网格、Board Widget 合同、复用看板库或看板提交工具。
- 打开工作区文件 / URL 来充当交互产物；Document 预览执行 HTML；Browser；WorkBuddy `static-html`。
- 宿主编译 React / TSX，复刻 `cursor/canvas`，像素对齐 Cursor。
- 用户手改源、导出、分享、跨 Task 可见、应用级目录、新建空件。
- 岛内拉网、宿主桥、岛内 storage / cookie。
- 挂 AG-UI ACTIVITY / CUSTOM；重开 AG-UI 接入；A2UI 渲染器。
- Interactive Surface 多 tab 并排。
- 远程多租户 Runtime、把交互产物当成生产集群能力。

## Further Notes

- 地图 [#167](https://github.com/xiaowen-0725/uilab-admin/issues/167) 已关。决策票 #170–#179、汇编 #180 已关。不要重开「这是不是 Canvas / 看板 / 文件」或「要不要复活 `work_surface.open_requested`」。
- 词表真源在 `CONTEXT.md`。ADR-0026 已接受。ADR-0009 对文件 / URL 仍成立，对交互产物以 0026 为准。
- 本规格是 `/to-spec` 从地图收拢的可施工计划。实施必须经 `/to-tickets` 拆成带阻塞边的纵向票；不要直接 `/implement` 本规格整张。
- 人眼验收：`pnpm dev:workbench` 与 `pnpm dev:workbench-runtime` 必须同时开。
