# Adversarial multi-axis review — Sidecar Plugin Auth (#26 / #28–#32)

**Date:** 2026-08-07  
**Scope:** uncommitted working tree under `tooling/workbench-runtime-voltagent` (Auth inject/revoke, persist, Keychain, OAuth PKCE, operator auth CLI)  
**Invocation:** `codex-companion.mjs adversarial-review --background --scope working-tree --base HEAD`  
**Thread:** `019fdb58-0151-7dd0-871d-6ce1aa03e421`  
**Prior pattern:** `docs/evidence/sidecar-plugin-adversarial-review-2026-08-06.md`

**Codex lanes (parallel):**

| Lane | Focus | Result |
| --- | --- | --- |
| A | inject/revoke + SecurityPolicy hard-deny regression | **P0** model-key re-inject via auth overlay |
| B | persist AuthBinding path / atomicity / JSON schema | **P1** workspace path, secret fields, race |
| C | Keychain + material mapping | **P1** argv token, envNames dropped on keychain login |
| D | OAuth PKCE + operator CLI | **P1** process-local PKCE, logout multi-resource, live sidecar |

---

## Verdict: **BLOCK** (no-ship)

| Scenario | Verdict |
| --- | --- |
| Local `PLUGIN_PATHS` with hostile `contributes.auth` | **block** — P0 model-key exfiltration via child-env overlay |
| Operator OAuth begin → complete in separate CLI processes | **block** — PKCE pending store is process-local |
| Logout while long-lived sidecar already loaded | **block for product claim** — inject snapshot not live-revoked |
| PAT login/logout same process + fake keychain (unit tests) | **ship-with-nits** for demo path only after P0 fix |

Fake Runtime / capture path still does not load sidecar plugins — not implicated by P0.

---

## Consensus findings

### P0 (1)

#### Auth overlay bypasses model-secret hard deny

**Files:**  
- `src/plugin/cli-loader.ts` (~340–343) `buildCliChildEnv`  
- `src/plugin/mcp-loader.ts` `buildMcpChildEnv`  
- `src/plugin/secret-store.ts` credential material → `envValues`

**Attack:** Local plugin declares `auth.envNames: ['OPENAI_API_KEY']` and `childEnvKeys: ['OPENAI_API_KEY']`. `filterChildEnv` strips the model key, then auth material overlay re-adds it. Codex probe: `modelKeyReadded=true`.

**Fix direction:** Reject `isModelProviderSecretKey` names in auth declarations and material resolution; re-apply hard deny after every MCP/CLI overlay.

---

### P1 (11)

1. **Logout does not revoke already-loaded sidecar inject** (`registry.ts` load-time snapshot into MCP headers / CLI closures). Live agent keeps old Authorization until restart.  
2. **OAuth CLI PKCE pending is process-local** (`operator-auth.ts` default pending store) — `oauth-begin` then new process `oauth-complete` always fails state.  
3. **Keychain write via `security -w <token>` argv** (`secret-store.ts`) — same-user process inspection can see PAT/access/refresh.  
4. **Logout multi-resource incomplete** — without `--resource`, only preferred resource cleared; `oauth.refreshAccount` may remain; errors swallowed.  
5. **Plugin-wide revoke undone by one upsert** (`secret-store.ts` clears `pluginId::*` on any resource upsert) — sibling resources re-enable env fallback.  
6. **`UILAB_PERSIST_AUTH=0` desync** — operator-auth still persists; runtime ignores file → logout appears successful, inject still uses env.  
7. **Keychain login drops `envNames`** — connected without named `envValues`; stdio/app_client can be incomplete or keep stale host env.  
8. **Persist root not constrained** — `UILAB_RUNTIME_DIR` / `rootDir` can sit under agent-writable workspace; symlink follow risk.  
9. **JSON SecretRef allows unknown fields** — e.g. `access_token` survives parse and reserialize.  
10. **Binding file write non-atomic / unlocked** — concurrent login/logout/refresh can lose revokes or leave corrupt JSON.  
11. **OAuth token fetch has no timeout** — hung AS blocks registry load / inject path indefinitely.

