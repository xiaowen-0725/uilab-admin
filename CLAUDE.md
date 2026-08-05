# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Instruction Scope

- Read `AGENTS.md` for platform-wide rules before changing code.
- Work under `archetypes/admin` is additionally governed by `archetypes/admin/AGENTS.md`; this contract is also copied into generated Admin applications.
- Work under `archetypes/agent-workbench` is additionally governed by `archetypes/agent-workbench/AGENTS.md`.
- The nearest application contract controls application behavior; root guidance controls monorepo layout, tooling, and cross-archetype boundaries.

## Commands

This is a pnpm 10 workspace. Install dependencies with:

```bash
pnpm install
```

| Command | Scope |
|---|---|
| `pnpm dev` | Run Admin in development mode |
| `pnpm dev:workbench` | Run Workbench at `http://localhost:5174/` |
| `pnpm build` | Build Foundation, Admin, and Workbench |
| `pnpm typecheck` | Typecheck Foundation, Admin, and Workbench |
| `pnpm test` | Run all three packages' browser-headless tests |
| `pnpm lint` | Lint Admin only |
| `pnpm format:check` | Check Admin formatting only |
| `pnpm knip` | Run Admin Knip only |
| `pnpm check` | Run typecheck plus Foundation, Workbench, and AI-contract gates |
| `pnpm check:foundation` | Validate Foundation exports and dependency boundaries |
| `pnpm check:workbench` | Validate Workbench module and renderer boundaries |
| `pnpm check:ai` | Validate AI docs, skill, catalog, scaffold, and link contracts |
| `pnpm test:browser:install` | Install Playwright Chromium used by browser tests |

Run one test file through the owning package:

```bash
pnpm --filter @uilab/admin exec vitest run --browser.headless src/lib/utils.test.ts
pnpm --filter @uilab/agent-workbench exec vitest run --browser.headless tests/integration/workbench-shell.test.tsx
pnpm --filter @uilab/foundation exec vitest run --browser.headless src/ui/button.test.tsx
```

The root watch/UI/browser/coverage scripts also delegate only to Admin. Workbench and Foundation do not define lint, format, Knip, or coverage scripts.

The deterministic Admin template CLI is available through:

```bash
pnpm uilab-admin help
```

Its shipped operations are `init`, `apply-scenario`, `check`, `add data-table-list`, `add settings-section`, and `set-shell`. Workbench generation and `add auth-page` are not implemented.

## Architecture

This repository is an AI-first template platform with two peer application archetypes:

```text
archetypes/admin/             Runnable Admin source and Admin-owned scaffolds/docs
archetypes/agent-workbench/   Runnable Agent Workbench source
packages/foundation/          Minimal source-consumed cross-archetype UI package
tooling/template-cli/         Canonical deterministic Admin generation CLI
tooling/quality-gates/        Canonical architectural and AI-contract checks
cli/ and scripts/             Compatibility wrappers around canonical tooling
skill/uilab-admin/            Agent-facing routing/orchestration skill
docs/                         Platform ADRs, plans, evidence, and research
```

`agent-desktop` is an Admin scenario; `agent-workbench` is a separate archetype. Workbench ships Phase 3 Shell plus **Phase 4 Fake path** (RuntimePort, DeterministicFakeRuntime, event projection, MemoryEventStore, dual-path capture local-sim + empty Fake Timeline) and an optional **local VoltAgent sidecar Adapter** (`VITE_RUNTIME_ADAPTER=voltagent`). Still planned / not production: remote multi-tenant Agent Runtime, IndexedDB EventStore, Surface Registry, concrete Document/Browser/Review surfaces, Git/filesystem product integration, desktop hosting, and Workbench CLI generation. Fake ≠ production Runtime.

### Foundation boundary

`@uilab/foundation` is source-consumed and intentionally exposes only:

- `@uilab/foundation/ui/button`
- `@uilab/foundation/ui/input`
- `@uilab/foundation/styles/tokens.css`

Both archetypes retain `@/components/ui/button` and `input` as compatibility re-exports. Do not add a root barrel or duplicate these primitives/tokens. Providers, shells, routers, data-table infrastructure, and application-specific patterns remain archetype-owned. Dependency direction is `archetypes/* -> foundation`, never the reverse.

### Admin

Admin uses four layers:

1. Kernel: UI, layout, data-table, context, Router, and Query infrastructure.
2. Patterns: reusable documented patterns under `archetypes/admin/docs/ai`.
3. App configuration: preferences and sidebar/navigation data.
4. Features: business areas under `src/features`.

New navigable pages normally require all three:

```text
src/features/<domain>/...
src/routes/_authenticated/<domain>/...
src/components/layout/data/sidebar-data.ts
```

Keep routes thin and features substantial. Reuse the existing data-table pattern for table pages. TanStack Router owns generated `src/routeTree.gen.ts`.

The Admin CLI reads source content from `archetypes/admin`, copies Foundation and canonical tooling, and emits a self-contained mini-workspace. Generated applications own the copied source; they are not live dependents of this repository.

### Agent Workbench

Workbench composition flows from `src/main.tsx` through bootstrap, providers, router, and `app/composition/workbench-app.tsx`; the Composition Root is the sole module assembly point.

Current modules are `workbench-session`, `task`, and `work-surface`. Consume each only through `@/modules/<name>` and its root `index.ts`; never import another module's internal files. Keep ports with the module that consumes them and do not create global `shared`, `common`, or `ports` dumping grounds.

Renderer code must remain browser-only. Future runtime, filesystem, Git, or desktop integrations belong behind module-owned ports/adapters, not direct Node/Electron/Tauri imports.

## Project-Specific Conventions

- Prefer existing archetype patterns, then UI Lab registry source, then `@/components/ui`, before bespoke components. This repo does not currently define a custom registry URL in `components.json`; do not invent one.
- Use Base UI's `render={...}` API. Do not use `asChild` or add `@radix-ui/*`.
- Express layout differences through configuration, preferences, or scenarios rather than forking shells.
- User-facing UI copy is Chinese-first; identifiers and paths stay English.
- Keep fixture and phase claims honest: local interactions may work, but absent backend/runtime capabilities must not be presented as shipped.

## Verification

Use the narrowest relevant checks while iterating, then run package-level gates before completion:

- Admin changes: typecheck, build, tests, lint, and relevant UI/navigation flows.
- Foundation changes: Foundation typecheck/tests plus `pnpm check:foundation`, then verify both archetypes.
- Workbench changes: Workbench typecheck/build/tests plus `pnpm check:workbench`.
- CLI, scaffolds, AI docs, catalog, or skill changes: `pnpm check:ai`.
- Cross-package changes: `pnpm check`, `pnpm test`, and `pnpm build`.

Browser tests are configured in each package's `vite.config.ts`. Workbench browser tests use a fixed 1440×900 Chromium viewport.
