# Phase 2A Minimal Foundation evidence

> Phase 2A Foundation **seam** only. Full Phase 2 is **not** complete until Agent Workbench is a second real consumer of broader primitives/providers.

| Field | Value |
| --- | --- |
| Date | 2026-08-01 |
| Branch | `main` |
| Source repo | `/Users/zhoujw/develop/github/uilab-admin` |
| Work order | `docs/plans/phase-2a-minimal-foundation-work-order.md` |
| Smoke app (initial) | `/Users/zhoujw/develop/tmp/phase2a-found-20260801-212320` |
| Smoke app (hardened gate/copy) | `/Users/zhoujw/develop/tmp/phase2a-hard-20260801-213014` |
| Final independent smoke | `/Users/zhoujw/develop/tmp/phase2a-codex-final` |
| Operator mode | Grok implementation; Codex diff review, negative fixtures, final smoke, CSS audit, and Playwright CLI |

## 1. Public Interface (exact)

`@uilab/foundation` exports **only**:

| Export key | Source (exact target enforced by gate) |
| --- | --- |
| `./ui/button` | `./src/ui/button.tsx` |
| `./ui/input` | `./src/ui/input.tsx` |
| `./styles/tokens.css` | `./src/styles/tokens.css` |

- No root barrel (`.`)
- `cn` is private (`src/internal/cn.ts`), not exported
- Package is `private: true`, source-consumed (build = `tsc --noEmit` validation)
- Gate enforces the exact key→target map, target existence, and that targets resolve inside the Foundation package (no absolute / escaping paths)

## 2. Dependency direction

```text
archetypes/admin  ──▶  @uilab/foundation
tooling           ──▶  package metadata / source checks
@uilab/foundation  ──X──▶  any @uilab/* except self @uilab/foundation
@uilab/foundation  ──X──▶  archetypes/* | @/* | relative escape
```

Admin dependency: `"@uilab/foundation": "workspace:*"`.

Symlink observed:

```text
archetypes/admin/node_modules/@uilab/foundation -> ../../../../packages/foundation
```

### Gate hardening (Correction 1)

`tooling/quality-gates/check-foundation-boundaries.mjs`:

- Rejects **every** `@uilab/*` import/dependency from Foundation except self-reference to `@uilab/foundation` (or its subpaths)
- Scans all source-like JS/JSX/TS/TSX/MJS/CJS/MTS/CTS files under the Foundation **package root** (includes `vite.config.ts`), not only `src/`
- Walk skips generated/dependency dirs: `node_modules`, `dist`, `coverage`, `.vitest-attachments`, `__screenshots__`, `.playwright-cli`
- Enforces exact export key→target map + existence + in-package resolution

### Copy filtering hardening (Correction 1)

`tooling/template-cli/uilab-admin.mjs` `copyFilter`:

- `COPY_IGNORE` includes `.vitest-attachments`, `__screenshots__`, `.playwright-cli` (plus existing `node_modules` / `dist` / `.git` / `.tanstack` / `coverage` / …)
- Rejects an ignored directory name at **any** relative path segment (not only the first segment)
- Removed working-tree generated artifacts (not tracked source):
  - `packages/foundation/.vitest-attachments/`
  - `packages/foundation/src/ui/__screenshots__/`

## 3. Admin consumption

| Path | Role |
| --- | --- |
| `src/components/ui/button.tsx` | compatibility re-export of `@uilab/foundation/ui/button` |
| `src/components/ui/input.tsx` | compatibility re-export of `@uilab/foundation/ui/input` |
| `src/styles/theme.css` | `@import '@uilab/foundation/styles/tokens.css'` (no duplicate token block) |
| `src/styles/index.css` | `@source "../../node_modules/@uilab/foundation/src/ui";` |

The source scope is intentionally limited to public UI implementation. In a generated app, scanning the package root produced a 238,350 B stylesheet; scanning `src/ui` produced 129,942 B while retaining the Foundation Button/Input classes.

Application import paths remain `@/components/ui/*`.

## 4. Platform verification commands and results

```bash
pnpm install --no-frozen-lockfile   # lockfile updated for foundation package
node --check tooling/quality-gates/check-foundation-boundaries.mjs   # OK
node --check scripts/check-foundation.mjs                             # OK
node --check tooling/template-cli/uilab-admin.mjs                     # OK
pnpm --filter @uilab/foundation typecheck   # OK
pnpm --filter @uilab/foundation build       # OK (tsc --noEmit)
pnpm --filter @uilab/foundation test        # 2 files / 8 tests OK
pnpm typecheck                              # foundation → admin OK
pnpm build                                  # foundation → admin OK
pnpm test                                   # foundation 8 + admin 18/108 OK
pnpm check:foundation                       # OK
pnpm check:ai                               # OK
```

