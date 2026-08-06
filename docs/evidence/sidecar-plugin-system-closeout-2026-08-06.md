# Sidecar Plugin System close-out evidence

**Date:** 2026-08-06  
**Scope:** Spec #17 · tickets #18–#25  
**Honesty:** Local VoltAgent sidecar plugins only — **not** remote multi-tenant production Runtime. Fake ≠ production. Secrets never enter browser / RuntimePort.

## Ticket map

| Issue | Title | Status | Representative commit |
| --- | --- | --- | --- |
| #17 | Spec: Sidecar Plugin System | Done (this close-out) | `b173569` + tickets |
| #18 | SecurityPolicy + SecretRef (env_ref) | Closed | `20d1cec` |
| #19 | PluginRegistry + MCP builtins | Closed | `f2c8757` |
| #20 | Skills contribution | Closed | `9784f17` |
| #21 | Domain CLI (execFile allowlist) | Closed | `82f3203` |
| #22 | Auth bindings (enable ≠ login) | Closed | `1ac3280` |
| #23 | plugin.json discovery (PLUGIN_PATHS) | Closed | `ea1fc7a` |
| #24 | Operator list/doctor | Closed | `7609374` |
| #25 | Assembly cutover + docs/evidence + Fake | Closed | (this document) |

## Assembly contract (office)

```text
createWorkbenchAgent({ profile: 'office' })
  → ensureOfficeWorkspace
  → createPluginRegistryFromEnv(env)   // builtins + PLUGIN_PATHS
  → registry.load({ workspaceRoot })
  → Workspace.skills.rootPaths = skillRoots
  → Agent.tools = MCP + domain CLI tools (if any)
```

- **No** `office-mcp` / `office-skills` façades; **no** dual-connector enum in the load path.
- Minimal profile does **not** load the plugin registry (DIY tools only).
- Without MCP/CLI env: Workspace FS + skills seed still work (`create-agent` tests).

## Reproducible verification (no API Key / no Feishu account)

```bash
# 1) Sidecar unit + typecheck
pnpm --filter @uilab/workbench-runtime-voltagent test
pnpm --filter @uilab/workbench-runtime-voltagent typecheck

# 2) Operator surface (script-assertable JSON; no secrets)
pnpm --filter @uilab/workbench-runtime-voltagent plugin:list
pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor -- --json

# 3) Workbench Fake / honesty / adapter (default Fake path; no sidecar required)
pnpm --filter @uilab/agent-workbench exec vitest run --browser.headless \
  src/modules/task/runtime/runtime-honesty.test.ts \
  src/modules/task/runtime/fake-runtime.test.ts \
  src/modules/task/runtime/voltagent/voltagent-runtime-adapter.test.ts

# 4) Workbench architectural gate
pnpm check:workbench
```

### Recorded run (2026-08-06, this close-out)

| Command | Result |
| --- | --- |
| `@uilab/workbench-runtime-voltagent` typecheck | pass |
| `@uilab/workbench-runtime-voltagent` test | **118** pass |
| honesty + fake-runtime + voltagent-adapter | **26** pass (3 files) |
| `pnpm check:workbench` | **OK** |

Operator smoke (no secrets printed): `plugin:list` / `plugin:doctor -- --json` exercise Registry + auth findings.

## Behaviour covered

| Area | Coverage |
| --- | --- |
| SecurityPolicy | fail-closed tool/CLI approval; model keys never in child env |
| SecretRef env_ref | resolve / missing / clear binding; no secret in logs |
| Registry MCP | disabled / mock connect / isolate fail / empty tools = failed |
| Skills | missing-only seed; symlink fail-closed; PLUGINS_DISABLED |
| Domain CLI | allowlist argv; execFile; missing binary; needsApproval |
| Auth | enable ≠ login; cli_session probe; doctor lines |
| Discovery | PLUGIN_PATHS plugin.json; reject tools JS; id conflict; isolate corrupt |
| Operator | list TSV + doctor JSON; exit 1 on warn/error |
| Fake path | honesty + fake-runtime + voltagent adapter tests (no plugin load in browser) |

## Disclosure checklist

- [x] Sidecar purpose / logs: local Office Runtime · not remote production cluster
- [x] OPERATOR.md + README: PluginRegistry, PLUGIN_PATHS, auth, list/doctor
- [x] `.env.example`: plugin env keys; secrets stay gitignored
- [x] Fake/capture remains default Workbench path without `VITE_RUNTIME_ADAPTER=voltagent`
- [x] UI still only sees tools via RuntimePort event stream when sidecar connected

## Residual / non-goals

- OAuth 2.1 browser flow and OS Keychain **implementation** (interfaces reserved).
- Plugin marketplace / UI panels.
- Loading arbitrary external JS tools from local plugins (hard-denied).
- Changing RuntimePort vocabulary or Fake projection semantics.
- Real Feishu/GitHub live account CI.

## Related docs

- `docs/plans/sidecar-plugin-system-spec.md`
- `docs/plans/sidecar-plugin-architecture.md`
- `docs/plans/sidecar-plugin-authorization.md`
- `tooling/workbench-runtime-voltagent/OPERATOR.md`
- `tooling/workbench-runtime-voltagent/README.md`
