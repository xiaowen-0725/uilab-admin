# CODEX-REVIEW-R1

**Date:** 2026-08-08  
**Goal:** `docs/plans/GOAL-voltagent-real-model-e2e-acceptance.md` (C4 design quality)  
**Tree:** working tree aligned with RUN-REPORT HEAD `fbfe7ab2c336aa37a9e67496ce2e151189725d9c` (`feat(workbench): real Task lifecycle — project catalog, IDB, Runtime default`)  
**Reviewer mode:** bounded Codex-style design review (boundaries, honesty, maintainability, readability) — not a full adversarial security re-audit of the plugin system.

## Scope file list

### Workbench — Runtime / Adapter / honesty

- `archetypes/agent-workbench/src/modules/task/runtime/voltagent/voltagent-runtime-adapter.ts`
- `archetypes/agent-workbench/src/modules/task/runtime/voltagent/voltagent-runtime-adapter.test.ts`
- `archetypes/agent-workbench/src/modules/task/runtime/voltagent/fullstream-to-envelope.ts`
- `archetypes/agent-workbench/src/modules/task/runtime/voltagent/fullstream-to-envelope.test.ts`
- `archetypes/agent-workbench/src/modules/task/runtime/runtime-honesty.ts`
- `archetypes/agent-workbench/src/modules/task/runtime/runtime-honesty.test.ts`
- `archetypes/agent-workbench/src/modules/task/runtime/tool-output-normalize.ts`
- `archetypes/agent-workbench/src/config/runtime-adapter.ts`
- `archetypes/agent-workbench/src/config/runtime-adapter.test.ts`
- `archetypes/agent-workbench/src/app/composition/workbench-app.tsx` (Composition Root dual-path assembly)

### Workbench — Application / UI (lifecycle + HITL surface)

- `archetypes/agent-workbench/src/modules/task/application/task-runtime-controller.ts`
- `archetypes/agent-workbench/src/modules/task/application/dispatch.ts`
- `archetypes/agent-workbench/src/modules/task/application/use-task-runtime.ts`
- `archetypes/agent-workbench/src/modules/task/application/command-factory.ts`
- `archetypes/agent-workbench/src/modules/task/ui/approval-dock/approval-dock.tsx`
- `archetypes/agent-workbench/src/modules/task/ui/timeline/timeline.tsx`
- `archetypes/agent-workbench/src/modules/task/ui/composer/composer.tsx`
- `archetypes/agent-workbench/src/modules/task/ui/task-surface/task-surface.tsx`
- `archetypes/agent-workbench/src/modules/task/ports/runtime-port.ts`
- `archetypes/agent-workbench/src/modules/task/index.ts` (module façade exports)

### Sidecar — local VoltAgent Runtime

- `tooling/workbench-runtime-voltagent/src/server.ts`
- `tooling/workbench-runtime-voltagent/src/create-agent.ts`
- `tooling/workbench-runtime-voltagent/src/tools.ts`
- `tooling/workbench-runtime-voltagent/src/workspace-root.ts`
- `tooling/workbench-runtime-voltagent/src/profile.ts` / `model.ts` / `office-runtime-defaults.ts`
- `tooling/workbench-runtime-voltagent/src/plugin/cli-loader.ts` (closed child env — residual from earlier P0 fix)
- Related plugin/security modules only as boundary context (not re-opened as E2E scope)

### Related tests / evidence context

- Adapter unit tests under `runtime/voltagent/*`
- Controller tests `task-runtime-controller*.test.ts`
- E2E evidence under this directory (`RUN-REPORT.md`, S10–S15, honesty / cancel / HITL)

### Git context (recent commits touching this area)

From `.git/logs/HEAD` (newest first for this area):

| SHA (short) | Message |
| --- | --- |
| `fbfe7ab` | feat(workbench): real Task lifecycle — project catalog, IDB, Runtime default |
| `9c669cc`…`279a6c0` | VoltAgent RuntimePort adapter, DeepSeek defaults, honesty + approval resume path |
| `8409729`…`f771f25` | Office profile O1–O5 + MCP fail-closed fixes |
| `20d1cec`…`dd56e037` | Sidecar plugin system + adversarial P0/P1 closes (closed CLI env) |