### Wrapper / canonical foundation gate parity

Both entries print `check-foundation OK` with the same approved exports:

- `node scripts/check-foundation.mjs`
- `node tooling/quality-gates/check-foundation-boundaries.mjs`

### CLI check / help parity

- `node cli/uilab-admin.mjs check` and `node tooling/template-cli/uilab-admin.mjs check` both pass
- `help` output still identifies `uilab-admin v0.2.0` from both entries

### Correction 2: `uilab-admin check` runs Foundation + AI

`cmdCheck` now runs **both** gates (Foundation first, then AI; fail-fast if Foundation fails):

| Layout | Scripts |
| --- | --- |
| Platform Admin | `tooling/quality-gates/check-foundation-boundaries.mjs` → `tooling/quality-gates/check-ai.mjs` |
| Derived app | `scripts/check-foundation.mjs` → `scripts/check-ai.mjs` |

- Both scripts must exist before either runs; missing → exit `4` (`NOT_FOUND`)
- Public JSON shape unchanged: `{ command, ok, status, stdout, stderr }` (combined strings, no nested gate schema)
- Success only when both gates pass
- Root wrapper (`cli/uilab-admin.mjs`) and canonical CLI remain identical (wrapper re-exports canonical)

### routeTree SHA (unchanged)

```bash
shasum -a 256 archetypes/admin/src/routeTree.gen.ts
# ae8902e654f8393e3499dbd3f912d4ddcb0f133cedd328c6bf112e681c9652b4
```

### Production CSS includes Foundation-unique class tokens

After `pnpm build`, Admin CSS contains escaped tokens unique to Foundation Button/Input sources, for example:

- `file\:inline-flex`
- `dark\:disabled\:bg-input\/80`
- `has-data-\[icon\=inline-end\]`
- `bg-clip-padding`

(Do not rely on visual guess alone.)

## 5. Negative / fail-fast fixtures

Repo source is **not** mutated for negatives. Temp fixture root:

```text
/Users/zhoujw/develop/tmp/phase2a-gate-neg-20260801-213014
```

| Fixture | Result |
| --- | --- |
| Package-level `vite.config.ts` imports `@uilab/agent-workbench` | exit **1**, `forbidden @uilab/* dependency in vite.config.ts: @uilab/agent-workbench` |
| Export `./ui/button` redirected to `./src/ui/../../../../etc/passwd` | exit **1**, `Foundation export ./ui/button must target exactly ./src/ui/button.tsx` |
| Package-level `vite.config.ts` relative import `../../archetypes/admin/src/main.tsx` | exit **1**, `forbidden Archetype path import in vite.config.ts` |
| Earlier: temp Foundation + forbidden `import '@/lib/utils'` | exit **1**, `forbidden Admin alias @/*` |
| Incomplete platform `--template` missing `packages/foundation` | exit **4**, **no** target directory created |

## 6. Generated application smoke

### Hardened re-smoke (Correction 1)

```text
/Users/zhoujw/develop/tmp/phase2a-hard-20260801-213014
```

Materialization includes:

- `packages/foundation/` (local copy)
- `pnpm-workspace.yaml` with `'.'` and `'packages/*'`
- `@uilab/foundation: workspace:*`
- local `scripts/check-foundation.mjs` (canonical gate copy, not platform wrapper)
- local `scripts/check-ai.mjs` + `cli/uilab-admin.mjs`

**Clean-copy observation (before `pnpm install`):** immediately after `uilab-admin init` / materialization, copied `packages/foundation` contains **none** of:

- `.vitest-attachments`
- `__screenshots__`
- `.playwright-cli`
- `node_modules`
- `dist`

After `pnpm install`, a local `node_modules` under the generated app (and possibly workspace packages) is **expected** and is **not** a copied template artifact. The copy filter still excludes `node_modules` / `dist` / test-artifact dirs from the **source** tree being copied.

Commands in smoke app:

```bash
pnpm install
pnpm typecheck          # OK
pnpm build              # OK
pnpm test               # 20 files / 116 tests OK
pnpm check:foundation   # derived mode OK
pnpm check:ai           # OK
pnpm uilab-admin check  # OK (Correction 2: both Foundation + AI gates)
```

### Earlier smoke (pre-hardening)

