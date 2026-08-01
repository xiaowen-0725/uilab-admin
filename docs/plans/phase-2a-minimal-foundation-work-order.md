# Phase 2A Minimal Foundation work order

## Goal

Establish the smallest production-safe Foundation seam without promoting the Admin Kernel into a shared layer. This slice proves package ownership, dependency direction, Tailwind source discovery, Admin compatibility, and Derived Application materialization.

Phase 2A does **not** claim that the full Phase 2 acceptance is complete. Agent Workbench does not exist yet, so broader interfaces remain unproven until it becomes the second real consumer.

## Design judgment

The first public Foundation Interface is intentionally limited to:

```text
@uilab/foundation/ui/button
@uilab/foundation/ui/input
@uilab/foundation/styles/tokens.css
```

Foundation owns the Base UI integration, variants, neutral visual behavior, and design tokens behind these exports. Its class-merging utility is private Implementation and is not a public export.

Admin keeps compatibility modules at:

```text
archetypes/admin/src/components/ui/button.tsx
archetypes/admin/src/components/ui/input.tsx
```

Those files re-export the Foundation Interface so existing shadcn aliases and Admin imports do not churn. They contain no parallel implementation.

### Why these three exports

- Button and Input already have stable, business-neutral semantics and are required by both planned Archetypes.
- Tokens are the visual vocabulary both Archetypes must share.
- Together they exercise TypeScript, React, Base UI, Tailwind scanning, CSS imports, package exports, tests, and app materialization.
- Deleting Foundation would force the Base UI wrappers, variants, tokens, and verification back into each Archetype.

### Explicitly deferred

- Theme / direction / font Providers: Admin persistence and configuration semantics are not yet proven identical in Workbench.
- Dialog, Popover, Tabs, Tooltip, Scroll Area: extract only when Workbench consumes them in the same semantics.
- Admin Shell, data-table, auth, settings, Router, Query, search, cookies, navigation, and scenario configuration.
- A root barrel export. Callers import explicit subpaths so the Interface stays small and dependency ownership remains visible.

## Target shape

```text
packages/foundation/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    internal/cn.ts
    styles/tokens.css
    ui/button.tsx
    ui/input.tsx
    ui/button.test.tsx
    ui/input.test.tsx
    test/setup.ts
```

The package is private and source-consumed during this phase. Public `exports` list only the three paths above.

## Dependency rules

Allowed direction:

```text
archetypes/*  ───────▶  @uilab/foundation
tooling       ───────▶  package metadata / source checks
```

Forbidden:

```text
@uilab/foundation  ──X──▶  archetypes/*
@uilab/foundation  ──X──▶  @uilab/admin
@uilab/foundation  ──X──▶  Admin alias @/*
```

Add a deterministic repository gate that checks imports and package dependencies rather than relying on convention. It must fail closed and be wired into the root check path.

## Tailwind contract

Tailwind ignores dependencies by default. Admin must explicitly register the Foundation package as a source from its stylesheet using the package under `node_modules`, so the same path works in both the platform workspace and generated mini-workspace:

```css
@source "../../node_modules/@uilab/foundation/src/ui";
```

The source is deliberately narrowed to `src/ui`: scanning the package root also scans test/config material and inflated a generated production stylesheet from 129,942 B to 238,350 B. The exact relative path must be verified from `archetypes/admin/src/styles/index.css` and from a generated application. This follows Tailwind 4's documented external-library source contract.

Admin imports Foundation tokens instead of maintaining a second token definition. No duplicate `:root`, `.dark`, or `@theme` token block remains in the Admin Archetype.

## Derived Application materialization

Derived Applications remain copy-and-own and do not depend on the Template Platform runtime.

`uilab-admin init` must:

1. Preflight `packages/foundation` before creating the target.
2. Copy Foundation source into target `packages/foundation`.
3. Materialize a target `pnpm-workspace.yaml` containing the application root and `packages/*`.
4. Preserve `@uilab/foundation: workspace:*` in the generated application package.
5. Ensure a generated app can install, typecheck, build, test, run `check:ai`, and run `uilab-admin check` outside the platform repository.
6. Support using a generated application as a self-contained derived template for another `init`.

The generated application may be a mini-workspace; it still owns all generated source and has no runtime dependency on the platform repository.

## Implementation batches

### Batch 2A-1 — Package and Admin consumption

- Create `@uilab/foundation` with explicit exports.
- Move token implementation and Button/Input implementation.
- Replace Admin Button/Input files with compatibility re-exports.
- Wire Tailwind source discovery and Admin workspace dependency.
- Add Foundation typecheck and Browser tests.

### Batch 2A-2 — Materialization and dependency gate

- Extend CLI layout/init sources with the Foundation source root.
- Copy Foundation and write generated workspace metadata.
- Add Foundation dependency-direction gate.
- Wire root scripts and quality contracts.
- Update platform/Admin documentation and evidence.

The batches may be one commit only if all rollback and verification evidence remains clear.

## Acceptance

Platform:

```bash
pnpm install
pnpm --filter @uilab/foundation typecheck
pnpm --filter @uilab/foundation test
pnpm typecheck
pnpm build
pnpm test
pnpm check:foundation
pnpm check:ai
```

Required observations:

- Foundation tests exercise Button click/disabled semantics and Input labeling/disabled semantics through the public Interface.
- Admin Browser suite remains green.
- Admin visual shell and form controls retain their Phase 1 appearance.
- Foundation has no forbidden reverse dependency.
- Foundation package exports exactly the approved Interface.
- `routeTree.gen.ts` SHA remains unchanged unless a separately approved route change occurs.

Generated application:

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm check:foundation
pnpm check:ai
pnpm uilab-admin check
```

Playwright CLI validates Dashboard, appearance drawer, one auth form, and console output in the platform Admin app. Console acceptance is zero errors and zero warnings.

## Exit condition

Phase 2A is complete when package mechanics and copy-and-own materialization are proven. Broader Foundation extraction remains blocked until Agent Workbench supplies a second real consumer; at that point Phase 2 and Phase 3 proceed together for shared primitives and appearance behavior.
