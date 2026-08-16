# Research：侧车执行 Widget Data Job（取数作业）的可用路径

> **Ticket:** GitHub issue #114（`wayfinder:research`）· 地图 #111
> **Date:** 2026-08-15
> **Scope:** 只读盘点 `tooling/workbench-runtime-voltagent` 现有工具面 / 审批语义 / Connector 门禁 / 侧车→渲染层通道，判定「Board Widget 手动刷新取数」的可行路径与缺口。
> **方法边界:** 本轮**只读源码与文档**，未启动侧车、未起浏览器、未跑任何进程、未执行 git 写操作。所有需要运行时才能确认的量（真实 payload 上限、Python 是否可用、MCP 实际工具名清单）一律标 **未验证**，见 §8。
> **证据标签:** 【shipped】= 代码在仓库里且被装配 · 【planned】= 文档写了但代码里没有 · 【推断】= 我从代码推出的结论，无直接测试覆盖 · 【未验证】= 需要运行时。

---

## 1. 结论先行

1. **侧车今天没有任何「通用 HTTP 取数」能力。** 整个侧车只有 7 处 `createTool` 调用（`tools.ts` ×3、`update-plan-tool.ts`、`ask-user-question-tool.ts`、`cli-loader.ts`、`mcp-loader.ts`），没有 fetch / http / request 形态的工具。外部数据今天只能经 **GitHub 官方 MCP**（动态工具）或 **`execute_command` 跑原生二进制**（含 `lark-cli`）拿到。【shipped】

2. **侧车今天也没有可用的「代码执行」给 Job 用。** `minimal` profile 的 `run_command` 是**纯 echo，不 spawn 任何进程**（`tools.ts:64-81`，自述 `Demo tool — no real process was spawned.`）。真代码执行只存在于 `office` profile 的 `execute_command`（VoltAgent `LocalSandbox`），而 **ADR-0017 硬性规定它每次调用都必须 Host 审批**。所以「用户点一下刷新就**静默**取数」与「Job 跑一段生成的取数代码」在当前合同下**互斥**。【shipped】

3. **首版手动刷新能不能不新增代码执行能力就跑通？能——但只在一条既有缝隙上，且不覆盖任意数据源。** 详见 §5.1。摘要：
   - **不需要**新增代码执行（不需要托管 CPython、不需要给 Job 开 `execute_command`）。
   - 但**必须**有某种取数能力：GitHub 数据源可以用现有 MCP 走通；**任意 HTTP 数据源今天零路径**；飞书只有 `execute_command` 这条必弹审批的路。
   - 「静默」（免审批）当前只有一个合法开口：`MCP_READ_ONLY_TOOL_NAMES` 精确名 allowlist（`mcp-loader.ts:453`）。这是**运维 env 配置**，不是产品内可控开关。

4. **产物回渲染层已有一条被低估的现成大通道：`GET /workspace/file`。** 侧车 Hono 上挂着只读文件字节路由，默认上限 **25 MiB**，**不经模型、不经 tool call、不需要审批**（`configure-sidecar-app.ts:66-94`、`workspace-file-api.ts:71`）。Document Surface 已经在用它。这正好对应 Kimi「大产物写到输出文件环境变量指向的文件」的那一半机制——我们的「输出文件 + 带外读取」已经 shipped，缺的是「谁来写这个文件」和「Board 怎么知道该读哪个文件」。

5. **Board 全局实体 vs Task-scoped EventStore 的错配是硬错配，不是软约定。** IDB `events` store 的 `keyPath` 是 `['taskId','taskSequence']`，`snapshots` 的 `keyPath` 是 `taskId`，`EventStorePort` 每个读方法都要 `taskId`，`AgentRuntimeEventEnvelope` 的 `projectId` / `taskId` 都是**非可选**字段。Board 若不隶属 Task，就没有合法 envelope 可写。【shipped，见 §4.4】

6. **Connector 工具面拿不到「没有 Task 的调用」。** 连接器工具在 invoke 时被 `gateConnectorToolInvoke` 拦：`taskId` 为空直接 `missing_task_context` 拒绝（`tool-gate.ts:85-92`）；而 `taskId` 的唯一来源是 VoltAgent 的 `conversationId`（`turn-context.ts:21`），渲染层在 submit body 里把它设成 `taskId`（`voltagent-runtime-adapter.ts:864`）。**Board 的刷新若不在某个 Task 的 Turn 内，现有 Connector 一个都用不了。**

7. **Kimi 那套 Job 运行时语义我们一条都没有。** 60 秒超时、run 记录（status/logs/exit/artifact 快照）、并发不重入 `already_running`、失败不覆盖上次成功数据——侧车与渲染层里都**不存在**任何对应实现。侧车只有各层零散的超时（见 §2.4），没有 Job 概念。【shipped 状态：无】

---

## 2. Q1 — 现有侧车工具面盘点

装配入口：`src/create-agent.ts`（office / minimal 两条）。profile 解析与「诚实工具名清单」在 `src/profile.ts`。

### 2.1 minimal profile（**默认**，`profile.ts:33-41`）

