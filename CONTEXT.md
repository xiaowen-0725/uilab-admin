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
可持久化、可在 Navigator 中选择的工作单元，包含多个 Turn 与相关 Artifact。协议与代码标识保持 Task；跨产品语义 ≡ Codex Thread / Claude Session。
_Avoid_: Thread, Chat, Workbench Session（作代码标识）

**Turn**:
Task 中一次用户提交到 Agent 完成全部动作的周期。协议与代码标识保持 Turn；跨产品语义 ≡ Codex Turn。
_Avoid_: Message, Run

**Run**:
不再作为协议层。v1 中「一次执行尝试」已并入 Turn；信封不再有 `runId` / `parentRunId`。历史文档若仍写 Run，按 Turn 理解。
_Avoid_: 新代码、新事件、新读模型字段

**TimelineItem**:
投影到时间线的一条可读条目，由一轮内的事件折叠而成。跨产品语义 ≡ Codex ThreadItem。
_Avoid_: Runtime Event（原始信封）, Chat Message

**Artifact**:
由 Task 或具体 Turn 产生、可在 Work Surface 中查看或操作的持久结果。
_Avoid_: Tool Surface, Runtime Event

### 跨产品术语映射

| Workbench | Codex | Claude Agent SDK |
|---|---|---|
| Task | Thread | Session |
| Turn | Turn | 一次用户消息到 `ResultMessage` 的周期 |
| TimelineItem | ThreadItem | 流式 `message` / tool 块（无独立 Item 层） |
| `turn.started` / `turn.completed` / `turn.failed` | `turn.started` / `turn.completed` / `turn.failed` | `message_start` … `ResultMessage` |
| `usage`（`turn.completed` / `usage.updated`） | `TokenCount` | `ResultMessage.usage` |
| （无 Run 层） | 旧 `task_*` 已改名 `turn_*` | 无 Run |

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

**Plan**:
Agent 在执行中通过工具声明并维护的结构化步骤列表，是任务当前意图的真源；UI 只读投影其最新快照，进度（已完成/总数）是 Plan 的派生属性而非独立概念。
_Avoid_: Todo, 待办, 任务列表, Progress（作主名）

**Plan Step**:
Plan 的条目，状态为待处理、进行中或已完成；「步骤」一词专属 Plan Step，不用于 Turn 过程活动计数等其他含义。
_Avoid_: 任务, 待办项, Task

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
呈现当前任务关联的环境、变更、来源、计划与子智能体等辅助上下文的只读状态快照（面板看「现在」，Timeline 看「过程」，Work Surface Host 看「产物」）；空间充足时占据保留位置，空间受限时覆盖 Task Surface。
_Avoid_: Context Overlay, Inspector, Context Sidebar, 任务摘要面板

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
可切换的专家配置包：角色说明（persona）+ 默认 Skills + 建议的 Connector/工具范围；改变后续 Turn 的能力偏好，不必然产生子 Agent。
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

**Board**:
用户长期持有、按主题聚合多个 Board Widget 的网格空间（用户可见中文文案「看板」）；只拥有放置与布局，不拥有 widget 的实现与数据。应用级全局实体，不隶属于某个 Project 或 Task，其存在与浏览不依赖 Agent Runtime 可用性。
_Avoid_: Dashboard, Canvas, Workspace, Work Surface, Task Context Panel

**Board Widget**:
Board 上一块可独立渲染的单元（用户可见中文文案「小组件」），实现形态为 Agent 生成的单文件 HTML/JS，运行在不透明源沙箱内且无网络、无存储、无导航能力；外部数据只能由 Widget Data Job 经宿主桥投入。
_Avoid_: Card, Panel, Component, Work Surface, Plugin, Artifact

**Widget Data Source**:
Board Widget 数据供给的一等抽象，kind 为 `preset`（预填数据）/ `job`（已批准的零依赖取数代码）/ `query`（插件声明的结构化查询，侧车以 Product Identity 加签执行）；触发策略（trigger）挂在 Data Source 上，一个 widget 只绑一个来源。模型与 IDB v4 快照分区已落地（#143）；求值器四道闸与三类失败语义已落地（#145）；query 通道与调度见后续票。
_Avoid_: Data Feed, Connector, 数据集, Widget Data Job（作上位词）

**Widget Data Job**:
为 Board Widget 取数或计算的可重复执行作业（用户可见中文文案「取数作业」），即 kind 为 `job` 的 Widget Data Source 的实现载体：一段被批准过的零依赖取数代码。代码写入时一次授权、之后运行静默，执行不经 Agent Runtime 也不需要 Task；调度与触发不属于 Job，属于 Widget Data Source。
_Avoid_: Automation, Cron Task, 定时任务, Runtime Command, Tool Call, Widget Data Source（作同义词）

**Product Identity**:
垂直派生应用的应用级登录身份：决定租户、可访问的 Authorized Resource 与权限，是产品前提而非可选接入。由 `modules/identity` 拥有，Board 经窄端口消费；模板自带「无身份」默认实现。与 Connector 分层：Connector 可缺，Product Identity 缺失则垂直应用无意义。设计定稿见 ADR-0024。
_Avoid_: Connector, Account Binding, 登录态（作主名）, Capability

**Authorized Resource**:
Product Identity 授权快照中的类型化资源条目（`type` / `id` / `name` / `permissions`），`type` 由垂直插件声明（如 parking-lot、warehouse）；求值器按它做参数级校验，端口与模板层不出现领域词。
_Avoid_: 车场（作模板层词）, Scope, Permission Preset

**预置看板 (Preset Board)**:
插件贡献的看板模板（placements + widget + query 绑定），安装后走真求值取真数据；复用 `presetId` / `presetVersion` 安装机制。与示例板不同：示例板是模板自带的 `preset` kind 假数据教学样本。
_Avoid_: 示例板, Example Board, Dashboard Template
