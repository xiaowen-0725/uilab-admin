# ADR 0018：移除 Deterministic Fake Runtime，VoltAgent 唯一默认

- **Status:** Accepted
- **Date:** 2026-08-11
- **Scope:** Agent Workbench Renderer 的 Task Runtime 适配器层
- **Supersedes:** ADR-0012 中「并提供生产 Adapter 与测试 Fake」的「测试 Fake」表述（本 ADR 修订该句）
- **Amends:** root `AGENTS.md`、`PROJECT_STATUS.md`、workbench `AGENTS.md` 中 Phase 4 Fake Runtime path 的定位

## Context

Workbench 自 Phase 4 起采用 Dual-path：默认走 Deterministic Fake Runtime（本地事件投影，非生产），`VITE_RUNTIME_ADAPTER=voltagent` 时走本机 VoltAgent 侧车。Fake 沉淀了 12 个场景、`VirtualClock`、reasoning/tool/approval/queue/steer 全套演示，约 3060 行源码 + 测试。

`docs/plans/agent-workbench-template-roadmap.md:355` 早已将 Fake 标注为「可删 Fake Runtime」——出厂设计预期它是可移除的演示脚手架，不是产品长期组成部分。

近期评审（候选 A）发现：Fake 的维护成本与它的演示价值已不匹配。具体摩擦：

1. `task/index.ts` 因 re-export Fake/VoltAgent 双适配器而成为 49 导出的 barrel，连带 composition root 手工装配 `TaskSurfaceView`/`composerRuntime`。
2. `TaskRuntimeController` 通过 `isFakeRuntime` type-guard 偷取 Fake 的 `VirtualClock` 作为 `CommandClock`，并暴露 `flush()`/`maybeFlush()`/`getFakeRuntime()` 等 Fake-only API，使 controller 耦合 runtime 具体类型。
3. 7 个测试文件用 Fake 当 runtime 替身驱动 projection/controller 断言，Fake 的任何改动都波及这些测试。

## Decision

1. **移除 Deterministic Fake Runtime**：删除 `fake-runtime.ts`、`fake-scenario-data.ts`、`virtual-clock.ts` 及其自测。
2. **VoltAgent 唯一默认**：`resolveRuntimeAdapterMode` 默认值从 `'fake'` 翻转为 `'voltagent'`。无侧车运行时，VoltAgent 适配器 fetch 失败 → `run.failed` + `voltagent_stream_error` 错误条；app 不崩溃、不伪装有本地流。`EmptyHub` 覆盖空对话态。
3. **Controller 解耦**：删除 `isFakeRuntime`、`getFakeRuntime()`、`flush()`、`maybeFlush()`、`autoFlush`。`CommandClock` 改为构造注入，缺省系统时钟（`new Date().toISOString()`）。Controller 不再 import 任何 runtime 具体类型。
4. **Honesty copy 塌缩**：`runtimeHonestyCopy` 只剩 `voltagent` 一个 mode；`RuntimeHonestyMode` union 与 `'fake'` 分支删除。文件降为单常量。
5. **接受测试覆盖损失**：删除 7 个 Fake-based 测试（controller / controller-4e / work-surface-open-listener / project-events / project-events-4d / codex-style-stream-order / runtime-wiring）。其中 3 个（codex-style-stream-order / work-surface-open-listener / runtime-wiring）已被其他测试等价覆盖；4 个（controller / controller-4e / project-events / project-events-4d）会真实丢失部分覆盖——含持久化重入（rehydrate）、`attachGeneration` 竞态不变量、follow-up 队列排空、retryTurn/steerRun/reconcileInterruptedRun、审批卡密钥脱敏、`run.cancelled`/`run.failed`/`run.interrupted` 投影。**这些路径在未来成为产品关键时，用 fixture 或极简 TestRuntimePort 重建覆盖。**
6. **`FAKE_RUNTIME_CORE_EVENT_TYPES` 删除**：定义于 `protocol/events.ts:125`，零消费方。

## Considered options

- **保留极简 echo runtime 作离线演示**：介于全删与现状之间，但仍保留一条需维护的本地 runtime 路径，违背降复杂度初衷。Rejected。
- **新增 `offline` 默认模式**（RuntimePort 返回总是 `run.failed` 的极薄实现）：比纯报错条多一层间接。VoltAgent 适配器自身已有 graceful degradation（fetch 失败产 `run.failed`），无需再造一层。Rejected。
- **保留需重写的 4 个测试，只删安全的 3 个**：意味着 Fake 不能完全删。与目标冲突。Rejected。
- **分层处理：删安全 + 重写关键 4 个为 fixture-based**：保住覆盖，但工作量中等，且 fixture 维护成本随事件协议演进上升。当前阶段这些路径未完全产品化，**延后**。

## Consequences

### Positive

- `task/index.ts` re-export 减少，为后续拆 `task-runtime` module 扫清最大障碍（候选 A PR2）。
- Controller 不再耦合 runtime 具体类型；`CommandClock` 注入为后续适配器替换打开接缝。
- 移除 3060 行演示脚手架及其维护负担；`VirtualClock` / 12 场景 / scenario 路由全部消失。
- 诚实边界清晰：无侧车 = 明确错误，不伪装本地流。

### Costs / risks

- 开箱体验从「能看的演示」变为「需要起 VoltAgent 侧车才能用」。`EmptyHub` + 错误条指引用户起侧车。
- 持久化重入、attach 竞态、审批脱敏、cancel/failed/interrupted 投影在一段时间内无单测覆盖。如这些路径成为产品关键，需优先重建。
- `work-surface` 的 `WorkspaceDocumentRuntimeMode = 'fake' | 'voltagent'` 与 `capabilities` 的 `fake-capability-snapshot` 是**模块级独立 fake**（不依赖 `fake-runtime.ts`），本 ADR 不强制移除；它们在无 Fake runtime 时仍有「本地文件选择器」「能力面占位读模型」的独立用途，留待各自模块演进。

## Migration

1. 本 ADR（PR1）：删 Fake 源码 + 7 测试 + controller 清理 + honesty 塌缩 + 默认翻转 + 文档。
2. 后续（PR2，候选 A 收尾）：拆 `task-runtime` module——VoltAgent adapter + EventStores + mapper 迁入 `modules/task-runtime/`，`task/index.ts` 收窄。

## Map

- 候选 A（架构评审）：`<tmpdir>/architecture-review-20260811-212803.html`
- 原设计意图：`docs/plans/agent-workbench-template-roadmap.md:355`（「可删 Fake Runtime」）