| 工具 | 参数 | 需审批 | 实现 | 备注 |
|---|---|---|---|---|
| `read_file` | `{ path: string }`（工作区根内相对路径） | 否 | `src/tools.ts:23-39` | 返回内容在 **20,000 字符**处截断（`tools.ts:35`） |
| `write_file` | `{ path, content }` | **是**（`tools.ts:49`） | `src/tools.ts:41-62` | `mkdir -p` 父目录 |
| `run_command` | `{ command: string }` | 仅当命令含 `rm`/`sudo`/`mkfs`/`dd`（`tools.ts:71-72`） | `src/tools.ts:64-81` | **echo-only，不 spawn 进程**；返回 `note: 'Demo tool — no real process was spawned.'` |
| `update_plan` | plan/steps | 否 | `src/update-plan-tool.ts:28` | 投影成 `plan.updated` |
| `ask_user_question` | `{ question, options[2..5], allow_multiple }` | 无 `needsApproval` | `src/ask-user-question-tool.ts:20-42` | **client-side tool，无 `execute`**：模型调用挂起，由渲染层回填输出 |

清单常量：`MINIMAL_TOOL_NAMES`（`profile.ts:84-90`）。

### 2.2 office profile（`AGENT_PROFILE=office`）

| 工具族 | 具体名 | 需审批 | 实现 / 来源 |
|---|---|---|---|
| Workspace FS（VoltAgent core，非本仓所有） | `ls` `list_tree` `list_files` `read_file` `stat` `glob` `grep` | **否**（`defaults.needsApproval: false`） | 策略在 `create-agent.ts:113-124`；名单在 `profile.ts:69-82` |
| Workspace FS 写侧 | `write_file` `edit_file` `delete_file` `mkdir` `rmdir` | **是** | `create-agent.ts:117-122`（`edit_file`/`delete_file` 还要 `requireReadBeforeWrite`） |
| Workspace Sandbox（**通用 Shell**） | `execute_command` | **是，无条件** | 策略 `create-agent.ts:125-130`；装配 `create-agent.ts:272-277`（`sandbox: {}`）；适配器 `runtime-shell/office-workspace-sandbox.ts` |
| Skills | `workspace_list_skills` `workspace_search_skills` `workspace_read_skill` `workspace_activate_skill` `workspace_deactivate_skill` `workspace_read_skill_reference` `workspace_read_skill_script` `workspace_read_skill_asset` | 否 | `profile.ts:18-27`；启用条件 `create-agent.ts:219-226` |
| 计划 / 提问 | `update_plan` `ask_user_question` | 否 | 同 minimal |
| MCP 动态工具 | 由 `tools/list` 决定（GitHub 以 `github__` 前缀公开） | **默认全部需审批** | `mcp-loader.ts:414-426`；前缀 `github-package.ts:23,82` |
| 领域 CLI 结构化工具 | **当前为空** | — | loader 存在（`cli-loader.ts:372-511`），但 `cli.feishu` 只贡献 `commandScopes: ['lark-cli']`，**没有 `contributes.cli[].commands`**（`feishu-package.ts:108`） |

清单常量：`OFFICE_TOOL_NAMES`（`profile.ts:93-99`）。

### 2.3 特别标注（#114 直接问的四项）

| 问题 | 答案 |
|---|---|
| **通用 HTTP 取数** | **无**。全仓 `createTool(` 只有 7 处（`tools.ts:23/41/64`、`update-plan-tool.ts:28`、`ask-user-question-tool.ts:20`、`cli-loader.ts:428`、`mcp-loader.ts:267`），没有任何 HTTP 工具。MCP 的 HTTP 只用于**连接 MCP server 自身**（`mcp-loader.ts:162-180`），不是给模型的取数工具。 |
| **代码执行（shell / node / python）** | 只有 office 的 `execute_command`（`LocalSandbox`，`office-workspace-sandbox.ts:47-53`）。**minimal 的 `run_command` 是假的。** 无 Node eval、无 Python 宿主、无 `contributes.tools`（外部插件被明确禁止贡献可执行 JS，README:135）。 |
| **文件读写** | 有。minimal 走 `resolvePathWithinRoot` 系列（`workspace-root.ts`），office 走 `NodeFilesystemBackend({ contained: true, virtualMode: true })`（`create-agent.ts:212-216`）。两者都 fail-closed 拒绝根外路径。 |
| **超时控制** | 见 §2.4——**分散在各层，没有 Job 级超时**。 |
| **产物如何回传** | 两条：① tool 返回值 → fullStream → envelope → Timeline（有截断，见 §4.1）；② 写到工作区文件，渲染层经 `GET /workspace/file` 带外取（无截断，25 MiB 上限，见 §4.3）。 |

### 2.4 现有超时 / 输出上限（全部 shipped）

