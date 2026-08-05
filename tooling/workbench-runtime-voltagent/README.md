# Workbench VoltAgent Sidecar

Local **Agent Runtime** process for `@uilab/agent-workbench`’s `VoltAgentRuntimeAdapter`.

**Honesty:** This is a **local sidecar** for development. It is **not** a multi-tenant production Runtime. Fake Runtime and capture replay remain first-class for tests and offline demos.

## Requirements

- Node 20+
- Model API key（默认 **DeepSeek** OpenAI 兼容：`https://api.deepseek.com`）

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
# DEEPSEEK_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.deepseek.com
# VOLTAGENT_MODEL=deepseek-v4-flash
# VOLTAGENT_MODEL_API=chat   # default; multi-step tools. Use responses only for flash experiments.
# AGENT_PROFILE=office
# WORKSPACE_ROOT=/absolute/path/to/office-folder

pnpm --filter @uilab/workbench-runtime-voltagent dev
```

| Model id | Notes |
| --- | --- |
| **`deepseek-v4-flash`**（默认） | V4 快档；Chat Completions 多步 tool 稳定；Responses 官方也支持 flash |
| `deepseek-v4-pro` | V4 旗舰；**请用** `VOLTAGENT_MODEL_API=chat`（Responses 尚未支持 Pro） |
| `deepseek-chat` / `deepseek-reasoner` | Legacy 别名，官方计划停用；勿作新默认 |

**API 表面：** 默认 `VOLTAGENT_MODEL_API=chat`（`/chat/completions`）。AI SDK 的 `provider(modelId)` 会默认打 `/responses`，在 DeepSeek 上会导致多步 tool 400（`No tool call found for tool output with call_id`）；侧车已改为 `provider.chat(modelId)`。

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
| sandbox / MCP | **未启用**（O4 MCP 后续） |
| skills | **O3 已启用**：`/skills` 下 `meeting-notes` / `weekly-report` / `research-brief` |

Paths outside the workspace root are rejected by `NodeFilesystemBackend`（`contained` + `virtualMode`）与 DIY `resolvePathWithinRoot`。

### Office Skills（O3）

首次启动 office 工作区时，侧车会：

1. 将内置 `bundled-skills/*` 复制到工作区 `skills/<id>/SKILL.md`（**已存在不覆盖**）
2. 创建交付目录：`output/meeting-notes/`、`output/weekly-report/`、`output/research-brief/`
3. 启用 Workspace skills toolkit + prompt 注入（`workspace_list_skills` / `activate` / `read` …）

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
