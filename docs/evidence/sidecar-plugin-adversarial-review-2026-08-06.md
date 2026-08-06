# Adversarial multi-axis review — Sidecar Plugin System (#17–#25)

**Date:** 2026-08-06  
**Range:** `20d1cec^` / `b173569` … `HEAD` (`f9ba521`)  
**Package:** `tooling/workbench-runtime-voltagent` (`src/plugin/*`, `create-agent.ts`)  

**Sources (parallel):**

| Lane | Focus | Status |
| --- | --- | --- |
| Codex adversarial-review A | #18 SecurityPolicy + SecretRef | **Completed** (`review-msh1a6hl-avyptb`) — structured findings |
| Codex adversarial-review B | #19+#20 Registry MCP + Skills | Intermediate (isolation / degraded paths); no final findings dump yet |
| Codex adversarial-review C | #21 domain CLI | Intermediate: child-env + approval + partial tools-on-fail |
| Codex adversarial-review D | #22–#25 auth/discovery/doctor/assembly | Intermediate: auth status-only; skills roots fallback |
| Local explore (security) | Full stack adversarial | **Completed** — P0/P1/P2 |
| Local explore (spec) | Ticket acceptance vs Spec | **Completed** — gap table |

Base for Codex: branch review against plugin-era parent (`b173569` / `20d1cec^`).  
Companion: `codex-companion.mjs adversarial-review --background --base … --scope branch`.

---

## Verdict: **block** (until child-env isolation fixed)

| Scenario | Verdict |
| --- | --- |
| Ship office with **only** MCP HTTP + skills, **no** domain CLI enabled | **ship-with-nits** (auth alias / doctor honesty nits) |
| Ship with **`cli.feishu` / any domain CLI / PLUGIN_PATHS CLI** enabled | **block** until `defaultCliRunner` stops merging full `process.env` |
| Trust untrusted `PLUGIN_PATHS` writers | **block** until host re-asserts approval (cannot self-certify `needsApproval:false`) |

Fake Runtime path unchanged by this review (plugins load only in sidecar office assembly).

---

## Consensus P0 / high (Codex + local)

### 1. Domain CLI child env inherits full host secrets (**must-fix**)

**Where:** `tooling/workbench-runtime-voltagent/src/plugin/cli-loader.ts` — `defaultCliRunner`

```ts
env: options.env ? { ...process.env, ...options.env } : process.env
```

**Contract claimed:** `filterChildEnv` + model-key hard-deny for stdio/CLI children.  
**Actual:** Filtered map is merged **onto** full `process.env`, so omitted keys (including `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`) still inherit.

**Evidence:**
- Codex #18: synthetic `OPENAI_API_KEY` sentinel **observed in child** when filtered map omitted it.
- Local security review: same root cause; MCP stdio path does **not** re-merge host env the same way.
- Codex #18 also notes `secret-store` / auth `cli_session` probes can forward full env into status runners.

**Impact:** Enabled domain CLI binary (builtin or PLUGIN_PATHS) can dump model credentials via stdout returned to the agent (truncated but large).

**Fix direction:** Pass **only** filtered env (plus intentional `CHILD_ENV_BASE_KEYS` already inside `filterChildEnv`). Regression test: runner sees no `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`.

**Severity:** Local called **P0**; Codex labeled **P1 high** (“No-ship”). Treat as **ship blocker**.

---

## Codex #18 final findings (verbatim themes)

Job `review-msh1a6hl-avyptb` — **No-ship: 3 P1 + 1 P2**

| Sev | Title | Notes |
| --- | --- | --- |
| high | Filtered child environment is replaced with the host environment | CLI execFile + auth probe env merge |
| high | Model-provider hard deny misses common credentials | e.g. `HF_TOKEN`, `AWS_SECRET_ACCESS_KEY`, …; `GOOGLE_APPLICATION_CREDENTIALS` exempt |
| high | CLI manifests can disable approval for mutating commands | `needsApproval:false` without requiring `readOnly` |
| medium | Keychain stub reports unsupported as “unconfigured” | `null` resolve / silent clear |

---

## Additional findings (local + Codex intermediate)

### P1