| 层 | 值 | 位置 |
|---|---|---|
| Workspace 操作 | 30 s（`WORKSPACE_OPERATION_TIMEOUT_MS` 可覆盖） | `create-agent.ts:210` |
| 普通 `execute_command` | 30 s，输出 1 MiB | `office-workspace-sandbox.ts:50-51` |
| Connector 作用域命令 | 120 s，输出 1 MiB | `office-workspace-sandbox.ts:84-86` |
| Connector 适配器硬顶（即便模型要求更多） | `maxTimeoutMs` 120 s / `maxOutputBytes` 1 MiB，`clamp()` 收敛 | `connector-aware-sandbox.ts:61-62,123-127` |
| MCP 连接 | 20 s（`MCP_TIMEOUT_MS`） | `mcp-loader.ts:158-160,513-534` |
| 声明式 CLI 命令 | 由 `cmd.timeoutMs` 决定（无默认硬顶） | `cli-loader.ts:499` |
| CLI stdout / stderr | 50,000 / 20,000 字符截断 | `cli-loader.ts:506-507` |
| **Job 级超时（Kimi 的 60 s）** | **不存在** | — |

---

## 3. Q2 — 代码执行路径的现实性与「静默刷新」的确切含义

### 3.1 ADR-0017 的硬边界

`docs/adr/0017-provider-owned-plugin-contract-and-dynamic-discovery.md`：

- **§3 第 45 行**：Office Runtime 只对 Agent 暴露一个通用 `execute_command`（`command + args[]`），不把 Provider 业务命令变成 Function Tools。
- **§3 第 49 行**：「**所有 `execute_command` 都始终需要 Host 审批；审批是任意命令执行的最终用户边界。**」
- **§3 第 48 行**：Provider command 还要额外满足 Plugin enabled ∧ CLI session Connected ∧ active Task selected；执行时固定可执行路径、丢弃模型 env、限超时/输出、拒绝可见的 shell 间接绕过（`connector-aware-sandbox.ts:89-97` 的 `connector_command_indirection_denied`）。
- **Costs/risks 第 133 行**（已预见本问题）：「CLI Skills 若需要 Shell/Code Execution，必须增加受控执行环境和更严格信任模型。」

补充一条**文档与代码的过期点**：`tooling/workbench-runtime-voltagent/README.md:103` 仍写「sandbox | **未启用**（攻击面收敛）」，但 `create-agent.ts:274` 已 `sandbox: {}`、`profile.ts:96` 已把 `execute_command` 列入诚实清单、README 自己第 137 行又描述了它的审批规则。**README:103 是 stale**，读者不要据此判断沙箱未启用。

另一条过期点：`docs/plans/sidecar-plugin-system-spec.md:192` 把「通用 shell/terminal 工具」列为 Out of Scope，这已被 ADR-0017（2026-08-09，08-10 修订）取代。同文件 **第 187 行**「修改 RuntimePort 事件类型全集或投影内核语义」仍在 Out of Scope，这一条对 §5 的路径 C 有直接约束力。

### 3.2 「用户点一下刷新就静默取数」在审批约束下的确切含义

**今天免审批（可静默）的动作全集：**

| 动作 | 依据 |
|---|---|
| office FS 只读：`ls` `read_file` `stat` `glob` `grep` `list_tree` `list_files` | `create-agent.ts:115-116` |
| minimal `read_file` | `tools.ts:23-39`（无 `needsApproval`） |
| Skills 只读工具族 | `profile.ts:18-27`（未设审批） |
| `update_plan` / `ask_user_question` | 无 `needsApproval` |
| **MCP 工具，且运维已把其精确名写进 `MCP_READ_ONLY_TOOL_NAMES`** | `mcp-loader.ts:414-426,447-457` + `security-policy.ts:77-81` |
| **受信 builtin 插件声明的 `readOnly: true` CLI 命令**（当前无实例） | `security-policy.ts:88-96` + `cli-loader.ts:583`（非 trusted 插件强制 `forceApproval`） |
| `minimal` 的 `run_command`（命令看起来不危险时） | `tools.ts:71-72` —— 但它是 echo，取不到数据 |

**今天一定弹审批的动作：**

| 动作 | 依据 |
|---|---|
| **任何 `execute_command`**（含所有 `lark-cli` 调用） | ADR-0017:49；`create-agent.ts:128` |
| 任何 FS 写 / 编辑 / 删除 / mkdir / rmdir | `create-agent.ts:117-122` |
| **任何 MCP 工具，只要没被 env 精确 allowlist** | `security-policy.ts:77-81`：`allow.size === 0` 直接 `return true`（fail-closed），所以**内置白名单为空 = 全员需审批**；`github-package.ts:76-84` **没有声明 `readOnlyToolNames`** |
| passthrough argv 形态的 CLI 工具 | `cli-loader.ts:419-420`（写死 `true`） |
| 非受信（`PLUGIN_PATHS` 发现的）插件的一切 CLI 命令 | `cli-loader.ts:583` |

**因此对 #120（刷新语义）的确切含义：**

