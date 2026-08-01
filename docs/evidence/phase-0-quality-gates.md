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
| `pnpm test` | 0 | PASS: 17 files passed; 103 tests passed |

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

## Original test-suite baseline

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

## Browser-test baseline repair

The pre-existing failures were repaired as a dedicated change before Phase 1:

1. Vitest Browser Mode now loads `src/styles/index.css`, matching the application entry point. This restores the Tailwind positioning and stacking classes required by Base UI portals, backdrops and inert regions.
2. Tests query the current Chinese accessible names and public Base UI roles instead of stale English copy or previous internal DOM shapes.
3. Auth form primary actions explicitly use `type='submit'`. Base UI Button defaults to `type='button'`, so the migration had otherwise prevented real click submission.
4. The task mutation form connects React Hook Form values to Select and RadioGroup as controlled state, removing Base UI default-value transition warnings during reset.

Independent verification after the repair:

```text
Test Files  17 passed (17)
Tests       103 passed (103)
Duration    6.97s
```

The headed local-Chrome Playwright CLI check at `/sign-in` also verified:

- the 登录 button has DOM type `submit`;
- clicking the empty form renders `请输入邮箱。` and `请输入密码。`;
- browser console: 0 errors, 0 warnings.

## Phase 0 interpretation

The current baseline is **fully green**. Phase 1 must use `pnpm test` as a strict migration equivalence gate alongside the existing engineering and UI gates. The migration comparison requires:

- all 17 Browser Mode test files / 103 tests passing;
- no Base UI console errors or warnings during the suite;
- `typecheck`, `build`, `check:ai`, CLI smoke and Playwright UI baseline remaining green.

The original red result remains recorded above as historical evidence; it is no longer the accepted migration baseline.
