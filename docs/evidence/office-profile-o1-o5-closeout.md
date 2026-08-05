# Office Profile O1–O5 close-out evidence

**Date:** 2026-08-05  
**Scope:** VoltAgent Office Profile milestones O1–O5 + O4 MCP + operator docs  
**Honesty:** Local sidecar only — **not** remote multi-tenant production Runtime. Fake ≠ production.

## Tickets

| Milestone | Issue | Commit (approx) | Status |
| --- | --- | --- | --- |
| O1 Workspace FS | #10 | `8409729` + follow-ups | Done |
| O2 root policy | #11 | `5cb0493` | Done |
| O3 Skills | #15 | `ceab8df` | Done |
| O5 long-run + honesty | #12 | `c38be43` | Done |
| O4 MCP docs | #13 | (this close-out) | Done |
| O4 MCP calendar | #14 | (this close-out) | Done |
| Integration + docs | #16 | (this close-out) | Done |

## Automated verification (no API Key)

```bash
pnpm --filter @uilab/workbench-runtime-voltagent test
pnpm --filter @uilab/workbench-runtime-voltagent typecheck
pnpm --filter @uilab/agent-workbench exec vitest run --browser.headless \
  src/modules/task/runtime/runtime-honesty.test.ts
```

Expected: sidecar unit/integration assembly tests green; honesty Fake vs Office copy green.

## Behaviour covered by tests

| Area | Coverage |
| --- | --- |
| Workspace root | explicit `WORKSPACE_ROOT`; office default `~/VoltAgent-Office/workspace`; not home/monorepo |
| First-run | mkdir + README; no overwrite |
| Path confinement | `路径越界` |
| Skills seed | three `SKILL.md` + output dirs; discover/activate |
| maxSteps / summarization / memory | defaults + env overrides |
| MCP disabled | both off; empty tools |
| MCP mock connect | docs+calendar tools; write needsApproval |
| MCP failure | degrade; FS path still constructed |
| Honesty UI | Office wording; Fake unchanged |

## Live demo (operator, optional with Key)

Follow `tooling/workbench-runtime-voltagent/OPERATOR.md` §1:

1. `AGENT_PROFILE=office` + `WORKSPACE_ROOT=…`
2. Sidecar + `VITE_RUNTIME_ADAPTER=voltagent`
3. 新对话 → ls / skill / write approval
4. Stop sidecar → honest error
5. Default adapter → Fake/capture still works

Prior live smoke (O1): `docs/evidence/office-o1-smoke/`.

## Disclosure checklist

- [x] Sidecar log: `note=local VoltAgent Office Runtime … not remote production cluster`
- [x] UI honesty: 本机 VoltAgent Office Runtime · 非远程生产集群
- [x] README + OPERATOR: Workspace Experimental + Fake boundary
- [x] MCP tools not listed when not connected

## Residual risks / non-goals

- Real Feishu MCP server selection left to operator env (no bundled cloud credentials).
- Live multi-step model quality depends on provider (DeepSeek chat surface recommended).
- PlanAgent + multi-expert UI still out of scope.
- IndexedDB cross-session recovery still not shipped.