- 「刷新 = 让 agent 跑一段生成的取数代码」→ **必然弹审批**，且是逐次弹。做不成静默刷新，也做不成后台定时（首版不做调度，但这条对二期是硬约束）。
- 「刷新 = 调一次 GitHub 只读 MCP 工具」→ **可以静默**，条件是运维在侧车 `.env` 里把用到的工具名逐个写进 `MCP_READ_ONLY_TOOL_NAMES`。这是**部署配置，不是产品内开关**，对模板用户不可见、不可靠。
- 「刷新 = 调一次飞书能力」→ **必然弹审批**（只有 `execute_command` 一条路）。
- 审批卡本身的载体是 Task Timeline：`approval.requested` / `approval.resolved` 走 Task envelope，恢复流靠 `resumeWithToolPart`（`voltagent-runtime-adapter.ts:645-683`）。**Board 若不在某个 Task 里刷新，今天没有地方显示审批卡、也没有地方恢复被挂起的 Run。**【推断，基于上述通道全是 task-scoped】

---

## 4. Q4 — 作业产物回渲染层的通道与容量

（先答 Q4，因为 Q3 的诚实表达依赖这里的通道结论。）

### 4.1 通道 ①：tool 返回值 → `tool.completed` envelope → Timeline

链路：侧车 tool 返回 → VoltAgent fullStream → `mapFullStreamChunk`（`task-runtime/voltagent/fullstream-to-envelope.ts`）→ envelope → `projectEvents`（`task/projection/project-events.ts`）→ Timeline。

`tool.completed` payload 构造（`fullstream-to-envelope.ts:385-399`）：

```
{ toolId, toolCallId, toolName, name, label, args,
  output: sanitizeToolOutputForEnvelope(output),
  summary: normalizeToolOutput(output).summary,
  items: normalizeToolOutput(output).items,
  isError }
```

容量（`task/runtime/tool-output-normalize.ts`）：

| 字段 | 上限 | 行 |
|---|---|---|
| `summary` | 4,000 字符 | `:7` |
| `items` 条数 | 80 条 | `:10` |
| `items` 单条 | 240 字符 | `:13` |
| 多行拆分前扫描窗口 | 80×240+2,000 ≈ 21.2 KB | `:16-17` |
| `output` 残留（`sanitizeToolOutputForEnvelope`） | 仅把 `content` / `text` / `data` / `message` / `error` / `hint` 这几个**字符串键**截到 4,000 字符 | `:178-198` |

**关键细节【推断】：** `sanitizeToolOutputForEnvelope` 对对象做的是浅拷贝 + 只清洗上述固定键（`:188-196`）。也就是说一个返回 `{ "artifact": { ...大 JSON... } }` 的工具，其 `artifact` 会**原样进 envelope payload 并原样落 IDB `events`**——既没有大小上限也没有脱敏。这既是「小 JSON 产物可以直接走 tool output」的可行性依据，也是一个 footgun（IDB 无界增长 + 密钥可能绕过 redact）。#119 定合同时要显式约束。

同链路另有 redact：`redactSecrets`（`:28-36`）只作用在被清洗的字符串字段上。

### 4.2 通道 ②：`work_surface.open_requested`（Runtime → Composition）

- 事件类型声明：`task/protocol/events.ts:78-79`，注释明确「Composition consumes; **not a timeline fact**」。
- 消费点：`task/application/task-runtime-controller.ts:645`（`setWorkSurfaceOpenListener`）→ `app/composition/surface-assembly.tsx:203-224`。
- **payload 只有 `{ kind?, resourceKey, title?, focus? }`**（`surface-assembly.tsx:83-88`），并且要通过 `resolveOpenWorkSurfaceIntent` 校验才生效。
- 结论：这是**指针通道，不是数据通道**。它对 Board 的价值是「让生成过程看得见」（#111 已锁定的会话内右侧 Board 预览可以复用这条通道打开 Board Surface），不是搬运 widget 数据。

### 4.3 通道 ③：`GET /workspace/file`（带外字节，**不经模型、不经审批**）

- 路由：`configure-sidecar-app.ts:66-94`（`mountWorkspaceRoutes`）。
- 实现：`workspace-file-api.ts:66-137`，默认 `maxBytes = 25 * 1024 * 1024`，可用 query `maxBytes` 收紧（`configure-sidecar-app.ts:70`）。含 realpath containment、`403` 越界 / `404` 不存在 / `413` 过大。
- 渲染层消费：`work-surface/adapters/http-workspace-document-content.ts:104`，按格式族收紧上限——文本/代码/markdown **1.5 MiB**、图片 15 MiB、PDF/office 25 MiB（`work-surface/surfaces/document/path-utils.ts:13-17`）。
- 反向配套：`GET /workspace/info` 返回 `{ workspaceRoot, profile }`（`configure-sidecar-app.ts:58-64`），渲染层已在用（`project/application/sidecar-workspace-ready.ts:29`）。
- 网络到达：Vite 代理 `/voltagent-runtime` → `127.0.0.1:3141`（`archetypes/agent-workbench/vite.config.ts:65-70`）。
- **这是当前唯一能承载 MB 级产物的通道，且它已经 shipped。**

### 4.4 通道 ④：`/capability/*` HTTP