```text
/Users/zhoujw/develop/tmp/phase2a-found-20260801-212320
```

Nested explicit derived-template dry-run against that app still valid:

```bash
node cli/uilab-admin.mjs init nestedphase2a \
  --scenario ops-console \
  --dir /Users/zhoujw/develop/tmp \
  --template /Users/zhoujw/develop/tmp/phase2a-found-20260801-212320 \
  --dry-run --json
```

Reports `foundationSourceRoot` under the generated app’s `packages/foundation`.

No platform-path contracts (`archetypes/admin`, `PROJECT_STATUS.md`, …) observed in generated `AGENTS.md` / skill Markdown.

## 7. Residual boundary (not Phase 2 complete)

Phase 2A proves:

1. Package ownership + explicit Interface
2. Admin compatibility without import churn
3. Tailwind source discovery via `node_modules`
4. Dependency direction gate (fail-closed on all non-self `@uilab/*`, package-root scan, exact export targets)
5. Copy-and-own mini-workspace materialization (nested artifact dirs excluded)

Still deferred for full Phase 2:

- Agent Workbench as second consumer
- Shared theme/direction/font providers
- Additional primitives (Dialog, Popover, Tabs, Tooltip, Scroll Area, …)
- Shell / data-table / Router / Query / cookies / hooks extraction

### Correction 2 verification (comprehensive `uilab-admin check`)

Platform (2026-08-01):

```bash
node --check tooling/template-cli/uilab-admin.mjs   # OK
diff help: wrapper vs canonical                     # identical
pnpm check:foundation                               # OK
pnpm check:ai                                       # OK
node cli/uilab-admin.mjs check                      # OK — both gates visible
node tooling/template-cli/uilab-admin.mjs check     # OK — identical
# JSON keys: command, ok, status, stdout, stderr (no nested gates schema)
```

Fresh generated app:

```text
/Users/zhoujw/develop/tmp/phase2a-check2
```

```bash
# pre-install: packages/foundation had no node_modules/dist/.vitest-attachments/__screenshots__/.playwright-cli
pnpm install
pnpm typecheck          # OK
pnpm check:foundation   # derived OK
pnpm check:ai           # OK
pnpm uilab-admin check  # OK — prints [foundation] then [ai], exit 0
```

Negative derived fixture (forbidden Foundation import):

```text
/Users/zhoujw/develop/tmp/phase2a-check2-neg-20260801-213456
```

Injected into `packages/foundation/vite.config.ts`:

```ts
import '@uilab/agent-workbench'
```

| Command | Exit | Observation |
| --- | --- | --- |
| `pnpm check:foundation` | **1** | `forbidden @uilab/* dependency in vite.config.ts: @uilab/agent-workbench` |
| `pnpm uilab-admin check` | **1** | fail-fast: only `[uilab-admin check] foundation` ran; no AI gate; `uilab-admin check failed` |
| `check --json` | **1** | `{ command: "check", ok: false, status: 1, stdout, stderr }` |

Missing-gate path (app root without scripts): exit **4**, message `missing gate script(s): scripts/check-foundation.mjs, scripts/check-ai.mjs`.

routeTree SHA unchanged: `ae8902e654f8393e3499dbd3f912d4ddcb0f133cedd328c6bf112e681c9652b4`.

### Final Codex audit

Fresh app generated from the final repository state:

```text
/Users/zhoujw/develop/tmp/phase2a-codex-final
```

- Before install, copied Foundation contained no `node_modules`, `dist`, `.vitest-attachments`, `__screenshots__`, or `.playwright-cli`.
- `pnpm install`, typecheck, build, 20 files / 116 tests, both gates, and comprehensive `uilab-admin check` passed.
- Generated production CSS: **129,942 B** with `@source "../../node_modules/@uilab/foundation/src/ui"`.
- A controlled comparison using package-root `@source` produced **238,350 B**; the exact `src/ui` source scope is now enforced by `check:foundation`.
- Independent derived negative injection of `@uilab/agent-workbench` made both `pnpm check:foundation` and `pnpm uilab-admin check` exit 1; after fixture removal both returned to green.
- Playwright CLI on restarted local Vite exercised Dashboard, Appearance Drawer, sign-in Input, submit Button, and validation feedback: **0 console errors / 0 console warnings**.
- Local Vite remains available at `http://127.0.0.1:5173`; headed Chrome session `uilab-preview` remains open.

**Claim:** Phase 2A Foundation seam complete after the checks above (including Correction 1 hardening and Correction 2 comprehensive `check`). Full Phase 2 is **not** claimed complete.
