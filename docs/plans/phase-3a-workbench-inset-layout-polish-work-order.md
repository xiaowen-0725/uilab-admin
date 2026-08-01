# Phase 3A Workbench Inset Layout Polish — Work Order

> Status: completed; evidence in `docs/evidence/phase-3a-workbench-inset-layout-polish.md`
> Scope: Shell geometry and visual/motion polish only; Phase 4 remains paused

## Objective

Align the Agent Workbench Shell with the spatial model already proven by the Admin
`inset` layout and with the visual hierarchy of Codex Desktop. Keep the Workbench Shell
independent; reuse the model and measured values, not Admin layout source code.

This phase fixes the current hard split / double-header / full-width Composer look. It
does not add Runtime, persistence, real Surfaces, or new Foundation exports.

## Reference interpretation

The Admin `SidebarProvider + Sidebar + SidebarInset` structure and Codex use the same
layout model:

```text
Sidebar background plane
├── Navigator
└── Inset Workspace (foreground plane)
    ├── one task-aware top bar
    └── Workbench Stage
        ├── Task Surface
        └── optional Work Surface
```

Workbench should reproduce this relationship with its own semantic regions and Module
Interfaces. Do not import or copy Admin `SidebarProvider`, `Sidebar`, or `SidebarInset`.

## Locked desktop geometry

### Wide desktop (`>1024px`, target 1440×900)

- Root background plane uses `sidebar` tokens.
- Expanded Navigator reserved width: **272px**.
- Inset Workspace margins: top/right/bottom **8px**; left **0** while Navigator is
  expanded.
- Inset Workspace when Navigator is collapsed: **8px on all sides**.
- Workspace radius: **12px / rounded-xl**.
- Workspace has a subtle border and shadow, clips children, and remains the only
  foreground application plane.
- Navigator itself has no hard right border. Its content has 8px outer padding and uses
  background/active-state contrast instead of a full-height divider.

### Medium (`768–1024px`, target 1024×768)

- Navigator is overlay, closed by default after mode transition.
- Workspace keeps 8px inset margins and 12px radius.
- Task Surface and Work Surface remain side-by-side with existing minimum widths.
- Context remains overlay when Task width is constrained.

### Narrow (`≤760px`)

- Workspace is full-bleed: no outer margin, radius, border, or shadow.
- Navigator is overlay.
- Work Surface remains serial/full-stage.
- No horizontal overflow.

The existing 761–767 px seam may use medium behavior; do not add a third layout model.

## Workspace top bar

Replace the current Shell header + Task Surface header duplication with one Workspace
top bar:

- leading icon-only Navigator toggle, equivalent to Admin/Codex panel toggle
- selected Task title and optional subtitle/breadcrumb
- trailing Context and Work Surface controls
- height approximately 52px, with restrained border and compact controls
- use `lucide-react` icons as Workbench-owned presentation; add the dependency to the
  Workbench package only
- preserve existing accessible names and `data-testid` values so user behavior and
  tests stay stable

`TaskSurface` becomes content-only. Remove its header and shrink its public Interface:
it receives `TaskSurfaceView`; callbacks used only by the removed header are no longer
public.

## Navigator visual hierarchy

- Keep one project and three static Tasks.
- Header should read as a compact product/project switcher, not an Admin form section.
- Search stays Foundation Input, visually subdued.
- Selected Task uses a soft rounded active row comparable to Codex.
- Footer remains a truthful Phase 3 fixture marker.
- Reserved Navigator remains mounted during collapse so pointer-triggered motion can
  be interruptible; hidden content must be `aria-hidden`/inert and unfocusable.
- Overlay Navigator remains mounted long enough to support transform/opacity state
  transitions and must not intercept pointer/focus while closed.

## Task Surface and Composer

- Execution stream content is centered with a readable max width (roughly 840–900px)
  instead of stretching edge to edge.
- Preserve clear static fixture disclosure.
- Composer becomes a floating Codex-style card near the bottom:
  - centered to the same content measure
  - rounded 16–20px
  - subtle border + shadow
  - textarea has no separate heavy border
  - local-only/no-Runtime disclosure and button behavior remain truthful
- Do not fake streaming, send state, or tool execution.

## Context Panel