`capability/http-routes.ts`：`GET /capability/snapshot`、`POST /capability/selection`、`POST /capability/auth/start`、`POST /capability/active-task`、`POST /capability/auth/refresh`、`POST /capability/auth/revoke`。只承载状态与选择，不承载业务数据。渲染层适配器 `capabilities/adapters/http-capability-snapshot.ts:57-110`。

**它证明了一件对 §5 很重要的事：侧车上加一条与 Agent 流无关、渲染层直连的 POST 路由，是本仓已有先例的做法（含 `POST /capability/active-task` 这种「渲染层告诉侧车当前 Task」的写路由）。**

### 4.5 Board 全局实体 vs Task-scoped EventStore：硬错配清单

| 约束 | 位置 |
|---|---|
| `events` store 主键 = `['taskId','taskSequence']`，索引 `taskId` | `app/persistence/workbench-idb-schema.ts:75-81` |
| `snapshots` store 主键 = `taskId` | `workbench-idb-schema.ts:82-84` |
| `EventStorePort.read/getSnapshot/deleteTaskData` **全部**以 `taskId` 为轴 | `task/ports/event-store-port.ts:17-24,75-97` |
| `AgentRuntimeEventEnvelope.projectId` / `.taskId` 是**必填**（非可选） | `task/protocol/events.ts:10-11` |
| IDB 只有 7 个 store，`WORKBENCH_IDB_VERSION = 1` | `workbench-idb-schema.ts:10-39` |
| Runtime 的 `conversationId` 就是 `taskId`；MCP/CLI 门禁靠它判定 | `voltagent-runtime-adapter.ts:864` + `capability/turn-context.ts:21` |
| `RuntimePort.subscribe/getSnapshot/startRun` 全部 task-scoped | `task/ports/runtime-port.ts:69-89` |

**含义：**
1. Board / Board Widget / Widget Data Job 三实体要新 store + schema bump（#111 已锁定），**这部分与 EventStore 无关，不冲突**。
2. 但只要「刷新」想复用 Runtime 事件流（`tool.completed` / 新增 `board.*` 事件），就必须提供一个 `taskId`。选项只有：(a) 刷新永远发生在某个真 Task 的 Turn 内；(b) 给 Board 造一个合成 Task / conversation id —— 会在 `tasks` 目录与 `events` 里留下孤儿行，且 Navigator「仅显示真目录」的既有硬规则（workbench `AGENTS.md`）会被冲击；(c) 刷新完全不走 Runtime 事件流（走 §4.3 + 新 HTTP 路由）。
3. `check-workbench-boundaries.mjs:572-583` 硬编码 6 个必需 module 的 `index.ts`，新增 `src/modules/board` 需同步（#111 已记）。

---

## 5. Q3 — Connector 作为取数通道

### 5.1 能不能被 Job 复用

**门禁算法（invoke 时，`capability/tool-gate.ts:76-126`）：**

```
连接器工具可执行 ⟺ taskId ≠ null
                  ∧ pluginGloballyEnabled
                  ∧ authStatus = connected
                  ∧ taskSelected（该 Task 选用了此 Connector）
                  ∧ toolName ∈ expandConnectorToolScope(connector)
```

- `taskId` 为空 → `missing_task_context`，中文提示「连接器工具缺少当前 Turn 的 Task 上下文，已拒绝执行」（`tool-gate.ts:85-92`）。
- 进模型之前还有一道过滤：`filterToolsForTaskSelection`（`tool-gate.ts:61-70`）与 `connectorRuntime.toolsFor(turnContext)`（`create-agent.ts:288-291`），未选用的 Connector 工具**根本不出现在本 Turn 工具集**里。
- Turn 上下文来源：渲染层 submit body 的 `options.context.capabilityConnectorIds` + `options.memory.conversationId`（`voltagent-runtime-adapter.ts:856-869`），侧车侧解析 `turn-context.ts:15-34`。
- 命令侧同理：`connector-aware-sandbox.ts:105-114` 先读 turn context 再 `resolveConnectorAccess`，失败抛 `connector_access_denied:<id>:<reason>`。

**结论：**
- **可以复用，但代价是 Job 必须携带一个 Task 上下文和一份连接器选择。**【推断】`readCapabilityTurnContext` 只读 `conversationId` 字符串，因此技术上可以塞一个合成 id；但那等于给 Board 造影子 Task，见 §4.5 第 2 点。**未验证**（未跑侧车确认合成 id 不会被 memory / libsql 侧其它逻辑拒绝）。
- 两个内置 Connector 的通道形态（`ADR-0017 §4`，`CONTEXT.md:156`）：
  - **GitHub → `mcp.github`**（官方远程 MCP `https://api.githubcopilot.com/mcp/`，工具以 `github__` 前缀动态发现；`github-package.ts:21-23,76-84`）。**这是唯一能不经 shell 就取到真外部数据的路径。** 但它**没声明 `readOnlyToolNames`**，所以默认每个工具都要审批。
  - **飞书 → `cli.feishu`**（只贡献 `commandScopes: ['lark-cli']` + CLI session auth + 官方 `lark-*` Skills 安装源；`feishu-package.ts:68-183`）。**没有任何业务 wrapper tool**，只能经 `execute_command` → 必审批。默认还**不启用**（README:130：需 `PLUGINS_ENABLED=cli.feishu`）。
  - `mcp.docs` / `mcp.calendar` 需要运维配 URL/COMMAND 才存在（`builtins.ts:76-152`），且**不投影为产品级 Connector**（README:132-133）。

