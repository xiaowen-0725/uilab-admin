# Phase 0 — CLI Smoke Baseline

> Frozen baseline of **published** `uilab-admin` CLI main paths before monorepo migration.
> Evidence only: no source/CLI fixes, no git commit/push, no temp cleanup.
>
> **Correction round 1 (2026-08-01):** prior work order used hyphenated ids (`phase0-orders` / `phase0-security`) that correctly fail-fast under `/^[a-z][a-z0-9]*$/`. Those remain as **expected negative ident checks**. Success path re-run with legal ids `phase0orders` / `phase0security`. Product/CLI/git history untouched.

| Field | Value |
| --- | --- |
| Date (UTC) | 2026-08-01T09:41:35Z |
| Correction round 1 (UTC) | 2026-08-01T09:46:08Z |
| Source repo | `/Users/zhoujw/develop/github/uilab-admin` |
| Git commit | `81731f8c4666c82a3442d60c5d9d642811270571` |
| Commit subject | `docs: define agent workbench template architecture` |
| CLI reported version | `uilab-admin v0.2.0` (from `node cli/uilab-admin.mjs help`) |
| package.json version | `0.0.1` |
| CLI entry | `pnpm uilab-admin` → `node cli/uilab-admin.mjs` |
| Temp parent | `/Users/zhoujw/develop/tmp/uilab-admin-phase0-cli-smoke-20260801` |
| Generated app | `/Users/zhoujw/develop/tmp/uilab-admin-phase0-cli-smoke-20260801/phase0-ops` |
| Operator mode | workhorse / mechanical; no scope expansion |

---

## 1. Environment

| Item | Value |
| --- | --- |
| OS | macOS (host) |
| Shell | zsh |
| `node --version` | `v24.6.0` |
| `pnpm --version` | `10.33.3` |
| Git HEAD | `81731f8c4666c82a3442d60c5d9d642811270571` |

Pre-existing untracked in source repo (not touched by this smoke):

- `.codex/`
- `skills-lock.json`

---

## 2. Temporary directory policy

| Step | Result |
| --- | --- |
| Pre-check path | `/Users/zhoujw/develop/tmp/uilab-admin-phase0-cli-smoke-20260801` |
| Exists before run? | **No** (`NOT_EXISTS`) |
| Action | `mkdir -p` created empty parent |
| Overwrite / delete? | Not performed (path was free) |
| Correction round 1 | Temp app **reused** (not deleted/overwritten); only CLI `add` mutated it |

---

## 3. CLI contract facts (from help / source read-only)

Global options include:

- `--dir <path>` — target app root / parent dir for `init` (default: cwd)
- `--scenario <id>` — scenario for `init`
- `--template <path>`, `--json`, `--dry-run`, `--force`, `--no-nav`, `--skip-seed`

Commands exercised:

| Command | Signature (observed) |
| --- | --- |
| `check` | `uilab-admin check` |
| `init` | `uilab-admin init <app-name> --scenario <id> --dir <parent>` |
| `apply-scenario` | `uilab-admin apply-scenario <scenario-id> --dir <app-root>` |
| `add data-table-list` | `uilab-admin add data-table-list --domain <id> [--title <text>] --dir <app-root>` |
| `add settings-section` | `uilab-admin add settings-section --section <id> [--title <text>] --dir <app-root>` |
| `set-shell` | `uilab-admin set-shell --theme … --sidebar … --layout … --direction … --dir <app-root>` |

Scenarios listed by help: `ops-console | saas-admin | agent-desktop`.

**Ident validation (read-only, `cli/uilab-admin.mjs`):**

- `add data-table-list --domain` must match `/^[a-z][a-z0-9]*$/` (no hyphens).
- `add settings-section --section` must match `/^[a-z][a-z0-9]*$/` (no hyphens).
- Example in help uses `orders` / `billing` (no hyphens).

---

## 4. Command matrix

Invocation convention: source-repo CLI via

```bash
cd /Users/zhoujw/develop/github/uilab-admin
pnpm uilab-admin <args>
```

