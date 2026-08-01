# Phase 1 Monorepo migration work order

## Goal

Move the current Admin application out of the repository root without changing its runtime behavior, then establish canonical tooling locations with compatibility wrappers. This work order implements Phase 1 of the [Agent Workbench Template Roadmap](./agent-workbench-template-roadmap.md).

Phase 1 does not create Agent Workbench UI, extract speculative Foundation Modules, rename the public CLI, or fix unrelated product behavior.

## Preconditions

- Architecture decision commit: `81731f8` or a descendant.
- Phase 0 evidence exists for UI, CLI and quality gates.
- `pnpm typecheck`, `pnpm build` and `pnpm check:ai` are green.
- Phase 0 Browser baseline is green: 17 files / 103 tests pass. Current Phase 1 suite is 18 files / 108 tests after adding scenario-aware default coverage; migration must not introduce new failures.
- Existing `.codex/` and `skills-lock.json` remain outside the migration unless separately authorized.

## Batch 1A — Workspace root and Admin application move

This batch must complete and be verified before tooling or contract paths move.

### Create

```text
pnpm-workspace.yaml
archetypes/admin/package.json
archetypes/admin/tsconfig.json
```

The root `package.json` becomes a private workspace orchestrator. The Admin package receives the current application dependencies and scripts. The root lockfile remains the single workspace lockfile.

### Move into `archetypes/admin`

```text
src/
public/
index.html
components.json
vite.config.ts
tsconfig.app.json
tsconfig.node.json
AGENT_BRIEF.md
.env.example
desktop/
```

The current root `tsconfig.json` is replaced by a workspace reference/configuration as needed; its Admin-specific content moves into `archetypes/admin/tsconfig.json`.

### Keep at repository root

```text
AGENTS.md
CONTEXT.md
README.md
PROJECT_STATUS.md
CHANGELOG.md
LICENSE
docs/adr/
docs/architecture/
docs/plans/
docs/research/
pnpm-lock.yaml
.gitignore
.prettierignore
.prettierrc
eslint.config.js
knip.config.ts
cz.yaml
netlify.toml
```

Root ESLint, Prettier and Knip configuration may be updated to include workspace paths, but their policy remains repository-wide. `netlify.toml` stays at root and is updated to build/publish the Admin package until deployment selection becomes configurable.

### Root command compatibility

The following root commands must remain valid and delegate to `@uilab/admin` or the all-workspace gate as appropriate:

```text
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm check:ai
pnpm lint
pnpm knip
```

`pnpm dev` continues to start Admin during Phase 1. A future explicit app selector is outside this batch.

### Batch 1A acceptance

- Admin renders the same routes and navigation as Phase 0.
- All seven Phase 0 Playwright screenshots can be reproduced at `1440 × 1000` without material layout drift.
- Root and package-level typecheck/build/check:ai pass.
- Browser tests remain green at 17 files / 103 tests (or better) with no new failure family.
- No path in generated `routeTree.gen.ts` changes solely because of the filesystem move.

## Batch 1B — Canonical tooling locations

### Move canonical implementations

```text
cli/uilab-admin.mjs
  → tooling/template-cli/uilab-admin.mjs

scripts/check-ai.mjs
  → tooling/quality-gates/check-ai.mjs
```

### Keep compatibility wrappers

```text
cli/uilab-admin.mjs
scripts/check-ai.mjs
```

The root paths become minimal forwarding wrappers so these existing invocations continue to work:

```bash
node cli/uilab-admin.mjs
pnpm uilab-admin
node scripts/check-ai.mjs
```

The wrapper must preserve argv, stdout/stderr, signals and exit codes. It must not duplicate CLI logic.

### Path-resolution requirements

The canonical CLI must resolve two execution modes explicitly:

1. Template Platform mode: default template source is `archetypes/admin`.
2. Derived Application mode: `check`, `add`, `apply-scenario` and `set-shell` operate on the target application passed through `--dir` or cwd.

Route generation, scaffold lookup, scenario lookup and copied-file exclusions must not depend on the old repository-root app layout.

### Batch 1B acceptance

- Phase 0 CLI matrix passes using the root compatibility command.
- The same matrix passes when invoking the canonical tooling entry directly.
- Exit 2 behavior for invalid identifiers remains fail-fast with no partial files.
- CLI banner/package version skew is recorded but not changed unless a separate versioning decision is approved.

## Batch 1C — Admin template assets and contracts

### Move Admin-owned assets

```text
scaffolds/
  → archetypes/admin/scaffolds/

docs/ai/
  → archetypes/admin/docs/ai/
```

The current Admin pattern catalog, scenario catalog and Bootstrap/CLI docs are Admin-owned because their contracts describe Admin Kernel, data-table, settings and the legacy `agent-desktop` scenario.

### Skill compatibility

`skill/uilab-admin/` remains at its current root path during Phase 1 because it is an externally discovered compatibility front door. Its references are updated to the canonical Admin docs under `archetypes/admin/docs/ai/`.

The neutral platform skill and Agent Workbench skill are created only after the Agent Workbench Archetype exists. Do not rename `$uilab-admin` during mechanical migration.

### Contract ownership (platform vs Admin / derived app)

- **Platform contracts** stay at repository root: `AGENTS.md`, `README.md` (Template Platform monorepo).
- **Admin / derived-app contracts** are Archetype-owned: `archetypes/admin/AGENTS.md`, `archetypes/admin/README.md`.
- `uilab-admin init` materializes Admin-local AGENTS/README via filtered Admin body copy. It must **not** copy platform-root AGENTS/README into generated apps.
- Preflight validates Admin-local contracts under `adminSourceRoot` before any target write.
- Explicit platform `--template` requires canonical tooling under `tooling/*` (no fallback to root import-only wrappers).

### Legacy `agent-desktop` behavior

- Keep the current scenario executable during Phase 1 so the Phase 0 CLI contract remains true.
- Mark it in documentation as a legacy Admin composition that will become a deprecated alias after the standalone Agent Workbench Archetype ships.
- Do not map it to a non-existent Archetype or emit a misleading migration success message.
- Phase 8 owns the final alias behavior and removal window.

### Batch 1C acceptance

- Every relative Markdown link resolves from its new location.
- `check:ai` validates Admin docs, catalogs, skill and scaffolds through canonical paths.
- Admin Derived Application generation still receives the required AI docs/scaffolds according to its copy contract.
- `$uilab-admin` discovery and all five shipped CLI routes remain usable.

## Commit sequence

Use separate, reviewable commits:

1. `chore: move admin app into workspace`
2. `refactor: relocate template tooling with compatibility wrappers`
3. `docs: align admin contracts with template platform`

Do not combine Browser test repairs, Foundation extraction or Agent Workbench creation with these commits.

## Explicit non-goals

- No Agent Workbench package or UI.
- No Foundation extraction.
- No changes to Admin labels, routes, mock data or visuals beyond equivalence migration.
- No public CLI rename.
- No Electron/Tauri implementation.
- No deletion of legacy scenario support.

Browser Mode is green (Phase 0: 17/103; current: 18/108). Do not treat broken Browser tests as an accepted Phase 1 baseline.

## Rollback strategy

- Batch 1A can be reverted independently because root wrappers and contracts have not moved yet.
- Batch 1B retains old executable paths as wrappers, so canonical tooling can be reverted without changing caller commands.
- Batch 1C changes documentation and asset locations only after CLI path resolution is stable.
- Any batch that changes the Phase 0 UI or CLI observable baseline must stop before the next batch.
