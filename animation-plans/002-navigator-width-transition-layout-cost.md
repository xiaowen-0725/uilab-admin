# 002 — Reserved-column width transitions: measured layout cost

- **Status**: EVALUATED — NO CHANGE
- **Severity**: LOW
- **Category**: Performance & motion semantics
- **Estimated scope**: none (decision record)

## Problem

Design review flags two rules in `archetypes/agent-workbench/src/styles/index.css` under a
generic "do not transition layout properties" heuristic:

```css
/* .nav-reserved-gap */
transition: width var(--nav-motion-duration) var(--ease-drawer);

/* .work-drawer-slot */
transition-property: width;
```

The heuristic is correct that `width` cannot be composited: every frame of these
transitions forces layout. The question this record settles is whether that cost is real
here, where it is spent, and whether removing it is worth what it would cost.

No repository gate enforces this. There is no stylelint or CSS lint configuration in the
workspace; the finding comes from design review only.

## Measurement

Chromium via the Cursor browser against the dev server at 1440×900 on a 120 Hz display, so
an unblocked frame is ~8.3ms. Frame deltas sampled with `requestAnimationFrame` over a
600ms window per run (500ms for the 1× runs), discarding the first two samples. Each run
toggles the Navigator once. An idle control with no interaction runs between every
measurement to separate real cost from ambient throttling of the embedded view.

At 1× CPU the transition is clean:

| Run | Frames | Longest frame | Frames > 33ms |
|---|---|---|---|
| idle control | 59 | 9.2ms | 0 |
| toggle | 50 | 17.1ms | 0 |
| toggle back | 51 | 17.5ms | 0 |

At 4× CPU throttling it is not:

| Run | Frames | Longest frame | Frames > 33ms |
|---|---|---|---|
| idle control | 71 | 9.2ms | 0 |
| toggle | 17–38 | 74.8–132.3ms | 4–6 |

The idle control stays flat under the same throttling, so the long frames belong to the
transition rather than to the harness.

## Where the cost is

Each hypothesis was isolated by re-running the 4× measurement with one factor removed.

| Variant | Frames > 33ms | Reading |
|---|---|---|
| Set `data-nav-open` directly on the Shell, bypassing React | 4–5 | Not React re-render |
| `.task-container` set to `container-type: normal` | 4–6 | Not container-query re-evaluation |
| Workspace children `visibility: hidden` (layout kept, paint dropped) | 5 | Not paint |
| Workspace children `display: none` (layout dropped) | 0–1 | Layout confirmed |
| `.nav-reserved-gap` given `contain: layout` | 4–5 | No effect |

The cost is per-frame layout of the **squeezed** side. `.workbench-workspace` is `flex: 1`,
so every frame of the gap's width animation resizes it and re-lays out its subtree.
Containment on the clipping slot does nothing because the expensive subtree is not inside
the slot.

## Decision

Keep the width transitions.

Removing the per-frame layout requires the Workspace width to stop depending on the
animating slot: fix it to its final width and translate it into place, so only a
compositor-driven transform animates. That trade is bad here.

- The reserved Navigator column and the Work drawer are **squeeze** geometry — they take
  space away, and the Workspace genuinely becomes narrower. Reflow is the honest rendering
  of that. A translate would clip and slide content for the duration, then snap to the real
  layout, reading as an overlay for 180ms and as a reserved column afterwards.
- Shell already draws this distinction correctly. Overlay Navigator
  (`.navigator-overlay-host`, narrow viewports) animates `transform` and `opacity`, because
  nothing is being squeezed there. Collapsing both modes onto transform would erase a
  correct structural distinction in order to silence a generic heuristic.
- Both transitions are interruptible by retargeting from the current computed width, and
  `.work-drawer-slot` drives `onTransitionEnd` in `workbench-shell.tsx`. A transform
  rewrite has to swap between "fixed width plus translate" and `flex: 1` on every
  interruption; any mismatch is a visible jump.
- Users who opt out are already covered: the `prefers-reduced-motion` block collapses all
  transition durations to `0.01ms`.

Low-end degradation gated on `navigator.hardwareConcurrency` or similar was considered and
rejected. Those signals do not reliably identify slow machines, and a wrong guess silently
removes motion on capable ones.

## What would reopen this

- Evidence of the stutter on hardware users actually run, rather than under synthetic
  throttling.
- Growth of the Workspace subtree — a long non-virtualized Timeline would raise this cost
  everywhere, not only during these 180ms. Making that subtree cheaper to lay out is the
  lever that helps generally; transform-driven motion is not.
