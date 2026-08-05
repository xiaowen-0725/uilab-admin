# Codex review — Office Profile O2–O5 / O4 MCP

**Range:** `5cb0493`…`HEAD` (plus follow-up fix commit)  
**Model:** gpt-5.6-sol (xhigh)  
**Date:** 2026-08-05

Follow-up fixes landed in `f771f25` for Codex **P0** (MCP fail-closed approval) and several **P1**s.

---

Reviewed `5cb0493^..HEAD` across both spec and repository-standards axes.

O2’s default root, O3’s three skills/output paths, and O5’s long-run defaults are substantially implemented. O4 is not safe to release: MCP mutations can bypass approval. Overall: **1 P0, 7 P1**. No repository files were modified.

Verification passed: sidecar typecheck, Workbench typecheck, `check:workbench`, 47 sidecar tests, and 4 honesty tests. Socket-based test commands hit sandbox `EPERM`; socket-free equivalents passed.

# Findings

## Spec

### P0 — MCP mutations fail open without approval

[office-mcp.ts:68](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:68) infers side effects from names and lets read-like tokens win. [applyMcpNeedsApproval](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:84) leaves unknown tools unapproved.

Reproduced as unapproved:

- `calendar_add_event`
- `docs_publish_document`
- `docs_get_or_create_document`

This violates the mandatory external-mutation approval requirement at [spec:162](/Users/zhoujw/develop/github/uilab-admin/docs/plans/voltagent-office-profile-spec.md:162) and permits silent cloud-side changes or deletion.

Suggested fix: use connector-specific read-only allowlists or trustworthy tool metadata; require approval for every unknown/non-read-only MCP tool. Add compound-name and unknown-verb tests.

### P1 — `mkdir` mutates the workspace without approval

[create-agent.ts:65](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/create-agent.ts:65) defaults filesystem approval to false and overrides `write_file`, `edit_file`, `delete_file`, and `rmdir`, but not `mkdir`. Effective runtime state was confirmed as `mkdir.needsApproval === false`.

This contradicts [spec:138](/Users/zhoujw/develop/github/uilab-admin/docs/plans/voltagent-office-profile-spec.md:138).

Suggested fix: make filesystem policy fail closed, explicitly exempt verified read-only tools, and test every effective mutator from `agent.getFullState()`.

### P1 — VoltAgent `minimal` is falsely presented as Office

The sidecar defaults to `minimal` at [profile.ts:20](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/profile.ts:20), while the UI derives honesty only from adapter mode at [workbench-app.tsx:114](/Users/zhoujw/develop/github/uilab-admin/archetypes/agent-workbench/src/app/composition/workbench-app.tsx:114). Consequently, every VoltAgent connection receives Office copy at [runtime-honesty.ts:48](/Users/zhoujw/develop/github/uilab-admin/archetypes/agent-workbench/src/modules/task/runtime/runtime-honesty.ts:48).

Suggested fix: expose the resolved profile through sidecar metadata/capabilities and model honesty as `fake | voltagent-minimal | voltagent-office`. Until the handshake completes, use generic local-VoltAgent wording.

### P1 — `capabilities.tools` lies when the sidecar is unavailable

[voltagent-runtime-adapter.ts:202](/Users/zhoujw/develop/github/uilab-admin/archetypes/agent-workbench/src/modules/task/runtime/voltagent/voltagent-runtime-adapter.ts:202) returns fixed minimal tools whenever metadata fetch fails—even when no sidecar or tools are available. This violates [spec:168](/Users/zhoujw/develop/github/uilab-admin/docs/plans/voltagent-office-profile-spec.md:168).

Suggested fix: return an empty tool list plus explicit unavailable/degraded state, or fail capability discovery. Test network failure and a successful response containing zero tools.

### P1 — Failed MCP connections can be reported as `ok(0)`

[defaultMcpHost](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:219) assumes `getTools()` throws. VoltAgent may instead swallow a connection error and return `[]`; [loadOfficeMcpTools](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:274) then records `connected`. An invalid endpoint reproduced `docs=ok(0)`.

The test at [office-mcp.test.ts:129](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.test.ts:129) throws from the injected host, missing the real SDK boundary.

Suggested fix: inspect actual per-server connection status or treat zero tools as failed unless explicitly permitted. Add an unreachable-endpoint contract test around the real host adapter.

## Standards and security

### P1 — Bootstrap writes escape through workspace symlinks

[workspace-root.ts:61](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/workspace-root.ts:61) follows a broken `README.md` symlink, while [office-skills.ts:91](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-skills.ts:91) follows symlinked skill directories.

A `workspace/skills -> outside` symlink reproduced creation of `outside/meeting-notes/SKILL.md`. Agent-facing `NodeFilesystemBackend` is contained, but startup bootstrap bypasses that backend.

Suggested fix: canonicalize the root, reject symlink components with `lstat`, verify each canonical parent remains below the root immediately before writing, and use no-follow file creation where available. Add README and skills symlink-escape tests.

### P1 — Stdio MCP children receive unrelated connector secrets

[office-mcp.ts:177](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:177) builds one global allowlist containing Feishu, Lark, and Google credentials, then passes it to every stdio connector at [office-mcp.ts:168](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/office-mcp.ts:168). A docs child can therefore receive calendar/Google credentials and vice versa.

Suggested fix: use connector-scoped variables such as `MCP_DOCS_CHILD_ENV_KEYS` and `MCP_CALENDAR_CHILD_ENV_KEYS`; globally pass only non-secret runtime essentials. Test that model keys and cross-connector secrets are absent.

### P1 — O2–O5 tests are not executed by CI

The root test/typecheck scripts at [package.json:18](/Users/zhoujw/develop/github/uilab-admin/package.json:18) omit `@uilab/workbench-runtime-voltagent`, while CI only invokes the root test script at [ci.yml:43](/Users/zhoujw/develop/github/uilab-admin/.github/workflows/ci.yml:43). All 47 new sidecar tests can therefore regress without failing CI.

Suggested fix: include sidecar test and typecheck in the root scripts or add explicit CI steps.

# Residual risks

- The optional read-only Office mode requested at [spec:114](/Users/zhoujw/develop/github/uilab-admin/docs/plans/voltagent-office-profile-spec.md:114) remains absent.
- [ensureOfficeWorkspace](/Users/zhoujw/develop/github/uilab-admin/tooling/workbench-runtime-voltagent/src/workspace-root.ts:52) inserts a README into any existing explicit workspace when missing, although the spec requests it for first creation of the default directory.
- O4 supplies generic docs/calendar MCP slots, not a pinned or validated Feishu/calendar implementation; live schemas and mutation naming remain operator-dependent.
- `git diff --check` reports trailing whitespace in committed Markdown files.
