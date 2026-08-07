# Project catalog module and unified IndexedDB

Agent Workbench 的 **Project/Task 导航目录** 由独立 `modules/project` 拥有（Task 仅持 `projectId` + 运行/事件），**不**再由 `workbench-session` 持有 projects/tasks 数组。浏览器路径下 **目录与 EventStore 共用单一 IndexedDB**（`uilab-agent-workbench`：projects/tasks/events/snapshots/commands/session/metadata），Composition 打开一柄并注入 `ProjectCatalogPort` 与 `EventStorePort`；否决 session 充当目录权威、否决目录与事件拆成两个 DB（双 open/双迁移）。桌面 Host 可换 SQLite 等 Adapter，逻辑 schema 与 Port 语义保持，不绑定 IDB API 本身。

决策溯源：wayfinder map `.scratch/real-task-lifecycle/`（tickets 01–03）。