---

### P2 (1)

- OAuth error bodies lightly redacted; short/punctuated tokens can leak into operator-printed errors.

---

## Remediation (same day, post-review)

| Finding | Status | Notes |
| --- | --- | --- |
| **P0** auth overlay re-injects model keys | **fixed** | `isAllowedAuthEnvName` rejects LLM keys at material resolve; MCP/CLI overlay skips model keys; `stripModelProviderSecrets` post-overlay. Tests: `auth-adversarial.test.ts` + security-policy. |
| P1 process-local PKCE | **fixed** | `createDurableOAuthPendingStore` (file TTL 15m, 0600, one-shot). Operator auth defaults to durable. |
| P1 multi-resource logout + refresh clear | **fixed** | `runAuthLogout` clears all plugin resources without `--resource`; clears access + oauth refresh keychain; JSON `needsSidecarRestart: true`. |
| P1 sibling revoke undone by upsert | **fixed** | Plugin-wide `pluginId::*` + reauthorized `!plugin::res` markers; one upsert does not clear siblings. |
| P1 `UILAB_PERSIST_AUTH=0` desync | **fixed** | `openAuthContext` honors same persist policy as registry. |
| P1 keychain login drops envNames | **fixed** | Keychain login keeps `resource.envNames` for child-env mapping. |
| P1 runtime dir under workspace | **fixed** | `assertRuntimeConfigOutsideWorkspace`. |
| P1 loose SecretRef / non-atomic write | **fixed** | `parseStrictSecretRef` + unknown-field reject; `atomicWriteFileSync` 0600. |
| P1 OAuth token hang | **fixed** | 15s timeout on token exchange; error bodies code-only (no raw AS body). |
| P1 live sidecar inject after logout | **documented** | `needsSidecarRestart: true` in logout JSON/text — no live re-resolve yet. |
| P1 Keychain `security -w` argv | **residual** | Still uses argv for OS keychain write; needs native API / stdin path. Fake mode unaffected. |
| P2 short token redaction | **partial** | Token endpoint errors no longer echo body; general log redaction still length≥4. |

---

## Local verification note

Post-fix (2026-08-07):

```bash
cd tooling/workbench-runtime-voltagent
pnpm typecheck   # pass
pnpm test        # 171 pass / 0 fail
```

Adversarial regression suite: `src/plugin/auth-adversarial.test.ts`.
---

## Re-review (post-fix, 2026-08-07)

**Invocation:** `codex-companion.mjs adversarial-review --background --scope commit --base 7fab5d8^`  
**Thread:** `019fdb98-de9e-75b2-aa03-e21b3f6065ac`  
**Commit reviewed:** `7fab5d8` (pushed to `origin/main`)  
**Verdict:** **needs-attention / no-ship**

| Severity | Finding | Disposition |
| --- | --- | --- |
| **critical** | `--from-env OPENAI_API_KEY` remaps model secret onto benign envNames | **fixed follow-up** — reject `isAllowedAuthEnvName` + declare-list match |
| **high** | Logout ok while live sidecar keeps inject snapshot | residual — `needsSidecarRestart` only |
| **high** | Concurrent load-once full rewrite can overwrite revoke | residual — needs lock/CAS ticket |
| **high** | Keychain `security -w` argv | residual (known) |
| **high** | Non-ENOENT bind-file read → empty store | **fixed follow-up** — fail closed |
| **medium** | Keychain delete ignores all nonzero exits | **fixed follow-up** — only not-found ignored |

### Residual follow-up (same day)

| Residual | Status |
| --- | --- |
| Persist concurrent RMW | **fixed** — exclusive `.lock` + reload-before-mutate; mtime reload on read |
| Live CLI inject after logout | **fixed** — `resolveAuthMaterial` per tool invoke |
| Live MCP host-side after logout | **fixed** — `wrapMcpToolsWithLiveAuthGate` refuses revoked material |
| MCP wire session (HTTP/stdio spawn env) | residual — still needs sidecar restart for transport-layer token drop |
| Keychain argv exposure | **mitigated** — `security -i` + hex `-X` via stdin (secret not in argv) |

