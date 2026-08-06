# Adversarial multi-axis review — Sidecar Plugin System (#17–#25)

**Date:** 2026-08-06  
**Range:** `b173569` / `20d1cec^` … `HEAD` (through close-out `f9ba521` + later docs)  
**Package:** `tooling/workbench-runtime-voltagent` (`src/plugin/*`, `create-agent.ts`, operator CLI)

**Sources (all parallel lanes finished):**

| Lane | Focus | Job | Status |
| --- | --- | --- | --- |
| Codex A | #18 SecurityPolicy + SecretRef | `review-msh1a6hl-avyptb` | **Done** — 3 P1 + 1 P2 |
| Codex B | #19+#20 Registry MCP + Skills | `review-msh1a6hl-i1gpo0` | **Done** — 4 P1 + 1 P2 |
| Codex C | #21 domain CLI | `review-msh1a6hl-pazeax` | **Done** — **1 P0** + 2 P1 + 1 P2 |
| Codex D | #22–#25 auth / discovery / doctor / assembly | `review-msh1a6hm-56649f` | **Done** — **1 P0** + 6 P1 + 1 P2 |
| Local explore | security adversarial | subagent | **Done** — P0 env merge |
| Local explore | spec compliance | subagent | **Done** — ticket gap table |

Invocation: `codex-companion.mjs adversarial-review --background --base <plugin-parent> --scope branch "<ticket focus>"`.

---

## Verdict: **block** (no-ship)

| Scenario | Verdict |
| --- | --- |
| Office + domain CLI / PLUGIN_PATHS CLI | **block** — P0 child-env secret inheritance |
| Office MCP HTTP + skills only, CLI never enabled | **ship-with-nits** after addressing skills disable fallback + MCP hang isolation |
| Untrusted `PLUGIN_PATHS` writers | **block** — self-certified free tools + arbitrary command + env leak |

Fake Runtime path is out of plugin load; not implicated by P0.

---

## Consensus P0 (Codex C+D + local)

### Filtered child env is nullified — `defaultCliRunner`

**File:** `tooling/workbench-runtime-voltagent/src/plugin/cli-loader.ts`

```ts
env: options.env ? { ...process.env, ...options.env } : process.env
```

`filterChildEnv` / model-key hard-deny are bypassed because omitted keys still inherit from host.

**Probes:**
- Codex A/C/D + local: synthetic secrets / `OPENAI_API_KEY` / `LEAK_ME` observed in child when not in filtered map.
- Auth statusCommand runners can forward full env similarly (Codex A/D).

**Impact:** Any ready domain CLI can dump model keys via tool stdout.

**Fix:** Pass **only** closed filtered env (base keys already in `filterChildEnv`). Never spread `process.env`. Add regression test on runner `env` argument.

---

## Codex lane summaries

### #18 (`avyptb`) — No-ship: 3 P1 + 1 P2

| Sev | Finding |
| --- | --- |
| high | Child env replaced with host env (CLI + auth probe) |
| high | Model-key hard deny incomplete (`HF_TOKEN`, `AWS_SECRET_*`, …; `GOOGLE_APPLICATION_CREDENTIALS` exempt) |
| high | CLI `needsApproval:false` without requiring `readOnly` |
| medium | Keychain stub “unconfigured” vs unsupported |

### #19+#20 (`i1gpo0`) — No-ship: 4 P1 + 1 P2

| Sev | Finding |
| --- | --- |
| high | Non-settling MCP blocks all later contributions (serial await, no hard deadline) |
| high | Local skills path/symlink escape (`bundledRelativeDir` absolute; package-root resolve; symlink follow) |
| high | One skills failure aborts entire office assembly (`create-agent` throw; may skip disconnect) |
| high | `PLUGINS_DISABLED=skills.office` still mounts `/skills` + toolkit + hard-coded skill instructions |
| medium | Empty-tools MCP failed status hidden if sibling MCP connected |

### #21 (`pazeax`) — No-ship: **P0** + 2 P1 + 1 P2

| Sev | Finding |
| --- | --- |
| **critical** | Same child-env P0 |
| high | `{{param}}` in any argv position can select subcommands / reconstruct `sh -c` when command is a shell |
| high | Mutating CLI can self-disable approval |
| medium | Mid-contribution CLI failure leaves earlier tools mounted while status=failed |

