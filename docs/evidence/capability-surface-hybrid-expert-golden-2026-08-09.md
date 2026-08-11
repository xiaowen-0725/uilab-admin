# Evidence: Hybrid channel + Expert file catalog + Golden probes

> 历史证据：飞书的旧专用工具面已被通用 `execute_command` + 官方 `lark-*` Skills 取代。当前合同以 Spec 2026-08-09g 为准。

**Date:** 2026-08-09
**Branch:** `research/capability-surface-reference-models` (working tree)
**Spec revision:** workbench-capability-surface-spec **2026-08-09c**

## What landed

### 1. Hybrid channel honesty (single product Connector)

- `ConnectorDescriptor.primaryChannel`: `'domain_cli' | 'mcp' | 'hybrid' | 'none'`
- `channelAuth[]` honesty rows (CLI session vs host OAuth / MCP)
- Feishu remains **one** id `connector.feishu`; MCP capability reserved with `available: false`
- Snapshot + Fake adapter project the same fields
- Spec / CONTEXT / Acceptance updated

### 2. Expert file catalog

- `tooling/workbench-runtime-voltagent/experts/*.json`
  - `office-meeting.json` (`expert.office-meeting` + instruction)
  - `xhs-cover.json` (`expert.xhs-cover` + instruction)
- Loader: `src/capability/expert-catalog.ts` (+ tests)
- HTTP: `loadExpertsForHttp()` at mount; snapshot includes `instruction`
- Honest: **not** Plugin packaging; migration target `contributes.experts`

### 3. Golden path probes (real sidecar, not Fake)

| Item | Result |
| --- | --- |
| Sidecar | `http://127.0.0.1:3142` (fresh process with new code; port 3141 was EADDRINUSE old process) |
| Profile | `office` |
| Plugin | `cli.feishu` Connected；当前形态为 `commandScopes=['lark-cli']`，无飞书 wrapper tools |
| Model | `deepseek-v4-flash` (from sidecar log) |
| `lark-cli --version` | **1.0.67** (pin guidance still 1.0.85; session connected) |
| `lark-cli auth status` | user identity available (`needs_refresh` → auto-refresh message); doctor `cli.feishu/cli:feishu=connected` |
| Script (no stream) | `SKIP_STREAM=1 CAPABILITY_BASE_URL=http://127.0.0.1:3142 …` → 12/12 |
| Script (G.5 live) | `REQUIRE_FEISHU_TOOL=1 FEISHU_DOC_ID='https://akeparking.feishu.cn/wiki/X0rHwDPlgiNBnRkvKl9cf1wSnQh' CAPABILITY_BASE_URL=http://127.0.0.1:3142 node …golden-path.mjs` |
| Probes | **12/12 PASS including G.5** — `stream observed feishu CLI tool activity (chunks≈2)` |

Snapshot sample (3142):

- `primaryChannel: domain_cli`
- `channelAuth`: CLI session + MCP 后置 rows
- `experts`: office-meeting / xhs-cover with `instruction: true`
- `honesty.authBoundary: provider_declared`（替代早期 Provider-specific 字段）

## Automated tests

```text
sidecar node:test — 23 pass (expert-catalog, snapshot, connector-descriptor, effective-capabilities)
workbench vitest capabilities — 2 files / 3 tests pass
```

## Not claimed / remaining

| Item | Status |
| --- | --- |
| G.5 Timeline **live model tool call** | **PASS** on :3142 with wiki URL (see above) |
| Manual UI Composer「+」walkthrough screenshots | Not re-run (HTTP/script path covers G.*; UI still recommended once) |
| Kill/replace stale process on :3141 | Left alone (old process); verification used :3142 |
| Expert `instruction` injected into Agent system prompt at stream time | Catalog ready; create-agent turn wiring may still be follow-up |

## Commands to reproduce

```bash
# unit
cd tooling/workbench-runtime-voltagent
node --import tsx --test \
  src/capability/expert-catalog.test.ts \
  src/capability/snapshot.test.ts \
  src/plugin/connector-descriptor.test.ts \
  src/plugin/effective-capabilities.test.ts

# sidecar (fresh port if 3141 busy)
AGENT_PROFILE=office PLUGINS_ENABLED=cli.feishu PORT=3142 \
  pnpm exec tsx --env-file=.env src/server.ts

# golden probes (no stream)
CAPABILITY_BASE_URL=http://127.0.0.1:3142 SKIP_STREAM=1 \
  node scripts/capability-surface-golden-path.mjs

# optional live tool (needs doc id + real model)
CAPABILITY_BASE_URL=http://127.0.0.1:3142 REQUIRE_FEISHU_TOOL=1 \
  FEISHU_DOC_ID='<url-or-token>' \
  node scripts/capability-surface-golden-path.mjs
```

## Secrets

No tokens logged. Auth status JSON from operator machine not pasted beyond non-secret fields.