| # | Command | Working dir | Exit | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `pnpm uilab-admin check` | source repo | **0** | **PASS** | `check:ai passed` + `uilab-admin check passed` |
| 2 | `pnpm uilab-admin init phase0-ops --scenario ops-console --dir …/uilab-admin-phase0-cli-smoke-20260801` | source repo | **0** | **PASS** | App at `…/phase0-ops`; shell from ops-console |
| 3 | `pnpm install --frozen-lockfile=false` | phase0-ops | **0** | **PASS** | 661 packages; lockfile up to date |
| 4 | `pnpm typecheck` | phase0-ops (post-init) | **0** | **PASS** | `tsc -b` |
| 5 | `pnpm build` | phase0-ops (post-init) | **0** | **PASS** | `tsc -b && vite build` → dist |
| 6 | `pnpm check:ai` | phase0-ops (post-init) | **0** | **PASS** | same gate text as source check:ai |
| 7 | `pnpm uilab-admin apply-scenario saas-admin --dir <phase0-ops>` | source repo | **0** | **PASS** | Rewrote scenario → saas-admin; seeded billing |
| 8 | `pnpm uilab-admin add data-table-list --domain phase0-orders --title Phase0订单 --dir <phase0-ops>` | source repo | **2** | **EXPECTED FAIL** | Hyphen id — fail-fast ident validation (not product blocker) |
| 9 | `pnpm uilab-admin add settings-section --section phase0-security --title Phase0安全 --dir <phase0-ops>` | source repo | **2** | **EXPECTED FAIL** | Hyphen id — fail-fast ident validation (not product blocker) |
| 10 | `pnpm uilab-admin set-shell --theme system --sidebar inset --layout compact --direction ltr --dir <phase0-ops>` | source repo | **0** | **PASS** | Wrote `adminPreferenceDefaults` |
| 11 | `pnpm typecheck` | phase0-ops (post-mutation) | **0** | **PASS** | After apply-scenario + set-shell (hyphen adds skipped) |
| 12 | `pnpm build` | phase0-ops (post-mutation) | **0** | **PASS** | Built successfully |
| 13 | `pnpm check:ai` | phase0-ops (post-mutation) | **0** | **PASS** | Passed |
| **14** | `pnpm uilab-admin add data-table-list --domain phase0orders --title Phase0订单 --dir <phase0-ops>` | source repo | **0** | **PASS** | Correction R1 — legal id success path |
| **15** | `pnpm uilab-admin add settings-section --section phase0security --title Phase0安全 --dir <phase0-ops>` | source repo | **0** | **PASS** | Correction R1 — legal id success path |
| **16** | `pnpm typecheck` | phase0-ops (post-legal-add) | **0** | **PASS** | Correction R1 re-gate |
| **17** | `pnpm build` | phase0-ops (post-legal-add) | **0** | **PASS** | Correction R1 re-gate (`✓ built in 544ms`) |
| **18** | `pnpm check:ai` | phase0-ops (post-legal-add) | **0** | **PASS** | Correction R1 re-gate |

### 4.1 Key command outputs (abbreviated)

#### Source `check` (exit 0)

```
check:ai passed
- required AI docs/skill/scaffolds present
- pattern catalog resolves
- skill frontmatter valid
- relative markdown links ok
- no @radix-ui/* package dependency
uilab-admin check passed
```

#### `init phase0-ops --scenario ops-console` (exit 0)

```
regenerated src/routeTree.gen.ts (generator from ../../../github/uilab-admin)
initialized phase0-ops
scenario: ops-console
dir: /Users/zhoujw/develop/tmp/uilab-admin-phase0-cli-smoke-20260801/phase0-ops
shell: {"theme":"system","sidebar":"sidebar","layout":"compact","direction":"ltr"}
```

#### Post-init `typecheck` / `build` / `check:ai`

| Step | Exit | Signal |
| --- | --- | --- |
| typecheck | 0 | `tsc -b` clean |
| build | 0 | `✓ built in 367ms` |
| check:ai | 0 | `check:ai passed` |

#### `apply-scenario saas-admin` (exit 0)

```
regenerated src/routeTree.gen.ts (generator from .)
applied scenario: saas-admin
shell: {"theme":"system","sidebar":"inset","layout":"default","direction":"ltr"}
- set-shell
- seed settings-section: src/features/settings/billing/index.tsx, src/features/settings/billing/billing-form.tsx, src/routes/_authenticated/settings/billing.tsx, src/features/settings/index.tsx
- app-brief: APP_BRIEF.md
- scenario-marker: .uilab-admin-scenario.json
- route-tree: src/routeTree.gen.ts
```

