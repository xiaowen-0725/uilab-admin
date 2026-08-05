# Second Codex Review — Office Profile (post-fix)

**Range:** `5cb0493`…`HEAD` at review time  
**Model:** gpt-5.6-sol (xhigh)  
**Date:** 2026-08-05  
**Original verdict:** block

## Follow-up fixes (this commit)

| Finding | Fix |
| --- | --- |
| P0 compound MCP read-token bypass | Exact read-only allowlist; default needsApproval |
| P1 LibSQL `.voltagent` symlink | `ensureDirWithinRoot` for default memory path |
| P1 model key filter incomplete | `isModelProviderSecretKey` pattern deny (incl. GEMINI) |
| P1 CI no sidecar typecheck | `ci.yml` runs `pnpm typecheck` |
| P2 docs Office-only UI copy | OPERATOR/README aligned to generic VoltAgent Runtime |

---

## Original second-pass report

# Second Codex Review — Office Profile

## Verdict (block)

**Block.** Fake Runtime and `RuntimePort` contracts are untouched, and most prior fixes landed correctly. However, MCP approval remains bypassable for compound unknown mutators, and default LibSQL memory can escape through a workspace symlink.

## Prior findings re-check

| id | status | evidence |
|---|---|---|
| 1 — MCP fail-open approval | **partial** | The named cases—unknown, `get_or_create`, `publish`, `add_event`—now require approval ([office-mcp.ts:70](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:70), [office-mcp.test.ts:14](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.test.ts:14)). Compound unknown mutators containing a read token still bypass approval; see P0 below. |
| 2 — `mkdir` approval | **fixed** | `mkdir.needsApproval=true` at [create-agent.ts:75](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/create-agent.ts:75). Effective `agent.getFullState()` probe also returned `true`. |
| 3 — Invented fallback tools | **fixed** | Sidecar metadata failure now returns an empty tool list at [voltagent-runtime-adapter.ts:122](/Users/zhoujw/develop/github/uilab-admin/archetypes/agent-workbench/src/modules/task/runtime/voltagent/voltagent-runtime-adapter.ts:122) and [voltagent-runtime-adapter.ts:231](/Users/zhoujw/develop/github/uilab-admin/archetypes/agent-workbench/src/modules/task/runtime/voltagent/voltagent-runtime-adapter.ts:231). |
| 4 — MCP `ok(0)` | **fixed** | Empty tool responses become `failed` and are disconnected at [office-mcp.ts:334](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:334), covered at [office-mcp.test.ts:157](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.test.ts:157). |
| 5 — Minimal presented as Office | **fixed** | VoltAgent UI copy is now profile-neutral at [runtime-honesty.ts:48](/Users/zhoujw/develop/github/uilab-admin/archetypes/agent-workbench/src/modules/task/runtime/runtime-honesty.ts:48). Documentation is stale; see P2 below. |
| 6 — README/skills symlink escape | **fixed** | Bootstrap validates directory components and refuses symlink file targets at [workspace-root.ts:126](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/workspace-root.ts:126) and [workspace-root.ts:165](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/workspace-root.ts:165). Both reported vectors have regression tests at [workspace-root.test.ts:101](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/workspace-root.test.ts:101). |
| 7 — MCP child secret isolation | **partial** | Docs/calendar defaults are separated at [office-mcp.ts:198](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:198), and four model keys are denied. Other model-provider keys can still be forwarded explicitly; see P1 below. |
| 8 — Sidecar tests absent from root CI | **fixed** | Root `test` includes the sidecar at [package.json:18](/Users/zhoujw/develop/github/uilab-admin/package.json:18), and CI invokes it at [ci.yml:43](/Users/zhoujw/develop/github/uilab-admin/.github/workflows/ci.yml:43). Sidecar typecheck is still not a CI gate; see P1 below. |

## New findings

- **P0 — MCP approval remains fail-open for compound unknown mutators.** [office-mcp.ts:73](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:73) uses an incomplete mutator denylist, while [office-mcp.ts:80](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:80) treats any read token as read-only. Reproduced without approval: `calendar_get_and_set_event`, `docs_mark_as_read`, and `docs_list_and_archive_items`. This violates the mandatory approval rule at [spec:162](/Users/zhoujw/develop/github/uilab-admin/docs/plans/voltagent-office-profile-spec.md:162). **Fix:** default every MCP tool to approval and opt out only exact connector-specific read-only names or trustworthy metadata.

- **P1 — Default LibSQL memory escapes through `.voltagent` symlinks.** [office-runtime-defaults.ts:104](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-runtime-defaults.ts:104) directly creates `<workspace>/.voltagent` and opens the database without canonical containment. A temp reproduction with `.voltagent → outside` created `outside/memory.db`. **Fix:** validate/create the memory directory through the canonical containment helpers before constructing `LibSQLMemoryAdapter`.

- **P1 — Model-key filtering is incomplete.** Operator-controlled keys are accepted at [office-mcp.ts:238](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:238), while the hard denylist covers only four providers at [office-mcp.ts:247](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:247). `GEMINI_API_KEY` was reproduced in the docs child environment, contradicting [README.md:120](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/README.md:120). **Fix:** centralize and comprehensively deny model credentials, including explicitly listed keys.

- **P1 — Sidecar typecheck still is not enforced by CI.** Root `typecheck` includes the sidecar at [package.json:24](/Users/zhoujw/develop/github/uilab-admin/package.json:24), but CI only runs tests and build at [ci.yml:43](/Users/zhoujw/develop/github/uilab-admin/.github/workflows/ci.yml:43). The build script does not compile the sidecar. **Fix:** add `pnpm typecheck` to CI.

- **P2 — Operator documentation still promises Office-specific UI copy.** Runtime copy is intentionally generic at [runtime-honesty.ts:51](/Users/zhoujw/develop/github/uilab-admin/archetypes/agent-workbench/src/modules/task/runtime/runtime-honesty.ts:51), but [README.md:137](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/README.md:137) and [OPERATOR.md:72](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/OPERATOR.md:72) expect Office wording. **Fix:** update the documentation or implement a profile handshake.

## Residual risks

- Optional read-only mode remains absent, and sandbox is always disabled at [create-agent.ts:152](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/create-agent.ts:152).
- Existing explicit workspaces still receive an unsolicited README whenever one is absent at [workspace-root.ts:197](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/workspace-root.ts:197).
- The pre-existing minimal DIY path performs lexical containment only at [tools.ts:18](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/tools.ts:18); workspace-internal symlinks can therefore redirect reads/writes outside its root.
- Office’s `NodeFilesystemBackend` remains configured with `virtualMode` and `contained`, `check:workbench` passes, and committed Fake Runtime/`RuntimePort` contract files are unchanged.

## Verification commands run

- `git log 5cb0493..HEAD` and `git diff 5cb0493...HEAD` — reviewed.
- Requested sidecar command — blocked by sandbox `tsx` IPC `EPERM`; typecheck was not reached through `&&`.
- `node --import tsx --test src/**/*.test.ts && pnpm typecheck` — **53/53 tests passed; typecheck passed**.
- `pnpm check:workbench` — **passed**.
- Focused approval/env/memory/Workspace-state probes — reproduced findings above; effective `mkdir.needsApproval=true`.
- Targeted Workbench Vitest invocation — blocked by sandbox listen `EPERM`.
- `git diff --check 5cb0493...HEAD` — failed on trailing whitespace in committed Markdown.
- Repository files were not modified.

