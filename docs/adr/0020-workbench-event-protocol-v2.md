# ADR 0020：Workbench 事件协议 v2（Task > Turn > Step，砍 Run）

- **Status:** Accepted
- **Date:** 2026-08-15
- **Scope:** Agent Workbench 事件信封、投影读模型、VoltAgent Mapper/Adapter、本地 IndexedDB
- **Supersedes:** [ADR-0014](0014-use-project-task-turn-run-lifecycle.md) 中的 Run 层（`runId` / `parentRunId` / `run.*` 生命周期）
- **Amends:** 根 `CONTEXT.md` 术语；Workbench `AGENTS.md` 的 Question Request 路径与 `turnStatus` 规则

## Context

v1 协议是 `Task > Turn > Run`。本机 VoltAgent 路径上 Run 与 Turn 一对一，`parentRunId` 无人使用。Codex 已把旧 `task_*` 并入 `turn_*`；继续维持双层增加理解与维护成本。

同时存在三类协议债务：

1. **词表缺口**：没有权威的轮次终结（靠 `run.completed` 兜底），没有用量与任务归档事件。
2. **命名不一致**：`output.delta`、`tool.called`、`command.output`、`run.input_*` 各族风格不齐。
3. **死事件**：`run.queued` / `run.interrupted` / `run.reconciled` / `source.grouped` / `message.accepted` / `reasoning.section_completed` 无人发射或消费。

## Decision

发布事件协议 v2。概念模型收敛为 **Task > Turn > Step > 事件**。投影产物 TimelineItem 对应 Codex ThreadItem。全事件族统一 `*.started / *.delta|progress / *.completed`。砍掉 Run 层。存量本地数据清库，不做 v1 别名或迁移。

### 对齐矩阵

| Workbench v2 | Codex | Claude Agent SDK |
|---|---|---|
| Task（active / archived） | Thread | Session |
| Turn | Turn | 一次用户消息到 `ResultMessage` |
| TimelineItem | ThreadItem | 流式 message / tool 块 |
| `turn.started` / `completed` / `failed` / `cancelled` | `turn.started` / `completed` / `failed` | `message_start` … `ResultMessage` |
| `usage` on `turn.completed` + `usage.updated` | `TokenCount` | `ResultMessage.usage` |
| 无 Run | 旧 `task_*` → `turn_*` | 无 Run |

### 信封

- `schemaVersion = 2`
- `turnId` 必填
- 删除 `runId`、`parentRunId`

### 词表（相对 v1）

- 新增：`task.archived`、`turn.completed` / `turn.failed` / `turn.cancelled`、`usage.updated`
- 改名：`output.*` → `message.*`；`tool.called` → `tool.started`；`command.output` → `command.delta`；`run.input_*` → `input.*`；取消链路 → `turn.cancel_requested` / `turn.cancelled`
- 删除：全部 `run.*` 生命周期，以及六个死事件
- `turn.completed` payload：`{ outcome, usage? }`

### 投影

- `run-terminal` → `turn-terminal`
- `runStatus` → `turnStatus`
- 删除 `activeRunId`
- 工作锚点、工具聚合、交付物聚合行为保持不变
- 未声明事件名投影为 `unsupported-event`（无 v1 别名）

### 清库

IndexedDB `uilab-agent-workbench` 版本 bump 到 2。`oldVersion < 2` 时删除全部 object store 再重建。不为 dev 阶段测试数据支付迁移成本。

### 用量展示

第一版只在轮次终结 chrome 的 hover / 详情展示，不做常驻状态栏。

## Considered options

- **保留 Run 层并做 v1 别名**：兼容旧库，但继续支付双层与死事件成本。Rejected。
- **Codex 式通用 `item.started/updated/completed`**：统一生命周期，但丢掉各族动词语义。明确选择每族动词式。Rejected。
- **Task 改名为 Thread**：对齐 Codex 标识，破坏现有模块与目录合同。仅文档映射。Rejected。

## Consequences

### Positive

- 一轮对话有权威完成 / 失败 / 取消边界；用量与归档有协议位。
- 消费方可按统一三段式编写；信封只有一种归属（`turnId`）。
- 协议只声明真实能力。

### Costs / risks

- 本地 v1 事件与快照在升级时被清空；刷新后需重新开对话。
- 命令类型名（`cancelRun` / `provideRunInput` / `steerRun`）仍带 Run 字样，以免扩大命令面改动；语义已指向 Turn。
- 远程 Runtime 的断连 / gap / snapshot 恢复仍只是协议声明，未实现。

## Migration

1. Mapper / Adapter / scripted test port 直接发 v2。
2. 投影与 UI `data-*` 跟进；既有三条测试接缝改事件名后变绿。
3. IDB version 2 清库。
4. 文档：本 ADR + `CONTEXT.md` 跨产品术语表。