#### `add data-table-list --domain phase0-orders` (exit 2) — **EXPECTED FAIL** (negative ident check)

```
add data-table-list requires --domain <lower-ident>, e.g. orders
ELIFECYCLE  Command failed with exit code 2
```

Reconfirm via direct node (same exit 2):

```bash
node cli/uilab-admin.mjs add data-table-list --domain phase0-orders --title 'Phase0订单' --dir <phase0-ops>
# → same error
```

**Observed (not a product blocker):** CLI enforces `/^[a-z][a-z0-9]*$/` on `--domain`.
`phase0-orders` contains `-` → rejected fail-fast. No feature/route files created. Matches contract.

#### `add settings-section --section phase0-security` (exit 2) — **EXPECTED FAIL** (negative ident check)

```
add settings-section requires --section <ident>, e.g. billing
ELIFECYCLE  Command failed with exit code 2
```

**Observed (not a product blocker):** CLI enforces `/^[a-z][a-z0-9]*$/` on `--section`.
`phase0-security` contains `-` → rejected fail-fast. No settings section files created. Matches contract.

#### `set-shell … --layout compact` (exit 0)

```
shell defaults updated:
{
  "theme": "system",
  "sidebar": "inset",
  "layout": "compact",
  "direction": "ltr"
}
note: providers consume adminPreferenceDefaults; clear cookies to see project defaults.
```

#### Post-mutation gates (after apply-scenario + set-shell; hyphen adds not applied)

| Step | Exit |
| --- | --- |
| typecheck | 0 |
| build | 0 (`✓ built in 395ms`) |
| check:ai | 0 |

#### Correction R1: `add data-table-list --domain phase0orders` (exit 0) — **PASS**

```
regenerated src/routeTree.gen.ts (generator from .)
added data-table-list
- src/features/phase0orders/index.tsx
- src/features/phase0orders/components/phase0orders-primary-buttons.tsx
- src/features/phase0orders/components/phase0orders-columns.tsx
- src/features/phase0orders/components/phase0orders-table.tsx
- src/features/phase0orders/data/schema.ts
- src/features/phase0orders/data/data.ts
- src/routes/_authenticated/phase0orders/index.tsx
- src/components/layout/data/sidebar-data.ts
- src/routeTree.gen.ts

Next:
- Review generated feature/route files
- Replace mock data / form fields as needed
- pnpm typecheck
- pnpm uilab-admin check
```

#### Correction R1: `add settings-section --section phase0security` (exit 0) — **PASS**

```
regenerated src/routeTree.gen.ts (generator from .)
added settings-section
- src/features/settings/phase0security/index.tsx
- src/features/settings/phase0security/phase0security-form.tsx
- src/routes/_authenticated/settings/phase0security.tsx
- src/features/settings/index.tsx
- src/routeTree.gen.ts

Next:
- Review generated feature/route files
- Replace mock data / form fields as needed
- pnpm typecheck
- pnpm uilab-admin check
```

#### Correction R1 post-legal-add gates

| Step | Exit | Signal |
| --- | --- | --- |
| typecheck | 0 | `tsc -b` clean |
| build | 0 | `✓ built in 544ms` (includes `phase0orders-*.js`, `phase0security-*.js` chunks) |
| check:ai | 0 | `check:ai passed` |

---

## 5. Generated / changed artifacts

### 5.1 After `init` (ops-console)

Key markers:

| Path | Observation |
| --- | --- |
| `APP_BRIEF.md` | scenario id `ops-console`; shell theme=system, sidebar=sidebar, layout=compact, direction=ltr; profileHint=`ops-dense` |
| package name | `phase0-ops` (APP_BRIEF + package.json) |
| `src/config/admin-preferences.ts` | `sidebar: 'sidebar'`, `layout: 'compact'` |
| Nav seeds (ops-console) | sidebar includes 任务列表 `/tasks`, 工单列表 `/tickets` |
| Routes present | `_authenticated/tasks`, `_authenticated/tickets`, `_authenticated/workspace`, settings suite, auth, errors |

`init` reported shell:

