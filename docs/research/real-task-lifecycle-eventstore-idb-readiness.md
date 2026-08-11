# Research: EventStorePort → IndexedDB readiness

> **Ticket:** `.scratch/real-task-lifecycle/issues/04-eventstore-idb-readiness.md`  
> **Date:** 2026-08-07  
> **Scope:** Read-only comparison of current Memory path vs design §12 IndexedDB EventStore; contract gaps before implementation session.  
> **Working schema assumption:** design `docs/superpowers/specs/2026-08-02-codex-task-pane-runtime-design.md` §12 (`events` / `snapshots` / `cursors` / `commands` / `metadata`). Ticket 03 (unified IDB schema) is **not** closed; findings that would change if Project/Task **catalog** shares the same IDB are marked **[shared-IDB]**.

---

## 1. Executive summary

Phase 4E shipped a **demo/test** `MemoryEventStore` that implements a **minimal** `EventStorePort` (append / range-read / snapshot get-put / command-ack get-put). `TaskRuntimeController` appends on each subscription event, writes a snapshot after every append, and on `attach` **full-replays** events from `taskSequence=1` into projection, then subscribes the Runtime from `lastTaskSequence`. That is enough for same-process rehydrate tests and multi-task isolation of event streams — **not** enough for browser durable recovery, transactional consistency, error honesty, snapshot-accelerated replay, cursor durability, task deletion, or cold-start task enumeration.

Before an IndexedDB implementation session, the product/contract owners must nail the patches in **§5**. Port surface is **necessary but not sufficient**; the larger gaps are **controller recovery protocol**, **error/result typing**, **transactional write contract**, and **lifecycle APIs** (delete / open / readiness) that Memory never needed.

---

## 2. Sources (primary)

| Area | Path |
|---|---|
| Port | `archetypes/agent-workbench/src/modules/task/ports/event-store-port.ts` |
| Memory adapter | `archetypes/agent-workbench/src/modules/task/runtime/memory-event-store.ts` |
| Memory tests | `…/runtime/memory-event-store.test.ts` |
| Controller rehydrate / persist | `…/application/task-runtime-controller.ts` (`attach`, `persistEnvelope`, `rememberAck`, `reconcileInterruptedRun`) |
| Controller 4E tests | `…/application/task-runtime-controller-4e.test.ts` |
| RuntimeSnapshot type | `…/ports/runtime-port.ts` |
| Envelope | `…/protocol/events.ts` |
| Composition wiring | `archetypes/agent-workbench/src/app/composition/workbench-app.tsx` |
| Design §12 | `docs/superpowers/specs/2026-08-02-codex-task-pane-runtime-design.md` §12 (+ §8 envelope, §6 concurrency, §16 perf) |
| Architecture note | `docs/architecture/agent-workbench-module-layout.md` (EventStorePort: Memory shipped, IDB planned) |
| Phase 4E work order | `docs/plans/phase-4e-persistence-queue-recovery-work-order.md` (explicit: IDB out of scope) |
| Fake-complete evidence | `docs/evidence/phase-4-fake-complete.md` |
| Map assumptions | `.scratch/real-task-lifecycle/map.md` (unified IDB for catalog + events; Q6) |
| Schema ticket (open) | `.scratch/real-task-lifecycle/issues/03-indexeddb-schema.md` |
| Delete ticket (open) | `.scratch/real-task-lifecycle/issues/05-task-delete-semantics.md` |

---

## 3. Current contract inventory

### 3.1 `EventStorePort` methods (as coded)

```ts
// ports/event-store-port.ts — summary
append(envelope) → { status: 'appended' | 'duplicate', eventId, taskSequence? }
read({ taskId, fromSequence?, toSequence?, limit? }) → envelopes[]
getSnapshot(taskId, runId?) → RuntimeSnapshot | null
putSnapshot(snapshot) → void
getCommandAcknowledgement(commandId) → CommandAcknowledgement | null
putCommandAcknowledgement(commandId, ack) → void
```

Also declared but **not part of the Port methods**:

```ts
EventStoreError { code: 'quota_exceeded' | 'transaction_failed' | 'blocked' | 'open_failed' | 'unknown'; message; retriable }
```

