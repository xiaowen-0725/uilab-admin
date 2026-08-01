# 001 — Replace Work morph with a right-anchored drawer

- **Status**: DONE
- **Commit**: 2a55658
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 5 source/test files, medium

## Problem

The current Work transition delegates pane geometry to the browser's default View
Transition morph:

```css
/* archetypes/agent-workbench/src/styles/index.css:219 — current */
[data-slot='task-pane'] {
  view-transition-name: task-pane;
}

[data-slot='work-surface-host'] {
  view-transition-name: work-surface;
}
```

Only duration and easing are overridden. Opening therefore presents as Task snapshot
compression plus Work appearance, while maximize scales the entire Work snapshot.
Text, icons, and content appear to grow or shrink.

The supplied Codex Desktop reference instead keeps the Work right edge fixed and moves
its left boundary leftward. Work content remains at normal scale and is progressively
revealed, like a reserved-space drawer.

The same toolbar also uses the wrong visual vocabulary:

```tsx
/* archetypes/agent-workbench/src/shell/workbench-shell/workbench-shell.tsx:280 — current */
<PanelRightIcon className='size-4' aria-hidden />
<AppWindowIcon className='size-4' aria-hidden />
```

## Target

Use one always-mounted, right-anchored Work drawer slot whose width is the only moving
boundary. Work content must remain live at `scale(1)`; no View Transition snapshot or
default geometry interpolation may participate.

Exact pointer timings:

- open: `200ms cubic-bezier(0.32, 0.72, 0, 1)`
- close: `160ms cubic-bezier(0.23, 1, 0.32, 1)`
- maximize / restore: `180ms cubic-bezier(0.77, 0, 0.175, 1)`
- keyboard and restored task state: `0ms`
- reduced motion: movement disabled by the existing media query

The slot transitions between these widths:

- hidden: `0px`
- split: task-scoped `effectiveWorkWidth`
- maximized or narrow serial Work: measured Stage width (fallback `100%` before measure)

The slot must use `overflow: hidden`, remain anchored to the Stage right edge, and be
interruptible through a CSS `width` transition that retargets from the current computed
width. Keep the Work content mounted while hidden so close retains its pixels throughout
the collapse; mark it `inert` and `aria-hidden` when Session says it is not visible.

Change toolbar icons to:

- Context: `SlidersHorizontal`
- Work Surface: `PanelBottom`

Keep existing accessible names, titles, test IDs, pressed states, and 32×32 hit areas.

## Repo conventions to follow

- Motion tokens live in `archetypes/agent-workbench/src/styles/index.css` `:root`.
- The existing reserved Navigator is the local exemplar: `.nav-reserved-gap` uses an
  always-mounted clipping slot and an interruptible width transition.
- Shell owns pointer/keyboard modality; Session must not gain animation state.
- Work Surface Host owns Work chrome and remains a Module implementation.
- Tests assert visible behavior and computed geometry, not Tailwind class strings.

## Steps

1. In `workbench-shell.tsx`, replace `PanelRightIcon` / `AppWindowIcon` with
   `SlidersHorizontal` / `PanelBottom` for the two trailing Task toolbar controls.
2. Remove `usePointerViewTransition` usage and define Shell-local pane motion action
   state for `open`, `close`, `maximize`, `restore`, and `instant`. Pointer callbacks set
   the matching action before executing the existing Session command; keyboard and Task
   restore paths stay instant.
3. Keep Task pane mounted. When Work is full-stage, make Task inert/aria-hidden and let
   the expanding Work slot reduce it to zero width; do not snapshot or scale Task.
4. Add an always-mounted `work-drawer-slot` around `WorkSurfaceHost`. Compute its target
   width from visible/split/full-stage state. It is the only element that animates the
   Work boundary.
5. In `work-surface-host.tsx`, remove the early `return null` for invisible Work. Keep
   content rendered, but omit its compatibility test ID while hidden and apply
   `aria-hidden` plus `inert`. Let the drawer slot own width; Host fills the slot with
   `width: 100%` and `min-width: 0`.
6. In `index.css`, delete all Task/Work View Transition names and pseudo-element rules.
   Add exact motion tokens and action-driven duration/easing variables. Add the
   right-anchored clipping slot with an explicit `transition-property: width`.
7. Delete the now-unused private helper
   `src/shell/workbench-shell/use-pointer-view-transition.ts`.
8. Update Workbench integration tests to verify the semantic icons, action source,
   200/160/180ms computed transitions, fixed right edge, no pane transform/scale,
   keyboard instant behavior, reduced motion, rapid retargeting, and existing final
   geometry/accessibility contracts.

## Boundaries

- Do NOT change Workbench Session model/reducer semantics.
- Do NOT add dependencies or a second animation library.
- Do NOT redesign conversation content, Composer, Context, tabs, resize, or Navigator.
- Do NOT alter Admin or Foundation.
- Do NOT commit or push.
- If keeping Work content mounted cannot be made inert and inaccessible with current
  React/TypeScript support, STOP and report instead of hiding it with unsafe focus hacks.

## Verification

- **Mechanical**:
  - `pnpm --filter @uilab/agent-workbench typecheck`
  - `pnpm --filter @uilab/agent-workbench test`
  - `pnpm --filter @uilab/agent-workbench build`
  - `pnpm check:workbench`
  - `git diff --check`
- **Feel check** with Playwright CLI + local Chrome at 1440×900:
  - At 10% playback, Work right edge does not move while its left boundary advances.
  - Work text, toolbar icons, and placeholder content never scale.
  - Open settles in 200ms with drawer easing; close settles in 160ms.
  - Maximize/restore moves the same left boundary in 180ms without content scaling.
  - Three toggles 30ms apart retarget smoothly and settle to the commanded state.
  - Keyboard shortcuts remain instant; reduced-motion removes movement.
  - Context and Work controls render `SlidersHorizontal` and `PanelBottom` respectively.
- **Done when**: final geometry remains identical to Phase 3B screenshots, but every Work
  boundary transition reads as a right-side drawer rather than a scale/morph.
