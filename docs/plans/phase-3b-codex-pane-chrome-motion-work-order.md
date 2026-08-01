# Phase 3B Codex Pane Chrome + Motion — Work Order

> Status: completed and independently verified
> Scope: Task/Work pane chrome and pointer motion polish only; no Runtime or concrete Surface

## Objective

Replicate the Codex Desktop presentation demonstrated in the user-supplied 22.33s GIF:

- Task and Work are peer panes, each with its own compact toolbar.
- Task-only + Context, Task/Work split, constrained Context overlay, Work maximize,
  Work restore, and Work close remain one continuous spatial model.
- Pointer actions preserve spatial continuity; keyboard shortcuts stay instant.

This phase refines the existing Phase 3/3A placeholder Host. It does not implement a
Document, Browser, Review, Artifact, Runtime, or Surface Registry.

## GIF-derived state model

```text
Task only
└── Task pane
    ├── Task toolbar
    ├── conversation fixture
    ├── adaptive Context card (reserved when wide, overlay when constrained)
    └── Composer

Task + Work
├── Task pane (own toolbar and Composer)
└── Work pane (own tab toolbar and placeholder content)

Work maximized
└── Work pane fills Stage; Navigator/Workspace shell remain
```

The existing task-scoped state remains authoritative. Phase 3B changes projection and
motion only.

## Task pane chrome

Move the current Workspace-wide header into the Task pane. The Stage must no longer
have one toolbar spanning both Task and Work.

- Toolbar height: **44px**.
- Keep `data-testid="workspace-top-bar"` for compatibility, but make it the Task pane
  toolbar and add `data-slot="task-pane-toolbar"`.
- Leading cluster:
  - icon-only Navigator toggle (`toggle-navigator`), frameless 32×32 control
  - folder/project glyph
  - selected Task title on one line
- Remove the Task subtitle from toolbar chrome. It remains available in Navigator data.
- Trailing cluster:
  - icon-only Context toggle (`toggle-context`)
  - icon-only Work toggle (`toggle-work-surface-chrome`)
  - preserve accessible names, `aria-pressed`, and test IDs
  - use native `title` text for immediate discoverability; do not add a tooltip dependency
- Controls use no always-visible border. Hover/pressed state is a soft rounded background.
- No fake menu/action. Do not add a decorative ellipsis that looks interactive.

The Task pane wrapper owns `view-transition-name: task-pane` and contains its toolbar
plus `TaskSurface`.

## Work pane chrome

Keep Work Surface Host as the owner of Work chrome, but align it with Codex:

- Toolbar height: **44px**, with the same bottom divider as Task toolbar.
- Tabs remain visible labels and keep tab semantics/test IDs.
- Active tab is a compact muted pill; inactive tabs are restrained text controls.
- Maximize/restore and close become icon-only 32×32 controls using existing accessible
  names and test IDs.
- Use `Maximize2`, `Minimize2`, and `X` from Workbench-owned `lucide-react`.
- Host background is the Workspace background rather than a separate card plane.
- Keep resize separator, keyboard resize, tabs, placeholder truthfulness, and all callbacks.
- The Host owns `view-transition-name: work-surface`.

## Pointer vs keyboard motion contract

### Pointer Work transitions

The following pointer actions use the browser View Transition API when available:

- open Work from Task toolbar
- close Work from Task toolbar or Work toolbar
- maximize Work
- restore Work

Contract:

- duration: **180ms**
- easing: `cubic-bezier(0.77, 0, 0.175, 1)` (strong on-screen movement curve)
- transition names: `task-pane`, `work-surface`
- suppress the root crossfade so the whole application never flashes
- repeated pointer actions skip/retarget the active transition before starting the next
- unsupported browsers fall back to the exact same state update with no animation
- `prefers-reduced-motion: reduce` bypasses movement and performs the update immediately
- expose `data-pane-motion="animated|instant"` on Workbench Shell for verification

