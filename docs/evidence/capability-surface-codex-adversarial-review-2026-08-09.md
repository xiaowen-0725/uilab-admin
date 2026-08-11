# A. Executive verdict

Ship with major revisions, not as-is. Overall risk is **high** for this validation slice, not because the idea is wrong, but because the spec currently claims a tighter, more executable loop than the repo actually defines. The design is strongest where it preserves existing doctrine (`PluginRegistry` as packaging truth, no secrets in renderer, no `RuntimePort` vocabulary explosion). It is weakest where it hand-waves the control plane that turns those doctrines into an honest product loop: Feishu host OAuth from `+`, the exact effective capability algorithm, the connector projection model, Expert bypass loading, and snapshot freshness/concurrency. In its current state, the team can very easily ship a UI that looks coherent while the real capability semantics remain ambiguous or fake-adjacent.

# B. What is solid (keep)

- **Plugin stays the packaging truth.** This is the right anchor. `workbench-capability-surface-spec.md` and `CONTEXT.md` correctly separate `Plugin` from user-facing `Connector`, and the shipped sidecar already has a stable `PluginManifest`/`PluginRegistry` base.
- **`enable != login` is the right invariant.** `tooling/workbench-runtime-voltagent/src/plugin/types.ts` already encodes `AuthStatus`, and `sidecar-plugin-system-spec.md` clearly distinguishes plugin enablement from connected identity.
- **Renderer never holding secrets is non-negotiable and correct.** Both the capability spec and the sidecar spec are aligned here; do not weaken this for convenience.
- **Not bloating `RuntimePort` is a good constraint.** The ADR is correct to resist turning auth/catalog state into a new execution event universe.
- **Expert as configuration, not supervisor product, is the correct product bet for this slice.** The research explicitly rejects Kun-style multi-agent routing. Keep that rejection hard.
- **Domain CLI as allowlisted argv, not shell, is correct.** The current `cli.feishu` sample is crude but the security model is sound.
- **Fake honesty is correctly stated.** The explicit “catalog/selectable but no fake external success” rule is one of the strongest parts of the spec and should remain uncompromised.

# C. Critical issues (must resolve before implementation)

## 1. Feishu OAuth is specified as the main demo path, but the base sidecar contract still treats it as post-phase

- **Severity:** blocker
- **Why it fails:** The validation slice claims “`+` → 去授权 → host OAuth → Connected → tools inject” as a core success path, but the underlying shipped plugin system does not yet define that as the stable product contract for Feishu. The current shipped builtins are `static_bearer` and `cli_session`, not a productized Feishu host OAuth connector.
- **Evidence:** `workbench-capability-surface-spec.md` makes Feishu in-panel OAuth a goal and acceptance path. `sidecar-plugin-system-spec.md` still marks browser OAuth/Keychain production hardening as later-phase / out of scope. `builtins.ts` shows `mcp.docs`/`mcp.calendar` using `static_bearer`, while `cli.feishu` uses `cli_session` and explicitly says this is not host OAuth. The sample-sources research also calls this mismatch out directly.
- **Concrete fix options:**
  - **Option A:** Downgrade this validation slice to an honest “connect via env/PAT or CLI login first, then select in `+`” path. Keep `+` for status and task selection only.
  - **Option B:** Pull Feishu host OAuth into the actual sidecar contract now: define the exact auth resource, redirect ownership, persisted binding shape, success/failure callbacks, refresh/revoke semantics, and which plugin/resource becomes `connected`.
- **Recommended:** **Option B** if the team insists this slice proves “in-place OAuth.” Otherwise the spec is overstating readiness. If schedule cannot support B, take A and rewrite the goal.

## 2. There is no normative “effective capability set” algorithm

- **Severity:** blocker
- **Why it fails:** The entire product loop depends on knowing what tools/skills are actually active for the next turn. Today the spec names multiple layers but never formalizes how they combine. That guarantees divergent implementations between UI state, sidecar assembly, and timeline behavior.
- **Evidence:** `workbench-capability-surface-spec.md` distinguishes global plugin enable, task-level connector selection, skill multi-select, expert defaults/recommendations, and connected status, but never defines precedence or output. `PluginRegistry` today only resolves env/global enablement (`enabledByDefault`, `PLUGINS_ENABLED`, `PLUGINS_DISABLED`). The research explicitly recommends an openworker-style `effective` algorithm, but the spec never locks it.
- **Concrete fix options:**
  - **Option A:** Add a normative algorithm now, e.g. `effectiveConnectors = globallyEnabled ∧ connected ∧ taskSelected ∧ !taskMuted`; `expert.connectors` only seeds UI defaults and never force-enables.
  - **Option B:** Collapse scope for this slice: task selection only affects chips/UI; actual runtime assembly continues to use a simpler global enable set. This is weaker but at least honest.