### #22–#25 (`56649f`) — No-ship: **P0** + 6 P1 + 1 P2

| Sev | Finding |
| --- | --- |
| **critical** | Same child-env P0 |
| high | `plugin.json` can register “JS” via CLI pointing at node + script + free approval |
| high | AuthBindingStore status-only; clear does not revoke env-based MCP tokens |
| high | Doctor can print opaque credential values from raw error strings |
| high | `PLUGINS_ENABLED` **replaces** default set (docs say override list; office loses skills if only `cli.feishu`) |
| medium | Production `cli_session` never probed (no runner injected in create-agent/operator) |
| high | create-agent remounts skills after Registry disables them |
| medium | Non-canonical IDs (whitespace) bypass conflict / enable matching |

---

## Local security / spec (compressed)

- Same CLI env P0; PLUGIN_PATHS trust for free tools; absolute cwd/template paths.
- Spec: #19/#20/#23/#24 largely done; #18/#21/#22 overstated “done” relative to child-env + auth completeness.
- Solid: MCP empty→failed, default tool approval, no external `contributes.tools` JS module load, execFile without shell string join, missing-only skills seed helpers, doctor intent.

---

## Recommended fix order

1. **P0** — Closed env for all CLI / statusCommand runners + tests.  
2. **P1** — MCP load timeout / fail isolation (don’t block skills/CLI forever).  
3. **P1** — Skills: plugin-relative roots only; no absolute escape; no `/skills` fallback when disabled; soft-fail optional local skills at assembly.  
4. **P1** — CLI approval: `needsApproval:false` requires `readOnly:true`; reject shell binary + free argv placeholders for action slots if needed.  
5. **P1** — `PLUGINS_ENABLED` semantics: additive vs replace — pick one and document; default office builtins must stay unless explicitly disabled.  
6. **P1** — Doctor: redact using known secret values; never raw-pass error strings with tokens.  
7. **P1** — Auth: either inject SecretRef into MCP loaders or stop reporting `connected` without injection; wire production `cli_session` probe.  
8. **P2** — Plugin status when any MCP server failed; keychain unsupported; ID normalize/trim.

---

## Repro

```bash
pnpm --filter @uilab/workbench-runtime-voltagent test   # green today — missing trust-boundary cases
pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor -- --json
```

Codex job IDs (this session):  
`review-msh1a6hl-avyptb`, `review-msh1a6hl-i1gpo0`, `review-msh1a6hl-pazeax`, `review-msh1a6hm-56649f`.

Raw structured dumps archived at session time under companion logs  
`/var/folders/.../codex-companion/uilab-admin-*/jobs/review-msh1*.log`.

---

## Fix pass (same day)

**Commit:** security fix batch after this review (see git log).

| Finding | Fix |
| --- | --- |
| P0 child env merge | `defaultCliRunner` / `closedChildEnv` — never spreads `process.env` |
| P1 CLI free-approval self-cert | `needsApproval:false` requires `readOnly:true` |
| P1 argv / shell | ban placeholder first segment; ban shell binaries as CLI |
| P1 partial CLI tools | only mount tools after full contrib validates |
| P1 MCP hang | `Promise.race` with `MCP_TIMEOUT_MS` / server timeout |
| P1 skills absolute path | reject absolute `bundledRelativeDir`; canonical check on templates |
| P1 skills disable remount | no `/skills` fallback; skills toolkit only when roots present; soft-fail non-office skills |
| P1 PLUGINS_ENABLED replace | additive: defaults ∪ ENABLED − DISABLED |
| P1 bearer auth aliases | `envNames` any-of for docs/calendar |
| P1 doctor opaque tokens | broader sanitize + env secret value redaction |
| P1 plugin status | any failed MCP marks plugin failed |
| P1 cli_session never probed | default to closed-env `defaultCliRunner` when no inject |
| P2 non-canonical id | reject whitespace/control in plugin id |

**Verify:** `pnpm --filter @uilab/workbench-runtime-voltagent test` → **120 pass** + typecheck.