Tests: 178 pass.

### Second re-review (thread 019fdbc8-41bf-7c80-a694-9c0202db1238)

**Verdict:** needs-attention / no-ship

| Severity | Finding | Follow-up |
| --- | --- | --- |
| critical | Local plugin.json Keychain account theft | **fixed** — reject keychain in discover; host-owned `uilab:plugin:resource:role`; resolve denies foreign accounts |
| high | CLI still dispatches after revoke | **fixed** — refuse runner unless material connected |
| high | sync load existsSync fail-open | **fixed** — readFileSync only ENOENT→null |
| high | lock timeout steals live lock | **fixed** — never unlink non-stale; owner-token unlink |

Residual: MCP wire session still needs restart.

### Third re-review (thread 019fdbd7-0f51-7f42-a69b-f64ddc638bb5)

**Verdict on f6601ac:** needs-attention / no-ship (3 P1)

| Finding | Follow-up |
| --- | --- |
| CLI authEnforced without matched resource fail-open | **fixed** — always install missing resolver |
| app_client fans one keychain value to all envNames | **fixed** — multi-field remains missing |
| logout ok:true despite keychain clear failure | **fixed** — phase clear keychain then revoke; ok:false + pendingKeychainAccounts |

Tests: 183 pass.

### Fourth re-review (thread 019fdbe7-e2d4-7361-9830-f88175ccabc6)

**Verdict on 8f65288:** needs-attention / no-ship (5 P1)

| Finding | Follow-up |
| --- | --- |
| OAuth refresh undoes logout | **fixed** — isRevoked check + wipe tokens before upsert |
| Unknown --resource logout ok:true | **fixed** — resource_not_found |
| Multi-field app_client keychain login | **fixed** — reject with app_client_multi_field_keychain |
| Keychain account colon collision | **fixed** — length-prefixed `uilab:v1` / `oauth:v1` exact match |
| Unmatched MCP live gate | **fixed** — missing resolver like CLI |

Tests: 185 pass.

### Fifth re-review (thread 019fdbfb-8948-7972-ab12-303c16b02b00)

**Verdict on 148199e:** needs-attention / no-ship (1 P1)

| Finding | Follow-up |
| --- | --- |
| OAuth refresh TOCTOU: isRevoked then upsert reauthorizes | **fixed** — `upsertIfNotRevoked` under lock; refresh never clears revoke |

Tests: 187 pass.

### Acceptance re-review (thread 019fdc95-1ada-7ab2-90d7-a4e3dab95bda)

**Verdict on 03172be:** needs-attention / NO-SHIP (1 P0 + 2 P1)

| Finding | Follow-up |
| --- | --- |
| P0 HTTP MCP omits auth → OPENAI_API_KEY as bearer | **fixed** — always deny model keys in resolveMcpBearerToken + discover parse |
| P1 stale-lock dual reclaim | **fixed** — reclaim only if lock body still matches observed instance |
| P1 logout leaves concurrent refresh tokens | **fixed** — revoke first, then clear snapshotted + deterministic oauth accounts |

Local: typecheck pass, 188 tests pass.
Residual: MCP wire session restart only.

### Pure-review P1 fix (after 1df4838)

| Finding | Fix |
| --- | --- |
| Stale-lock auto-reclaim dual owner | **fail-closed** — never unlink foreign locks; timeout throws |
| runtimeConfigDir skipWorkspaceGuard | **removed** — only explicit test-only `skipWorkspaceGuard` |
| PKCE durable root under workspace | **assertRuntimeConfigOutsideWorkspace** + RMW file lock |
| MCP wrap drops needsApproval fn | **in-place execute wrap** preserves metadata |

Tests: 191 pass.