```json
{"theme":"system","sidebar":"sidebar","layout":"compact","direction":"ltr"}
```

### 5.2 After `apply-scenario saas-admin`

| Path | Change |
| --- | --- |
| `APP_BRIEF.md` | scenario → `saas-admin`; one-liner SaaS; shell sidebar=`inset`, layout=`default`; profileHint=`console-default`; modules recommended/optional updated |
| `.uilab-admin-scenario.json` | **created** (see §5.4) |
| `src/features/settings/billing/index.tsx` | **created** (seed) |
| `src/features/settings/billing/billing-form.tsx` | **created** (seed) |
| `src/routes/_authenticated/settings/billing.tsx` | **created** (seed) |
| `src/features/settings/index.tsx` | nav entry `/settings/billing` registered |
| `src/routeTree.gen.ts` | regenerated |
| Shell via apply-scenario | set to saas-admin defaults (inset/default) before later set-shell |

**Features/routes delta vs post-init baseline:**

- **Added features:**
  - `src/features/settings/billing/billing-form.tsx`
  - `src/features/settings/billing/index.tsx`
- **Added routes:**
  - `src/routes/_authenticated/settings/billing.tsx`
- **Removed:** none observed

**Sidebar (`sidebar-data.ts`):** no diff vs post-init baseline for this apply (ops tickets/tasks entries remained; billing is settings-nav, not sidebar).

### 5.3 After failed hyphen-id `add` commands (negative evidence)

| Expected by original work-order sample ids | Actual |
| --- | --- |
| `src/features/phase0-orders/**` | **missing** (correct — id illegal) |
| `src/routes/_authenticated/phase0-orders/**` | **missing** |
| sidebar entry for hyphen id | **missing** |
| `src/features/settings/phase0-security/**` | **missing** |
| `src/routes/_authenticated/settings/phase0-security.tsx` | **missing** |
| settings nav for hyphen id | **missing** |

These are **expected negative ident validation** results, not product blockers.

### 5.3b After legal-id `add` (Correction R1) — success artifacts

#### data-table-list (`phase0orders`)

| Path | Status |
| --- | --- |
| `src/features/phase0orders/index.tsx` | **created** |
| `src/features/phase0orders/components/phase0orders-primary-buttons.tsx` | **created** |
| `src/features/phase0orders/components/phase0orders-columns.tsx` | **created** |
| `src/features/phase0orders/components/phase0orders-table.tsx` | **created** |
| `src/features/phase0orders/data/schema.ts` | **created** |
| `src/features/phase0orders/data/data.ts` | **created** |
| `src/routes/_authenticated/phase0orders/index.tsx` | **created** (thin route) |
| `src/components/layout/data/sidebar-data.ts` | **modified** — nav `Phase0订单` → `/phase0orders` |
| `src/routeTree.gen.ts` | **regenerated** — includes `/phase0orders/` |

Thin route content (verified):

```ts
import { createFileRoute } from '@tanstack/react-router'
import { Phase0orders } from '@/features/phase0orders'

export const Route = createFileRoute('/_authenticated/phase0orders/')({
  component: Phase0orders,
})
```

Sidebar registration (verified):

```
title: 'Phase0订单',
url: '/phase0orders',
```

#### settings-section (`phase0security`)

| Path | Status |
| --- | --- |
| `src/features/settings/phase0security/index.tsx` | **created** |
| `src/features/settings/phase0security/phase0security-form.tsx` | **created** |
| `src/routes/_authenticated/settings/phase0security.tsx` | **created** (thin route) |
| `src/features/settings/index.tsx` | **modified** — nav `Phase0安全` → `/settings/phase0security` |
| `src/routeTree.gen.ts` | **regenerated** — includes `/settings/phase0security` |

Thin route content (verified):

```ts
import { createFileRoute } from '@tanstack/react-router'
import { SettingsPhase0security } from '@/features/settings/phase0security'

export const Route = createFileRoute('/_authenticated/settings/phase0security')({
  component: SettingsPhase0security,
})
```

Settings nav registration (verified):

```
title: 'Phase0安全',
href: '/settings/phase0security',
```

#### `routeTree.gen.ts` (both routes present)

Verified symbols/paths:

