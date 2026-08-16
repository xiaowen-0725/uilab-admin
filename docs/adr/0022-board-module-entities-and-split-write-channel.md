# ADR 0022：Board 模块、三实体模型与「控制面 / 内容面分离」写入通道

- **Status:** Accepted
- **Date:** 2026-08-16
- **Scope:** Agent Workbench `modules/board`、统一 IndexedDB schema、侧车 board 工具族与内容拉取端点
- **Map:** [#111](https://github.com/xiaowen-0725/uilab-admin/issues/111) · **Tickets:** [#115](https://github.com/xiaowen-0725/uilab-admin/issues/115) / [#116](https://github.com/xiaowen-0725/uilab-admin/issues/116) / [#119](https://github.com/xiaowen-0725/uilab-admin/issues/119) / [#126](https://github.com/xiaowen-0725/uilab-admin/issues/126)
- **Spec:** [workbench-board-spec §1 / §2 / §5](../plans/workbench-board-spec.md)
- **Amends:** 根 `CONTEXT.md`（Board / Board Widget / Widget Data Job 三条术语）；ADR-0011 的 module 清单

## Context

Board 是**应用级全局实体**，而 Workbench 现有的一切都是 task-scoped：EventStore、审批卡、Connector 门闸（`taskId` 为空直接 `missing_task_context`）、Work Surface 布局。同时**侧车工具写不了渲染层的 IDB**，而 IDB 是已锁的权威（ADR-0015）。

于是「一份 30 KB 的 agent 生成 HTML 怎么从模型手里到 IDB 里」成为本特性最关键的架构决策。调研（#113）查明单次写入的天花板在**模型输出层**而非传输层：30 KB HTML 转义后需模型一次吐 8k–12k output token，而侧车**未配** `maxOutputTokens`、**未配** `experimental_repairToolCall`——截断即 JSON 断裂且无修复兜底，重试会撞同一堵墙。所以必须分片。

client-side tool 通道另有三条硬约束：并行 tool call 会**静默丢调用**（`resumeWithToolPart` 一次只恢复一个 part，`filterIncompleteToolCallsForModel` 会把无输出的 part 从 prompt 剔除）；挂起状态**无 TTL**，刷新与切 Task 都会静默作废；该通道**绕过 Permission Preset**。

## Decision

### 1. 新增 Deep Module `modules/board`，port 归它自己

只经 `@/modules/board` 根 `index.ts` 对外。`BoardStorePort` / `BoardJobRuntimePort` / `BoardContentPort` **归 board module 拥有**，不建全局 `shared/` / `common/` / `ports/`。渲染层已有三个模块在做「不经 Runtime 直接调侧车 HTTP」，board 是第四个，形态照抄。

### 2. 四实体、四个 store，additive bump 到 IDB v3

`boards` / `boardWidgets` / `widgetDataJobs` / `widgetJobRuns`，全部 keyPath `'id'`，形状照 `projects`（全局实体、由 module 自己的 adapter 拥有）。**不参与 `deleteTaskCascade`**；`createdByTaskId` 是纯溯源，允许悬空。

三条模型层的结构性保证：

- **`latestData` 只在 run 成功时写入** → 「失败/超时/取消不覆盖上次成功数据」由结构保证，不靠调用方自律。
- **`approved` 与 `pendingChange` 分离，且 `approved` 快照包含代码本身**（不只是哈希）→ 消除「用户改了代码但未获批，此时该跑哪份」的歧义。没有 `approved` 则 job 不可运行。
- **`mountId` 与 `widgetId` 分离** → 保留「同一 widget 放多块板」的唯一缝隙，代价一个字段。

Board 的 bump 必须**纯增量**，排在 #124 之后单独一版。

### 3. 写入通道：方案 D——控制面走 client-side tool，内容面走侧车磁盘 + 渲染层 HTTP 拉取

| 面 | 通道 |
|---|---|
| 内容（widget HTML、作业代码） | 模型分片写入 → **侧车侧工具**落 staging（agent loop 内，**不挂起渲染层**） |
| 控制 / 提交 | **一次**极小的 client-side tool，payload 只有 id 与 hash |
| 内容回渲染层 | 渲染层经 board module 的 port 调侧车普通 HTTP 端点拉取 |

**关键观察：内容不需要经过模型往渲染层搬。** 必须分片，但**分片的落点不必是渲染层**。往返从十几次降到一次。

配套：`board_commit` 一次原子提交 widget row + job row + placement 追加（同一 IDB 事务）；幂等键 `(widgetId, contentHash, codeHash?)`；agent 的提交只做「追加 placement 到首个空位」，绝不整体覆盖 `placements`；`board_status` 必须是 client-side（**权威读必须回权威方**）；返回值只放标量与短字符串。

### 4. Board 变更不进事件流

## Considered options

- **A｜纯 client-side tool 分片**：十几次挂起-恢复，每次重发整个上下文（成本近似二次增长），每次都暴露在「挂起无 TTL、刷新即作废」的风险里；被打断的形态是「一半 widget 已落库、剩下永不补齐」。方案 D 把暴露窗口缩到最后一次提交调用，且被打断时状态是**干净的未提交**。
- **B｜侧车发 `board.*` 事件 → 渲染层投影落库**：排除的真正理由是**重放危险**。Timeline 的投影是从事件重建的；若 Board 变更是事件，每次投影重建（刷新、切回该 Task）都会**重新施加一次 Board 变更**，除非再叠一层「已施加」追踪。这等于把「可重放的叙事」和「全局状态变更」混在同一条流里。附带一条：B 还要新开一个事件族，而 #124 正在收敛协议。
- **C｜侧车持有存储（对齐 Kimi 的 daimon）**：与已锁的统一 IDB 前提冲突。**明确记录排除理由以免后人重开**——Kimi 能这么做是因为它的持久化本来就在侧车（JSON 文件树），渲染层无本地库；我们相反，渲染层已有权威 IDB（ADR-0015），反向由侧车持有会出现**两个权威**。且侧车是可选依赖，Web / 测试路径没有侧车，Board 靠侧车存储会让看板随 Runtime 可用性消失——而它是用户长期持有的资产。
- **单工具 + action 分派**（Kimi 的 `blueprint.canvas`）：不可行。`board_commit` / `board_status` 是 client-side（无 `execute`），其余是侧车侧，**一个工具不可能同时是两者**。切分被通道选择强制。

## Consequences

- 实现面从「一条通道」变成「侧车侧工具族 + 一个 client-side 提交工具 + 一条 HTTP 拉取端点」。这笔交换换掉了十几次挂起往返与二次增长的上下文成本。
- 侧车磁盘上的内容是**派生副本**，不是权威：不一致时以 IDB 为准，渲染层可重新安装。**不允许任何读路径把侧车磁盘当权威。**
- 每块 Board 的 widget 上限校验落在 board module 的 application 层（IDB 表达不了，UI 会被工具写入绕过），工具族与 UI 拖拽经同一条 command 路径。
- 首版 **agent 不能删**任何东西（删除不可逆且无撤销）。
- **后续协议升级不得照抄** `Array.from(db.objectStoreNames)` 全量删除的写法——Board 是全局用户资产，不该因协议升级丢失。现有清库分支被 `oldVersion < 2` 界定，不会碰 v3。
- 待实测：单片 2–4 KB（推算值）、staging TTL、拉取端点体积上限、数十个 widget HTML 入库后的 IDB 配额。