### 5.2 Enabled 与 Connected 在 widget 上怎么表达才诚实

**词汇（根 `CONTEXT.md:171-177`）：**
- **Enabled**：Plugin 或其贡献已装进当前 Runtime 可用集合；**启用 ≠ 用户已完成外部服务登录**。
- **Connected**：Connector 所需身份材料可用；与 Enabled 分立，**可以「已启用但未连接」**。

**读模型已经有全部需要的字段**（`capabilities/ports/capability-snapshot-port.ts:15-48`）：
`enabled` / `connected` / `connectionState`（`connected|missing|expired|error|none_required|auth_in_progress|unavailable`）/ `taskSelected` / `capabilityEffective` / `reasons[]` / `availability`（`sidecar|fake-catalog-only|missing-binary`）。侧车侧对应判定在 `plugin/effective-capabilities.ts`，中文理由映射在 `tool-gate.ts:128-147`（`插件未全局启用` / `连接器未连接` / `本 Task 未选用该连接器` / `授权已过期` / `未连接`）。

**对 widget 的建议（这是我的推断，不是既有实现）：**

1. **widget 自己不应知道授权状态。** widget 跑在 `srcdoc + sandbox="allow-scripts"` 的不透明源里（#111 锁定），把 `connectionState` 送进去只有坏处：它无法可信渲染、也无法引导授权（授权入口在 Capability Surface / Composer chip）。widget 的宿主桥应只收到 `data`，以及一个**不含原因细节的粗粒度 `state`**（如 `ready | stale | unavailable`）。
2. **「未连接时 widget 显示什么」应该由宿主 chrome 回答，不由 widget 回答。** Kimi 实操证据已表明 widget 头部的 刷新/全屏/更多 是**宿主绘制的 chrome**（#111 Notes），我们把「未连接 → 显示「飞书未连接，去连接」+ 跳 Capability Surface」放在同一层 chrome 上，语义与既有 `reasons[]` 一一对应，且不需要 widget 配合。
3. **widget 主体在未连接时应显示上次成功数据 + degraded 标记，而不是空白或报错。** 这与 Kimi 的「失败/超时/取消的 run 不覆盖上一次成功数据」和 `widget 状态机 idle/running/needs_input/error/degraded/cancelled`（#111 Notes）一致，但**我们今天没有任何 run 记录实现**，所以「上次成功数据」需要 Board 模型自己存（新 store 的字段设计问题，属 #119/#120）。
4. **ADR-0018 的诚实报错在 widget 上的呈现**：无侧车时 `capabilities/adapters/http-capability-snapshot.ts` 的 fetch 会失败，Runtime 侧 `voltagent_stream_error` + `run.failed`（`voltagent-runtime-adapter.ts:968-980`，ADR-0018 Decision 2）。**Board 页面在无侧车时应当能打开并渲染已存数据（widget HTML 与 data 都在 IDB，不依赖侧车），只有「刷新」按钮变为不可用 + 错误条。** 这符合 workbench `AGENTS.md` 硬规则 12「不得把『未接后端』做成『控件不可用』」的反面要求——这里控件不可用是**真实**的（侧车确实没了），必须给出「请启动侧车」的具体指引而不是静默失败。

---

## 6. Q5 — 缺口清单与可选路径（不做决策）

### 6.1 最小必需缺口（为支撑首版「手动刷新取数」）

| # | 缺口 | 现状 | 必需性 |
|---|---|---|---|
| G1 | **取数执行体**：谁真的去拿外部数据 | GitHub MCP（需审批）/ `execute_command`（必审批）/ 无 HTTP 工具 | **必需**。任意非 GitHub 数据源今天零路径。 |
| G2 | **免审批语义**：让「点一下刷新」不弹卡 | 唯一开口是 `MCP_READ_ONLY_TOOL_NAMES` 运维 env | **必需**（若产品要求静默）。否则首版刷新必须承认「会弹审批」。 |
| G3 | **Job 运行时语义**：超时 / run 记录 / 并发不重入 / 失败不覆盖 | **全部不存在** | 首版可裁剪到「超时 + 失败不覆盖」两条；`already_running` 与 run 记录可延后（#111 已把「启停开关与近期运行记录 UI」列 Not yet specified）。 |
| G4 | **产物回 Board 的通道**：Board 是全局实体，EventStore 是 task-scoped | `GET /workspace/file` 可搬字节；无 Board 写入事件；envelope 必填 taskId | **必需**，且是三条候选路径的主要分歧点。 |
| G5 | **触发通道**：渲染层如何让侧车「跑一次 job」 | 只有 `POST /agents/workbench/stream`（要 Task+模型）与 `/capability/*` | **必需**。 |
| G6 | **Board 侧持久化**：新 store + schema bump + `check:workbench` required 列表 | IDB v1 / 7 store / 6 必需 module | 必需，但与侧车无关（属 Board 实施 ticket）。 |

