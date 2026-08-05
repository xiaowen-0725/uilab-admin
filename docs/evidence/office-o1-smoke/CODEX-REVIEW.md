# Codex Review — Office O1 / VoltAgent (base d1a21da → HEAD)

**Tool:** `codex review --base d1a21da`  
**Model:** gpt-5.6-sol  
**Date:** 2026-08-05  
**Session:** 019fd24e-ef1f-73e2-8759-531004f0ed37  
**Status:** All P1/P2 **fixed** in `279a6c0`  
**Raw output:** `codex-review-output.txt`

## Summary (findings)

The primary approval-resume path could prematurely mark a run complete, lose approval state, and display misleading Fake-runtime copy for real filesystem writes. Configuration and capability reporting also diverged from the selected sidecar profile.

## Resolution

| Severity | Finding | Fix commit / approach | Verified |
| --- | --- | --- | --- |
| **P1** | Suppress `run.completed` while approval pending | `279a6c0`: after `rememberApprovalFromChunk`, skip terminal envelopes when `pendingApprovals.size > 0` | Unit: `approval pause does not emit run.completed`; live: `10-codex-fix-waiting-approval.png` stays **等待审批** |
| **P1** | Runtime-specific approval outcome copy | `279a6c0`: `approvalApproved` / `approvalRejected` / `inputProvided` in `runtime-honesty.ts` | Live footer: `已允许一次（本机侧车；批准后可能写入工作区文件）` — not Fake |
| **P2** | Validate approval before resolve/delete | `279a6c0`: require pending + idle stream before delete/resume | Unit: missing approval → `rejected` |
| **P2** | Do not hardcode `maxSteps: 50` | `279a6c0`: omit unless `options.maxSteps` set | Unit: resume body has no `maxSteps` by default |
| **P2** | Capabilities tools = active profile | `279a6c0`: `GET /agents/:id` tool names (+ override) | Unit: tools from metadata |

### Live re-smoke after fix (2026-08-05)

- Prompt: write `/output/codex-p1-verify.md` with `codex-fix-ok`
- UI: needsApproval → **允许一次** → **已编辑 codex-p1-verify.md** + Chinese confirm
- Disk: `output/office-smoke-workspace/output/codex-p1-verify.md` = `codex-fix-ok`
- Screenshots: `10-codex-fix-waiting-approval.png`, `11-codex-fix-after-approve-write.png`

## Original findings (verbatim notes)

- [P1] Keep approval streams nonterminal until a decision — `voltagent-runtime-adapter.ts`  
  VoltAgent ends an approval pause with `tool-approval-request` followed by `finish` (`finishReason: "tool-calls"`). Mapper must not convert that `finish` into `run.completed` while HITL is open.

- [P1] Use runtime-specific copy for approval outcomes — `runtime-honesty.ts`  
  Approve/reject notices must not say Fake under `honestyMode: 'voltagent'`.

- [P2] Validate approval resumability before resolving it — do not delete pending / emit resolved until request exists and stream is idle.

- [P2] Let the sidecar enforce its configured maxSteps — omit per-request override unless configured.

- [P2] Report only the active profile's tools — load from sidecar agent metadata, not a static union.
