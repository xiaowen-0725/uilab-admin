# Phase 3B Codex Pane Chrome + Motion — Evidence

> Date: 2026-08-01
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
| 1440×900 Task-only | One pane-local 44px Task toolbar; no subtitle; icon-only Context/Work controls | [`task-only-1440.png`](../../output/playwright/phase3b-audit/task-only-1440.png) |
| 1440×900 Context | Context remains a content-height reserved card at the Task upper-right | [`task-context-1440.png`](../../output/playwright/phase3b-audit/task-context-1440.png) |
| 1440×900 split | Task and Work have separate, non-overlapping 44px toolbars | [`split-context-1440.png`](../../output/playwright/phase3b-audit/split-context-1440.png) |
| 1024×768 split | Task `x=9, w=526`; Work `x=536, w=479`; Context overlays constrained Task; no overflow | [`split-context-1024.png`](../../output/playwright/phase3b-audit/split-context-1024.png) |
| 760×800 serial | Work fills Stage `x=0, w=760`; one operable Navigator control; no left divider or overflow | [`work-serial-760.png`](../../output/playwright/phase3b-audit/work-serial-760.png) |
| 1440×900 maximized | Work fills inset Stage; toolbar remains 44px and owns restore/close controls | [`work-maximized-1440.png`](../../output/playwright/phase3b-audit/work-maximized-1440.png) |
| 1440×900 restored | Pointer restore recovers Task, Context, and Work split state | [`work-restored-1440.png`](../../output/playwright/phase3b-audit/work-restored-1440.png) |

Console: **0 errors / 0 warnings**.

## Motion verification

- Pointer Work open/close/maximize/restore uses named View Transitions
  `task-pane` and `work-surface` at `180ms cubic-bezier(0.77, 0, 0.175, 1)`.
- Root transition group/crossfade is disabled (`animation-name: none`, duration `0s`);
  sampled active named animations were 180ms only.
- Three pointer toggles spaced 30ms apart interrupted safely and settled to the expected
  final closed state with no active animations or console warnings.
- Pointer Context open computed to `140ms cubic-bezier(0.23, 1, 0.32, 1)` with
  opacity and `translateY(-4px)` entry; closing is immediate.
- `Ctrl/Cmd+Shift+W`, `Ctrl/Cmd+I`, and `Escape` do not invoke
  `document.startViewTransition`; Shell reports the `instant` motion source.
- With `prefers-reduced-motion: reduce`, pointer Work actions bypass View Transition and
  settle instantly with zero active animations.
- No `transition-all`, generic `ease-in`, scale-from-zero, bounce, or decorative keyframes
  were introduced.

## Automated verification

```text
Foundation:  2 files /   8 tests passed
Admin:      18 files / 108 tests passed
Workbench:   2 files /  20 tests passed
Total:                  136 tests passed
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
| Work continuity | Named pane snapshots preserve spatial identity through open, close, maximize, and restore | — | Pass |
| Root document | Root crossfade/group animation is suppressed, preventing whole-window flash | — | Pass |
| Interruption | Active transitions are skipped before retargeting; rapid input settles deterministically | — | Pass |
| Context entry | 140ms opacity + 4px translation is subtle, directional, and contains no scale/bounce | — | Pass |
| Keyboard motion | High-frequency shortcuts and Escape are instant | — | Pass |
| Reduced motion | View Transition is bypassed and CSS motion is disabled | — | Pass |
| Snapshot cost | View Transition captures two bounded pane surfaces for 180ms | Low, accepted | Recheck when real Browser/Document surfaces arrive |

**Animation verdict: Approve.**

## Residual boundary

Phase 4 remains paused. Phase 3B does not add Agent Runtime, Document/Browser/Review
Surfaces, Surface Registry, persistence, filesystem/Git integration, or desktop hosting.
