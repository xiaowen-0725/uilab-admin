# APP_BRIEF — Agent Workbench

## 产品一句话

桌面优先的 Agent 工作台：以 Task 为中心编排对话/执行流，并按需展开工作面查看产物。

## 当前（2026-08-14）

已超出 Phase 3 静态 Shell：Project/Task 目录、本机 VoltAgent 侧车、Permission Preset、只读 Plan、Document/Browser 打开文件、Spec-α Electron。诚实边界与验收圈见 [`docs/plans/workbench-acceptance-round-2026-08-14.md`](../../docs/plans/workbench-acceptance-round-2026-08-14.md)。下面 Phase 3 段落保留为历史范围，不再代表当前 shipped。

## Phase 3 范围（历史）

当时交付**可运行、可测试**的静态 Shell，证明空间模型与 Task 作用域布局状态，**不接**真实 Agent Runtime。

### 用户可感知

- 一个演示项目、至少三个 Task
- 静态执行流（用户 / 助手 / 已完成工具活动）并标明 fixture
- Composer 可本地输入；提交不调用 Runtime
- Context Panel：环境 / 变更 / 来源 / 子 Agent
- Work Surface 占位 tabs（如「布局规格.md」「浏览器预览」）

### 明确不做

- Runtime、SSE/WS、工具批准真流程
- Document / Browser / Review 真实 Surface
- 持久化、Git、文件系统、桌面宿主

## 技术约束

- 包名：`@uilab/agent-workbench`
- Composition Root 唯一装配；Module 根 `index.ts` 为唯一跨界 Interface
- UI 栈与平台统一：官方 shadcn Base UI（`base-nova`）+ `@/components/ui/*`；Foundation Button/Input/tokens 经兼容 re-export
- 中文 UI 文案
