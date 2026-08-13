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
为 Task 提供资源、环境与权限范围的持久工作集合；本地资源边界为单个根目录。根目录来源：(1)「打开本地文件夹」绑定任意目录；(2) 在 Projects Home 下「新建」；(3) 用户未选择 Project 时由新 Task 自动创建（目录落在 Projects Home 下，并成为可选 Project）。已选 Project 时，多个 Task 共用该根目录，不再为每个 Task 新建根。
_Avoid_: Workspace（指文件夹或 Shell 主区域时）, Repository, Working Tree（作风领域主名）, Projects Home

**Projects Home**:
Desktop Host（或等价本机配置）管理的应用级默认父目录，用于容纳「新建」或「未选择时自动创建」的 Project 根目录；本身不是 Project，不出现在可选 Project 列表中。路径可配置，Product Profile 提供初始默认值。
_Avoid_: Workspace, Project, cwd, 默认工作空间（作风领域主名）

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

**Capability Surface**:
用户在对话路径可浏览与选用的能力集合，由 Connector、Skill 与 Expert 及其状态摘要构成。
_Avoid_: Plugin Marketplace, Extension Page, Settings-only catalog

**Plugin**:
侧车（或等价 Runtime 宿主）中可版本化的**能力包（packaging）**与发现单元，可**同时**贡献 MCP、领域 CLI、Skills 与授权声明等；对齐 ChatGPT/Cursor/Claude/Copilot 的 Plugin 包模型。不是 MCP 协议本身，也不是用户口语里的「连接器」。
_Avoid_: Connector, MCP Server, Channel Plugin, Extension（Kun 式可执行 UI 包）

**Connector**:
面向用户的**一等**外部服务接入面（如 GitHub、飞书）：授权状态 + 子能力 + 工具范围。平台同时支持 **MCP** 与**领域 CLI**，但每个 Connector 按 Provider 原生契约选择一种或多种通道，**不要求单个 Connector 默认 Hybrid**；当前内置基准是 GitHub → 官方 MCP、飞书 → 官方 CLI。由 Plugin contribution 投影而来，本身不是第二套插件内核。用户路径对齐主流：目录 → 去登录/授权 → Connected → 会话/Task 选用。
_Avoid_: Plugin, IM Channel / messaging adapter, Expert, Skill, Work Surface, Timeline 工具行, 按 MCP/CLI 拆成两个用户连接器

**Skill**:
与主流 Agent 宿主一致的可加载技能包（通常以 `SKILL.md` 为清单的目录/包），向 Agent 提供可复用工作流与操作说明；不是 MCP 工具枚举，也不是 Expert。
_Avoid_: Tool, Connector, Expert, Prompt snippet, Slash command only

**Expert**:
可切换的专家配置包：角色说明（persona）+ 默认 Skills + 建议的 Connector/工具范围；改变后续 Turn 的能力偏好，不必然产生子 Agent 或子 Run。
_Avoid_: Persona（作主名）, Subagent, Supervisor, multi-agent routing, Plugin

**Expert Profile**:
Expert 的可序列化定义与装载形态（侧车或配置根上的具体 profile）；产品对外主名仍是 Expert。
_Avoid_: Agent Profile 自动路由表, Subagent Profile

**Enabled**:
某 Plugin 或其贡献已被装配进当前 Runtime 可用集合；启用不等于用户已完成外部服务登录。
_Avoid_: Connected, Installed（作唯一用户词）, Authorized

**Connected**:
某 Connector 所需身份材料可用（授权状态为已连接）；与 Enabled 分立，可出现「已启用但未连接」。
_Avoid_: Enabled, Installed, Logged in（作全局宿主登录）

**Permission Preset**:
Task 级默认权限档位，决定渲染端如何自动应答 Runtime 审批请求（`approval.requested`）；两档：`auto-approve`「帮我批准」（文件写白名单自动批准，命令与未知工具弹 Dock）与 `full-access`「完全访问」（一律自动批准）。侧车门闸保持 fail-closed，预设只自动化用户同意动作。
_Avoid_: Permission Mode（作实现词）, 权限策略引擎, Role
