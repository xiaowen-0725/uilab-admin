# Agent Todo/计划机制业界参照调研（Codex CLI / Claude Code / Cursor）

> 对应 issue #93。目标：为 agent-workbench 的「Agent 工具真源 Todo/计划机制」（侧车 agent 通过工具维护计划、UI 只读投影到任务摘要面板 + Timeline 内联）提供业界一手参照。
>
> 调研日期：2026-08-13。来源以官方开源源码与官方文档为主；逆向整理资料单独标注可信度。

## 1. Codex CLI：`update_plan` 工具（openai/codex，一手源码）

### 1.1 工具 schema

真源为 Rust 源码（两处）：

- 协议类型：[`codex-rs/protocol/src/plan_tool.rs`](https://github.com/openai/codex/blob/65cc12d7/codex-rs/protocol/src/plan_tool.rs)
- 工具定义与 handler：[`codex-rs/core/src/tools/handlers/plan.rs`](https://github.com/openai/codex/blob/99f47d6e9a3546c14c43af99c7a58fa6bd130548/codex-rs/core/src/tools/handlers/plan.rs)

```rust
// codex-rs/protocol/src/plan_tool.rs
pub enum StepStatus { Pending, InProgress, Completed }   // serde snake_case

pub struct PlanItemArg { pub step: String, pub status: StepStatus }

pub struct UpdatePlanArgs {
    pub explanation: Option<String>,   // 可选：改计划时说明理由
    pub plan: Vec<PlanItemArg>,        // 必填：完整步骤列表
}
```

要点：

- **参数只有两个**：必填 `plan`（`{step, status}` 数组）+ 可选 `explanation`。`additionalProperties: false`。
- **状态枚举仅三个**：`pending` / `in_progress` / `completed`。没有 blocked/cancelled——受阻时的做法是改写步骤文本或在 explanation 里说明。
- **整表替换**：每次调用传入完整计划快照，没有增量 API、没有 item id。
- **单一 in_progress 约束写进工具描述**：description 原文为 "Updates the task plan. Provide an optional explanation and a list of plan items, each with a step and status. At most one step can be in_progress at a time."
- **服务端 handler 是「无操作」的**：`handle_update_plan` 只解析参数、把 `EventMsg::PlanUpdate(args)` 发给客户端事件流、返回 `"Plan updated"`。源码注释明确说明："This function doesn't do anything useful. However, it gives the model a structured way to record its plan that clients can read and render." —— **工具的价值在输入（供客户端渲染），不在输出**。这正是「工具真源 + UI 只读投影」模式的官方实现。
- Plan Mode（只读规划模式）下禁止调用该工具，报错 "update_plan is a TODO/checklist tool and is not allowed in Plan mode"（见 [`plan.rs` 后续版本](https://github.com/openai/codex/blob/53b50197/codex-rs/core/src/tools/handlers/plan.rs)）——Codex 明确区分「todo/checklist 工具」与「Plan mode 产出的方案文档」两条链路。

### 1.2 Prompt 引导（何时用、粒度）

真源：[`codex-rs/core/prompt.md`](https://github.com/openai/codex/blob/main/codex-rs/core/prompt.md)（及 `gpt_5_2_prompt.md`、`protocol/src/prompts/base_instructions/default.md`，内容一致）。关键引导：

- **定位**："tracks steps and progress and renders them to the user……helps demonstrate that you've understood the task"。
- **使用时机**（Use a plan when）：任务非平凡且需要长时程多个动作；存在阶段/依赖顺序；有歧义需要先列高层目标；希望有中间检查点；用户一条 prompt 里要求多件事；用户显式要求用 plan 工具（"aka TODOs"）；工作中产生了新步骤且打算在交还前完成。
- **粒度**：新建计划时用「一句话步骤，每条不超过 5-7 个词」。
- **状态机操作**："There should always be exactly one `in_progress` step until everything is done"；可以在一次调用里同时标记多项完成；全部完成后必须再调一次把所有步骤置为 `completed`；中途改计划时要带 `explanation` 说明理由。
- 官方 [Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide) 补充：最简单的约 25% 任务跳过计划工具；**禁止单步计划**；结束前必须清算（reconcile）所有计划项，不得以 in_progress/pending 收尾；更新计划时不要另发消息重复计划内容。

### 1.3 TUI 呈现

真源：[`codex-rs/tui/src/history_cell.rs`](https://github.com/openai/codex/blob/178c3d30/codex-rs/tui/src/history_cell.rs) 的 `PlanUpdateCell`，以及 [`codex-rs/tui/src/chatwidget/turn_runtime.rs`](https://github.com/openai/codex/blob/31519549/codex-rs/tui/src/chatwidget/turn_runtime.rs) 的 `on_plan_update`。

- **内联历史单元**：每次 `PlanUpdate` 事件在会话 transcript 中追加一个 "• Updated Plan" 单元（不是常驻侧栏面板），explanation 以暗色斜体注释呈现。
- **视觉惯例**（`render_step`）：
  - `completed` → `✔ ` 前缀 + **删除线** + 暗色（`crossed_out().dim()`）
  - `in_progress` → `□ ` 前缀 + **青色加粗**（`cyan().bold()`）
  - `pending` → `□ ` 前缀 + 暗色
- **进度聚合到状态面**：`on_plan_update` 计算 `completed/total` 存入 `last_plan_progress`，刷新底部状态条/终端标题等 status surfaces（PR [#18935](https://github.com/openai/codex/pull/18935) 让该进度跨 turn 保持可见）。即：**内联卡片记录历史，聚合进度常驻状态条**。

## 2. Claude Code：`TodoWrite` 工具

### 2.1 Schema 与状态枚举（官方文档）

官方真源：

- [Claude Code tools 文档](https://code.claude.com/docs/en/tools)：`TodoWrite` 条目——"Manages the session task checklist. Disabled by default as of v2.1.142 in favor of `TaskCreate`, `TaskGet`, `TaskList`, and `TaskUpdate`."
- [Agent SDK todo-tracking 文档](https://code.claude.com/docs/en/agent-sdk/todo-tracking)：item 形状为 `{ content, status, activeForm }`；`status` 为 `"pending" | "in_progress" | "completed"`。

字段语义：

- `content`：祈使式描述，给模型看/完成或待办时展示（如 "Run tests"）。
- `activeForm`：现在进行时描述，条目处于 in_progress 时给用户展示（如 "Running tests"）——**同一条目为「模型视角」和「用户进行中视角」准备两份文案**，这是 TodoWrite 独有的设计。
- `status`：三态，无 blocked/partial；官方引导是受阻时保持 in_progress 并新建一条描述阻塞点的任务。

**更新方式**：单次 `TodoWrite` 调用整表替换（"One tool call……replacing the whole list on every call"，官方 SDK 文档原话）。

**演进注**：2.1.142 起默认改用 Task 工具族（`TaskCreate/TaskUpdate/TaskList/TaskGet`），改为**按 id 增量更新**（`TaskUpdate` 接受 `taskId + status/subject/...`，`status: "deleted"` 表示删除），并支持依赖（`addBlocks/addBlockedBy`）与 owner。这说明 Anthropic 自己也从「整表替换」演进到了「增量 + 依赖图」，但会话级轻量清单场景下 TodoWrite 语义仍是最常被参照的形态。

### 2.2 System prompt 引导（逆向整理，可信度标注）

来源：[Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-todowrite.md)（从官方发行版 JS 中提取的工具描述，多个独立提取版本内容一致，可信度较高；非 Anthropic 官方发布）。关键规则：

- **何时用**：≥3 个不同步骤的复杂任务；需要规划的非平凡任务；用户显式要求 todo list；用户给了多任务列表；收到新指令时立即入表；开始做某任务前先标 in_progress；完成后立即标 completed 并补充新发现的后续任务。
- **何时不用**：单一直接任务;琐碎任务;<3 个简单步骤可完成;纯对话/信息类请求。
- **状态机硬约束**："Exactly ONE task must be in_progress at any time (not less, not more)"；实时更新、完成即标完成（不要攒到最后批量标）；不再相关的任务直接从列表移除。
- **完成判定**：仅在完全完成时标 completed；测试失败、实现不完整、有未解决错误时不得标 completed；受阻时保持 in_progress 并新建描述阻塞的任务。
- **文案要求**：每条必须同时提供 content（祈使式）与 activeForm（进行时）。

### 2.3 终端呈现

官方未发布渲染源码（Claude Code CLI 闭源），以下为文档与普遍观察（可信度中）：todo 列表在终端会话内以复选清单形式内联展示，pending 为空心项、completed 为勾选项，in_progress 条目以 `activeForm` 文案 + spinner 呈现「正在做什么」；列表随每次 TodoWrite 调用原地刷新。`content`/`activeForm` 双文案正是为该呈现服务（[Agent SDK 文档](https://code.claude.com/docs/en/agent-sdk/todo-tracking) 印证监听方式：宿主程序通过拦截 `tool_use` block 自行投影渲染，与「工具真源、UI 只读投影」同构）。

## 3. Cursor：Agent To-dos 与消息队列（官方文档）

- **Agent To-dos**（[Cursor 1.2 changelog](https://cursor.com/changelog/1-2)，官方）："Agents now plan ahead with structured to-do lists……The agent breaks down longer tasks with dependencies, visible to you in chat and streamed into Slack when relevant. It can update this list as work progresses."——由 agent **自动生成**结构化 to-do 列表（支持依赖关系），在 chat 中作为可展开的面板展示并随进度实时更新，可同步到 Slack。
- **Plan Mode**（[官方文档](https://cursor.com/docs/agent/planning)、[官方博客](https://cursor.com/blog/plan-mode)）：与 to-dos 互补的前置规划链路——Agent 先调研代码库、提问澄清，产出**可编辑的 Markdown 计划**（含文件路径、代码引用、to-do 列表），用户可直接增删 to-do 后再 Build。计划默认存在用户主目录，可保存到 workspace。即 Cursor 把「方案文档（Plan Mode 产物）」与「执行期 checklist（Agent To-dos）」分成两个产品面。
- **消息队列**（[Agent overview 文档](https://cursor.com/docs/agent/overview)）：Agent 工作时用户可继续输入，Enter 入队、队列消息按序显示在当前任务下方、可拖拽排序，Agent 完成当前任务后依次消费；Cmd+Enter 绕过队列立即插话。**队列与 to-dos 是两个独立机制**：to-dos 是 agent 对自身工作的分解，队列是用户后续指令的缓冲，文档未将二者耦合。
- 呈现：to-do 列表在 chat 内随 agent 消息出现（勾选圆点 + 进行中高亮），Cursor 未公开渲染源码；行为描述以上述官方 changelog/docs 为准。

## 4. 横向对比与对本项目的启示

### 4.1 对比

| 维度 | Codex `update_plan` | Claude Code `TodoWrite` | Cursor Agent To-dos |
|---|---|---|---|
| 状态枚举 | pending / in_progress / completed | 同左 | 未公开 schema（行为上同为待办/进行中/完成） |
| 单一 in_progress | 是（工具描述 + prompt 双重强调） | 是（"exactly ONE……not less, not more"） | 未公开约束 |
| 更新方式 | 整表替换（无 id） | 整表替换（新 Task 工具族改为按 id 增量 + 依赖） | agent 自动维护，随进度更新（含依赖关系） |
| 附加字段 | 可选 `explanation`（改计划说明理由） | `activeForm`（进行中的用户视角文案） | 依赖关系 |
| Prompt 引导 | 非平凡/多阶段才用；步骤 5-7 词；禁单步计划；结束前清算全部状态 | ≥3 步才用；琐碎不用；完成即标不批量；受阻不标完成 | 产品层自动触发，未公开 prompt |
| 服务端语义 | 无操作，仅广播事件供客户端渲染 | 同类（宿主拦截 tool_use 投影） | 闭源 |
| UI 呈现 | Timeline 内联 "Updated Plan" 卡片（✔+删除线 / □ 青色 / □ 暗色）+ 底部状态条聚合 completed/total | 会话内联复选清单，in_progress 显示 activeForm+spinner | chat 内 to-do 面板实时刷新，可同步 Slack |

**共性**：三态状态机 + 单一 in_progress 是事实标准；工具本身是「无副作用的结构化广播」，真源在工具调用参数，UI 只读投影；prompt 都强调「小任务不用、完成即时标记、结束前不留悬挂状态」；视觉上普遍用勾选/圆点 + 完成删除线或变暗 + 进行中高亮。

**差异**：Codex 用 `explanation` 解决「计划变更的可解释性」，Claude 用 `activeForm` 解决「进行中状态的用户文案」；Claude 新 Task 工具族已转向增量 + 依赖图，Codex 坚持整表替换的极简形态；Codex 额外做了「内联历史 + 状态条聚合进度」双呈现。

### 4.2 对本项目（agent-workbench）的启示

1. **直接采用 Codex 形态作为 v1 合同**：`update_plan(plan: {step, status}[], explanation?)` 整表替换 + 三态枚举 + 单一 in_progress，schema 最小、投影最简单（快照即真源，无需 diff/merge），且与 VoltAgent 侧车「事件广播 → projection」的现有架构天然吻合（Codex 服务端就是发一个 `PlanUpdate` 事件）。
2. **UI 双呈现**：Timeline 内联「计划更新」卡片（保留每次快照历史，completed 删除线变暗、in_progress 高亮、pending 暗色圆点/方框）+ Codex 风格任务摘要面板常驻显示最新快照与 `completed/total` 进度——这正是 Codex TUI 的 history cell + status surface 组合。
3. **prompt 引导要点照搬业界共识**：非平凡/≥3 步才建计划、禁单步计划、步骤一句话（5-7 词量级）、完成即时标记不批量、变更计划带 explanation、结束前清算所有状态。
4. **预留演进方向不预支实现**：若后续需要任务依赖/多 agent 分工，参照 Claude Task 工具族（id + 增量 + blocks/blockedBy）演进；`activeForm` 双文案在中文场景收益有限（中文无进行时形态差异），可不引入。

## 来源清单

- Codex schema/handler：https://github.com/openai/codex/blob/65cc12d7/codex-rs/protocol/src/plan_tool.rs ；https://github.com/openai/codex/blob/99f47d6e9a3546c14c43af99c7a58fa6bd130548/codex-rs/core/src/tools/handlers/plan.rs
- Codex prompt：https://github.com/openai/codex/blob/main/codex-rs/core/prompt.md ；https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
- Codex TUI：https://github.com/openai/codex/blob/178c3d30/codex-rs/tui/src/history_cell.rs （`PlanUpdateCell`）；https://github.com/openai/codex/blob/31519549/codex-rs/tui/src/chatwidget/turn_runtime.rs （`on_plan_update`）；https://github.com/openai/codex/pull/18935
- Codex agent loop 官方博客：https://openai.com/index/unrolling-the-codex-agent-loop/
- Claude Code 官方：https://code.claude.com/docs/en/tools ；https://code.claude.com/docs/en/agent-sdk/todo-tracking
- Claude Code system prompt（逆向，可信度较高）：https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-todowrite.md
- Cursor 官方：https://cursor.com/changelog/1-2 （Agent To-dos）；https://cursor.com/docs/agent/planning （Plan Mode）；https://cursor.com/docs/agent/overview （Queued messages）；https://cursor.com/blog/plan-mode
