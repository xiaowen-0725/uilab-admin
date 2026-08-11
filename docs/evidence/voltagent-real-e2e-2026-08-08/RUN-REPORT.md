# RUN-REPORT — VoltAgent real-model E2E (2026-08-08)

**Executor:** implementer (goal harness session)  
**git HEAD:** `fbfe7ab2c336aa37a9e67496ce2e151189725d9c`  
**Finished (UTC):** 2026-08-07T17:21:12Z  
**Runtime:** `VITE_RUNTIME_ADAPTER=voltagent` + sidecar `AGENT_PROFILE=office` + model `deepseek-v4-flash` / `modelApi=chat`  
**Workbench UI:** http://localhost:5180/  
**Sidecar:** http://127.0.0.1:3141  
**Workspace:** `output/voltagent-e2e-workspace/`  
**Env snapshot:** `env-profile-snapshot.md` (no secrets)  
**Sidecar boot:** `sidecar-start.log`  
**Tools:** `agent-tools.json`

## Scenario results

| ID | Status | Evidence paths |
| --- | --- | --- |
| S01 | PASS | S01-new-chat-runtime-hub.png, S01-new-chat-dom.txt, S01-S06-lifecycle-integration.log |
| S02 | PASS | S02-switch-task-a.png, S02-switch-task-b.png, S02-switch-notes.md |
| S03 | PASS | S03-before-delete.png, S03-after-delete.png, S03-delete-notes.md |
| S04 | PASS | S04-navigator-items.txt, S04-navigator.png |
| S05 | PASS | S05-cold-start-empty.png, S05-cold-start-dom.txt |
| S06 | PASS | S06-default-path.png, S06-default-path-notes.md |
| S07 | DEFERRED | (catalog deferred-with-reason — multi Project UI) |
| S08 | DEFERRED | (catalog deferred-with-reason — IDB refresh) |
| S10 | PASS | S10-text-stream.sse, S10-text-stream-summary.json, S10-text-ui.png |
| S11 | PASS | S11-ls-stream.sse, S11-ls-summary.json, S11-ls-timeline.png |
| S12 | PASS | S12-write-approval.sse, S12-write-summary.json, S12-approval-chunk.json, S12-write-after-approve.sse, S12-write-after-approve-summary.json, S12-workspace-file.txt, S12-waiting-approval.png, S12-after-approve.png, S12-workspace-ui-file.txt |
| S13 | PASS | S13-cancel-ui.png, S13-cancel-notes.md, S13-cancel-unit-test.log, S13-cancel-partial.sse, S13-cancel-stream-notes.json |
| S14 | PASS | S14-honesty.png, S14-honesty-dom.txt |
| S15 | PASS | S15-sidecar-down.png, S15-sidecar-down-notes.md |
| S20 | PASS | gate-typecheck.log, gate-test.log, gate-build.log, gate-check-workbench.log |

## Key observations

- Pure text stream returns 办公就绪 (API + UI).
- Multi-step ls tool succeeds end-to-end (no historical 400).
- write_file HITL: approval dock → 允许一次 → file written (`e2e-ui-hitl.txt` / API `e2e-hitl.txt`).
- Cancel: Timeline 已取消; composer re-submittable.
- Honesty: 本机 VoltAgent Runtime · 非远程生产集群 · 本地侧车 (not Fake).
- Sidecar down: 运行失败 · 侧车 HTTP 502: Bad Gateway.
- Lifecycle: cold empty shell, new chat hub, switch, hard delete, no mock utilities, no capture default.

## Assumptions

- Office profile used (not minimal fallback).
- S07/S08 deferred per catalog (≤2).


## Gates (C5)

| Command | Exit | Log |
| --- | --- | --- |
| pnpm --filter @uilab/agent-workbench typecheck | 0 | gate-typecheck.log |
| pnpm --filter @uilab/agent-workbench test | 0 | gate-test.log (193 passed) |
| pnpm --filter @uilab/agent-workbench build | 0 | gate-build.log |
| pnpm check:workbench | 0 | gate-check-workbench.log |