`git diff --stat origin/main` was not re-run in this review process; scope is the current tree for the files above plus the HEAD history noted. RUN-REPORT pins the same HEAD for the E2E pass set.

---

## Summary

The dual-path design is **coherent and boundary-clean**:

1. **Composition Root** (`workbench-app.tsx`) selects `RuntimePort` via `VITE_RUNTIME_ADAPTER` and threads a matching `honestyMode` into controller + UI.
2. **Task module** owns the port; **VoltAgentRuntimeAdapter** is a browser-safe `fetch`/SSE client only — no Node, no sidecar package imports in the renderer (matches ADR 0011/0012).
3. **Pure mapping** (`fullstream-to-envelope.ts` + `tool-output-normalize.ts`) is separated from I/O; adapter owns bookkeeping (`turn.created` / `message.accepted` / terminal synthesis / approval resume).
4. **Honesty** on primary surfaces (banner, submit/cancel/approval notices, context chips) is mode-aware; E2E S14 shows Volt copy and absence of Fake banner. Sidecar-down path emits `run.failed` with Chinese HTTP/stream error (S15), not a fake success.
5. **Capabilities honesty** improved: empty tool fallback when sidecar metadata unavailable (no invented DIY/office tool names).
6. **Sidecar** keeps keys and tool side effects out of the renderer; workspace tools use containment / approval for mutators; CLI runner documents closed child env (prior P0 closed).

No **P0** design defects on the shipped real-model path (stream, tool, HITL, cancel, honesty, failure). Remaining issues are **maintainability / lifecycle residual** risks that should be accepted in `RESIDUAL-RISKS.md` rather than forced into R2 code churn for this goal.

---

## P0 findings (must fix)

_None._

No security-boundary break in the reviewed renderer path (no API keys in Workbench; no Node imports).  
No wrong module ownership (adapter under `task/runtime`, façade export, Composition Root assembly).  
No silent Fake-as-real on primary submit/timeline/HITL surfaces.  
No design-level silent data loss of workspace files on the approve path (sidecar containment + HITL).

---

## P1 findings (should fix)

### P1-1 — `TaskRuntimeController` still hardcodes Fake-only success notices for secondary commands

**Where:** `task-runtime-controller.ts` — `retryTurn`, accepted `queueFollowUp`, `steerRun`, `reconcileInterruptedRun`.

**What:** Primary submit/cancel/approval/input use `runtimeHonestyCopy(honestyMode)`, but these secondary paths always say “Fake Runtime / Fake queue / Fake steer / Fake reconcile” on **accepted** acks.

**Why it matters:** Under `honestyMode === 'voltagent'`, Volt adapter currently returns `unsupported`/`rejected` for most of these, so the main E2E path does not show Fake copy. If queue/steer/retry land later (or Fake acks are reused), UI will mislabel a real local sidecar as Fake — exactly the honesty class this goal polices.

**Recommendation:** Move strings into `RuntimeHonestyCopy` (or mode-aware helpers) and use them consistently. **Accept as residual for C4** unless product enables those commands on Volt before R2.

### P1-2 — Volt adapter ignores subscribe `cursor` and never seeds `nextSequence` from EventStore

**Where:** `VoltAgentRuntimeAdapter.subscribe(taskId, _cursor, …)` + `ensureTask` always starts `nextSequence: 1`. Fake runtime **does** honor cursor.

**What:** Live session sequences are consistent. After IDB rehydrate (controller replays store, then resubscribes with `cursor = lastTaskSequence`), a new `submitTurn` can emit `taskSequence` starting again at 1. `appendWithCheckpoint` may conflict → `persistenceDegraded`, and live projection can diverge from store authority.

**Why it matters:** Lifecycle goal shipped IDB; S08 refresh is deferred, but the dual-writer design (adapter sequences + EventStore sequences) is fragile. Not a silent Fake/real confusion, but real maintainability / recovery risk.

