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
