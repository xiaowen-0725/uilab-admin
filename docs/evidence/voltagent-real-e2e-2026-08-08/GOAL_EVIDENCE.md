# GOAL_EVIDENCE — VoltAgent real-model E2E acceptance

**Goal:** docs/plans/GOAL-voltagent-real-model-e2e-acceptance.md  
**Lifecycle state:** complete  
**Generated (UTC):** 2026-08-07T17:28:00Z  
**HEAD:** `fbfe7ab2c336aa37a9e67496ce2e151189725d9c`  
**Fix commits for this goal:** none (no product FAIL; residual P1 accepted without R2 code churn)

## C1 — Scenario catalog

| Verdict | PASS |
| Evidence | docs/evidence/voltagent-real-e2e-2026-08-08/SCENARIO-CATALOG.md |
| Notes | Mapping table covers A2/A3/A4/A6/A8/A10 + agent axes + gates; deferred S07/S08 only (2). |

## C2 — Fresh real-model E2E evidence

| Verdict | PASS |
| Evidence | RUN-REPORT.md + per-S* files under docs/evidence/voltagent-real-e2e-2026-08-08/ |
| Env | VITE_RUNTIME_ADAPTER=voltagent; AGENT_PROFILE=office; deepseek-v4-flash chat; workspace output/voltagent-e2e-workspace |
| Snapshot | env-profile-snapshot.md, sidecar-start.log, agent-tools.json |

## C3 — Independent adjudication

| Verdict | PASS |
| Evidence | VERDICT.json, VERDICT.md |
| adjudicator_id | independent-adjudicator-rejudge-20260808 |
| overall | pass |
| Notes | First pass failed only on race (S20 logs not yet written); re-adjudication after gates → overall pass. Runner RUN-REPORT not used as substitute for VERDICT. |

## C4 — Bounded Codex design review

| Verdict | PASS |
| Evidence | CODEX-REVIEW-R1.md, RESIDUAL-RISKS.md |
| Rounds | 1 (R2 not required) |
| P0 | 0 |
| P1 | 3 accepted residual (non-blocking) |
| P2 | 8 nits |

## C5 — Package gates

| Command | Exit | Log |
| --- | --- | --- |
| pnpm --filter @uilab/agent-workbench typecheck | 0 | gate-typecheck.log |
| pnpm --filter @uilab/agent-workbench test | 0 | gate-test.log |
| pnpm --filter @uilab/agent-workbench build | 0 | gate-build.log |
| pnpm check:workbench | 0 | gate-check-workbench.log |

## Scenario overall (from VERDICT)

All non-deferred S* pass; S07/S08 deferred-with-reason.

## Assumptions / residual

- Real model via existing local .env (keys never printed or committed).
- Office profile (not minimal fallback).
- Residual P1 documented in RESIDUAL-RISKS.md.
- No production multi-tenant Runtime claimed.

## Paths package

- SCENARIO-CATALOG.md
- RUN-REPORT.md
- VERDICT.json / VERDICT.md
- CODEX-REVIEW-R1.md
- RESIDUAL-RISKS.md
- gate-*.log
- Per-scenario S*.png / S*.sse / S*.json / S*.md