Port methods do **not** return or throw a typed `EventStoreError`. File header still says “type stub only (Phase 4E implements IndexedDB adapter)” while Memory is the real 4E ship; comment is stale relative to evidence.

### 3.2 `MemoryEventStore` behavior

| Concern | Memory behavior |
|---|---|
| Event key / order | `byTask: Map<taskId, envelope[]>`; append then **sort by `taskSequence`**; global `byEventId` for dedupe |
| Duplicate | Same `eventId` → `{ status: 'duplicate' }`; **does not** reject conflicting `taskId+taskSequence` with different `eventId` |
| Snapshots | Two map keys: `taskId` and optional `taskId:runId` |
| Command acks | Global map by `commandId` only (no `taskId` / `projectId` scope) |
| Failure modes | Never fails; no quota; no open |
| Wipe | `clear()` test helper only — not on Port |
| Enumerate / delete | None |
| Cursor store | None (cursor is not a first-class store entity) |
| Persistence | Process memory only; refresh loses all |

### 3.3 Controller use of the Port

| Call site | Behavior |
|---|---|
| `attach` | `read({ taskId, fromSequence: 1 })` → `projectEvents` full reduce → `cursor = lastTaskSequence` → `runtime.subscribe(taskId, cursor, …)` |
| Subscription `event` | `applyRuntimeEvent` then `persistEnvelope` (fire-and-forget `void`) |
| `persistEnvelope` | `append` then **separate** `putSnapshot` (status, sequence, optional `runtimeCursor`, projectionVersion); **empty `catch`** |
| Command path | `putCommandAcknowledgement` only; **never** `getCommandAcknowledgement` for client-side dedupe |
| Snapshot on rehydrate | **`getSnapshot` never called** |
| Non-terminal recovery | **No** automatic `run.interrupted` append on attach/rehydrate; `reconcileInterruptedRun` is explicit user/API path |
| Honesty | Notice hardcodes Memory copy: `已从本地 EventStore 恢复时间线（Memory，非生产持久化）` |
| Multi-task | Single controller; `attach` switches task; shared store; isolation via `taskId` on events + `attachGeneration` race guard |

### 3.4 Spec §12 expected shape (working assumption)

Object stores (design text):

1. **`events`** — key `taskId|taskSequence`, unique index on `eventId`  
2. **`snapshots`** — Task/Run + projection version  
3. **`cursors`** — first-class local cursor advancement  
4. **`commands`** — idempotent acknowledgement by `commandId`  
5. **`metadata`** — (unspecified fields in design; schema version / migration bookkeeping implied)

Behavioral requirements:

- Writes complete **in transaction**, then advance local cursor  
- **Replay:** latest compatible Snapshot → tail events by sequence; else from 1  
- **Recovery:** load local → Runtime subscribe from last cursor; non-terminal Run must **append `run.interrupted`** then reconcile via commands/events (never mutate Run state in place)  
- **Schema version** + migration chain; unmigratable keep raw → `unsupported-event` / recovery error  
- **Errors:** map quota / transaction / blocked / open → diagnosable error; optional **read-only memory degrade** with honesty; **failed write must not advance projection cursor**  
- **Consistency:** append + dedupe + cursor + Snapshot checkpoint transactional; **no cross-task global transaction**  
- **Cleanup:** must not delete source events still referenced by Timeline/Artifact  
- **Perf (§16):** batched/controlled flush; must not block input/animation  

---

## 4. Gaps

### 4.1 Port method sufficiency