2. **Local plugin self-certifies free tools** — `discover.ts` accepts `needsApproval: false` / `readOnlyToolNames`; host trusts flags. Writer of `PLUGIN_PATHS` can opt out of HITL.  
3. **Auth vs MCP bearer alias mismatch** — MCP load accepts `MCP_DOCS_TOKEN` / `MCP_BEARER_TOKEN`; auth `secretRef` only checks `MCP_DOCS_BEARER_TOKEN` → doctor `auth=missing` while MCP may connect.  
4. **Absolute `defaultCwd` / `bundledRelativeDir`** from declarative plugins (operator `PLUGIN_PATHS` trust boundary).  
5. **Codex C intermediate:** model-controlled `{{param}}` may expand into argv positions that look like subcommands if templates are poorly written (still allowlisted templates only).  
6. **Codex D intermediate:** auth bindings used for **status only**, not credential injection into MCP loaders (may be intentional for env_ref MVP).  
7. **Codex D intermediate:** `create-agent` falls back to `skillRoots=['/skills']` when registry returns none — disabling `skills.office` may not isolate an already-seeded disk tree.

### P2

- `sanitizeHint` pattern-only (no SecretStore known-value pass).  
- `auth=expired` never produced by resolver.  
- `AuthBindingStore` ephemeral; no durable `~/.uilab/runtime` (spec product path).  
- Office assembly hard-throws on any skills `failed` (stricter than per-plugin isolation).  
- Keychain stub honesty (Codex P2).

---

## Spec compliance (local)

| Ticket | Close-out claim | Spec review |
| --- | --- | --- |
| #18 | Closed | **partial** — policy + env_ref OK; durable store missing; child-env contract broken for CLI |
| #19 | Closed | **done** |
| #20 | Closed | **done** (assembly throws on skills fail is stricter isolation) |
| #21 | Closed | **partial** — allowlist/execFile OK; **env merge undoes hard-deny** |
| #22 | Closed | **partial** — enable≠login OK; alias mismatch; expired unused |
| #23 | Closed | **done** |
| #24 | Closed | **done** |
| #25 | Closed | **done** (docs/Fake gates) |

---

## What looks solid (all lanes)

- MCP empty tools → `failed`, not `ok(0)`.  
- MCP tools default `needsApproval`; empty allowlist fail-closed.  
- External `plugin.json` **cannot** load arbitrary JS (`contributes.tools` rejected).  
- CLI uses `execFile` + `shell: false` (no shell string join).  
- Skills missing-only seed + path helpers refuse symlink escape.  
- Registry isolates discovery/MCP/CLI failures for other plugins.  
- Doctor/list designed not to print secret **values** (pattern redaction residual risk).  
- Office assembly is Registry-only (no dual-connector façade).  
- Fake / RuntimePort path not loading sidecar plugins in browser.

---

## Recommended fix order

1. **P0/P1:** `defaultCliRunner` + auth statusCommand runner — closed env only.  
2. **P1:** `decideCliCommandNeedsApproval` — `needsApproval:false` only with explicit `readOnly:true` (or host policy override).  
3. **P1:** Align auth bearer env names with MCP `bearerTokenFromEnv` lists.  
4. **P1:** Broaden model-secret classifier *or* document hard allowlist of child keys only (prefer closed allowlist).  
5. **P2:** Keychain stub status `unsupported`; durable binding store later.

---

## Repro commands

```bash
# Sidecar suite (still green despite contract hole — no real execFile env assert yet)
pnpm --filter @uilab/workbench-runtime-voltagent test

# Operator
pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor -- --json

# Codex (already launched in parallel)
# node …/codex-companion.mjs adversarial-review --base 20d1cec^ --scope branch "<ticket focus>"
```

---

## Job IDs (this session)

| ID | Focus |
| --- | --- |
| `review-msh1a6hl-avyptb` | #18 — **completed**, findings above |
| `review-msh1a6hl-i1gpo0` | #19+#20 |
| `review-msh1a6hl-pazeax` | #21 |
| `review-msh1a6hm-56649f` | #22–#25 |

If remaining jobs emit final structured findings later, append under this file’s “Appendix” rather than reopening the verdict unless they contradict the child-env blocker.
