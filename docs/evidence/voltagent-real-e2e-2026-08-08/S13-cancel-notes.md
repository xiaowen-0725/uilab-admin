# S13 cancel in-flight Run

## UI
- Submitted long-form streaming request.
- Clicked composer stop (aria-label 停止 / same control as submit while running).
- Timeline status: **已取消**.
- Composer notice: **已请求取消（本机 VoltAgent Runtime，非远程生产集群）**.
- Composer control returned to **发送** (re-submittable).
- Evidence: `S13-cancel-ui.png`

## Adapter unit
- `voltagent-runtime-adapter.test.ts` cancelRun aborts and emits `run.cancelled` — 12 tests pass.
- Log: `S13-cancel-unit-test.log`

## Stream partial
- Client abort of long SSE also captured: `S13-cancel-partial.sse`, `S13-cancel-stream-notes.json`