- **Recommended:** **Option A.** Without it, “Task-level enable” is not a design, it is a slogan.

## 3. Connector is defined as a product type, but the mapping from plugin contributions to connector records is underspecified

- **Severity:** blocker
- **Why it fails:** The spec wants “Connector” to be a first-class user concept while refusing to create a second plugin kernel. That is fine in principle. It is not fine to omit the projection model. Someone still has to define the canonical connector record, its IDs, display name, auth source, contributing plugin resources, and how one connector spans MCP plus CLI.
- **Evidence:** `CONTEXT.md` says a connector can map from one or more plugins. The capability spec says `connector.feishu` may map to official MCP plus optional CLI. The research explicitly warns that 1 plugin -> N connectors is possible. There is no `ConnectorDescriptor`/projection schema in repo docs or code. The current builtins are still `mcp.docs`, `mcp.calendar`, `cli.feishu`, not product connector entities.
- **Concrete fix options:**
  - **Option A:** Add a small explicit `ConnectorDescriptor` layer owned by the sidecar or shared contract: `id`, `name`, `description`, `authSummarySource`, `pluginRefs[]`, `toolScope`, `availability`.
  - **Option B:** Drop connector aggregation for the validation slice and expose only one plugin = one connector row, with product renaming deferred.
- **Recommended:** **Option A.** Otherwise Feishu will be a naming trick over mismatched plugin rows, which is exactly the kind of product confusion this spec claims to eliminate.

## 4. Expert bypass profiles are a shadow packaging system, not just a shortcut

- **Severity:** high
- **Why it fails:** The ADR frames bypass-loaded Expert profiles as a temporary speed move. In practice, it creates a second discovery root, second versioning story, second trust boundary, and second vendor/copy flow. That is not free. It weakens the “PluginRegistry is the packaging truth” doctrine while pretending not to.
- **Evidence:** ADR 0016 explicitly chooses an independent expert profiles root and bypass load. `workbench-capability-surface-spec.md` places experts under `tooling/workbench-runtime-voltagent/experts/` rather than inside `PluginManifest`. The sample-source research already has to explain this as a separate profile mechanism.
- **Concrete fix options:**
  - **Option A:** Make Experts a first-class manifest contribution now (`contributes.experts`) even if loader support is minimal.
  - **Option B:** Keep bypass loading, but explicitly declare Expert profiles as a **Workbench-owned static config root**, not part of plugin packaging truth. Document trust, collision, and version precedence rules.
- **Recommended:** **Option B** for this slice. It is cheaper. But stop describing it as “not a second kernel”; describe it honestly as a temporary separate profile catalog with a migration target.

## 5. `CapabilitySnapshotPort` is under-specified as a live state contract

- **Severity:** high
- **Why it fails:** Snapshot is doing much more than “status-safe catalog read.” It is the freshness contract for auth state, connector visibility, task chips, and post-auth UI recovery. If this port is not specified as a state machine with invalidation rules, the product will drift into stale or contradictory UI.
- **Evidence:** The ADR and spec justify SnapshotPort as a way to avoid `RuntimePort` bloat, but they do not define push vs poll, refresh triggers, staleness semantics, optimistic transitions, or what happens during auth window close, task switch, logout, or residual state issue `#33`. Acceptance expects `+` to refresh from missing to connected after OAuth, but no control-plane contract explains how.
- **Concrete fix options:**
  - **Option A:** Specify SnapshotPort as query + explicit invalidation events: `refresh(reason)`, `authStarted`, `authCompleted`, `authFailed`, `taskSelectionChanged`, with versioned snapshots.
  - **Option B:** Make it polling-only for the validation slice, with brutally honest UX and no promise of instant recovery.
- **Recommended:** **Option A.** The port does not need to become `RuntimePort`, but it does need lifecycle semantics.

## 6. The built-in sample set does not actually prove the claimed product loop

