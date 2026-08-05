# Agent Workbench Module Layout

生产级 Agent Workbench 采用 Composition Root、Deep Modules、Pluggable Surfaces 与 Ports/Adapters 的结构。目录表达依赖方向，不按页面或技术类型平铺。

```text
archetypes/agent-workbench/
├── package.json
├── src/
│   ├── app/
│   │   ├── bootstrap/
│   │   ├── providers/
│   │   ├── router/
│   │   └── composition/
│   ├── shell/
│   │   ├── workbench-shell/
│   │   ├── navigator/
│   │   ├── workspace/
│   │   └── responsive-layout/
│   ├── modules/
│   │   ├── workbench-session/
│   │   │   ├── index.ts
│   │   │   ├── model/
│   │   │   ├── application/
│   │   │   └── persistence/
│   │   ├── task/
│   │   │   ├── index.ts
│   │   │   ├── model/
│   │   │   ├── application/
│   │   │   ├── protocol/
│   │   │   │   ├── commands.ts
│   │   │   │   └── events.ts
│   │   │   ├── runtime/
│   │   │   ├── projection/
│   │   │   ├── ports/
│   │   │   └── ui/
│   │   │       ├── task-surface/
│   │   │       ├── composer/
│   │   │       ├── execution-stream/
│   │   │       └── context-panel/
│   │   ├── work-surface/
│   │   │   ├── index.ts
│   │   │   ├── registry/
│   │   │   ├── lifecycle/
│   │   │   ├── layout/
│   │   │   └── ui/work-surface-host/
│   │   └── project/
│   │       ├── index.ts
│   │       ├── model/
│   │       ├── ports/
│   │       └── ui/resource-explorer/
│   ├── surfaces/
│   │   ├── document/
│   │   │   ├── index.ts
│   │   │   ├── renderers/
│   │   │   │   ├── text/
│   │   │   │   ├── code/
│   │   │   │   ├── markdown/
│   │   │   │   ├── docx/
│   │   │   │   ├── pdf/
│   │   │   │   └── spreadsheet-preview/
│   │   │   └── source-mode/
│   │   ├── browser/
│   │   │   ├── index.ts
│   │   │   ├── ports/
│   │   │   └── ui/
│   │   └── review/
│   │       ├── index.ts
│   │       ├── model/
│   │       ├── ports/
│   │       └── ui/
│   ├── adapters/
│   │   ├── agent-runtime-http/
│   │   ├── agent-runtime-stream/
│   │   ├── project-api/
│   │   ├── file-system-web/
│   │   ├── git-api/
│   │   ├── browser-host-web/
│   │   ├── persistence-indexeddb/
│   │   └── telemetry/
│   ├── patterns/
│   ├── routes/
│   ├── config/
│   ├── styles/
│   └── test-support/
├── tests/
│   ├── contract/
│   ├── integration/
│   └── e2e/
├── docs/ai/
└── scaffolds/
```

## Dependency rules

- `app/composition` 是唯一 Composition Root，负责装配 Shell、注册 Surface、选择 Adapter 和应用配置。
- 每个 Module 只通过根部 `index.ts` 暴露 Interface；其他目录不能跨 Module 引用内部 Implementation。
- Work Surface Host 只依赖 Surface Definition Interface；Document、Browser、Review 等实现由 Composition Root 注册。
- Port 位于使用它的 Module 内，Adapter 实现 Port；不建立全局 `ports` 杂物目录。
- Task Module 通过 Runtime Command 发出意图，通过 Agent Runtime Event 与 Snapshot 生成 Task Projection；UI 不直接拼接流式状态。
- Task Context Panel 位于 Task Module，Resource Explorer 位于 Project Module，并作为相关 Surface 的辅助面板。
- 单元测试与 Module 共置；Adapter 合同、跨 Module 集成和 Playwright 用户流程测试位于顶层 `tests`。
- 跨 Archetype UI primitive 从 `packages/foundation` 导入；Archetype 内不建立模糊的 `components/common` 或 `shared/utils`。

## Phase 4 seam refinement (4B+)

Umbrella design `docs/superpowers/specs/2026-08-02-codex-task-pane-runtime-design.md` 对 Task Module 作局部 refinement（不改 Shell geometry 所有权）：

| 层 | 所有者 | 说明 |
|---|---|---|
| Shell geometry / motion / Work drawer | `shell/*` | Preserve Phase 3/3A/3B contracts |
| Task Pane product UI | `modules/task/ui/*` | 4C+ 重建 Timeline/header；4B 可不替换 capture UI |
| Domain + commands + events | `modules/task/model` + `protocol` | Task/Turn/Run；无 Project 实体 |
| RuntimePort / Fake / virtual clock | `modules/task/ports` + `runtime` | 4B；生产 Adapter 后续 |
| EventStorePort | `modules/task/ports` | 4B 类型 + **4E MemoryEventStore**（进程内内存）；**IndexedDB 仍 planned**，非 4E 已交付 |
| Projection / TaskReadModel | `modules/task/projection` | 4C–4D 深化 |
| Project aggregate | `modules/project` | 独立 Module；Task 只持 `projectId` |
| workbench-session | layout + selected task only | 不拥有 Runtime 或 Project |

**诚实边界：** 4B Fake Runtime ≠ 生产 Runtime。默认 UI 在 4C 之前可继续使用 capture-driven stream。

## Lifecycle model

```text
Project
└── Task
    ├── Turn
    │   └── Run
    │       └── Agent Runtime Event
    └── Artifact

Workbench Session = 当前 Task 的 Projection、活动 Work Surface 与布局状态
```

外部 Runtime 的 Thread 由 Adapter 映射为 Task。子 Agent 默认是带 `parentRunId` 与 `agentId` 的子 Run；独立导航和独立生命周期出现后，才提升为 Task。
