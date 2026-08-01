# Phase 0 quality-gate baseline

## Environment

- Date: 2026-08-01
- Commit: `81731f8`
- Node: `v24.6.0`
- pnpm: `10.33.3`
- Playwright package: `1.59.1`
- Vitest browser instance: `chromium` through `@vitest/browser-playwright`

## Gate matrix

| Gate | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | PASS |
| `pnpm build` | 0 | PASS |
| `pnpm check:ai` | 0 | PASS |
| Playwright CLI UI smoke | 0 | PASS; see [UI baseline](./phase-0-playwright-baseline.md) |
| `pnpm test` | 1 | BASELINE FAIL: 11 files failed, 6 passed; 55 tests failed, 48 passed |

## Browser installation prerequisite

The first `pnpm test` attempt did not execute tests because the Playwright 1.59.1 Chromium Headless Shell revision `1217` was absent. The repository-provided command was run with the local proxy:

```bash
HTTP_PROXY=http://127.0.0.1:7897 \
HTTPS_PROXY=http://127.0.0.1:7897 \
ALL_PROXY=http://127.0.0.1:7897 \
NO_PROXY=localhost,127.0.0.1,::1 \
pnpm test:browser:install
```

This installed:

- Chrome for Testing `147.0.7727.15`, Playwright Chromium revision `1217`
- Chrome Headless Shell revision `1217`
- Playwright FFmpeg revision `1011`

The interactive Phase 0 UI baseline used the local headed Chrome through Playwright CLI. The Vitest suite intentionally retained its repository-defined pinned Chromium provider instead of changing configuration to `channel: 'chrome'` during baseline capture.

## Test-suite result

After the pinned browser was installed, `pnpm test` completed with:

```text
Test Files  11 failed | 6 passed (17)
Tests       55 failed | 48 passed (103)
Duration    228.82s
```

Observed failure families:

1. Tests still query English accessible names while the current UI renders Chinese labels, for example `Email`, `Continue`, `Verify`, `Sign in`, `Create Account`, and `Open theme settings`.
2. Several Base UI dialog tests time out because a `data-base-ui-inert` presentation layer intercepts pointer events.
3. Some drawer/dialog tests expect a previous DOM shape, for example two Close buttons where the current render exposes one.
4. Most failures consume the full 5-second or 15-second locator timeout; the suite is therefore slow when the baseline is red.

This is not a universal browser-startup failure: 48 tests pass, the failure screenshots contain rendered component DOM, and the independent Playwright CLI UI flows pass in headed Chrome.

## Phase 0 interpretation

The current baseline is **not fully green**. Phase 1 must not use `pnpm test` as a strict migration equivalence gate until these pre-existing tests are repaired or explicitly rebaselined. The migration comparison should require:

- no increase beyond the recorded 11 failed files / 55 failed tests;
- the same failure families unless a dedicated test-fix change intentionally removes them;
- `typecheck`, `build`, `check:ai`, CLI smoke and Playwright UI baseline remaining green.

Test repair should be performed as a separate workstream before or at the beginning of Phase 1, not mixed into mechanical directory moves.