| Need | In Port today? | Verdict |
|---|---|---|
| Append + eventId dedupe | Yes | Keep; tighten uniqueness rules (see D4) |
| Range read by task + sequence | Yes | Keep; clarify exclusive `toSequence`, stable order, gap presence |
| Snapshot get/put | Yes | Keep; decide keying Task vs Run (D5); controller must **use** get on replay (D8) |
| Command ack get/put | Yes | Keep; controller should read for command-level idempotency if required (D10) |
| **Cursor get/put** | **No** (only implicit via snapshot `lastTaskSequence` / envelope `runtimeCursor`) | Spec names a **`cursors` store**; Port has no API. Either promote cursors onto Port or formally collapse into Snapshot and drop store (D3) |
| **Metadata** | **No** | Schema/migration bookkeeping needs an owner: Port method, private adapter detail, or shared DB shell **[shared-IDB]** (D6) |
| **listTasks / list by project** | **No** | Not required on EventStore if **catalog** is authoritative for Navigator **[shared-IDB]**; EventStore may still need `listTaskIdsWithEvents(projectId?)` for orphan GC / integrity audits (D11) |
| **deleteTaskEvents / purge** | **No** | Required for map destination “必删 Task” + ticket 05 cascade; Memory has only test `clear()` (D7) |
| **Transactional batch write** | **No** | Spec: append+dedupe+cursor+snapshot one TX; today two awaits (D2) |
| **Open / ready / close** | **No** | IDB needs open failure / blocked / versionchange; Memory is always ready (D1) |
| **Error surface on methods** | Type exists, **unused** | Need Result/throw contract consumers can branch on (D1) |
| **Batch/flush control** | **No** | Spec §16 write batching; Memory writes every event (D9) |

**Answer to ticket Q1:** Current methods cover the **happy-path Memory demo**. They are **not enough** for durable IDB without: (at least) error contract, transactional multi-write, recovery-oriented snapshot+tail read, task-scoped delete, and an explicit decision on cursors + metadata. `listTasks` likely belongs to **catalog**, not EventStore — unless orphan detection requires EventStore-side enumeration.

### 4.2 Memory → IDB behavior differences

| Dimension | Memory | IDB requirement | Gap severity |
|---|---|---|---|
| Latency | Sync-in-async (microtask) | Real async; multi-request TX | Medium — attach race already mitigated; UI must tolerate delayed rehydrate |
| Failure | Swallow in controller `catch` | Quota / blocked / open / TX fail | **High** — would silently lose durability and still advance in-memory projection |
| Atomicity | append then putSnapshot race-prone | Single multi-store TX; fail → no cursor advance | **High** |
| Durability honesty | Notice says Memory | Notice must say IDB vs degraded memory | High for product honesty |
| Dedupe | eventId only | eventId unique **and** taskId+taskSequence primary key conflicts | Medium — define conflict vs duplicate (D4) |
| Snapshot key | Dual map keys | Object store keyPath TBD in ticket 03 | Medium (D5) |
| Full replay cost | Fine for short Fake streams | Spec wants Snapshot + tail; 10k events soak | **High** if large sessions |
| Refresh survival | No | Yes (map destination) | Product-critical |
| Concurrent tabs | N/A | Multi-tab IDB not yet specified (map “Not yet specified”) | Defer or explicit single-writer (out of map?) |
| Write pacing | Every event | Batched flush | Medium for streamy output.delta |

Controller-specific IDB risks:

1. **`void this.persistEnvelope(...)`** — projection advances **before** durable write completes; on IDB fail, in-memory cursor has already moved → **violates** “写入失败不得推进 projection cursor” unless rehydrate/persist order is redesigned (D2, D8).  
2. **Empty catch** — no UI notice, no read-only degrade flag, no retriable state.  
3. **Rehydrate ignores snapshots** — always O(n) from sequence 1.  
4. **No auto-interrupt on attach** when rehydrated `runStatus` is non-terminal — after refresh, Fake/Runtime may not match stored stream; design requires `run.interrupted` append as recovery fact before reconcile (D8).

### 4.3 Multi-task isolation gaps

| Spec claim | Current | Gap |
|---|---|---|
| Independent EventStore cursor per Task | Implicit via `taskId` partition + controller local `cursor` on attach | No durable per-task cursor entity; switching tasks rebuilds cursor from full read |
| One Task’s events must not change another | Memory `byTask` + controller taskId filter | OK for Memory; IDB must use task-scoped keys/indexes and **no multi-task write TX** |
| Cross-task parallel execution | Product uses **one** `TaskRuntimeController` (switch attach); Fake supports multi-task sequences | Parallel **live** subscriptions for multiple tasks not product-default; IDB must still allow concurrent reads / background write for non-selected task if future multi-controller |
| Command ack isolation | Global `commandId` | OK if `commandId` globally unique (CommandFactory seeds); document that commands store is **not** task-partitioned |
| Catalog vs events | Catalog not in EventStore | **[shared-IDB]** Navigator list ≠ EventStore contents; integrity requires catalog↔events rules (orphan events, delete order) — ticket 03/05 |