### 6.2 候选路径 A：**零侧车改动**——把「刷新」实现为一次真 Task Turn

刷新 = 在某个 Task 里 `submitTurn`，prompt 携带 widget 的 job 描述；agent 用现有工具取数并**写进工作区文件**；渲染层再经 `GET /workspace/file` 读回、写 Board store。

- **代价**：① 每次刷新烧一次 LLM（慢、贵、非确定性，与「刷新」的用户心智不符）；② 只要用到 `execute_command` 或未 allowlist 的 MCP 工具就**弹审批**，做不成静默；③ 需要一个承载 Turn 的 Task → 与「Board 是全局实体」错配，会产生孤儿 Task 或污染用户的对话列表；④ G3 全缺；⑤ 写文件本身也需审批（`write_file` needsApproval）。
- **收益**：**真的零侧车改动**，可以立刻端到端验证「侧车能不能拿到数据」，作为 spike 有价值。
- **适合**：把它当**可行性验证**，不当产品路径。

### 6.3 候选路径 B：**新增侧车 Job HTTP 路由**（不经模型）

在 `configureSidecarApp` 加 `POST /widget-data-job/run`（形态对齐已有 `POST /capability/*`），执行体是侧车侧**确定性代码**（不经 LLM）；大产物写工作区文件、小摘要直接回 JSON；渲染层直接 fetch（Vite 代理已就绪）。

- **代价**：① 必须先回答「执行体是什么」——声明式取数描述？受限 HTTP allowlist？复用 `connectorRuntime.execute`？**这正是 #119 要定的合同**；② 绕过了 HITL 审批面，需要显式安全论证：ADR-0017:49 的不变量是「**任意命令执行**的最终边界是审批」，一个**不执行任意命令**的受限声明式取数器不必然违反它，但**必须在 ADR 里写清边界**，否则就是偷偷开后门；③ 凭据可达性：Connector 凭据今天由 `connectorRuntime` / Keychain / child env 持有，HTTP 路由复用它是可行的（`/capability/auth/*` 已是先例），但要重新处理 `taskId` 门禁（§5.1）；④ 新增一套 run 记录/超时/不重入需要自己写（G3）。
- **收益**：**能做到「点一下就静默取数」**；不烧 LLM；天然可挂超时/不重入/run 记录；**完全不碰 Task EventStore**，绕开 §4.5 的硬错配；与「Board 全局实体」天然对齐。
- **适合**：产品路径的主要候选。

### 6.4 候选路径 C：**新增取数工具 + Board 写入事件**（走 Runtime 流）

给侧车加一个 `readOnly` 的受限取数工具（HTTP allowlist 或包成受信 builtin 的声明式 CLI command，从而落进 `security-policy.ts:88-96` 的免批口子），并新增 `board.widget_data_updated` 类事件 + 一条 Composition-only 的 Board 写入通道（形态照抄 `work_surface.open_requested`）。

- **代价**：① **要动 `task/protocol/events.ts` 的事件全集**，而 `docs/plans/sidecar-plugin-system-spec.md:187` 明确把它列为 Out of Scope（需要新 ADR 或显式豁免）；② envelope 仍必填 `taskId`（§4.5），Board 全局性没解决；③ 免审批要在 fail-closed 策略上开产品级开口（不能只靠运维 env），这是安全面的实质改动；④ 生成期（agent 建 widget）与刷新期共用一条通道，看起来优雅，但把 Board 的生命周期永久绑到 Task 事件流上。
- **收益**：复用现成 projection / 持久化 / Timeline 可见性；agent 建 widget 时「顺手跑一次」（Kimi 实操证据里 agent 建完组件主动跑一次）在这条路上最自然。
- **适合**：如果 #119 决定「Board 写入必须经 Runtime 事件流」，那这条是必然形态。

### 6.5 三条路径的正交事实（无论选哪条都成立）

1. 大产物走 `GET /workspace/file` 是**免费的**（已 shipped，25 MiB，无审批）——**建议不要**发明第二套 blob 通道。
2. 小 JSON（≲ 4 KB 摘要）走 tool output 是可行的，但 `sanitizeToolOutputForEnvelope` 的浅拷贝行为（§4.1）意味着大 JSON 也会**悄悄**全量进 IDB——#119 必须显式约束 payload 上限。
3. 「Board 页面在无侧车时可读、刷新按钮诚实失败」不依赖任何一条路径，属 ADR-0018 的既有义务。
4. 任何用到 Connector 的方案都要先解决 `taskId` 门禁（§5.1）。

---

## 7. 对下游 ticket 的直接影响

**对 #120（刷新语义）：**

