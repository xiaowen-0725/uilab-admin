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
| `office` | **`Agent` + `Workspace`**（Node FS，`virtualMode`） | Workspace FS：`ls`、`read_file`、`write_file`、`edit_file`、`delete_file`…；**写/删默认 needsApproval** |

Office 未设 `WORKSPACE_ROOT` 时落到 `~/VoltAgent-Office/workspace`（不会默认整个 home 或 monorepo 根）。显式 `WORKSPACE_ROOT` 始终优先。

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
# VOLTAGENT_MODEL=deepseek-chat
# AGENT_PROFILE=office
# WORKSPACE_ROOT=/absolute/path/to/office-folder

pnpm --filter @uilab/workbench-runtime-voltagent dev
```

可选模型：`deepseek-chat`、`deepseek-reasoner`、`deepseek-v4-flash`、`deepseek-v4-pro`。

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
| sandbox / skills / MCP | **O1 未启用**（后续 ticket） |

Paths outside the workspace root are rejected by `NodeFilesystemBackend`（`contained` + `virtualMode`）。

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
- Ticket: #10 O1 Workspace FS  
- Adapter tickets: #1–#8  
- Domain: `RuntimePort`, `AgentRuntimeEventEnvelope`
