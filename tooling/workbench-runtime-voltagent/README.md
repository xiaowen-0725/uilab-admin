# Workbench VoltAgent Sidecar

Local **Agent Runtime** process for `@uilab/agent-workbench`’s `VoltAgentRuntimeAdapter`.

**Honesty:** This is a **local sidecar** for development. It is **not** a multi-tenant production Runtime. Fake Runtime and capture replay remain first-class for tests and offline demos.

## Requirements

- Node 20+
- Model API key for the configured provider (default OpenAI via `@ai-sdk/openai`)

## Setup

```bash
# from monorepo root
pnpm install
cd tooling/workbench-runtime-voltagent
pnpm install   # if workspace does not hoist this package yet
```

Add to root `pnpm-workspace.yaml` if needed (already under `tooling/*`).

## Run

```bash
export OPENAI_API_KEY=sk-...
export WORKSPACE_ROOT=/absolute/path/to/uilab-admin   # tool read/write root
export PORT=3141
pnpm --filter @uilab/workbench-runtime-voltagent dev
```

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

## Tools (M3)

| Tool | Notes |
| --- | --- |
| `read_file` | Read UTF-8 under `WORKSPACE_ROOT` |
| `write_file` | Write under root; **needsApproval** |
| `run_command` | Demo only (no real shell); approval if command looks destructive |

Paths outside `WORKSPACE_ROOT` are rejected.

## API used by Adapter

- `POST /agents/workbench/stream` — SSE fullStream events  
- Optional: `POST /agents/workbench/approvals` — best-effort approval notify  

## Security

- Keys stay in the sidecar env, not in the Vite browser bundle.
- File tools are confined to `WORKSPACE_ROOT`.
- Do not expose the sidecar on a public network without auth.

## Related

- Spec: GitHub issue #1  
- Adapter tickets: #2–#8  
- Domain: `RuntimePort`, `AgentRuntimeEventEnvelope`