1. **「静默刷新」在当前合同下只有一条既有缝隙**（`MCP_READ_ONLY_TOOL_NAMES` 运维 env），凡走 `execute_command` 的刷新**必然逐次弹审批**（ADR-0017:49）。#120 必须先选：承认「刷新会弹审批」，还是把刷新做成不经 `execute_command` 的受限取数（路径 B/C）。
2. **审批卡今天只能长在 Task Timeline 上**，Board 若不在 Task 里刷新，就没有承载审批 UI 与 Run 恢复的地方（`voltagent-runtime-adapter.ts:645-683`）。
3. **Kimi 那套 run 语义（60 s 超时 / run 记录 / `already_running` / 失败不覆盖）我们一条都没有**，#120 要决定首版裁到多薄。我的建议裁剪线是「超时 + 失败不覆盖上次成功数据」两条。
4. **无侧车时 Board 必须可读**（widget HTML 与 data 都在 IDB），只有刷新失败；这是 ADR-0018 的既有义务，不是新增需求。

**对 #119（工具族合同）：**

5. **侧车零 HTTP 取数能力**是 #119 的起点事实：不管合同怎么写，要么新增取数能力，要么把首版数据源限定到 GitHub MCP。
6. **`tool.completed` payload 的截断行为不对称**（`summary` 4 KB 硬顶，但 `output` 里非固定键的对象**原样落 IDB**），#119 必须显式规定 Board 产物的 payload 上限与「大产物走 `/workspace/file`」的分界线。
7. **Board 写入通道若走事件流，会撞 `docs/plans/sidecar-plugin-system-spec.md:187` 的 Out of Scope**（不改 RuntimePort 事件全集），需要新 ADR 或显式豁免。
8. **连接器工具面的 `taskId` 门禁**（`tool-gate.ts:85-92`）要求 Board 刷新携带 Task 上下文，或明确走「不经 Agent 工具」的路径 B；#119 的工具族形态直接决定这一点。
9. **免审批不能靠运维 env**：若合同要求某些 board 工具免批，需要在 `security-policy.ts` 的 fail-closed 之上引入产品级 allowlist 机制（当前只有 `readOnly` + 受信 builtin 一条口子，且无实例）。

---

## 8. 未验证 / 诚实边界清单

| # | 项 | 为什么未验证 |
|---|---|---|
| 1 | GitHub 官方 MCP 实际返回的工具名清单与只读工具集合 | 需要连侧车 + 完成 OAuth（本轮禁止起进程）。`github-package.ts` 只声明前缀，工具名以 `tools/list` 为真源。 |
| 2 | 侧车宿主是否有可用的 Python / 其它解释器 | 需要执行探测命令。**本轮未探测。** 与之相关：`LocalSandbox` 的 `allowSystemBinaries: false` + 隔离提示（`office-workspace-sandbox.ts:39-46` 注释称 macOS 系统目录 allowlist 对 `/usr/bin` 工具过窄会 SIGABRT），实际可执行范围**未验证**。 |
| 3 | `WORKSPACE_SANDBOX_ALLOW_NETWORK` 默认允许网络（`office-workspace-sandbox.ts:41` 读作 `!== '0'`）在真实 `sandbox-exec` 下是否真的放行出网 | 需要跑侧车验证。 |
| 4 | 合成 `conversationId`（给 Board 造影子 Task 上下文）是否会被 VoltAgent memory / libsql 层拒绝或产生副作用 | 需要跑侧车。§5.1 的可行性是**推断**。 |
| 5 | `GET /workspace/file` 在 25 MiB 附近的真实表现（Hono `c.body` + 渲染层解码内存占用） | 需要跑侧车 + 浏览器。 |
| 6 | envelope payload 携带大 JSON 时 IDB 写入的实际配额行为（`EventStorePortError.code = 'quota_exceeded'` 是否触发） | 需要浏览器。 |
| 7 | Kimi 侧的参照事实（托管 CPython 3.12 跑 `run(ctx)`、`{"artifact":{...}}`、输出文件环境变量、60 s 超时、`already_running`） | 来自 #111/#114 记录的本机逆向，**本轮未复核**，按「可信的外部参照」引用。 |
| 8 | `docs/plans/sidecar-plugin-*.md` 三份文档间的细节冲突 | 只读了 `sidecar-plugin-system-spec.md`；`sidecar-plugin-architecture.md` / `sidecar-plugin-authorization.md` / `builtin-plugin-package-seam.md` 未逐行核对。该 spec 自述冲突时以其 Implementation Decisions 为准（`:212`）。 |

**发现的文档过期点（建议由后续 ticket 修，本轮不改文件）：**

- `tooling/workbench-runtime-voltagent/README.md:103`「sandbox **未启用**」与 `create-agent.ts:274`（`sandbox: {}`）、`profile.ts:96`、README 自身 `:137` 矛盾 → **stale**。
- `tooling/workbench-runtime-voltagent/README.md:5`「Fake Runtime 与 capture replay 仍是 first-class」→ 与 **ADR-0018** 矛盾（Fake 已删）。
- `docs/plans/sidecar-plugin-system-spec.md:192`「通用 shell/terminal 工具」列 Out of Scope → 已被 ADR-0017 §3 取代。
- `archetypes/agent-workbench/src/modules/task/protocol/events.ts:24` 注释仍提「Fake 4B emits a subset」→ ADR-0018 后无 Fake。
