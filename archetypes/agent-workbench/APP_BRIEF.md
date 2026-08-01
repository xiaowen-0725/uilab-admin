# APP_BRIEF — Agent Workbench

## 产品一句话

桌面优先的 Agent 工作台：以 Task 为中心编排对话/执行流，并按需展开工作面查看产物。

## Phase 3 范围

交付**可运行、可测试**的静态 Shell，证明空间模型与 Task 作用域布局状态，**不接**真实 Agent Runtime。

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
- 依赖 `@uilab/foundation` workspace 公开子路径
- 中文 UI 文案