- **Severity:** high
- **Why it fails:** The current samples can let the team “pass” acceptance while never proving connector selection materially changes behavior. `planning-and-task-breakdown` does not require Feishu. `expert.xhs-cover` does not require any connector at all. That means the system can look like it supports connector/skill/expert composition while only the prompt overlay and skill path are real.
- **Evidence:** Appendix A in the capability spec plus the sample-source research. The strongest real E2E path is actually `expert.office-meeting` + `meeting-notes` + Feishu doc read, but the spec treats the four sample items as co-equal rather than identifying one mandatory proof path.
- **Concrete fix options:**
  - **Option A:** Define one mandatory golden path: select Feishu connector + office-meeting expert + a document-reading task; connector use must be necessary and observable.
  - **Option B:** Remove the claim that the slice proves connector selection affects runtime behavior; state that it proves only catalog/auth selection plus independent skill/expert usage.
- **Recommended:** **Option A.** Otherwise the demo can succeed while the main architectural promise remains unproven.

# D. Important non-blockers

## 1. `@专家` / `@技能` is deferred too far for a feature whose headline is “in conversation”

- **Severity:** medium
- **Why it fails:** The main path can still be `+`, but once the spec names `@` as a supported auxiliary path, conflict rules matter: duplicate selection, unknown ids, partial matches, and whether textual mention mutates task state or is just parsed as content.
- **Evidence:** The capability spec says `+` is primary and `@` shares the same state source, but open items explicitly defer `@` syntax and conflict rules.
- **Fix options:** Either remove `@` from this slice entirely, or add a minimal grammar and precedence rule now.
- **Recommended:** Remove it from the slice unless the team is ready to spec it properly.

## 2. Selection persistence semantics are too fuzzy

- **Severity:** medium
- **Why it fails:** Expert is “next turns only,” but the spec does not say whether task selections persist across reload, adapter switch, or duplicate task tabs. That ambiguity will produce accidental persistence bugs framed as UX preference disputes.
- **Evidence:** `workbench-capability-surface-spec.md` mentions `workbench-session` as optional for task persistence but leaves behavior open.
- **Fix options:** Lock one rule for the slice: persist per-task locally until task deletion, or do not persist across reload at all.
- **Recommended:** Persist per-task locally; anything else will feel broken in a desktop-first shell.

## 3. “Status-safe” snapshot still needs a field-level PII budget

- **Severity:** medium
- **Why it fails:** Avoiding tokens is necessary, not sufficient. Tenant ids, email addresses, app ids, and redirect URIs can still become accidental leakage if the snapshot gets too generous.
- **Evidence:** `types.ts` marks OAuth metadata as non-secret, but that does not automatically make it safe for renderer/UI display or timeline logging.
- **Fix options:** Add an allowlist of snapshot-visible fields and ban raw binding metadata from renderer-facing DTOs.
- **Recommended:** Explicit allowlist.

## 4. The Feishu product name is overloaded across docs/docs-MCP/calendar/CLI

- **Severity:** medium
- **Why it fails:** If “Feishu” means docs MCP in one place, calendar MCP in another, and generic office auth elsewhere, operators and users will not know what they actually connected.
- **Evidence:** Current builtins are `mcp.docs`, `mcp.calendar`, `cli.feishu`; the capability spec proposes a single `connector.feishu` projection.
- **Fix options:** Either scope the first connector to “飞书文档” only, or define sub-capabilities under one connector explicitly.
- **Recommended:** Narrow P0 to “飞书文档” unless there is real calendar coverage in the demo.

## 5. Fake honesty needs one more guard: no fake connector-derived expertise

- **Severity:** medium
- **Why it fails:** Even without fake external calls, Fake can still look too smart if selected experts/skills silently bias outputs as if connector-backed context were loaded.
- **Evidence:** The spec forbids fake external success but does not forbid fake connector-context effects.
- **Fix options:** Add an invariant that Fake may reflect selected labels/chips but may not claim connector-fetched facts or imply remote retrieval.
- **Recommended:** Add the invariant.

# E. Minor / nits

- “Enabled” is overloaded between plugin-level and connector-level UI. Use separate labels or scopes in implementation notes.
- `connector.feishu` is too broad for a first slice if the real shipped coverage is mostly docs-oriented.
- The acceptance script should explicitly fail if connector selection has no observable effect on tool availability.
- `expert.xhs-cover` is a weak sample for sidecar capability proof. Keep it as a UX sample, not an architecture proof sample.
- “Settings later” is fine, but the spec should still state who owns account disconnect/revoke authority.