- import `./routes/_authenticated/phase0orders/index`
- import `./routes/_authenticated/settings/phase0security`
- `fullPath: '/phase0orders/'`
- `fullPath: '/settings/phase0security'`
- FileRouteTypes include `'/phase0orders/'` and `'/settings/phase0security'`

### 5.4 After `set-shell`

`src/config/admin-preferences.ts` final defaults:

```ts
export const adminPreferenceDefaults: AdminPreferences = {
  theme: 'system',
  sidebar: 'inset',
  layout: 'compact',
  direction: 'ltr',
}
```

Note: `APP_BRIEF.md` and `.uilab-admin-scenario.json` still reflected **saas-admin apply** shell (`layout: default`) and were **not** rewritten by `set-shell`. Only `admin-preferences.ts` matched the set-shell payload (layout compact).

### 5.5 Scenario marker file

Path: `phase0-ops/.uilab-admin-scenario.json`

```json
{
  "scenarioId": "saas-admin",
  "appliedAt": "2026-08-01T09:40:52.043Z",
  "shell": {
    "theme": "system",
    "sidebar": "inset",
    "layout": "default",
    "direction": "ltr"
  },
  "desktopHostReady": false,
  "cliVersion": "0.2.0"
}
```

### 5.6 APP_BRIEF final (scenario section)

- id: `saas-admin`
- title: SaaS 管理端
- shell in brief: theme system, sidebar inset, layout **default**, direction ltr
- package name: `phase0-ops`

---

## 6. Compatibility / behavioral facts

1. **Global `--dir` works** for `init` (parent), `apply-scenario`, `add` (flag accepted; illegal id fails before write; legal id writes under target), and `set-shell`.
2. **`init --scenario ops-console`** materializes app + APP_BRIEF + shell defaults + scenario module seeds (tasks/tickets/workspace observed).
3. **`apply-scenario` is overwrite-style for scenario identity**: ops-console → saas-admin updates APP_BRIEF, shell via internal set-shell, scenario marker, and optional module seed (billing).
4. **`apply-scenario` seeds** use valid ids (`billing`) that pass `/^[a-z][a-z0-9]*$/`.
5. **`add` domain/section ids do not allow hyphens** (`/^[a-z][a-z0-9]*$/`). Illegal ids exit 2 fail-fast with no partial write — **contract-correct negative path**. Legal ids (e.g. `phase0orders` / `phase0security`) complete the full scaffold trio (feature + thin route + nav) and regenerate `routeTree.gen.ts`.
6. **`set-shell` flags** match help: `--theme`, `--sidebar`, `--layout`, `--direction`; values used (`system` / `inset` / `compact` / `ltr`) accepted. Layout enum in config type: `'default' | 'compact' | 'full'`.
7. **`set-shell` does not refresh** `APP_BRIEF.md` or `.uilab-admin-scenario.json` shell fields.
8. **Post-init, post-mutation, and post-legal-add quality gates** (`typecheck`, `build`, `check:ai`) all exit 0.
9. **`pnpm install` warning**: ignored build scripts for esbuild (`pnpm approve-builds`); did not block install/build.
10. **CLI help via `pnpm uilab-admin --help`**: treated as unknown command `--help` (exit 2), but still prints usage; prefer `-h` / bare help pattern or subcommand without `--help` as first token. Per-command `init --help` still prints full usage (exit 0).
11. **Version skew observation**: CLI banner `v0.2.0` vs root `package.json` `"version": "0.0.1"`.

---

## 7. Failures / non-blockers

| Case | Exit | Classification |
| --- | --- | --- |
| `add data-table-list --domain phase0-orders` | 2 | **Expected negative ident check** — fail-fast matches `/^[a-z][a-z0-9]*$/`; **not** a product blocker for main path |
| `add settings-section --section phase0-security` | 2 | **Expected negative ident check** — same class; **not** a product blocker |

**No remaining full-matrix blocker for legal `add` ids.** Main success path (`phase0orders` / `phase0security`) exit 0 with artifacts + re-gates green.

**Not failures:** source `check`, `init`, install, all gate triples, `apply-scenario`, `set-shell`, legal-id `add`s.

### Remaining observations (out of correction scope; not fixed)

