# UI Lab Application Templates

UI Lab 面向不同核心交互模型维护应用模板。应用原型共享设计基础，但不因复用组件而混淆各自的产品边界。

## Language

**Application Archetype**:
由核心交互模型定义的一等应用模板类型；同一 Archetype 下的应用具有相近的信息架构与主要工作循环。
_Avoid_: Scenario, 页面变体

**Admin Console**:
以资源查看、筛选、编辑和管理为主要工作循环的 Application Archetype。
_Avoid_: Agent Workbench, 通用前端模板

**Agent Workbench**:
以任务或会话执行、过程观察和结果处理为主要工作循环的 Application Archetype，Codex 类应用属于此类。
_Avoid_: Admin 中的 AI 页面, Agent Desktop Scenario

**Agent Workbench Template**:
供多个 Agent Workbench 应用复用的起始基线，沉淀该 Archetype 共有的布局、交互模式与质量标准。
_Avoid_: Multi-Agent Template, 单一 Codex 仿制品, Admin Scenario

**Derived Application**:
从 Application Archetype 创建并独立演进的具体应用，拥有自己的产品身份与后续变化。
_Avoid_: Template Instance, 自动同步副本

**Template Platform**:
集中维护 Foundation、Application Archetype 及其生成与验证规则的中立模板体系。
_Avoid_: Admin Template, 超级应用

**Foundation**:
被多个 Application Archetype 证明可复用、且不属于某一种核心交互模型的共同能力基线。
_Avoid_: Common, 共享杂物层

**Archetype Shell**:
表达某一 Application Archetype 持久空间结构与导航模型的组成部分，每个 Archetype 拥有自己的 Shell。
_Avoid_: UniversalShell, 通用布局配置

**Admin Shell**:
围绕页面导航与资源管理组织空间的 Admin Console Archetype Shell。
_Avoid_: Workbench Shell

**Workbench Shell**:
围绕任务、会话与执行上下文组织空间的 Agent Workbench Archetype Shell。
_Avoid_: Admin Shell, AI 页面布局

**Desktop-first Workbench**:
以键盘、鼠标和宽屏多面板工作流为首要体验，并为窄屏提供可用降级的 Agent Workbench。
_Avoid_: Mobile-first Workbench, Desktop Host

**Desktop Host**:
为 Desktop-first Workbench 提供操作系统能力的可选原生宿主，不定义 Workbench Shell 的交互模型。
_Avoid_: Workbench Shell, Desktop UI

**Navigator**:
用于定位和选择项目、任务与会话的 Workbench Shell 区域。
_Avoid_: Sidebar, Inspector

**Workspace**:
承载当前任务或会话执行、过程观察与结果处理的 Workbench Shell 主区域，由必需的 Task Surface 与可选的 Work Surface Host 组成。
_Avoid_: Dashboard, 页面内容区

**Task Surface**:
承载对话、执行轨迹、工具调用和输入控制的 Workspace 必需区域，是单个任务生命周期的持续主轴。
_Avoid_: Chat Page, Main Content

**Project**:
为 Task 提供资源、环境与权限范围的持久工作集合。
_Avoid_: Workspace, Repository

**Task**:
可持久化、可在 Navigator 中选择的工作单元，包含多个 Turn、Run 与相关 Artifact；外部 Runtime 的 Thread 映射到 Task。
_Avoid_: Thread, Chat, Workbench Session

**Turn**:
Task 中一次用户输入及其对应处理周期，可因重试或恢复产生多个 Run。
_Avoid_: Message, Run

**Run**:
Agent Runtime 对一个 Turn 的单次执行尝试，由有序的 Agent Runtime Event 描述；子 Agent 默认表现为关联父 Run 的子 Run。
_Avoid_: Turn, Task

**Artifact**:
由 Task 或具体 Run 产生、可在 Work Surface 中查看或操作的持久结果。
_Avoid_: Tool Surface, Runtime Event

**Workbench Session**:
工作台壳层会话：记住当前选中的 Project 与 Task（Task 可为空）、以及每 Task 的布局与 Work Surface 恢复；不拥有 Project/Task 目录，也不拥有 Agent Runtime。
_Avoid_: Global Workspace State, Chat State, Project catalog, Task directory

**Agent Runtime**:
执行 Agent、处理工具调用并产生流式运行事件的外部运行能力，通过 Adapter 接入 Agent Workbench。
_Avoid_: Workbench Shell, Frontend Agent Engine

**Runtime Command**:
Workbench 发给 Agent Runtime 的意图请求，例如发送输入、取消运行或批准工具调用；Command 不直接代表执行结果。
_Avoid_: Runtime Event, UI Action

**Agent Runtime Event**:
Agent Runtime 产生的不可变、只追加事实，用于描述执行过程与结果，并驱动 Workbench 的 Task Projection。
_Avoid_: Runtime Command, Component State

**Task Projection**:
由 Snapshot 与后续 Agent Runtime Event 计算出的当前任务可读状态，供 Task Surface 与其他 Module 消费。
_Avoid_: Event Store, Local Component State

**Work Surface Host**:
按需承载 Markdown、HTML、Browser、Editor、Review、Terminal 等可组合工作面的 Workspace 区域。
_Avoid_: Inspector, Artifact Sidebar, 固定右栏

**Document Surface**:
通过按格式注册的 Renderer 阅读或预览文件型内容的 Work Surface 家族，覆盖文本、代码、Markdown、DOCX、PDF 与只读 Spreadsheet 等内容。
_Avoid_: Universal Document Component, Browser Surface

**Spreadsheet Surface**:
提供单元格编辑、公式、筛选和 Sheet 管理等深度表格交互的专业 Work Surface；只读表格预览仍属于 Document Surface。
_Avoid_: Spreadsheet Preview, Data Table

**Task Context Panel**:
呈现当前任务关联的环境、变更、来源与子智能体等辅助上下文；空间充足时占据保留位置，空间受限时覆盖 Task Surface。
_Avoid_: Context Overlay, Inspector, Context Sidebar
