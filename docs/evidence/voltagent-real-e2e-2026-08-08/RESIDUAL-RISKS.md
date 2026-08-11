# Residual risks (accepted after CODEX-REVIEW-R1)

**Review:** `CODEX-REVIEW-R1.md`  
**P0 open:** 0  
**P1 open (accepted, non-blocking for C3):** 3  
**R2:** not required (no P0; P1 accepted here without code churn for this goal)

## Accepted P1

1. **Controller Fake-hardcoded notices on secondary paths** — **closed in simplification pass**  
   Retry / queue / steer / reconcile accepted notices now use `RuntimeHonestyCopy` (`retryAccepted` / `queueAccepted` / `steerAccepted` / `reconcileAccepted`). Voltagent mode no longer hardcodes Fake on those paths.

2. **Volt adapter subscribe cursor ignored** — **closed in simplification pass**  
   `subscribe(taskId, cursor)` seeds `nextSequence = max(state, floor(cursor)+1)`. Unit: `subscribe seeds nextSequence from EventStore cursor`.

3. **Pending approvals in-memory only** *(still residual)*  
   Refresh during HITL can drop resume state while UI still shows waiting. In-session approve→write resume was proven live (S12). Persistence of pending approvals is a follow-up.

## Not accepted as blockers

- Multi-Project UI (S07) and refresh restore (S08) remain catalog-deferred (≤2).
- No secrets in evidence dir (keys only as presence flags).

## Recommendation

Ship C3/C4 on residual P1 documentation; optional later cleanup commits outside this goal’s two-round review cap unless a new P0 appears.