Use `flushSync` only inside the View Transition update callback so React commits the
state change in the captured transition boundary. Keep this helper private to Shell.

### Keyboard Work transitions

- `Ctrl/Cmd+Shift+W` and `Escape` remain **instant**.
- They must not call `document.startViewTransition`.
- Shell marks `data-pane-motion="instant"`.

### Context card

Pointer Context open uses a subtle **140ms** entry:

- opacity `0 → 1`
- transform `translateY(-4px) → translateY(0)`
- easing `cubic-bezier(0.23, 1, 0.32, 1)`
- no scale, bounce, or keyframes
- closing is immediate
- `Ctrl/Cmd+I` remains instant
- expose `data-context-motion="animated|instant"` on Shell

Use CSS transitions / `@starting-style`; no `transition-all`.

### Existing Navigator motion

Do not alter the accepted Phase 3A Navigator pointer/keyboard motion contract.

## Shortcut ownership

Update the shortcut hook to receive one required callbacks object for the three Shell
motion-aware toggles:

- Navigator keyboard toggle
- Context keyboard toggle
- Work keyboard toggle

Escape still exits maximize directly and instantly. Input modality remains Shell-only
and must not enter Workbench Session state.

## Responsive behavior

- Wide and medium split geometry/minimum widths remain unchanged.
- At 1024 split, Task toolbar belongs only to Task; Work toolbar belongs only to Work.
- Context overlay behavior under constrained Task width remains unchanged.
- At 760 narrow, Work remains serial/full-stage and its toolbar remains operable.
- No horizontal overflow.

## Files and ownership

Expected implementation scope:

- `src/shell/workbench-shell/workbench-shell.tsx`
- `src/shell/workbench-shell/use-workbench-shortcuts.ts`
- optional private Shell helper/component under `src/shell/workbench-shell/*`
- `src/modules/work-surface/ui/work-surface-host/work-surface-host.tsx`
- `src/styles/index.css`
- Workbench integration tests
- Workbench README/AGENTS and root status/changelog/roadmap

Do not modify Foundation exports or Workbench Session model/reducer semantics.

## Required tests

1. Task-only:
   - exactly one Task pane toolbar/title
   - subtitle absent from toolbar
   - Context/Work controls remain accessible icon buttons
2. Split:
   - Task toolbar bounds match Task pane bounds
   - Work toolbar bounds match Work pane bounds
   - Task and Work headers do not overlap
3. Pointer controls:
   - Context sets `data-context-motion="animated"`
   - Work open/close/maximize sets `data-pane-motion="animated"`
4. Keyboard controls:
   - Context and Work set their motion source to `instant`
   - existing behavior remains correct
5. Existing Task restoration, tabs, resize, maximize/Escape, 1024 containment, 760
   serial behavior, Composer honesty, Navigator semantics, and geometry remain green.

Tests assert visible behavior/geometry/data attributes, not Tailwind class strings.

## Playwright acceptance

Use Playwright CLI + local Chrome at 1440×900, 1024×768, and 760×800:

- screenshot Task-only + Context, Task/Work split, Work maximized, and restored states
- verify 44px Task and Work toolbar heights and pane-aligned bounds
- sample View Transition animations and confirm duration/easing
- verify rapid pointer toggles settle to correct state
- emulate reduced motion and confirm pointer Work transition is bypassed
- verify keyboard Context/Work actions are instant
- console: 0 errors / 0 warnings

## Completion gates

```bash
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
git diff --check
```

Animation review must produce a findings table and explicit `Approve` or `Block` before
commit.

## Non-goals

- No conversation-content redesign in this phase.
- No Composer redesign in this phase.
- No real artifact thumbnail/open flow.
- No new Work Surface tab creation.
- No Runtime, streaming, persistence, filesystem, Git, desktop bridge, or Surface Registry.
- No Admin or Foundation changes.