- Preserve the already accepted Task-owned adaptive behavior:
  - wide Task: reserved-space
  - constrained Task: overlay
- Card sits at the upper-right of its lane/overlay and sizes to content up to an
  available-height max; it must no longer force full-height presentation by default.
- Keep environment, changes, source, and sub-agent sections.
- Use opacity + small translate entry only for pointer-triggered opening if source can
  be distinguished; otherwise keep Context toggle instant because it has a keyboard
  shortcut and is high-frequency.

## Motion contract

Motion exists to explain the sidebar plane / Workspace plane relationship. It must stay
crisp and interruptible.

### Pointer-triggered Navigator toggle

- duration: **180ms**
- easing: `cubic-bezier(0.32, 0.72, 0, 1)` (`--ease-drawer`)
- Navigator content: opacity + small `translateX`, never `scale(0)`
- reserved gap / inset relation may use an explicit width/grid-column transition to
  match Admin inset behavior; limit transition properties exactly and keep duration
  under 200ms
- no `transition-all`

### Keyboard-triggered `Ctrl/Cmd+B`

- **instant**; no movement animation
- Shell must distinguish pointer vs keyboard toggle source with a small Shell-owned
  motion state/data attribute; do not put input modality into Workbench Session

### Overlay Navigator

- transform + opacity only, 180ms drawer curve for pointer actions
- closed state has `pointer-events: none`, hidden semantics, and no focusable children
- keyboard toggle is instant

### Other high-frequency controls

- Context, Work Surface, Task switching, tabs, resize, and maximize do not gain
  decorative animation in this phase
- existing resize remains direct and interruptible

### Accessibility

- current `prefers-reduced-motion` behavior must remove movement and reduce transition
  durations
- focus remains visible
- no hover transform unless gated by `(hover: hover) and (pointer: fine)`

## Implementation ownership

- Geometry/motion source lives under `src/shell/responsive-layout` or
  `src/shell/workbench-shell`.
- Navigator Implementation stays under `src/shell/navigator`.
- Task content stays inside Task Module; Work Surface stays inside Work Surface Module.
- Workbench Session remains responsible only for durable in-memory layout state.
- No `shared`, `common`, or global `ports` directory.

## Required tests

Update or add visible-behavior tests:

1. 1440 expanded:
   - Navigator width ≈272px
   - Workspace has 8px top/right/bottom inset and no left gap beyond Navigator
   - exactly one visible Task title/top bar
2. 1440 collapsed by pointer:
   - Navigator is hidden/inert
   - Workspace has ~8px left inset and expands to remaining viewport
   - Shell marks pointer motion as animated
3. Keyboard `Ctrl+B`:
   - toggles the same state
   - Shell marks motion as instant
4. 1024:
   - overlay Navigator does not consume reserved width when closed
   - existing Task/Work containment and Context overlay pass
5. 760:
   - Workspace full-bleed
   - Context overlay and Work serial behavior pass
6. Composer:
   - local text/notice behavior unchanged
   - one Composer exists and stays within Task Surface
7. Existing Task A/B/A restoration, tabs, resize, maximize/Escape remain green.

Tests assert geometry, semantics, and data attributes—not Tailwind class strings.

## Platform/docs

- Workbench package may add `lucide-react`; update lockfile.
- Root orchestration and Foundation exports remain unchanged.
- Update Workbench README/AGENTS, root PROJECT_STATUS/CHANGELOG, and roadmap to record
  Phase 3A layout polish without claiming Phase 4.
- Add independent Phase 3A evidence after Playwright verification.

## Acceptance

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

Playwright CLI + local Chrome:

- capture 1440 expanded, 1440 collapsed, 1024 split/context, 760 task/context
- verify Workspace inset geometry numerically
- verify pointer toggle has an active 180ms transition and keyboard toggle is instant
- exercise rapid pointer toggles to confirm interruption does not strand layout state
- Console: 0 errors / 0 warnings

Animation review must produce findings table + `Approve`/`Block` under the
`review-animations` standards before commit.

## Non-goals

- No Phase 4 Runtime/event projection.
- No real Document/Browser/Review Surface.
- No theme system/provider extraction.
- No CLI Workbench generation.
- No Admin Shell modification.
- No Foundation export expansion.