### 4.4 Recovery protocol gap (controller + Port together)

Design recovery algorithm (compressed):

```text
load latest Snapshot for task
  → if present: project(snapshot) + read events (from lastTaskSequence+1)
  → else: read from 1
if run non-terminal: append run.interrupted (via Runtime/command path, not silent state edit)
subscribe Runtime from durable cursor
optional: reconcileInterruptedRun
```

Implemented today:

```text
read all from 1 → projectEvents
subscribe Runtime from lastTaskSequence
(no interrupt, no snapshot apply, no Runtime getSnapshot, no store cursor API)
```

This is the largest **behavioral** gap for “refresh recovery” claimed in umbrella Phase 4E item 5 vs what 4E actually shipped (Memory rehydrate only).

### 4.5 Findings that change if catalog shares the same IDB **[shared-IDB]**

Map decision: Project/Task **directory + events** in **one** IndexedDB.

Impacts:

1. **DB open ownership** — single open handle in Composition Root vs two adapters opening same DB (ticket 03). EventStorePort should not own version bumps alone if catalog stores co-evolve.  
2. **`metadata` store** — may hold DB-wide schema version, not Task-only. Port might not expose it; shared infrastructure module/adapter shell might.  
3. **Task delete** — single TX may need catalog row + events + snapshots + cursors + (scoped) commands; pure EventStore `deleteTaskEvents` is necessary but not sufficient (ticket 05).  
4. **`listTasks`** — still catalog-first; EventStore list only for integrity/GC.  
5. **Quota** — catalog + large event streams share quota; degrade policy is product-wide (map already lists as unspecified).  
6. **Migration** — one `onupgradeneeded` chain for all stores; EventStore adapter must participate without owning Project Module.

If ticket 03 chooses **separate DBs**, cursors/metadata ownership simplifies for EventStore, but map currently locks unified IDB — plan for shared.

---

## 5. Recommended contract patches (decision list — not code)

Prioritized for implementation-session blockers. Each is a decision, not an API sketch.

### Must decide before coding IDB adapter

