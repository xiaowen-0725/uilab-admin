# Phase 1 Template Platform migration evidence

## Scope

Phase 1 moves the Admin application and Admin-owned assets into a monorepo Template Platform layout without changing Admin runtime behavior.

| Batch | Commit | Scope |
|---|---|---|
| 1A | `9a7b582` | Workspace root + move Admin app into `archetypes/admin` |
| 1B | `e22a8f4` | Canonical tooling under `tooling/*` + root compatibility wrappers |
| 1C | *(this commit)* | Move `docs/ai` + `scaffolds` under `archetypes/admin`; three-root CLI/gate contracts; skill/docs alignment |

## Expected verification (Batch 1C)

Run from repository root:

```bash
node --check tooling/template-cli/uilab-admin.mjs
node --check tooling/quality-gates/check-ai.mjs
node --check cli/uilab-admin.mjs
node --check scripts/check-ai.mjs

pnpm typecheck
pnpm build
pnpm test
pnpm check:ai

pnpm --filter @uilab/admin typecheck
pnpm --filter @uilab/admin build
pnpm --filter @uilab/admin test
pnpm --filter @uilab/admin check:ai
```

Wrapper / canonical parity:

```bash
node cli/uilab-admin.mjs --help
node tooling/template-cli/uilab-admin.mjs --help
node scripts/check-ai.mjs
node tooling/quality-gates/check-ai.mjs
node cli/uilab-admin.mjs check
node tooling/template-cli/uilab-admin.mjs check
```

routeTree SHA (must remain exactly):

```bash
shasum -a 256 archetypes/admin/src/routeTree.gen.ts
# ae8902e654f8393e3499dbd3f912d4ddcb0f133cedd328c6bf112e681c9652b4
```

## Canonical vs wrapper contract

| Entry | Role |
|---|---|
| `tooling/template-cli/uilab-admin.mjs` | Canonical CLI |
| `cli/uilab-admin.mjs` | Root compatibility wrapper (import canonical) |
| `tooling/quality-gates/check-ai.mjs` | Canonical AI gate |
| `scripts/check-ai.mjs` | Root compatibility wrapper (import canonical) |
| `skill/uilab-admin/` | Externally discovered skill front door (stays at root) |

### Three roots (CLI)

| Root | Platform value | Derived value |
|---|---|---|
| Admin app source (`adminTemplateRoot` / `appRoot`) | `archetypes/admin` | app root |
| Admin assets (`adminAssetsRoot`) | `archetypes/admin` | app root |
| Support (`supportRoot`) | repository root | app root |

`resolveCommandRoots` (check/add/apply-scenario/set-shell) resolves Admin app + Admin assets only.  
`resolveInitSources` also returns `supportRoot`.

**Copy ownership:**

| Artifact | Source root | Notes |
|---|---|---|
| Admin app body (`src`, package, etc.) | `adminSourceRoot` | filtered copy |
| **AGENTS.md / README.md** | **`adminSourceRoot`** | Archetype-owned app contracts; arrive via body copy; preflight-required; **not** re-copied from support |
| `docs/ai` + `scaffolds` | `adminAssetsRoot` | Admin-owned assets |
| skill + configs (CHANGELOG, LICENSE, eslint, …) | `supportRoot` | platform support; skill links rewritten to local `docs/ai` |
| CLI + gate | canonical tooling paths | platform: `tooling/template-cli` + `tooling/quality-gates` only (no root-wrapper fallback); derived self-init: local `cli/` + `scripts/` |

Generated apps are self-contained at their root. Platform-root AGENTS/README remain Template Platform contracts and must not appear as the generated app's contracts.

### Four fields (quality gate)

| Field | Platform | Derived |
|---|---|---|
| `platformRoot` | repo root | app root |
| `adminRoot` | `archetypes/admin` | app root |
| `assetsRoot` | `archetypes/admin` | app root |
| `supportRoot` | repo root | app root |

## Full derived-app smoke expectations

```bash
pnpm uilab-admin init smoke-ops --scenario ops-console --dir /tmp --dry-run
# dry-run prints admin source, admin assets, support roots

pnpm uilab-admin init smoke-ops --scenario ops-console --dir /tmp
cd /tmp/smoke-ops
pnpm install
pnpm typecheck && pnpm build && pnpm check:ai
pnpm uilab-admin check
# generated AGENTS.md / README.md are Admin-local (no archetypes/admin, @uilab/admin, PROJECT_STATUS.md, docs/plans)
# generated skill Markdown has local docs/ai links only (no archetypes/admin/docs/ai)
# no partial target on invalid template (exit 4) or invalid id (exit 2)
```

