# Research：Cursor Canvas 的产品职责与生命周期

> **Ticket:** [调研：Cursor Canvas 的产品职责与生命周期](https://github.com/xiaowen-0725/uilab-admin/issues/168)
> **地图:** [Wayfinder 地图：Workbench 对话旁现场产物（Cursor Canvas 职责）首版规格](https://github.com/xiaowen-0725/uilab-admin/issues/167)
> **Date:** 2026-08-27
> **Scope:** 只还原 Cursor 产品里 Canvas（对话旁现场交互件）的职责与生命周期。不设计 Workbench 方案，不写产品代码，不把本仓工作名写进结论。
> **方法边界:** 按票面顺序只读一手来源：本机 Cursor skill `~/.cursor/skills-cursor/canvas/SKILL.md` 与 `sdk/*.d.ts`；Cursor 官方文档 / changelog / 帮助中心（`cursor.com/docs`、`cursor.com/blog`、`cursor.com/changelog`、`cursor.com/help`）。未做本轮 UI 实测（未点 Open Canvas、未 Publish、未关窗再开验证恢复）。本地 `~/.cursor/projects/<workspace>/canvases/` 与 `agent-transcripts/` 仅作 skill 落地痕迹核对，不当成官方产品规格。论坛帖不当真源。
> **证据标签:** 【一手】= 上述来源的明文 · 【推断】= 由一手推出、来源未直接写死 · 【未验证】= 需要点产品 UI 或读未公开实现才能确认。官方页与 skill 冲突时以官方产品文档为准，冲突见 §9。

---

## 1. 结论先行

1. **Canvas 是 Agent 写出来的独立 React 产物，不是聊天气泡。** 官方定义是「interactive artifacts that render next to the chat」：替代长 markdown 表 / 代码块，给一份可重开、可改、可迭代的独立视图。【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)
2. **谁决定做、谁打开，是两步。** 创建可由 Cursor/Agent 自动决定，也可由用户直接要（含内置 `/canvas` skill）。渲染面的打开，官方 Opening 小节写成用户点响应末尾 card、Command Palette「Open Canvas」，或 Agents Window 新 tab。【一手】同上；[Skills](https://cursor.com/docs/skills.md)。创建后是否自动弹出渲染面，官方导语与 Opening 小节不一致，本轮未实测。【未验证】
3. **对话里进的是指针，不是画布本体。** 官方：构建后「inserts a reference to it in your chat」。Skill：回复里必须放 `.canvas.tsx` 绝对路径 markdown 链接。画布文件落在工作区外的托管目录；同一文件可被后续会话读取/改写。画布也能反向开对话（`openAgent` / `newComposerChat`）。【一手】官方文档 + skill + `sdk/hooks.d.ts`
4. **持久化跟工作区走，不跟单次会话绑定。** 官方有「workspace's canvas list」，关掉后可重开、可「rerun … with fresh data」，不必重跑当时那轮 Agent。交互状态可另存 `.canvas.data.json` sidecar，声明为跨 rebuild / reload / IDE 重启仍在。团队分享是另一条路：toolbar **Publish** 上传 live snapshot，Dashboard 只读，明确「instead of sharing a full chat thread」。【一手】官方文档 + changelog + SDK
5. **用户能改源；运行时数据默认内嵌，但「取数」官方允许 Agent 再跑查询。** 官方允许切到 source 手改，也更推荐让 Agent 改。Skill 禁止 canvas 内 `fetch()` / 网络。官方 skill 包装与「rerun the underlying query」说的是 Agent 再去跑 SQL / API / shell，再写回画布——以官方为准。【一手】官方文档 + skill；冲突见 §9
6. **明确不用 Canvas 的清单在 skill，不在用户帮助页。** 帮助中心无独立 Canvas 页。官方用户文档只从正面说 dashboard / analysis / audit / report。Agent 合同（skill）禁止：用户点名要别的工具产物、已有明确交付物（改代码 / 写回复 / 做 PR）、改已有工件、针对性调试、短答、MCP 只是中间步骤。【一手】skill；官方未列否定清单
7. **分界：Canvas ≠ 普通文件预览 ≠ Browser。** Canvas 是 IDE 编译的 `.canvas.tsx` 专用面，只认托管 `canvases/` 目录、只准 `import` `cursor/canvas`。普通文件是工作区源码，Agents Window 里用 Cmd+P 打开。Browser 是受控网页（URL / localhost），截图和操作进聊天，状态按工作区隔离 cookies / storage。【一手】官方 Canvas / Browser / Agents Window 文档 + skill

本轮只调研。下面逐条展开；每条主张跟到来源。

---

## 2. 来源

| 层级 | 来源 | 角色 |
|---|---|---|
| 官方产品文档 | [Canvases](https://cursor.com/docs/agent/tools/canvas.md) | 用户可见生命周期（打开、迭代、分享、工作区列表） |
| 官方产品文档 | [Skills](https://cursor.com/docs/skills.md) | 内置 `/canvas`：Creates interactive React artifacts that render alongside the conversation；Agent 也可在匹配时自动用 |
| 官方产品文档 | [Agents Window](https://cursor.com/docs/agent/agents-window.md) | 并行面：文件用 Cmd+P；Canvas 从新 tab 菜单开 |
| 官方产品文档 | [Browser](https://cursor.com/docs/agent/tools/browser.md)、[Browser help](https://cursor.com/help/ai-features/browser.md) | 浏览器预览：URL / localhost / 截图进聊天 |
| 官方产品文档 | [Shared transcripts](https://cursor.com/help/ai-features/shared-transcripts.md) | 对照：分享整段对话 ≠ 分享 Canvas |
| 官方博客 / changelog | [blog/canvas](https://cursor.com/blog/canvas)（随 Cursor 3.1）、[changelog/04-15-26](https://cursor.com/changelog/04-15-26)、[Shared canvases](https://cursor.com/changelog/shared-canvases)（3.5，2026-05-20） | 定位与分享语义 |
| Agent 合同 | 本机 `~/.cursor/skills-cursor/canvas/SKILL.md` | 何时写、写到哪、导入约束、聊天回链、否定清单 |
| SDK 声明 | `~/.cursor/skills-cursor/canvas/sdk/index.d.ts`、`hooks.d.ts`、`form-primitives.d.ts` 等 | 运行时状态、回链动作、组件面 |
| 本地痕迹（非规格） | `~/.cursor/projects/Users-zhoujw-develop-github-uilab-admin/canvases/`、`agent-transcripts/` | 核验 skill 落地路径与「聊天里放链接」 |

官方 sitemap（[llms.txt](https://cursor.com/docs/llms.txt)，2026-08-27）把 Canvas 列在 Agent **tools** 下，与 Terminal / Browser / Search 并列。帮助中心 AI features 无独立 Canvas 页。【一手】

Agent 总览 [overview](https://cursor.com/docs/agent/overview.md) 的 Tools 列表写了 Browser、未点名 Canvas。【一手】这只说明总览未同步，不否定 tools 专页。

---

## 3. 何时打开、谁打开

### 3.1 创建：Agent 可自动，用户也可点名

官方 How it works 第 1 步：

> Cursor decides that your task benefits from a visual or interactive view, or you ask for one directly.

适用正面例子：dashboard、analysis、audit、report；「when that is a better fit」。【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)

内置 `/canvas`：「Creates interactive React artifacts that render alongside the conversation。」用户可 `/` 手动调用；「Agent may also use some built-in skills automatically when your request clearly matches their purpose。」【一手】[Skills](https://cursor.com/docs/skills.md)

Skill 把触发判据写成 **user intent，不是 response shape**：问「用户是否受益于把这份输出看成独立工件、和聊天分开」。适合新的独立分析输出（量化、账单、安全审计、架构审查、MCP 数据本身就是交付物、超过一小把行的表）。【一手】`SKILL.md` §1

Skill frontmatter：`surfaces: ide, cloud`；`environments: local, cloud`。【一手】Agent 在 IDE 与 Cloud 都被要求走同一套 canvas 合同。Cloud 侧是否同一套打开 UI，官方未单独写。【未验证】

### 3.2 打开渲染面：官方写成用户点

官方 Opening a canvas：

- **From Cursor:** 创建后「a card appears at the end of the response. Click it to open.」
- **Command Palette:** View 分组下的 **Open Canvas**
- **Agents Window:** 新 tab 菜单直接开 canvas tab

【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)

Skill：Agent 必须把文件写到托管目录；「Users can click the canvas file path in the response to open it, just like any other file path」。回复里要写「可以在聊天旁边打开」+ 路径链接。没有「Agent 调用打开工具」的步骤。【一手】`SKILL.md` Introducing / Troubleshooting

### 3.3 冲突：导语「opens」vs Opening「Click it」

同一官方页导语写「Cursor opens the result in a canvas」，Opening 却是 card + 点击。Skill 也是用户点路径。

**以 Opening 小节为准（更具体）：** 创建决策可以自动；打开渲染面的产品说明是用户手势。【一手】官方页内部不一致，见 §9。创建后 IDE 会不会自动弹出 pane，本轮未点 UI。【未验证】

---

## 4. 与对话的关系

### 4.1 旁路：独立面，不是气泡正文

官方：独立视图，「Instead of scrolling through a long markdown table or code block」。博客：explore custom interfaces，「instead of reading walls of texts in chats or markdown files」。Agents Window 里 canvas 是 durable artifact，「alongside … terminal, browser, and source control」。【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)、[blog/canvas](https://cursor.com/blog/canvas)、[changelog/04-15-26](https://cursor.com/changelog/04-15-26)

Skill：「live React app that the user can open beside the chat」；「its own standalone artifact, separate from the chat」。【一手】`SKILL.md`

### 4.2 回链：聊天 → 画布，画布 → 聊天

**聊天 → 画布**

- 官方：构建后 insert a **reference**；响应末尾 **card**。【一手】
- Skill：凡提到某张 canvas，必须用绝对路径 markdown 链接，例如 `[billing-review](/Users/<user>/.cursor/projects/<workspace>/canvases/billing-review.canvas.tsx)`。【一手】

**画布 → 聊天**（SDK，官方用户文档未写）

`useCanvasAction()` 火即忘、无返回：

| action | 作用 |
|---|---|
| `openAgent` | 跳到已有 Agent 对话；`agentId` = `agent-transcripts/` 文件名 stem；本地与 cloud/background 都适用 |
| `newComposerChat` | 开**新的**本地 Agent 聊天，并把当前 canvas 文件当作 @mention；可选 `userPrompt` |
| `openFile` | 打开工作区文件（路径或绝对路径，可选 selection） |

【一手】`sdk/hooks.d.ts`

因此产品关系是：**工作区级工件 + 聊天指针**，不是「只能活在创建它的那条 transcript 里」。画布可以打开旧对话，也可以开新对话并 @ 自己。

### 4.3 是否进 transcript

进聊天的是 **reference / card / 路径链接**，不是把渲染树当气泡正文。【一手】官方 + skill

本地 transcript 与 skill 一致：Agent 用 Write 写 `…/canvases/<name>.canvas.tsx`，助手正文放 markdown 链接，分析摘要仍写在聊天里。例如本工作区 `agent-transcripts/490c3ecf-…` 对 `streaming-answer-industry.canvas.tsx`、`ake-cleanup-scan-hotspots.canvas.tsx` 的写法。【一手】本地 traces（核验 skill，不是官方规格）

Shared transcripts：「The full conversation history is shared, including code snippets, tool calls, and their results。」若创建走写文件工具，工具调用会进被分享的对话副本；本地文件本身「Local files … are not included」。【一手】[Shared transcripts](https://cursor.com/help/ai-features/shared-transcripts.md)

Shared canvases 是另一条分享：changelog 写「Instead of sharing a full chat thread」，文档写「without … digging through chat history」。【一手】[Shared canvases](https://cursor.com/changelog/shared-canvases)、[Canvases](https://cursor.com/docs/agent/tools/canvas.md)

**推断：** 画布源码作为独立文件存在；transcript 保指针和（若分享对话）工具调用文本。关掉聊天不会从规格上删除画布文件。【推断】官方未写「删会话是否删 canvas」。【未验证】

---

## 5. 持久化

### 5.1 跟工作区走，不跟单次会话

- 「Cursor saves the canvas so you can reopen and rerun it later with fresh data。」
- 「Each canvas appears in your workspace's canvas list, so you can jump back to past ones without rerunning them。」

【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)

博客 / 3.1 changelog：Agents Window 里 canvases 是 durable artifacts，和 terminal / browser / source control 并列。【一手】

Skill 落地路径（官方用户文档没写绝对路径）：

```text
/Users/<user>/.cursor/projects/<workspace>/canvases/<name>.canvas.tsx
```

只认该目录根下的 `.canvas.tsx`；子目录、别的扩展名、别的位置不收录。目录由 Cursor 预置，Agent 直接 Write，不要 `mkdir`。【一手】`SKILL.md`

本工作区该目录在 git 仓库外，含多张历史 `.canvas.tsx`、宿主下发的 `tsconfig.json` / `node_modules/cursor/canvas`。后续会话会 Read / 改已有文件。【一手】本地 traces

**关掉再开：** 官方列出 card、Open Canvas、工作区 canvas list、Agents Window tab——都能回到已保存画布，不必重跑当时 Agent。【一手】是否「关 pane 再开同一文件仍渲染、状态仍在」，与 §5.2 一致的部分见 SDK；本轮未点 UI。【未验证】

Checkpoints「reverts files only」，且「stored locally and separate from Git」，对象是 codebase 修改。【一手】[overview](https://cursor.com/docs/agent/overview.md)。Canvas 文件在仓库外，是否进 checkpoint，官方未写。【未验证】

### 5.2 交互状态：`.canvas.data.json`

`useCanvasState(key, defaultValue)`：像 `useState`，但「survives rebuilds, reloads, and IDE restarts」，存在源文件旁的 `.canvas.data.json`。key 由作者指定，与 hook 调用顺序无关。【一手】`sdk/hooks.d.ts`

表单控件的 `onChange` 直接给值，为和 `useCanvasState` 配对。【一手】`sdk/form-primitives.d.ts`

本工作区未见任何 `.canvas.data.json`（现有 canvas 未用该 hook）。【一手】本地 traces。未用 hook 时关窗再开是否只靠 `.canvas.tsx` 重编译，SDK 未另说；按声明，没有 sidecar 就回 `defaultValue`。【推断】

`useHostTheme()` 读宿主 `theme` channel；注释提到 `window.__cursorCanvas.state`，值为跨「untrusted JSON/SSE boundary」的 raw theme。【一手】`sdk/hooks.d.ts`。这是主题桥，不是画布业务数据存储。

本地还见 `<name>.canvas.status.json`（例：`{"status":"rendered"}`）。官方与 skill 均未描述。【一手】本地文件存在；产品语义【未验证】

### 5.3 团队分享：snapshot，只读，不绑对话

- Publish 上传「live snapshot」，队友用浏览器打开，「same layout, charts, and tables, without rerunning the agent or digging through chat history」。
- Dashboard **Shared Canvases** 浏览；toolbar **Publish** 发布或刷新。
- 付费档（Pro / Teams / Enterprise）；要在 team 上；Legacy Privacy Mode 会挡；Free 不能建 share。
- 管理员可在 team settings 关 Shared Canvases。

【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)

Changelog 3.5：「share a link to a live snapshot」；Dashboard「read-only access」。【一手】[Shared canvases](https://cursor.com/changelog/shared-canvases)

与 Shared transcripts 对照：后者分享整段对话（Teams / Enterprise，可 Team / Public），不含本地文件。【一手】[Shared transcripts](https://cursor.com/help/ai-features/shared-transcripts.md)

「live snapshot」是只读冻结视图还是打开后仍可交互，官方同时用 live 与 read-only。【推断】Dashboard 侧是只读快照；是否可在快照里点表单，【未验证】

---

## 6. 用户能否编辑源；数据是否必须内嵌

### 6.1 能改源

官方 How it works 第 3 步：review rendered view，「switch to the source to tweak it, or ask Cursor to change it」。

Iterating：

- 布局不对：告诉 Cursor 改，而不是手改。
- 数字过期 / 不对：让 Cursor rerun underlying query 或 show its work。
- 大改：revert 再 prompt，通常快过小步追问。
- 「For small tweaks, you can also manually edit the source code。」

【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)

Skill：用户点路径「just like any other file path」；Agent 每次编辑会收到 `Canvas TypeScript check`。【一手】`SKILL.md`

渲染面里的表单 / `useCanvasState` 改的是 sidecar 状态，不是 `.canvas.tsx` 源。【一手】SDK。官方「manually edit the source code」指切到 TSX 源。

### 6.2 数据：运行时禁止自取网；官方允许 Agent 再取数

Skill 文件规则（Agent 写 canvas 时）：

- 恰好一个 `.canvas.tsx`；禁止 helper / style / 支持模块。
- **只**从 `cursor/canvas` import；无相对 import、无 npm、无 Node built-in。
- 「Embed all data inline. **No `fetch()`, no network calls.**」
- 没数据就不要出 canvas。

【一手】`SKILL.md`

官方 Packaging in skills 则写：canvas skill 可含「Data sources and queries Cursor should run to populate the view, such as a SQL query, API call, or shell command」；短 prompt 即可「regenerate the canvas with fresh data」。How it works 第 4 步：save 后可 reopen and **rerun it later with fresh data**。Iterating：ask Cursor to **rerun the underlying query**。【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)

博客：Agent 可把 Datadog / Databricks / Sentry MCP 与本地 debug 文件拼进同一张图。——取数发生在 Agent 工具回合，再写进画布。【一手】[blog/canvas](https://cursor.com/blog/canvas)

**以官方为准：** 运行中的 canvas 不自己打网（skill 约束仍适用于 `.canvas.tsx` 运行时）。新鲜数据靠 **Agent 再跑查询/工具，再改文件**。不是「数据必须永远冻在第一份 TSX 里、永远不能更新」。【一手】冲突见 §9

SDK 另有一条持久化通道：用户在画布里点出来的状态走 `.canvas.data.json`，不是 embed 进 TSX。【一手】`hooks.d.ts`

---

## 7. 何时明确不用 Canvas

官方用户文档没有「Do not use」列表，只从正面说 visual / interactive view 更合适时用。【一手】[Canvases](https://cursor.com/docs/agent/tools/canvas.md)

否定清单在 Agent skill（官方未反驳）：

| 不要用 Canvas | Skill 原文要点 |
|---|---|
| 用户要的是**另一个具体工具里的产物** | 「create a Datadog dashboard」→ 真做 Datadog dashboard，不要做 canvas |
| 用户要的是**特定交付物** | draft support response / fix this code / make this PR |
| 用户在**已有工件**里改 | 改进已有 HTML dashboard、编辑已有文件 |
| **针对性调试**或正在写代码 | 即便中途冒出结构化发现 |
| 短答、一次性改文件、澄清问题 | — |
| MCP 只是**中间步骤** | 查 Stripe 是为了写客服回复 → 不要为查询结果单独做 canvas |

【一手】`SKILL.md` §1

Skill 还写：整张会是空的（没拿到底层数据）就不要做，改问用户。【一手】

帮助中心无 Canvas 专页，普通用户看不到上述否定清单。【一手】[llms.txt](https://cursor.com/docs/llms.txt)

---

## 8. 和普通文件预览 / 浏览器预览的分界

官方没有「Canvas vs Preview vs Browser」对照表。分界由三份并列文档 + skill 拼出。【一手】各页如下；「因此 Canvas 不是 X」在未写死处标【推断】

| | Canvas | 普通文件预览 / 编辑 | Browser |
|---|---|---|---|
| 官方位置 | [tools/canvas](https://cursor.com/docs/agent/tools/canvas.md) | [Agents Window](https://cursor.com/docs/agent/agents-window.md) Cmd+P / Cmd+Shift+F；[overview](https://cursor.com/docs/agent/overview.md) Read/Edit files | [tools/browser](https://cursor.com/docs/agent/tools/browser.md)、[help/browser](https://cursor.com/help/ai-features/browser.md) |
| 对象 | 托管目录里的一份 `.canvas.tsx`，IDE 编译成独立 React 面 | 工作区任意文件 | URL / localhost 网页 |
| 谁建 | Agent 写（可自动或 `/canvas`） | 用户或 Agent 改仓库文件 | Agent 开浏览器（默认可需批准） |
| 谁开 | card / Open Canvas / Agents Window canvas tab / 点路径 | 点文件、Cmd+P | Agent 打开；用户可手输非 allowlist URL |
| 和聊天 | 旁路面 + 聊天 reference；内容不替代气泡 | 文件内容可被 @ / 读入上下文；Image generation 默认进 `assets/` 并 **inline in chat** | 截图与操作显示在聊天，另有 browser window / inline pane |
| 运行时 | 只准 `cursor/canvas`；无 fetch（skill） | 普通编辑器 / 语言服务 | 真网页：console、network、cookies |
| 持久化 | 工作区 canvas list + 源文件 + 可选 sidecar；分享是 snapshot | Git / 工作区文件；checkpoint 管 Agent 改过的 codebase 文件 | 按工作区持久化 cookies、localStorage、IndexedDB |
| Agents Window | 与 terminal、browser、source control 并列的 durable artifact | source control / 文件搜索 | 并列的 browser 工具 |

Skill 收紧 Canvas 边界：只有托管 `canvases/*.canvas.tsx` 会被识别；写在仓库里的 `.tsx` 即使长得像 canvas 也不会被收。【一手】`SKILL.md`

点 canvas 路径「像点普通文件」是**打开手势**相同；宿主随后按 canvas 编译，不是当普通 TSX 预览。【一手】skill Troubleshooting；【推断】编译器行为以 skill「IDE compiles」为准，未读 IDE 源码。

Browser 明确是测前端、审可访问性、看 localhost / 公网站，不是 Agent 新写的分析工件。【一手】Browser 文档。Canvas 博客把「本来要做 web app 做 eval 分析」改成 skill + canvas，作为对照用例。【一手】[blog/canvas](https://cursor.com/blog/canvas)

Image generation：默认存项目 `assets/`，**shown inline in chat**。【一手】[overview](https://cursor.com/docs/agent/overview.md)。与 Canvas「独立面 + 聊天指针」不同。【推断】

---

## 9. 官方文档与 skill 的冲突

按票面：冲突以官方产品文档为准。

| 主题 | Skill | 官方 | 本调研采用 |
|---|---|---|---|
| 打开 | 用户点路径；Agent 只写文件、在回复里放链接 | 导语「Cursor opens」；Opening 是 card 点击 / Open Canvas / Agents Window tab | **官方 Opening**：用户打开。导语「opens」当作创建+呈现，不当成已证实的自动弹窗。【未验证】是否自动弹 |
| 数据 / 网络 | 全部 inline；禁止 `fetch()` / 网络 | skill 包装与 rerun 写 SQL / API / shell；save 后可 rerun fresh data | **官方**：新鲜数据由 Agent 再跑查询后写回。Skill 的禁网视为 **canvas 运行时**约束，不是「永远不能更新数据」 |
| 文件位置 | `~/.cursor/projects/<workspace>/canvases/` 写死 | 只说 workspace canvas list 与 source | 不冲突。路径以 skill 为准（官方未写反例） |
| 何时不用 | 详细否定清单 | 无否定清单，只有正面场景 | 不冲突。否定清单标为 Agent 合同，不是用户帮助文案 |
| 回链动作 | 只要求聊天里放文件链接 | 用户文档只写 chat reference / card | 不冲突。`useCanvasAction` 是 SDK 补充，官方用户页未写 |

---

## 10. 未验证 / 未在一手来源出现

- 创建后渲染 pane 是否自动弹出，还是只出现 card。【未验证】
- 删掉创建它的聊天 / 清 transcript，工作区 canvas list 与文件是否还在。【未验证】
- Restore Checkpoint 会不会动仓库外的 `canvases/`。【未验证】
- Shared canvas 在浏览器里是纯只读静态页，还是仍可点控件；「live snapshot」与 `.canvas.data.json` 是否一起上传。【未验证】
- Cloud Agent / 远程 SSH 是否同一套托管目录与 Open Canvas。【未验证】（skill 声明 cloud surface，官方未写路径）
- `.canvas.status.json` 的产品含义。【未验证】
- 官方 canvas list 的 UI 入口是否等于托管目录文件列表。【推断】skill 路径 + 官方「workspace's canvas list」指向同一集合，未看到设置页截图。

---

## 11. 本轮不做

- 不设计 Workbench 产品、不写 ADR、不改地图 #167 正文。
- 不把「现场产物」或任何本仓工作名写进上述结论。
- 不实现功能、不接入 `cursor/canvas` SDK。
