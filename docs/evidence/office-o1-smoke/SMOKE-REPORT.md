# Office Profile O1 smoke evidence (2026-08-05)

**Ticket:** #10 office-profile O1  
**Commit under test:** `8409729`  
**Goal:** live verify `AGENT_PROFILE=office` Workspace FS + Timeline + honesty

## Environment

| Item | Value |
| --- | --- |
| Sidecar | `AGENT_PROFILE=office`, port `3141` |
| WORKSPACE_ROOT | `output/office-smoke-workspace` (seeded `notes/seed.md`, `output/`) |
| Model | `deepseek-chat` via `https://api.deepseek.com` |
| Workbench | `VITE_RUNTIME_ADAPTER=voltagent`, `http://localhost:5174/` |
| Seed | `notes/seed.md` present |

## What passed

1. **Sidecar boots as office** — log line includes  
   `profile=office … tools=ls,read_file,write_file,edit_file,delete_file,stat,mkdir,rmdir,list_tree,list_files,glob,grep`  
   and note `local office Runtime (Agent+Workspace FS)`.
2. **`GET /agents/workbench` tools** are Workspace FS toolkit names only (no DIY `run_command`) — see `agent-tools.json`.
3. **Workspace FS tool actually executes** — first step `ls` tool-call + tool-result:  
   `output = /notes/ (directory)\n/output/ (directory)` — see `api-stream-ls-summary.json`.
4. **Text-only streaming works** (no tools): stream deltas assemble to `办公就绪` — see `api-stream-text-summary.json`.
5. **UI path hits real sidecar** (not Fake scenario routing): Timeline shows tool row `ls` with real `call_00_…` id from DeepSeek, then `运行失败` after provider error — screenshots `03` / `04`.
6. **Mapper path for tool rows works**: `ls` appears as expandable Timeline tool group.

## What failed (blocking multi-step tool loops)

### P0 — DeepSeek tool multi-step continuation 400

After successful `tool-call` + `tool-result` for `ls`, the next model request to  
`https://api.deepseek.com/responses` returns:

```json
{"error":{"message":"No tool call found for tool output with call_id call_00_….","type":"invalid_request_error"}}
```

Observed both via raw `curl` SSE and Workbench UI → Adapter → proxy → sidecar.

**Effect:** any agent step that needs “tool then continue” ends in `run.failed` / UI “运行失败 · runtime error”.  
Write+approval live loop could not be completed for the same reason (write would also need multi-step).

**Likely cause (not fully proven):** AI SDK / VoltAgent is talking to DeepSeek **Responses** API (`/responses`). DeepSeek’s multi-turn tool-result wiring rejects the function_call_output `call_id` shape. Text-only chat works.

### P1 — UI honesty still says “Deterministic Fake Runtime”

Even with `VITE_RUNTIME_ADAPTER=voltagent` and real sidecar traffic:

- Timeline `aria-label` / banner: `Deterministic Fake Runtime · 非生产 · 本地事件投影`
- Composer notice: `已提交到 Deterministic Fake Runtime…`

Hardcoded in:

- `src/modules/task/ui/timeline/timeline.tsx` honesty banner
- `src/modules/task/application/task-runtime-controller.ts` notice strings
- `src/modules/task/ui/composer/composer.tsx` notice strings

This is misleading for office/voltagent smoke (still “not production”, but should say **本机 VoltAgent / Office**).

## Screenshots

| File | What it shows |
| --- | --- |
| `01-workbench-initial.png` | Workbench shell loaded |
| `02-new-chat-empty.png` | Empty / 新对话 hub |
| `03-after-submit-ls.png` | After submit: user message, **ls** tool row, **失败** |
| `04-ls-tool-expanded.png` | Expanded tool group after click |

## Artifacts

- `agent-tools.json` — office tool list from sidecar
- `api-stream-ls.sse` + `api-stream-ls-summary.json` — ls succeeds then provider 400
- `api-stream-text.sse` + `api-stream-text-summary.json` — text-only OK
- `SMOKE-REPORT.md` — this file

## Verdict on #10 acceptance

| AC | Live smoke |
| --- | --- |
| Office profile switch | **Pass** (log + tools) |
| Workspace FS not DIY | **Pass** (tool list + ls result) |
| Write/delete needsApproval + HITL continue | **Blocked** by P0 (could not complete multi-step) |
| file.changed on write | **Blocked** by P0 (no successful write stream) |
| Read tools as Timeline rows | **Pass** (ls row visible) |
| Renderer / RuntimePort only | **Pass** (architecture) |
| Unit tests / Fake no regression | **Pass** (prior commit CI) |

**Recommendation:** keep #10 open until either (a) DeepSeek multi-step tool path fixed or (b) alternative model path documented for office tool loops; file follow-up for honesty banner copy when adapter=voltagent.


---

## Re-smoke after model fix (2026-08-05)

**Change:** default `VOLTAGENT_MODEL=deepseek-v4-flash`, `VOLTAGENT_MODEL_API=chat` (`provider.chat`).

**Result:** multi-step `ls` succeeds end-to-end:

- `tool-call` → `tool-result` (`/notes/`, `/output/`)
- then Chinese `text-delta` summary
- `finish` without 400

Artifacts: `api-stream-ls-v4flash.sse`, `api-stream-ls-v4flash-summary.json`