Invalid template must exit `4` with no partial target. Explicit platform `--template` missing canonical `tooling/template-cli/uilab-admin.mjs` or `tooling/quality-gates/check-ai.mjs` also exits `4` with no target. Invalid identifiers must exit `2` with no partial feature files.

## Unchanged routeTree

SHA-256 of `archetypes/admin/src/routeTree.gen.ts`:

`ae8902e654f8393e3499dbd3f912d4ddcb0f133cedd328c6bf112e681c9652b4`

Phase 1 must not rewrite generated route paths solely because of filesystem moves.

## Playwright Batch 1A visual evidence

Environment: headed Chrome via Playwright CLI, viewport `1440 × 1000`, 7 flows, Browser suite 17 files / 103 tests green, 0 console errors / 0 console warnings after checked flows.

That 17/103 count is the Batch 1A capture-time baseline. Final Phase 1 verification is 18 files / 108 tests after adding five focused tests for scenario-aware sidebar defaults. A fresh `ops-console` derived app also passes all 18/108 tests with `sidebar: sidebar`, `layout: compact`, and the sidebar closed by project default.

Screenshots under `output/playwright/phase1-batch1a/`:

| Flow | File | Notes |
|---|---|---|
| Dashboard | [dashboard-1440.png](../../output/playwright/phase1-batch1a/dashboard-1440.png) | Differs from Phase 0 only in Faker chart values |
| Command search | [search-dialog.png](../../output/playwright/phase1-batch1a/search-dialog.png) | Differs from Phase 0 only in Faker chart values (background) |
| Appearance drawer | [appearance-drawer.png](../../output/playwright/phase1-batch1a/appearance-drawer.png) | Differs from Phase 0 only in Faker chart values (background) |
| User menu | [user-menu.png](../../output/playwright/phase1-batch1a/user-menu.png) | Differs from Phase 0 only in Faker chart values (background) |
| Tasks text filter | [tasks-text-filter.png](../../output/playwright/phase1-batch1a/tasks-text-filter.png) | Exact visual hash match vs Phase 0 |
| Tasks faceted filter | [tasks-faceted-filter.png](../../output/playwright/phase1-batch1a/tasks-faceted-filter.png) | Exact visual hash match vs Phase 0 |
| Legacy workspace | [workspace-legacy.png](../../output/playwright/phase1-batch1a/workspace-legacy.png) | Exact visual hash match vs Phase 0 |

### SHA-256 (Batch 1A captures)

| File | SHA-256 |
|---|---|
| `tasks-text-filter.png` | `08d6bbbb2b8e17a69bfa32f65a5ef1572a7e186f19516e19d7ca8e47b3fc6d97` |
| `tasks-faceted-filter.png` | `a4c3eec30947337beff6d6ec988ef4b7931a183e680eb4f24d6d152f0f30f124` |
| `workspace-legacy.png` | `e1077693b32f87ff75ba0bb6f5a2162c3e069d7a17c2753bce14a12ddc3b7c10` |
| `dashboard-1440.png` | `5f991053a3244bcea563823b04df6f864cf5977287fe6a937de292db54884671` |
| `search-dialog.png` | `d10d5c64accd3a3c751b001e30a99c1b3d09afc188f641e44b6c85e3a53cb0c7` |
| `appearance-drawer.png` | `4a03967c399cedae081c39994841d230c77757866b855b219a94e899e645f21c` |
| `user-menu.png` | `193ed22f0a3d7a74d1e5f6d46f9679315e6b6367b63c5391b41395dd79a91cbd` |

Exact-match confirmation vs Phase 0 baseline (`output/playwright/phase0-baseline/`):

- `tasks-text-filter.png` — identical SHA  
- `tasks-faceted-filter.png` — identical SHA  
- `workspace-legacy.png` — identical SHA  

## Pre-existing debt (not Phase 1 acceptance)

The following are **explicitly separated** from Phase 1 migration acceptance:

- **eslint / lint** debt already present in the Admin package or shared configs  
- **knip** unused-export / dependency findings already present under monorepo knip policy  

Phase 1 acceptance is: typecheck, build, current Browser 18/108, check:ai, CLI/gate wrapper parity, routeTree SHA, Admin asset relocation, scenario-aware shell defaults, and derived-app self-containment. Do not fail the batch solely for pre-existing lint/knip noise.

## Related evidence

- [Phase 0 quality gates](./phase-0-quality-gates.md)  
- [Phase 0 Playwright baseline](./phase-0-playwright-baseline.md)  
- [Phase 1 work order](../plans/phase-1-monorepo-migration-work-order.md)  
- [Agent Workbench roadmap](../plans/agent-workbench-template-roadmap.md)  
