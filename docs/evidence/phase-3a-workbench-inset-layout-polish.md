# Phase 3A Workbench Inset Layout Polish — Evidence

> Date: 2026-08-01
> Branch: `main`
> Verdict: **Pass**
> Scope: Shell layout and motion only; no Agent Runtime or concrete Surface

## Delivered layout

- Reuses the Admin inset spatial model without importing Admin Shell code.
- Wide: 272px reserved Navigator and one inset Workspace foreground plane.
- Medium: inset Workspace with overlay Navigator; Task and Work stay contained.
- Narrow: full-bleed Workspace; overlay Navigator and serial Work Surface.
- One task-aware top bar, centered execution stream, floating Composer, and adaptive
  content-height Context card.

## Playwright CLI + local Chrome

Browser: local Chrome, headed, named session `workbench-phase3`.
URL: `http://127.0.0.1:5174/`.

| Viewport/state | Verified geometry and behavior | Screenshot |
|---|---|---|
| 1440×900 expanded | Navigator `x=0, w=272`; Workspace `x=272, y=8, w=1160, h=884`; one 52px top bar; no horizontal overflow | [`workbench-1440.png`](../../output/playwright/phase3a-audit/workbench-1440.png) |
| 1440×900 Context | Context reserved at `x=1131, w=300`; card content height 475px rather than full height | [`workbench-1440-context.png`](../../output/playwright/phase3a-audit/workbench-1440-context.png) |
| 1440×900 collapsed | Workspace `x=8, y=8, w=1424, h=884`; Navigator hidden/inert | [`workbench-1440-collapsed.png`](../../output/playwright/phase3a-audit/workbench-1440-collapsed.png) |
| 1024×768 split | Workspace inset 8px; Task `w=526`, Work `w=480`; Context overlays constrained Task; `scrollWidth=1024` | [`workbench-1024-split-context.png`](../../output/playwright/phase3a-audit/workbench-1024-split-context.png) |
| 760×800 Task | Workspace full-bleed `x=0, y=0, w=760`; Context overlays Task; `scrollWidth=760` | [`workbench-760-context.png`](../../output/playwright/phase3a-audit/workbench-760-context.png) |
| 760×800 Navigator | 272px overlay Navigator; backdrop active only while open | [`workbench-760-navigator.png`](../../output/playwright/phase3a-audit/workbench-760-navigator.png) |

Console: **0 errors / 0 warnings**.

## Motion verification

Pointer collapse samples:

| Sample | Reserved gap | Workspace left |
|---|---:|---:|
| 0ms | 272px | 272px |
| 50ms | 34.98px | 41.95px |
| 220ms | 0px | 8px |

- Computed pointer transition: `width 0.18s cubic-bezier(0.32, 0.72, 0, 1)`.
- `Ctrl+B` set `data-nav-motion="instant"`; computed duration `0s` and geometry
  changed immediately.
- Three pointer toggles interrupted at 40ms intervals settled correctly at open,
  `gap=272px`, `workspaceLeft=272px`.
- `prefers-reduced-motion: reduce` produced computed duration `0.00001s`.
- No `transition-all`, `ease-in`, scale animation, or decorative animation on Context,
  Work, tabs, resize, or maximize.

## Automated verification

```text
Foundation:  2 files /   8 tests passed
Admin:      18 files / 108 tests passed
Workbench:   2 files /  17 tests passed
Total:                  133 tests passed
```

Commands passed:

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
git diff --check
```

## Animation review

| Area | Finding | Severity | Disposition |
|---|---|---|---|
| Pointer Navigator | 180ms strong drawer curve explains reserved-space change and remains interruptible | — | Pass |
| Keyboard Navigator | High-frequency shortcut is instant | — | Pass |
| Overlay Navigator | Uses transform + opacity; closed state is inert and non-interactive | — | Pass |
| Reserved layout | Explicit width/margin transitions cause bounded layout work, justified by inset parity and limited to 180ms | Low, accepted | Monitor with real content |
| Reduced motion | Movement duration collapses to 0.01ms | — | Pass |

**Animation verdict: Approve.**

## Residual boundary

Phase 4 remains paused. This phase does not add Runtime, event projection, real
Document/Browser/Review Surfaces, persistence, filesystem/Git integration, or a
desktop host.
