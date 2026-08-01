# Phase 3 Agent Workbench Shell Skeleton — Evidence

> Date: 2026-08-01
> Branch: `main`
> Verdict: **Pass**
> Scope: static Workbench Shell only; no Agent Runtime or concrete Work Surface

## 1. Delivered Archetype

`archetypes/agent-workbench` is a runnable peer of `archetypes/admin`:

- package: `@uilab/agent-workbench`
- Vite + React 19 + TypeScript + Tailwind CSS 4
- code-defined TanStack Router
- unique Composition Root at `src/app/composition`
- Shell: Navigator, Task Surface, Composer, Adaptive Context Panel
- placeholder Work Surface Host: Single-pane + Tabs, show/hide, resize, maximize
- static project / Task / execution fixtures with explicit no-Runtime disclosure

The Shell does not import fixture Implementation. The Composition Root resolves the
selected Task fixture into the Task Module's public view and passes it to the Shell.

## 2. Module Interfaces

| Module | Public Interface | Implementation kept private |
|---|---|---|
| `workbench-session` | controller hook + required view/command/seed types | reducer, selectors, initialization, constants |
| `task` | `TaskSurface` + view/callback/data types | Composer, Context Panel, execution stream |
| `work-surface` | placeholder Host + minimum view/callback types | placeholder content and resize interaction |

`check:workbench` rejects imports into another Module's internal path. Shell consumers
use only `@/modules/<module>` roots.

## 3. Task-scoped layout behavior

Workbench Session owns, per Task:

- Context open/closed
- Work Surface visible/hidden
- desired Work Surface width
- active tab
- maximized state

Task A → Task B → Task A restores the complete layout state. Responsive geometry caps
the currently rendered width without overwriting the Task's desired width; a 760 →
1024 transition restores the seeded 480 px width.

Navigator state is Shell-level. Medium and narrow viewports use an overlay Navigator;
wide uses a reserved Navigator column.

## 4. Playwright CLI + local Chrome

Browser: local Chrome, headed, named session `workbench-phase3`.
URL: `http://127.0.0.1:5174/`.

### 1440 × 900 — wide Task-only + Context

| Region | Geometry |
|---|---|
| Navigator | x=0, width=280 |
| Task execution stream | x=280, width=860 |
| Composer | x=280, width=860 |
| Context Panel | x=1140, width=300 |

- Context uses reserved-space.
- Context does not overlap execution stream or Composer.
- Work Surface is absent in the initial Task-only state.

### 1024 × 768 — Task + Work split

| Region | Geometry |
|---|---|
| Stage | x=0, width=1024 |
| Task Surface | x=0, width=544 |
| Work Surface | x=544, width=480 |

- Work right edge equals Stage right edge; no clipping.
- Task ≥ 420 px and Work ≥ 320 px.
- Context overlaps the constrained Task stream, proving overlay mode.
- Page `scrollWidth === clientWidth === 1024`.
- Resize separator receives focus on pointer click; ArrowLeft changed width 480 →
  496 while preserving Stage containment. At a later narrow → medium check, desired
  width restored to 480 with effective max 604.
- Tab switching, maximize, and Escape-to-restore passed.
- Task A/B/A restored Context, Work visibility, active `浏览器预览` tab, and width.

### 760 × 800 — narrow

- Task-only Context overlaps execution stream, proving overlay mode.
- Page `scrollWidth === clientWidth === 760`.
- Opening Work Surface unmounts Task Surface and makes Work Surface fill Stage exactly
  (760 px): serial/full-stage behavior, no forced split.
- Navigator remains operable as an overlay.

### Console

- Errors: **0**
- Warnings: **0**
- Removed external Google Fonts; favicon no longer produces `/favicon.ico` 404.

## 5. Automated verification

```text
Foundation: 2 files / 8 tests passed
Admin:      18 files / 108 tests passed
Workbench:   2 files / 14 tests passed
```

Final commands:

```bash
pnpm install --frozen-lockfile                             # PASS
node --check tooling/quality-gates/check-workbench-boundaries.mjs
node --check tooling/quality-gates/check-foundation-boundaries.mjs
node --check scripts/check-workbench.mjs                   # PASS
pnpm --filter @uilab/agent-workbench typecheck             # PASS
pnpm --filter @uilab/agent-workbench build                 # PASS
pnpm --filter @uilab/agent-workbench test                  # 14 PASS
pnpm check:foundation                                      # PASS
pnpm check:workbench                                       # PASS
pnpm check:ai                                              # PASS
pnpm typecheck                                             # PASS
pnpm build                                                 # PASS
pnpm test                                                  # 130 PASS total
pnpm check                                                 # PASS
git diff --check                                           # PASS
```

Workbench production output:

```text
dist/index.html                  1.05 kB
dist/assets/index-*.css         31.12 kB
dist/assets/index-*.js         339.65 kB
```

## 6. Fail-closed negative fixture

A temporary renderer source file contained:

- `import 'electron'`
- `import '@/modules/workbench-session/application/reducer'`
- an `asChild` property

`pnpm check:workbench` exited **1** and reported all three violations:

1. forbidden desktop host import
2. cross-Module internal import
3. forbidden `asChild` usage

The temporary fixture was removed, then the positive gate passed.

## 7. Foundation second-consumer proof

Workbench directly consumes the existing public Foundation Interface:

- `@uilab/foundation/ui/button`
- `@uilab/foundation/ui/input`
- `@uilab/foundation/styles/tokens.css`

Foundation exports remain unchanged. `check:foundation` now verifies dependency
direction `Admin + Workbench → Foundation only`.

This proves the existing Phase 2A seam with two consumers, but does **not** complete
full Phase 2: shared theme/direction providers and broader primitives remain deferred
until concrete Workbench use cases require them.

## 8. Residual boundary

Not delivered in Phase 3:

- Agent Runtime, Fake Runtime, streaming, Task projection
- Surface Registry
- concrete Document, Browser, Review, Terminal, or Editor Surface
- Resource Explorer
- persistence, project filesystem, Git
- Electron/Tauri host
- `uilab-admin init` generation for Workbench

Next product phase is Phase 4 Fake Runtime and Task lifecycle. Full Phase 2 Foundation
expansion should remain demand-driven rather than block Phase 4.
