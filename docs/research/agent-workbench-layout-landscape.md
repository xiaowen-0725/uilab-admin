# Agent Workbench 布局调研

> 调研时间：2026-08-01
> 范围：主流 Coding Agent / Agent Workbench 的桌面级布局
> 方法：只采用产品官方文档、官方帮助中心和用户提供的 Codex 截图；布局文档不足时明确标记，不用二手文章补洞。

## 结论摘要

跨产品最稳定的结构不是“主内容区 + 固定 Inspector”，而是：

1. **任务面**：承载对话、执行过程、工具轨迹和输入控制。
2. **工作面**：承载用户与 Agent 共同查看或操作的文件、Artifact、Browser、Preview、Diff、Terminal、IDE 等内容。
3. **导航与辅助信息**：项目/会话导航、资源树、环境信息和来源信息按产品形态放在侧栏、工具 Tab、Popover 或 Overlay 中，并没有统一固定在最右侧。

因此，Codex 截图最右侧不宜统一命名为 Inspector。文件树是当前文件工作面的 Resource Explorer；Markdown、HTML、Browser、Diff 等位于更广义的 Work Surface；环境、来源、子智能体等属于 Task Context Panel。

## 产品对比

| 产品 | 主要形态 | 任务/对话面 | 文件、浏览器与产物 | 布局判断 |
|---|---|---|---|---|
| OpenAI Codex app | Agent-first | Thread 持续显示执行过程和 Composer | 官方提供 built-in Browser、Review pane、file previews、integrated terminal；Browser 工作流要求在代码 Diff 旁查看渲染结果 | 任务面与多种工作面并存；右侧不是单一 Inspector |
| Cursor | IDE-first | Agent 位于 sidepane | Browser 可显示在独立窗口或 inline pane；代码编辑器与 Terminal 保持 IDE 工具形态 | 编辑器是主工作面，Agent 是侧面协作者 |
| Windsurf | IDE-first | Cascade 作为 Agent panel | Preview 可作为 Editor 新 Tab 打开，并与 Cascade panel 并排；Terminal 是集成工具 | Editor/Preview/Terminal 是可切换工作面，Agent panel 持续存在 |
| Replit Agent | Pane-system-first | Agent 本身是一个 Tool Tab | Pane 可横纵拆分、缩放、重排和浮动；Tab 可承载 Editor、Preview、Agent 等单一工具 | 最明确的通用 Pane + Tool Surface 模型 |
| Devin | Agent-session-first | Session/Progress 组织 Agent 执行 | IDE、Desktop/Browser、Shell 是独立 Session Tools；Progress 将命令、编辑和浏览活动汇总为统一视图 | 任务状态与多个专业工作面协同，而非固定右栏 |
| Claude Artifacts | Conversation-first | 主对话持续存在 | Artifact 在对话右侧独立窗口显示，可承载代码、文档、应用等 substantial content | 清晰的 Conversation + Artifact 双面模型 |
| Manus | Task-first | 任务流驱动 Browser/Computer Use | 官方确认 Cloud Browser、Browser Operator、VS Code/Browser takeover，但公开文档不足以确认稳定 Pane 布局 | 能确认 Browser/IDE 是可接管工作面，不能据此锁定 Shell 几何结构 |

## 一手证据

### OpenAI Codex app

