# Phase 3 Agent Workbench Shell Skeleton — Work Order

> Status: frozen for implementation
> Scope: static Workbench Shell only; no Agent Runtime or real Work Surface implementation

## Objective

Create `archetypes/agent-workbench` as a runnable, independently testable peer of
`archetypes/admin`. Prove the Workbench spatial model and task-scoped layout state
before introducing runtime, persistence, project I/O, or concrete Document / Browser /
Review surfaces.

The result must look and behave like an Agent-first desktop workbench, not like an
Admin page with a different sidebar.

## Locked product model

```text
Workbench Shell
├── Navigator
└── Workbench Stage
    ├── Task Surface
    │   ├── execution fixture
    │   ├── Composer
    │   └── Task Context Panel
    │       ├── Reserved-space when Task Surface is wide
    │       └── Overlay when Task Surface is constrained
    └── Work Surface Host
        └── Single-pane + Tabs placeholder host
```

- New tasks are Task-only.
- Opening work content reveals Work Surface Host.
- Context open/closed, Work Surface visibility, width, active tab, and maximized state
  belong to each Task and restore when switching tasks.
- Context Panel keeps the same floating-card visual treatment in both modes. In
  reserved mode, Task content must geometrically avoid it; in overlay mode it may cover
  Task content.
- The first host supports show/hide, active tab, keyboard/pointer resize, and maximize.
- No fixed Inspector region and no arbitrary multi-pane layout.

## Module and Interface decisions

### `modules/workbench-session`

Owns static fixture selection and task-scoped layout state. Its root `index.ts` is the
only public Interface. Expose one controller hook plus the view/command types needed by
the Composition Root and Shell. Keep reducer and initialization Implementation private.

Required commands:

- select Task
- toggle Navigator
- toggle Task Context Panel
- open / close Work Surface Host
- activate Work Surface tab
- resize Work Surface within declared min/max
- toggle / exit maximize

The reducer is the primary in-process test surface. Switching Task A → Task B → Task A
must preserve each Task's independent layout state.

### `modules/task`

Owns Task Surface, execution fixture, Composer, and Task Context Panel UI. Public root
Interface exports the Task Surface and the minimum view/callback types. It does not
model Turn/Run/RuntimeEvent yet and must not fake an executing Agent.

### `modules/work-surface`

Owns the placeholder Single-pane + Tabs host and resize interaction. Public root
Interface exports the host and its minimum view/callback types. Placeholder tabs are
static fixture content, not Document / Browser / Review implementations and not a
premature registry seam.

### `shell`

Owns Workbench geometry, Navigator, responsive layout, focus order, and keyboard
shortcuts. It consumes Module root Interfaces only. It must not import Module internal
Implementation paths.

### `app/composition`

The only Composition Root. It creates the Workbench Session controller, combines
static fixtures with the Shell, and selects no production Adapter in this phase.

## Required paths

```text
archetypes/agent-workbench/
├── AGENTS.md
├── APP_BRIEF.md
├── README.md
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── bootstrap/
│   │   ├── providers/
│   │   ├── router/
│   │   └── composition/
│   ├── shell/
│   │   ├── workbench-shell/
│   │   ├── navigator/
│   │   └── responsive-layout/
│   ├── modules/
│   │   ├── workbench-session/
│   │   ├── task/
│   │   └── work-surface/
│   ├── config/
│   ├── styles/
│   └── test-support/
└── tests/
    └── integration/
```

Empty speculative directories are forbidden. Add only directories containing Phase 3
source or tests.

## Technology and Foundation consumption

- Vite + React 19 + TypeScript 6 + Tailwind CSS 4.
- Use a small code-defined TanStack Router composition for the index route; do not add
  route generation for one page.
- Depend on `@uilab/foundation: workspace:*`.
- Import Button and Input through public Foundation subpaths. A native styled textarea
  is allowed for the Composer because Foundation has no textarea Interface yet.
- Import Foundation tokens and configure Tailwind `@source` for Foundation UI.
- Do not add Foundation exports in this phase. The Workbench is evidence for the
  existing Button/Input/tokens only.

## Responsive geometry

### Wide desktop (target 1440×900)

- Navigator is a reserved column, approximately 240–280 px.
- Task-only state fills the remaining Stage.
- Open Context Panel uses reserved-space mode: the Task stream and Composer remain
  unobscured.
- The Panel may retain floating card visuals inside its reserved lane.

### Medium desktop (target 1024×768)

- Task Surface and Work Surface can coexist side-by-side.
- Task minimum width: 420 px.
- Work Surface minimum width: 320 px.
- Context Panel switches to overlay when the Task Surface cannot reserve its lane.
- Resize is clamped so neither surface collapses below its minimum.