1. CLI banner version `v0.2.0` vs package.json `0.0.1` skew.
2. `pnpm uilab-admin --help` treated as unknown command (exit 2) while still printing usage.
3. `set-shell` does not sync shell fields into `APP_BRIEF.md` or `.uilab-admin-scenario.json`.

---

## 8. Reproduction commands

```bash
# 0) env
node --version
pnpm --version
cd /Users/zhoujw/develop/github/uilab-admin
git rev-parse HEAD

# 1) temp parent (must not already exist per original policy)
test ! -e /Users/zhoujw/develop/tmp/uilab-admin-phase0-cli-smoke-20260801
mkdir -p /Users/zhoujw/develop/tmp/uilab-admin-phase0-cli-smoke-20260801

# 2) source check
pnpm uilab-admin check

# 3) init
pnpm uilab-admin init phase0-ops \
  --scenario ops-console \
  --dir /Users/zhoujw/develop/tmp/uilab-admin-phase0-cli-smoke-20260801

# 4) generated app gates
APP=/Users/zhoujw/develop/tmp/uilab-admin-phase0-cli-smoke-20260801/phase0-ops
cd "$APP"
pnpm install --frozen-lockfile=false
pnpm typecheck
pnpm build
pnpm check:ai

# 5) incremental via source CLI
cd /Users/zhoujw/develop/github/uilab-admin
pnpm uilab-admin apply-scenario saas-admin --dir "$APP"

# Negative ident checks (expected exit 2):
pnpm uilab-admin add data-table-list --domain phase0-orders --title 'Phase0订单' --dir "$APP"
pnpm uilab-admin add settings-section --section phase0-security --title 'Phase0安全' --dir "$APP"

# Legal success path (Correction R1; expected exit 0):
pnpm uilab-admin add data-table-list --domain phase0orders --title 'Phase0订单' --dir "$APP"
pnpm uilab-admin add settings-section --section phase0security --title 'Phase0安全' --dir "$APP"

pnpm uilab-admin set-shell --theme system --sidebar inset --layout compact --direction ltr --dir "$APP"

# 6) re-gates
cd "$APP"
pnpm typecheck
pnpm build
pnpm check:ai
```

**Ident rule for future baselines:** valid `add` ids must be hyphen-free lowercase alphanumerics matching `/^[a-z][a-z0-9]*$/` (e.g. `phase0orders` / `phase0security`).

---

## 9. Repo mutation from this smoke

| Path | Action |
| --- | --- |
| `docs/evidence/phase-0-cli-smoke.md` | **created** then **updated** (Correction R1 evidence only) |
| Source app code / CLI / package / skills / AGENTS.md | **not modified** |
| Temp app under `/Users/zhoujw/develop/tmp/...` | created; mutated by CLI `add`; **not deleted** |
| git commit / push | **not performed** |

Acceptance check expected:

```bash
cd /Users/zhoujw/develop/github/uilab-admin
git status --short
# should show only:
#   ?? docs/evidence/   (or this file)
# plus pre-existing ?? .codex/ and ?? skills-lock.json
```

---

## 10. Summary

| Area | Result |
| --- | --- |
| Source `check` | PASS (0) |
| `init` ops-console → phase0-ops | PASS (0) |
| Generated app install + typecheck + build + check:ai | PASS (0) |
| `apply-scenario` saas-admin | PASS (0) |
| `add` with hyphen ids (`phase0-orders` / `phase0-security`) | **EXPECTED FAIL (2)** — contract fail-fast; not product blocker |
| `add` with legal ids (`phase0orders` / `phase0security`) | **PASS (0)** — Correction R1 |
| Feature + thin route + nav trio (both adds) | **verified present** |
| `routeTree.gen.ts` includes both new routes | **verified** |
| `set-shell` system/inset/compact/ltr | PASS (0) |
| Re-gates after legal adds | PASS (0) typecheck / build / check:ai |
| Main CLI success matrix green? | **Yes** — legal-id `add` path complete; illegal-id fail-fast also contract-correct |

**Conclusion (Correction R1):** Main path succeeds. Illegal id fail-fast matches the published ident contract and is **not** a product blocker. No remaining full-matrix blocker for the legal success path.

**Out-of-scope remaining observations:** version skew (`v0.2.0` vs `0.0.1`), `--help` as unknown command, `set-shell` marker/brief desync.

End of evidence.