**Recommendation:** On subscribe, seed `nextSequence = max(state.nextSequence, Number(cursor)+1)`; document that Volt live streams never replay history (EventStore owns rehydrate). Track in residual risks; full fix can wait for A9 refresh hardening.

### P1-3 — Pending approval state is adapter-memory only

**Where:** `TaskStreamState.pendingApprovals` in `voltagent-runtime-adapter.ts`.

**What:** Approval resume depends on in-memory map keyed by `approvalId`. Refresh / remount loses pending input; user cannot resume HITL without re-running the turn.

**Why it matters:** HITL works in-session (S12 PASS). Cross-refresh approval is not promised, but it is a sharp edge once IDB timeline restore shows “waiting” while adapter has no pending record → approve fails with `approval_not_found`.

**Recommendation:** Residual: either clear waiting approval on rehydrate interrupt, or persist minimal pending approval resume payload. Prefer product notice over silent broken dock.

---

## P2 / nits

1. **`findPendingApproval` hardcodes `toolLabel: '终端'`** even for `write_file` HITL — misleading chrome on S12-style writes. Derive from timeline title/toolName.
2. **Composition Root always constructs both Fake and Volt adapters** (`useRef` both); only one is selected. Prefer lazy construction by mode.
3. **Dual sequence assignment** in stream path: mapper allocates `taskSequence`/`eventId`, then adapter overwrites — readable enough but confusing; either mapper is pure payload-only or adapter trusts mapper fully.
4. **`normalizeWorkspaceToolInput` basename → `/output/<base>`** is a best-effort model-path repair; wrong file under workspace if model invents host paths. Keep sidecar as authority; consider logging/warning.
5. **`toolsCache` never invalidates** after sidecar restart/profile change within a long-lived SPA session.
6. **Honesty still not profile-handshaked** (office vs minimal); copy is intentionally generic (“Office/minimal 由侧车 profile 决定”) — acceptable residual from earlier Office review.
7. **Adapter file size (~770 lines)** — SSE parse, approval resume, path normalize could be sibling modules; not blocking.
8. **Composer/context metadata** injected as synthetic prompt XML (`<workbench_context>`) — pragmatic, but documents that attachments are metadata-only (tested).

---

## What is working well (positive)

| Area | Observation |
| --- | --- |
| Deep module boundary | Renderer → RuntimePort only; sidecar package not imported |
| Pure stream map | `fullstream-to-envelope` unit-tested; shell vs file tools → command/file events |
| Terminal synthesis | DONE-only / tail line without newline / approval pause without premature `run.completed` covered by tests |
| HITL resume | UIMessage `approval-responded` path explicit; reject when missing/busy |
| Capability matrix | `steer`/`queueFollowUp`/`runInput` false; cancel/approval true — matches adapter |
| Sidecar honesty logs | `note=local … not remote production cluster` |
| Fail-closed mutators | Office FS write/edit/delete/rmdir/mkdir approval config present |
| Closed CLI env | `defaultCliRunner` uses `closedChildEnv` — does not re-merge full `process.env` |

---

## Verdict: **pass_with_nits**

| Count | Severity |
| ---: | --- |
| **0** | P0 |
| **3** | P1 (non-blocking for current E2E axes; residual) |
| **8** | P2/nits |

Primary real-model axes (stream, tools, HITL, cancel, honesty, sidecar-down) are design-sound and evidence-aligned. No must-fix design defect for goal C4.

---

## Recommendation

- **Do not force R2 code churn** solely for P1-1…P1-3 unless product chooses to close them in this goal window.
- **Accept residual P1s** in `docs/evidence/voltagent-real-e2e-2026-08-08/RESIDUAL-RISKS.md` with owners/follow-ups (honesty secondary copy; sequence seed on subscribe; pending approval vs rehydrate).
- **R2 needed only if** implementer later changes adapter ownership, honesty wiring, or sequence/EventStore contract in a way that introduces P0 or new blocking P1s.

**C4 stance:** R1 = **pass_with_nits** → residual documentation sufficient for goal gate.