### Narrow window (target ≤760 px)

- Navigator becomes an overlay/drawer-like layer or is hidden behind its toggle.
- Work Surface is serial/full-stage rather than forcing an unusable split.
- Context Panel is overlay.
- No horizontal page overflow.

Use CSS container queries for Context reserved/overlay behavior so mode follows actual
Task Surface width, not only viewport width.

## Keyboard and accessibility requirements

- All panel toggles and tabs are real buttons with accessible names.
- Resize handle uses `role="separator"`, is focusable, exposes orientation/value
  semantics, and supports ArrowLeft/ArrowRight.
- `Ctrl/Cmd+B`: toggle Navigator.
- `Ctrl/Cmd+I`: toggle Task Context Panel.
- `Ctrl/Cmd+Shift+W`: toggle Work Surface Host.
- `Escape`: exit Work Surface maximize before any other action.
- Visible focus indicators; reduced-motion media query disables nonessential movement.

## Static fixture content

- One project, at least three Tasks, and one selected Task.
- Execution stream contains user text, assistant text, and clearly marked completed
  tool activity; it must say or imply that data is a static Phase 3 fixture.
- Context Panel includes environment, changes, source, and sub-agent sections.
- Work Surface placeholder has at least two tabs to prove tab switching. Use labels such
  as `布局规格.md` and `浏览器预览`; content must explicitly state that concrete
  Surface Modules arrive in Phase 6.
- Composer accepts local text but submit stays disabled or produces a local explanatory
  notice; it must not pretend to call a Runtime.

## Platform integration

Update root orchestration without breaking Admin defaults:

- Keep `pnpm dev` targeting Admin for compatibility.
- Add `dev:admin`, `dev:workbench`, and `preview:workbench`.
- Root `typecheck`, `build`, and `test` run Foundation → Admin → Workbench.
- Add `check:workbench` and include it in root `check`.
- Extend `check:foundation` to verify Workbench consumes the existing public Foundation
  Interface and never make Foundation depend on an Archetype.

Add `tooling/quality-gates/check-workbench-boundaries.mjs` with fail-closed checks for:

- forbidden `@radix-ui/*` and `asChild`
- forbidden Electron/Tauri imports and Node built-ins from renderer source
- forbidden cross-Module internal imports; other code may import only
  `@/modules/<module>` root Interfaces
- required Workbench package, Foundation dependency, token import, and Foundation UI
  consumption
- no `shared`, `common`, or global `ports` dumping-ground directories

## Documentation updates

- Root `AGENTS.md`, `README.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`
- `docs/plans/agent-workbench-template-roadmap.md`
- Add `archetypes/agent-workbench/AGENTS.md`, `README.md`, and `APP_BRIEF.md`
- Correct stale Phase 1C / Phase 2A commit references in `PROJECT_STATUS.md`
- Add Phase 3 evidence after independent verification.

Do not claim:

- full Phase 2 Foundation completion
- concrete Document / Browser / Review Surface delivery
- Agent Runtime, streaming, persistence, project filesystem, Git, or desktop host
- Workbench generation support in `uilab-admin init`

## Tests

At minimum:

1. Workbench Session reducer/controller tests:
   - Task-only initial state
   - per-Task layout restoration
   - width clamping
   - maximize/escape behavior
   - tab activation
2. Browser integration tests:
   - Shell renders project/tasks/static-fixture disclosure
   - Context toggle
   - Work Surface open/tab/maximize/close
   - Task switching restores layout
   - keyboard shortcuts
   - Composer does not fake Runtime submission

Tests must assert behavior through Module Interfaces or visible user behavior, not
private Implementation state.

## Acceptance commands

```bash
pnpm install --frozen-lockfile
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
pnpm check:foundation
pnpm check:workbench
pnpm check:ai
pnpm typecheck
pnpm build
pnpm test
pnpm check
```

Playwright CLI with the user's local headed Chrome:

- 1440×900: Task-only and Context reserved-space screenshots; verify no overlap.
- 1024×768: open Work Surface; resize; switch tabs; Context is overlay when open.
- Narrow viewport: no horizontal page overflow; Navigator and Work Surface remain
  operable.
- Switch Task A/B/A and verify layout restoration.
- Exercise keyboard shortcuts and maximize/Escape.
- Console: zero errors and zero warnings caused by the application.

## Non-goals

- No real Runtime or Fake Runtime event projection (Phase 4).
- No Surface Registry seam or concrete surfaces (Phases 5–6).
- No Resource Explorer implementation.
- No persistence beyond in-memory task switching.
- No arbitrary multi-pane, drag reorder, Terminal, Editor, Electron, or Tauri.
- No redesign of Admin and no destructive removal of `agent-desktop` compatibility.