# F. Missing specs / invariants to add

1. **Effective connector rule:** A connector is runnable for a task iff `plugin globally enabled AND connector selected for task AND auth status = connected AND connector not muted/disabled by task override`.
2. **Expert recommendation rule:** `expert.connectors[]` seeds recommendations only; it never force-enables disconnected or unselected connectors.
3. **Connector projection schema:** Each product connector must declare `id`, `name`, `pluginRefs`, `authSummarySource`, `toolScope`, and `availability in Fake`.
4. **Snapshot freshness contract:** Define refresh triggers, stale state behavior, and whether the port supports push notifications, polling, or both.
5. **Auth round-trip rule:** After auth success/failure/cancel, the renderer must converge to a new snapshot without receiving secrets or raw token metadata.
6. **Persistence rule:** Define whether task selections persist across reload, runtime adapter switch, and task duplication.
7. **Fake rule:** Fake may expose catalog and local selection state but may not simulate remote retrieval, connected status, or connector-derived facts.
8. **Expert trust rule:** Expert profiles may not declare tools outside Registry-visible tool scope; unknown connector ids are validation errors.
9. **Field budget rule:** Renderer-facing capability snapshots may include only an explicit allowlist of non-secret, non-PII fields.
10. **Acceptance proof rule:** At least one built-in scenario must fail when its connector is deselected and succeed when selected + connected.

# G. Suggested redesign deltas (if any)

I would not replace the current architecture; I would tighten it.

The smallest structural redesign that improves this slice materially is:

1. Add a **Connector projection descriptor** as a thin contract, instead of treating connector rows as ad hoc UI view models over plugin manifests.
2. Treat **Expert profiles as an explicitly separate static catalog** for this slice, with a written migration target to plugin contributions later.
3. Define a single **effective capability resolver** in sidecar assembly, not in UI state, so the renderer never invents capability semantics.
4. Reduce the proof path to **one golden workflow**: Feishu document read + office meeting expert + notes output.

Cost versus current design:

- Lower than inventing a new runtime.
- Slightly higher than the current docs, because you must specify two tiny contracts (`ConnectorDescriptor`, effective resolver).
- Much lower risk than letting each implementation layer invent its own mapping.

# H. Implementation sequencing risk

The current suggested slice order is **not safe** because it front-loads UI and snapshot shape before the capability semantics are locked. That encourages a visually polished but semantically hollow implementation.

Safer order:

1. **Lock the effective capability algorithm** and connector projection contract.
2. **Choose the auth truth for the slice**: real Feishu host OAuth now, or honest env/CLI login first.
3. **Implement sidecar-side capability resolution + snapshot contract**, including refresh/invalidation behavior.
4. **Prove one golden E2E path** in a testable operator/demo environment.
5. Only then build `+` panel UI and chips around those contracts.
6. Add Expert catalog loading after the above, because Expert without connector semantics is mostly prompt decoration.

If the team wants the fastest risk-kill sequence, do this first: **make connector selection materially change the next turn’s actual tool surface**. That will expose half the unresolved design immediately.

# I. Battle questions for the authors

1. Is Feishu host OAuth truly part of this validation slice, or are you willing to ship the first proof with env/CLI login only?
2. When a connector is globally enabled but not task-selected, is it completely absent from the next turn’s tool surface, or merely deprioritized?
3. Are `expert.connectors[]` recommendations only, or can they auto-select connectors for a task? Pick one.
4. Is `connector.feishu` one connector spanning docs + calendar + CLI, or do you actually need `connector.feishu-docs` as the P0 truth?
5. Which layer owns the effective capability resolver: renderer module, workbench composition root, or sidecar assembly? It must be exactly one.
6. After OAuth success, how does the renderer learn the new connected state: callback event, explicit refresh, polling, or app restart? Pick one.
7. If auth is revoked outside the current task, does the task keep its selected connector chip but show disconnected state, or is selection removed automatically?
8. Are Expert profiles part of packaging truth for this slice, yes or no? If no, what is their trust/versioning rule?
9. In Fake mode, may expert/skill selection change answer style only, or must Fake also suppress any implication that remote context was loaded?
10. What is the single mandatory acceptance scenario that proves connector selection is real rather than decorative?
