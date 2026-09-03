# Animation plans

| Plan | Severity | Status | Dependencies |
|---|---|---|---|
| [001 — Replace Work morph with a right-anchored drawer](./001-replace-work-morph-with-drawer.md) | HIGH | DONE | Phase 3B pane chrome |
| [002 — Reserved-column width transitions](./002-navigator-width-transition-layout-cost.md) | LOW | EVALUATED — NO CHANGE | Measurement record |
| [003 — Replace live Timeline spinner with text shimmer](./003-timeline-live-row-shimmer-not-spinner.md) | MEDIUM | DONE | Reuses existing `.wb-live-status-shimmer` |

## Recommended order

Plan 001 is done. Plan 002 is a keep-width decision, not work.

Execute **003** next. It only changes live Timeline command/tool rows: drop the
rotating refresh icon and put the existing text sweep on the status label.

No dependency on 001 or 002.
