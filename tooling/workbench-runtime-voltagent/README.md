# Workbench VoltAgent Sidecar

Local **Agent Runtime** process for `@uilab/agent-workbench`’s `VoltAgentRuntimeAdapter`.

**Honesty:** This is a **local sidecar** for development. It is **not** a multi-tenant production Runtime. Fake Runtime and capture replay remain first-class for tests and offline demos.

## Requirements

- Node 20+
- Model API key（默认使用 **DeepSeek 专用 Provider**：`https://api.deepseek.com`）

## Setup

```bash
# from monorepo root
pnpm install
cd tooling/workbench-runtime-voltagent
cp .env.example .env   # 填入 DEEPSEEK_API_KEY（.env 已被 gitignore）
```

## Profiles

| `AGENT_PROFILE` | 形态 | 工具 |
| --- | --- | --- |
| `minimal`（默认） | plain `Agent` + DIY tools | `read_file` / `write_file`（审批）/ `run_command` |
| `office` | **`Agent` + `Workspace`**（Node FS + Skills） | Workspace FS + `workspace_*_skill*`；**写/删默认 needsApproval** |

### Workspace root 策略（O2）

| 优先级 | 规则 |
| --- | --- |
| 1 | 显式 `WORKSPACE_ROOT`（绝对路径）始终优先 |
| 2 | `AGENT_PROFILE=office` 且未配置 → **`~/VoltAgent-Office/workspace`** |
| 3 | `minimal` 且未配置 → 历史 monorepo 相对默认（`cwd/../../`） |

**禁止默认：** 用户 home 本身、整个 Documents、monorepo 仓库根作为 Office 工作区。

**首次启动：** Office 会 `mkdir -p` 工作区根，并在根下写入简短 `README.md`（已存在则不覆盖）。侧车启动日志打印 `workspaceRoot=…` 便于排障。

**越界：** DIY `read_file`/`write_file` 与 Workspace `contained + virtualMode` 均拒绝根外路径；错误文案含「路径越界」。

```bash
# .env
AGENT_PROFILE=office
# WORKSPACE_ROOT=/absolute/path/to/your/folder
```

## Run（DeepSeek）

```bash
# .env 内配置，例如：
# VOLTAGENT_MODEL_PROVIDER=deepseek
# DEEPSEEK_API_KEY=sk-...
# DEEPSEEK_BASE_URL=https://api.deepseek.com
# VOLTAGENT_MODEL=deepseek-v4-flash
# VOLTAGENT_MODEL_API=chat
# AGENT_PROFILE=office
# WORKSPACE_ROOT=/absolute/path/to/office-folder

pnpm --filter @uilab/workbench-runtime-voltagent dev
```

| Model id | Notes |
| --- | --- |
| **`deepseek-v4-flash`**（默认） | V4 快档；专用 Provider 保留并回传多步工具所需的 `reasoning_content` |
| `deepseek-v4-pro` | V4 旗舰；同样使用 Chat Completions |
| `deepseek-chat` / `deepseek-reasoner` | Legacy 别名，官方计划停用；勿作新默认 |

**API 表面：** DeepSeek 固定使用 `@ai-sdk/deepseek` 的 Chat Completions 路径。该 Provider 把响应中的 reasoning 映射成标准 AI SDK part，并在工具结果后的下一次请求回传 `reasoning_content`。`VOLTAGENT_MODEL_API=responses` 只允许与显式 `VOLTAGENT_MODEL_PROVIDER=openai` 一起使用。

Server default: `http://127.0.0.1:3141`
Agent id: `workbench`

## Connect Workbench UI

```bash
# terminal 2 — Vite proxies /voltagent-runtime → :3141 (no CORS hassle)
export VITE_RUNTIME_ADAPTER=voltagent
# optional override: export VITE_VOLTAGENT_BASE_URL=http://127.0.0.1:3141
export VITE_VOLTAGENT_AGENT_ID=workbench
pnpm dev:workbench
```

Then open empty / 新对话 and send a message. Capture tasks still use local-sim / replay.

## Tools

### minimal (DIY)

| Tool | Notes |
| --- | --- |
| `read_file` | Read UTF-8 under `WORKSPACE_ROOT` |
| `write_file` | Write under root; **needsApproval** |
| `run_command` | Demo only (no real shell); approval if command looks destructive |

### office (Workspace FS)

| Tool | Notes |
| --- | --- |
| `ls` / `list_tree` / `read_file` / `stat` / … | 只读，Timeline 工具行可展开 |
| `write_file` / `edit_file` | **needsApproval**；成功后 Adapter 合成 `file.changed` |
| `delete_file` / `rmdir` | **needsApproval** |
| sandbox | **未启用**（攻击面收敛） |
| skills | **O3 已启用**：`/skills` 下 `meeting-notes` / `weekly-report` / `research-brief` |
| MCP | **O4 可选**：文档/知识库 + 日历（env 启用；失败诚实降级） |

