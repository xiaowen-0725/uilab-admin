# Phase 3B Codex Pane Chrome + Motion — Evidence

> Date: 2026-08-02 (drawer correction; original pane chrome delivered 2026-08-01)
> Branch: `main`
> Verdict: **Pass**
> Scope: Task/Work pane chrome and continuity motion only; no Runtime or concrete Surface

## Delivered behavior

- Task and Work are peer panes with independent 44px toolbars.
- Task chrome is compact and icon-led; the task subtitle remains Navigator metadata rather
  than occupying the toolbar.
- Context keeps its adaptive reserved/overlay geometry.
- Work open, close, maximize, and restore form one spatially continuous pane model.
- Pointer actions animate; keyboard actions and reduced-motion operation update instantly.

## Playwright CLI + local Chrome

Browser: local Chrome, headed, named session `workbench-phase3`.
URL: `http://127.0.0.1:5174/`.

| Viewport/state | Verified geometry and behavior | Screenshot |
|---|---|---|
| 1440×900 Task-only | One 44px Task toolbar; Context=`SlidersHorizontal`, Work=`PanelBottom`; 32×32 controls | [`task-icons-1440.png`](../../output/playwright/work-drawer-audit/task-icons-1440.png) |
| 1440×900 Context | Context remains a content-height reserved card at the Task upper-right | [`task-context-1440.png`](../../output/playwright/phase3b-audit/task-context-1440.png) |
| 1440×900 split | Task and Work have separate toolbars; Work right edge fixed to Stage | [`work-open-1440.png`](../../output/playwright/work-drawer-audit/work-open-1440.png) |
| 1024×768 split | Stage `w=1006`; Task `w=526`; Work `w=480`; no horizontal overflow | [`work-split-1024.png`](../../output/playwright/work-drawer-audit/work-split-1024.png) |
| 760×800 serial | Work fills Stage `x=0, w=760`; Task remains inert at 0px; one operable Navigator control | [`work-serial-760.png`](../../output/playwright/work-drawer-audit/work-serial-760.png) |
| 1440×900 maximized | Work boundary expands to full Stage without scaling content | [`work-maximized-1440.png`](../../output/playwright/work-drawer-audit/work-maximized-1440.png) |
| 1440×900 restored | Pointer restore recovers Task, Context, and Work split state | [`work-restored-1440.png`](../../output/playwright/phase3b-audit/work-restored-1440.png) |

Console: **0 errors / 0 warnings**.

## Motion verification

- Frame-by-frame review revoked the original default View Transition morph because it
  compressed Task snapshots and scaled Work during maximize.
- Current Work drawer samples at 1440px: width `47.85 → 373.98 → 467.01 → 480px`;
  every sampled `slot.right - stage.right` was `0px`, and Work transform stayed `none`.
- Pointer open: 200ms drawer curve; close: 160ms strong ease-out;
  maximize/restore: 180ms strong ease-in-out.
- Maximize and restore intermediate samples also kept right-edge delta at `0px`, while
  Task width moved inversely and Work content remained unscaled.
- Three pointer toggles spaced 30ms apart retargeted safely and settled open at 480px.
- Pointer Context open computed to `140ms cubic-bezier(0.23, 1, 0.32, 1)` with
  opacity and `translateY(-4px)` entry; closing is immediate.
- `Ctrl/Cmd+Shift+W`, `Ctrl/Cmd+I`, and `Escape` report the `instant` motion source;
  keyboard Work computed duration was `0s`.
- With `prefers-reduced-motion: reduce`, Work computed duration was `0.01ms`, the slot
  had zero active animations after settling, and movement was imperceptible.
- No `transition-all`, generic `ease-in`, scale-from-zero, bounce, or decorative keyframes
  were introduced.

## Automated verification

```text
Foundation:  2 files /   8 tests passed
Admin:      18 files / 108 tests passed
Workbench:   2 files /  21 tests passed
Total:                  137 tests passed
```

Commands passed:

```bash
pnpm install --frozen-lockfile
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
| Work continuity | Right edge remains fixed while the left boundary advances/retracts; content stays at normal scale | — | Pass |
| Interruption | CSS width transition retargets from the current computed width | — | Pass |
| Context entry | 140ms opacity + 4px translation is subtle, directional, and contains no scale/bounce | — | Pass |
| Keyboard motion | High-frequency shortcuts and Escape are instant | — | Pass |
| Reduced motion | Drawer movement collapses to 0.01ms; keyboard remains 0ms | — | Pass |
| Layout cost | One bounded Stage width transition intentionally reflows Task/Work for 160–200ms | Low, accepted | Recheck with real Browser/Document surfaces |

**Animation verdict: Approve.**

## Residual boundary

Phase 4 remains paused. Phase 3B does not add Agent Runtime, Document/Browser/Review
Surfaces, Surface Registry, persistence, filesystem/Git integration, or desktop hosting.
