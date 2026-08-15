# Use the Project, Task, Turn, Run lifecycle

- **Status:** Superseded in part by [ADR-0020](0020-workbench-event-protocol-v2.md) (Run layer removed from the event protocol; Task / Turn remain)
- **Date:** 2026-08

Agent Workbench 的核心生命周期曾统一为 `Project → Task → Turn → Run → Agent Runtime Event`：Project 提供资源与环境范围，Task 是 Navigator 中的持久工作单元，Turn 表达一次用户意图及处理周期，Run 表达一次具体执行尝试，重试与恢复创建新的 Run，Artifact 关联 Task 或产生它的 Run。外部 Runtime 的 Thread 只通过 Adapter 映射为 Task；子 Agent 默认建模为带 `parentRunId` 与 `agentId` 的子 Run，只有被提升为独立工作单元时才创建新 Task。

协议 v2（ADR-0020）删除 Run 层：执行尝试并入 Turn，信封不再携带 `runId` / `parentRunId`。