Paths outside the workspace root are rejected by `NodeFilesystemBackend`（`contained` + `virtualMode`）与 DIY `resolvePathWithinRoot`。

### Workspace file HTTP（Document Surface 真读）

Workbench UI 在 `VITE_RUNTIME_ADAPTER=voltagent` 时经 Vite 代理调用侧车只读 API（**不是** Agent tool call）：

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/workspace/info` | `{ workspaceRoot, profile }` |
| `GET` | `/workspace/file?path=<rel>&maxBytes=` | 根内只读字节；`403` 越界 / `404` 不存在 / `413` 过大 |

`path` 为工作区相对路径（可带虚拟前导 `/`）。Fake 路径仍用 Memory fixtures，不访问侧车。

### 插件系统（PluginRegistry）

office 装配**只经** `createPluginRegistry().load()` 聚合：

| Builtin 插件 | 贡献 | 启用 |
| --- | --- | --- |
| `mcp.github` | 产品级 `connector.github`；GitHub 官方远程 MCP；`tools/list` 动态工具以 `github__` 前缀公开 | **默认启用**；用户点击连接后走平台 UI Lab Connector 一键授权；可用 `MCP_GITHUB_URL` 覆盖端点 |
| `mcp.docs` | 文档/知识库 MCP | `MCP_DOCS_URL` / `FEISHU_DOCS_MCP_URL` 或 `MCP_DOCS_COMMAND` + `MCP_DOCS_ARGS` |
| `mcp.calendar` | 日历 MCP | `MCP_CALENDAR_URL` / `FEISHU_CALENDAR_MCP_URL` 或 `MCP_CALENDAR_COMMAND` + `MCP_CALENDAR_ARGS` |
| `skills.office` | `/skills` 下三 skill + output 目录 | 默认启用；`PLUGINS_DISABLED=skills.office` 可关 |
| `cli.feishu` | `connector.feishu` metadata；官方 `lark-*` Skills 安装源；`commandScopes=['lark-cli']`；CLI session auth；无飞书业务 wrapper tools | **默认关闭**；`PLUGINS_ENABLED=cli.feishu` **叠加**默认集 + `FEISHU_CLI_PATH` / `FEISHU_SKILLS_ROOT`；Connected=`cli_session`（非宿主 OAuth） |

产品级 Connector 目录当前只有两项：GitHub（MCP）与飞书（CLI）。`mcp.docs`、
`mcp.calendar`、`skills.office` 是已有内部能力包，不投影为额外产品 Connector。

其他自托管 MCP 可选：`MCP_*_BEARER_TOKEN` / `MCP_BEARER_TOKEN`；它们不适用于 builtin `mcp.github`。另有 `MCP_TIMEOUT_MS`、`PLUGINS_ENABLED` / `PLUGINS_DISABLED`、**`PLUGIN_PATHS`**（逗号分隔目录，扫描 `plugin.json` 或子目录包；支持 Provider-owned `contributes.connectors`；**不**加载任意外部 JS，禁止 `contributes.tools`）。
MCP **默认全部 tools `needsApproval`**；仅 `MCP_READ_ONLY_TOOL_NAMES=exact_name,...` 精确免批。
Office Workspace 同时暴露通用 `execute_command`，**每次**都需 Host 审批。普通命令走“主机只读 + Workspace 可写”OS 隔离（网络默认允许，可用 `WORKSPACE_SANDBOX_ALLOW_NETWORK=0` 关闭）；Provider command scope 还需 Plugin enabled + Connected + active Task selected，并由固定可执行文件、闭合 env、超时/输出上限保护。飞书通过该通用 Shell 执行原生 `lark-cli`，不生成业务 Function Tools。
MCP 工具登记 canonical identity `(pluginId, channelId, originalName)`；模型名冲突或 normalize 时保留可逆映射。通用 CLI loader 仍可服务其它声明式插件，但不是飞书内置连接器的执行路径。
stdio/CLI child env 按 `childEnvKeys` 隔离；**模型密钥永不转发**。
MCP 连接失败不崩溃；Skills seed 路径越界 fail-closed。其他自托管插件的密钥只放 Sidecar SecretStore；builtin GitHub 的 Provider Secret 只在平台 Broker。Renderer 无 MCP SDK。

GitHub 产品连接流程不接受终端用户配置 App 凭据或 PAT。Workbench 点击「连接」后，
Sidecar 向平台 Connector Broker 创建一次性授权会话并打开 UI Lab Connector 的 GitHub
授权页；平台持有 GitHub App Client Secret 与 hosted callback。Sidecar 只持有短期 claim
capability，轮询成功后把 access/refresh material 写入 Keychain，并热加载 MCP tools。

`UILAB_CONNECTOR_BROKER_URL` 是平台发行/运维配置，不是终端用户设置。未部署 Broker 时
连接动作诚实失败为“平台连接服务尚未配置”，不会回退到 PAT 或要求用户创建 GitHub App。

飞书官方 Skills + 原生 Shell 验收（不调用模型）：

```bash
pnpm --filter @uilab/workbench-runtime-voltagent capability:feishu-shell-smoke
```

探针会在临时 Workspace 内同步官方 `lark-*` Skills，通过真实 CLI session + Task selection gate 执行 `lark-cli --version` 与 `lark-cli skills list`，并验证只暴露通用 `execute_command`。

启动日志示例：`mcp=github=ok(N),docs=off,calendar=off`；飞书无 CLI tool-loader 状态；`auth=cli.feishu/cli:feishu=connected,...`。

**Auth（启用 ≠ 登录）：** 插件可声明 `contributes.auth`（`env_ref` / `static_bearer` / `cli_session` / `oauth2`）。GitHub builtin 的 `oauth2` 固定为 `managed_broker`；缺平台 Broker 时 fail-closed。`cli_session` 可用 `statusCommand` 探测。

- **#28 inject/revoke：** doctor 状态与 MCP HTTP Bearer / 子进程 secret env **同一 resolve 路径**；`AuthBindingStore.clear` 会 revoke；`expiresAt` → `auth=expired`。
- **#29 持久绑定：** 非密 AuthBinding 默认落盘 `$UILAB_RUNTIME_DIR` 或 `~/.uilab/runtime/auth-bindings.json`（**不**进 workspace / git）。`UILAB_PERSIST_AUTH=0` 可关。
- **#30 Keychain：** `SecretRef.backend=keychain` 在 macOS 走 `security`；CI 用 `UILAB_KEYCHAIN_MODE=fake`；`migrateEnvSecretsToKeychain` 可从 `.env` 迁入。
- **#32 Operator auth：** `pnpm plugin:auth status|login|logout`；login 仅 `--from-env`；logout 与 inject revoke 一致。
- **#31 OAuth / managed broker：** GitHub Provider App secret、callback 与 refresh 归平台 Broker；Sidecar claim 后 token 进 Keychain，失败 → `auth=expired`。doctor 摘要**永不**打印 secret。

**运维 list/doctor（非 Agent 终端）：**

```bash
pnpm --filter @uilab/workbench-runtime-voltagent plugin:list
pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor
pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor -- --json
```

### 长任务默认（O5）

| 配置 | 默认（office） | 说明 |
| --- | --- | --- |
| `VOLTAGENT_MAX_STEPS` | **80**（≥50，推荐 80–100） | 可覆盖；minimal 默认 12 |
| `VOLTAGENT_SUMMARIZATION` | **on** | `false`/`off` 关闭 |
| `VOLTAGENT_MEMORY` | **libsql** | `in-memory` / `off` 可选 |
| `VOLTAGENT_MEMORY_URL` | `file:<workspace>/.voltagent/memory.db` | LibSQL 文件 URL |

Adapter 已将 `conversationId` 对齐 `taskId`，同 Task 多轮可续上下文。
侧车启动日志打印 `maxSteps` / `summarization` / `memory`。

**披露：** UI 标明「本机 VoltAgent Runtime · 非远程生产集群」（profile 由侧车 `AGENT_PROFILE` 决定）；侧车 log 在 office 时注明 Office；Fake 路径文案不变。

### Office Skills（`skills.office` builtin）

首次启动 office 时 Registry 会：

1. 将 `bundled-skills/*` 复制到工作区 `skills/<id>/SKILL.md`（**已存在不覆盖**）
2. 创建交付目录：`output/meeting-notes/`、`output/weekly-report/`、`output/research-brief/`
3. 启用 Workspace skills toolkit（`workspace_list_skills` / `activate` / `read` …）

| Skill | 交付路径 |
| --- | --- |
| `meeting-notes` | `output/meeting-notes/` |
| `weekly-report` | `output/weekly-report/` |
| `research-brief` | `output/research-brief/` |

Fake Runtime / capture 路径**不**加载这些 skills。

## API used by Adapter

- `POST /agents/workbench/stream` — SSE fullStream events
- Optional: `POST /agents/workbench/approvals` — best-effort approval notify

## Security

- Keys stay in the sidecar env, not in the Vite browser bundle.
- File tools are confined to the resolved workspace root.
- Office write/delete default to HITL approval.
- Do not expose the sidecar on a public network without auth.
- Workspace API is **Experimental** in VoltAgent — may change across upgrades.

## Tests

```bash
pnpm --filter @uilab/workbench-runtime-voltagent test
pnpm --filter @uilab/workbench-runtime-voltagent typecheck
```

## Related

- Spec: GitHub issue #9 / `docs/plans/voltagent-office-profile-spec.md`
- Ticket: #10 O1 · #11 O2 · #15 O3 skills
- Adapter tickets: #1–#8
- Domain: `RuntimePort`, `AgentRuntimeEventEnvelope`