- Codex 的 built-in Browser 可以打开本地或公开页面、交互、截图和验证；官方工作流明确要求把渲染结果与 code diff 一起检查。[In-app browser](https://developers.openai.com/codex/app/browser)
- Review pane 是独立的变更审查工作面，支持按 unstaged、staged、commit、branch、last turn 查看和操作 Diff。[Review](https://developers.openai.com/codex/app/review)
- 官方 Windows 说明列出 built-in browser、file previews 和 Git 等核心工作流。[Windows app](https://developers.openai.com/codex/app/windows)
- 用户提供的 Codex 截图进一步显示 Thread 与文件/Markdown 工作面并排，文件树作为工作面内部的资源浏览器；这是对官方能力的界面观察，不作为官方通用布局承诺。

### Cursor

- Cursor 官方将 Agent 描述为通过 sidepane 使用的助手。[Agent overview](https://cursor.com/docs/agent/overview)
- Browser 可显示为独立窗口或 inline pane，Agent 可以操作页面、Console 和 Network。[Browser](https://cursor.com/docs/agent/tools/browser)
- Terminal 是 Agent 可直接操作的独立 IDE 工具。[Terminal](https://cursor.com/docs/agent/tools/terminal)

### Windsurf

- Cascade 是 IDE 内的 Agent panel，并使用 Search、Web Search、MCP 和 Terminal 等工具。[Cascade overview](https://docs.windsurf.com/windsurf/cascade/cascade)
- Preview 可以作为 Editor 新 Tab 打开，与 Cascade panel 并排，也可以在系统浏览器打开。[Previews](https://docs.windsurf.com/windsurf/previews)

### Replit Agent

- Replit Project Editor 明确定义 Window、Pane 和 Tab：Pane 支持拆分、缩放、重排与浮动；每个 Tab 承载一个 Editor Tool，例如 file editor、Preview 或 Agent。[Editor & Tools](https://docs.replit.com/features/editor/editor-and-tools)
- Preview 是可独立打开的 Project Editor Tool，包含地址栏、响应式视图和开发者工具。[Preview](https://docs.replit.com/features/editor/preview)
- Canvas 将运行应用、设计、图片和视频组织为可操作 Frame，并把 Agent chat 停靠在旁边。[Canvas](https://docs.replit.com/features/design/canvas)

### Devin

- Devin 官方把 IDE、Desktop/Browser 和 Shell 定义为三种 Session Tools，Progress tab 将 Shell command、code edit 和 browser activity 汇入统一视图。[Devin Session Tools](https://docs.devin.ai/work-with-devin/devin-session-tools)
- IDE 是可接管的完整 VS Code 环境，Desktop 是交互浏览器/桌面，Shell 提供命令行访问；三者可协同使用。[Devin Session Tools](https://docs.devin.ai/work-with-devin/devin-session-tools)

### Claude Artifacts

- Claude 官方将 Artifact 定义为与主对话分离的 dedicated window，并明确说明它显示在对话右侧。[Artifacts help](https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- Artifact 可承载 substantial standalone content，包括代码、文档和应用。[Projects and Artifacts](https://www.anthropic.com/news/projects)

### Manus

- Manus Cloud Browser 是可实时观看和接管的独立浏览环境。[Cloud Browser](https://manus.im/docs/features/cloud-browser)
- Manus 允许用户接管 Browser 或 VS Code，但官方帮助没有给出可据以抽象通用 Pane 结构的稳定布局合同。[Take over Browser or VS Code](https://help.manus.im/en/articles/11711218-how-can-i-take-over-manus-browser-or-vs-code)

## 跨产品稳定模式

### 1. Task Surface 与 Work Surface 是两个不同角色

Agent-first 产品通常保留持续的任务/对话面，同时把文件、Browser、Diff 或 Preview 放入另一个工作面。IDE-first 产品则相反：Editor 是主工作面，Agent 是侧面任务面。左右位置会变化，但两个角色普遍存在。

### 2. Browser 是一等 Work Surface

Codex、Cursor、Windsurf、Replit、Devin 和 Manus 都把 Browser/Preview 视为可观看、交互或接管的工作环境，不只是工具调用日志中的一张截图。

### 3. Artifact 只是 Work Surface 的一种内容

Markdown、HTML、代码文件、生成页面和文档可以称为 Artifact；Browser、Terminal、IDE、Resource Explorer 是 Tool Surface。把所有右侧内容统称为 Artifact 会遗漏实时工具，把它们统称为 Inspector 又会弱化编辑和接管能力。

### 4. Pane/Tab 比固定左右栏更稳定

Replit 明确采用 Window → Pane → Tab → Tool；Windsurf 用 Editor Tab 承载 Preview；Cursor 用 inline pane 承载 Browser；Codex 和 Claude 都支持对话旁出现独立工作内容。跨产品稳定抽象是“可组合 Work Surface”，不是固定的 right sidebar。

### 5. Task Context Panel 使用自适应占位/覆盖行为

用户提供的 Codex Desktop GIF 显示，环境、权限、来源、子智能体和状态摘要由同一个 Task Context Panel 承载：空间充足时为它保留独立位置并使任务内容避让，空间受限时再覆盖 Task Surface。它在视觉上可以保持悬浮卡片形态，但不是固定 Inspector，也不占用 Workbench Shell 唯一的右侧扩展位。

## 对 Template Platform 的建议

Workbench Shell 的候选模型应从固定三区域调整为：

```text
Workbench Shell
├── Navigator                    # 项目、任务、会话；可折叠
└── Workbench Stage
    ├── Task Surface             # Thread、执行过程、Composer
    │   └── Task Context Panel   # 环境、变更、来源、子智能体
    │       ├── Reserved-space   # 空间充足时占位并使任务内容避让
    │       └── Overlay          # 空间受限时覆盖 Task Surface
    └── Work Surface Host        # 零个或多个可组合 Pane/Tab
        ├── Artifact Surface     # Markdown、HTML、文档、图片
        ├── Editor Surface       # 文件阅读与编辑
        ├── Browser Surface      # 页面预览、操作与接管
        ├── Review Surface       # Diff、审查、提交
        ├── Terminal Surface     # 命令与进程
        └── Resource Explorer    # 与当前项目/工作面关联的资源导航
```

### Interface 原则

- Shell 应拥有 Pane 的拆分、尺寸、显隐、焦点、Tab 和持久化行为。
- Work Surface 通过小 Interface 注册自身标题、类型、生命周期和内容，不让每个 Agent 应用重写布局系统。
- Task Surface 是 Agent Workbench 必需能力；Work Surface Host 可以为空，也可以同时承载多个 Pane。
- Task Context Panel 归属于 Task Surface，并根据可用空间在 Reserved-space 与 Overlay 两种模式间切换。
- Resource Explorer 是工作面相关导航，不与项目/会话 Navigator 混为一谈。
- Artifact、Browser、Terminal、Review 是 Work Surface 类型，而不是顶层 Shell 区域。

## 已确定的产品边界

- Work Surface Host 是 Workbench Shell 的核心能力，但首版采用 Single-pane + Tabs。
- 首版支持工作面的显隐、调宽与最大化，不支持任意拆分、拖拽重排或多 Pane 编排。
- Interface 保留未来演进为 Multi-pane 的能力，不在首版提前实现。
- 新任务采用 Task-first 单面布局；打开工作内容时按需展开 Work Surface Host，并按任务恢复上次布局状态。
- 首版实际交付 Document、Browser、Review Surface 与辅助 Resource Explorer；Terminal 和完整 Editor 只保留注册 Interface。
- Document Surface 通过独立 Renderer 覆盖 Markdown、DOCX、PDF 与只读 XLSX；深度 XLSX 编辑以后分化为 Spreadsheet Surface，HTML 渲染归 Browser Surface。

## 本轮已关闭的产品决策

Workbench Shell 的区域语义、Context Panel 自适应行为、Work Surface Host 首版能力、默认布局和首批 Surface 范围均已确定。后续设计进入 Template Platform 的物理目录与 Module 边界。