| ID | Decision | Options (recommended first) | Why |
|---|---|---|---|
| **D1** | How Port surfaces durable failures | **(a)** Methods throw or return `Result` carrying `EventStoreError`; controller maps to notice + `persistenceDegraded` flag **(b)** Callback/event bus | Type exists but is dead; empty `catch` is unsafe for IDB |
| **D2** | Transactional write unit | **(a)** Add `appendWithCheckpoint({ envelope, snapshot, cursor? })` (or `commitBatch`) as single atomic Port op **(b)** Keep separate methods but document “adapter may buffer; only TX commit is durable” and **forbid** controller from treating post-append projection as durable until ack | Spec: append+cursor+snapshot TX; fail must not advance durable cursor |
| **D3** | First-class `cursors` store | **(a)** Collapse: durable cursor **is** Snapshot.`lastTaskSequence` + optional `runtimeCursor` string; drop separate store from §12 **(b)** Keep `cursors` store + Port get/putCursor(taskId) | Avoid dual sources of truth; Memory already has no cursor store |
| **D4** | Uniqueness / conflict on append | On primary key `taskId+taskSequence`: same eventId → duplicate; **different** eventId → `conflict` / `transaction_failed` (not silent overwrite). eventId unique globally across tasks | IDB keyPath forces this; Memory does not |
| **D5** | Snapshot keying | **(a)** One row per `taskId` (latest checkpoint only) + optional historical run snapshots later **(b)** Composite `taskId+runId` as primary with “latest task” pointer | Memory dual-write both keys; clarify for IDB keyPath |
| **D6** | `metadata` ownership **[shared-IDB]** | **(a)** Shared DB shell owns metadata/migrations; EventStore adapter is a store consumer **(b)** EventStorePort gets get/putMetadata | Ticket 03 coupling |
| **D7** | Task-scoped delete on Port | Add `deleteTaskData(taskId): Promise<…>` deleting events + snapshots + task cursors; commands: **(a)** leave global acks **(b)** delete acks with `taskId` field if stored | Map requires Task delete; ticket 05 |
| **D8** | Controller recovery algorithm (product contract) | Adopt §12: snapshot+tail; on attach if non-terminal → ensure `run.interrupted` fact then optional reconcile; persist path must not advance durable checkpoint before TX success; honesty copy parameterized (Memory / IDB / degraded) | Largest behavior gap vs refresh recovery |
| **D9** | Write batching policy | **(a)** Adapter batches appends; Snapshot checkpoint every N events / turn boundary / terminal **(b)** Checkpoint every event (Memory parity; may jank under IDB) | Spec §16 |
| **D10** | Command ack read path | **(a)** Runtime remains sole idempotency authority; EventStore commands are audit/resume cache only **(b)** Controller consults store before resend after refresh | Spec requires commands store retrievable by commandId; usage is undecided |
| **D11** | Enumeration API | **(a)** No `listTasks` on EventStore; catalog only; optional `hasEvents(taskId)` / admin `listTaskIdsWithEvents` **(b)** EventStore list drives Navigator (reject — fights catalog ownership) | Avoid dual catalogs |
| **D12** | Open / readiness lifecycle | Composition Root opens DB once; Port is ready after `open`; expose `open_failed` / `blocked` before first attach | IDB-specific; Memory factory is sync |
| **D13** | Schema version on stored records | Every event/snapshot/command carries `schemaVersion` (envelope already has it); adapter migration chain version separate from envelope; unmigratable → retain raw + surface recovery error | Spec §12 schema bullet |
| **D14** | Degrade mode product copy | On durable fail: keep memory projection, set explicit non-recovery-guaranteed notice; never claim IDB restore | Spec + map unspecified UX |

### Soft / can trail slightly after adapter skeleton

| ID | Decision | Note |
|---|---|---|
| **D15** | Multi-tab writer policy | Map lists as not yet specified; default single-tab optimistic is OK for v1 if documented |
| **D16** | Contract test suite for EventStorePort | Spec §14 requires Fake + future production Adapter same contract tests (duplicate, range, conflict, error codes, isolation) |
| **D17** | Snapshot body richness | Today Snapshot is thin (`RuntimeSnapshot`); full projection blob vs sequence-only checkpoint affects D8 performance |
| **D18** | GC vs hard delete | Spec: cleanup must not delete referenced source events; Task hard-delete may still remove entire task stream (ticket 05) |

---

## 6. Direct answers to ticket questions

1. **Port methods enough?**  
   **No** for IDB production path. Keep append/read/snapshot/ack; **add or decide** transactional checkpoint, errors, delete, open/ready; **decide** cursors/metadata/list (likely not listTasks on this Port).

2. **Memory → IDB behavior diffs?**  
   Sync-success vs async failure (quota/blocked/TX); non-atomic append+snapshot; projection currently advances before durable write; no degrade path; rehydrate is full replay without snapshot; honesty string is Memory-hardcoded.

3. **Multi-task cursor / isolation gaps?**  
   Event stream isolation by `taskId` is fine. Durable per-task cursor store missing; command acks global; true multi-subscription parallel not product-default; **[shared-IDB]** catalog↔events integrity and delete TX are open (03/05).

4. **Contract patch list?**  
   See **§5 D1–D14** (must) and D15–D18 (trail).

---

## 7. Suggested one-line map gist (for parent)

> EventStorePort covers Memory happy-path only; IDB needs transactional checkpoint + error/degrade contract, snapshot+tail rehydrate with run.interrupted recovery, task-scoped delete, and explicit cursors/metadata ownership (shared-IDB with catalog) before implement.

---

## 8. Out of scope / non-claims

- No product code or Port edits in this research.  
- Does not close ticket 03 schema or 05 delete — only lists dependencies.  
- Does not design IndexedDB keyPath DDL (belongs to 03).  
- VoltAgent adapter persistence is still non-IDB; same Port contract would apply when durable store is injected at Composition Root.
