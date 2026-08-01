# Phase 0 Playwright baseline

## Environment

- Date: 2026-08-01
- Commit: `81731f8`
- Branch: `main`
- App URL: `http://127.0.0.1:5173`
- Browser: headed Chrome controlled through Playwright CLI
- Viewport: `1440 × 1000`
- Node: `v24.6.0`
- pnpm: `10.33.3`
- Session: `phase0-baseline`

The existing `uilab-preview` browser session and Vite server were left running. Phase 0 used an isolated Playwright CLI session.

## Result

| Flow | Result | Observable evidence |
|---|---|---|
| Dashboard route | PASS | `/` rendered `仪表盘`, overview tabs, cards and chart |
| Command search | PASS | `搜索 ⌘ K` opened the `命令面板`; Escape restored focus to the trigger |
| Appearance settings | PASS | `外观与布局` opened with theme, sidebar, density and direction controls |
| User menu | PASS | User trigger opened profile, billing, settings, team and logout items |
| Tasks route | PASS | `/tasks` rendered the data-table, pagination and faceted toolbar |
| Text filter | PASS | `TASK-9366` changed the URL to `?filter=TASK-9366` and reduced the table to one row |
| Faceted status filter | PASS | Selecting `已完成` changed the URL to `?status=["done"]` and reduced the result to 18 rows / 2 pages |
| Legacy workspace | PASS | `/workspace` rendered the current three-column Agent Desktop placeholder |
| Browser console | PASS | Playwright reported 0 errors and 0 warnings after the checked flows |

## Screenshots

- [Dashboard](../../output/playwright/phase0-baseline/dashboard-1440.png)
- [Command search](../../output/playwright/phase0-baseline/search-dialog.png)
- [Appearance drawer](../../output/playwright/phase0-baseline/appearance-drawer.png)
- [User menu](../../output/playwright/phase0-baseline/user-menu.png)
- [Tasks text filter](../../output/playwright/phase0-baseline/tasks-text-filter.png)
- [Tasks faceted filter](../../output/playwright/phase0-baseline/tasks-faceted-filter.png)
- [Legacy workspace](../../output/playwright/phase0-baseline/workspace-legacy.png)

All screenshots are PNG files captured at `1440 × 1000` CSS pixels.

## Reproduction

```bash
PWCLI="$HOME/.codex/skills/playwright/scripts/playwright_cli.sh"

"$PWCLI" -s=phase0-baseline open http://127.0.0.1:5173/ --headed
"$PWCLI" -s=phase0-baseline resize 1440 1000
"$PWCLI" -s=phase0-baseline snapshot
```

All interactions used element references from the latest snapshot. Screenshots were written under `output/playwright/phase0-baseline/` as required by the project Playwright skill.

## Baseline interpretation

The current `/workspace` route is confirmed as an Admin Shell feature composed of three Cards: recent threads, a mock main canvas and a fixed context card. Phase 1 must preserve it while moving Admin; Phase 3 replaces this concept only inside the new Agent Workbench Archetype.
