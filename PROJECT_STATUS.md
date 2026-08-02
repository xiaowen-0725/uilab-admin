# uilab-admin 项目状态快照

> 更新时间：2026-08-01
> 分支：`main`
> 架构基线提交：`81731f8`
> Phase 1 批次：Batch 1A `9a7b582` · Batch 1B `e22a8f4` · Batch 1C `c84be8d`
> Phase 2A：`9d55b3c` minimal Foundation seam（`packages/foundation` Button/Input/tokens + materialization + boundary gate）
> Phase 3：Agent Workbench Shell skeleton（证据已落盘）
> Phase 3A：Workbench inset layout polish（布局/动效；Playwright 证据已落盘）
> Phase 3B：Codex pane chrome + pointer motion（**Done**；Playwright/动效证据已落盘）
> 远程：https://github.com/xiaowen-0725/uilab-admin.git
> 用途：后续优化/追溯用状态真源；平台合同见根 `AGENTS.md`，Admin / 派生应用硬规则见 `archetypes/admin/AGENTS.md` 与 `archetypes/admin/docs/ai/*`。

## 1. 一句话定位

仓库已演进为中立 **Template Platform**：可运行 Archetype 为 Admin Console（`archetypes/admin`）与 Agent Workbench Phase 3 静态 Shell（`archetypes/agent-workbench`）。技术栈：Vite + React 19 + TS + Tailwind 4 + 官方 shadcn **Base UI** + TanStack。

## 2. 当前阶段判断

| 维度 | 状态 | 说明 |
|---|---|---|
| 可运行模板壳 | **Done** | dashboard / tasks / settings / auth / errors / workspace |
| Base UI 迁移 | **Done** | `base-nova`，无 `@radix-ui/*` 依赖 |
| 中文主路径 | **Done** | 主要页面中文 |
| AI 合同 / skill | **Done** | 平台根 `AGENTS.md` + Admin-local `archetypes/admin/AGENTS.md` + Admin `docs/ai/*` + `$uilab-admin` |
| CLI-1 extend | **Done** | `check` / `add` / `set-shell` |
| CLI-2 bootstrap | **Done** | `init` / `apply-scenario` |
| scenario packs | **Done（薄）** | ops / saas / agent-desktop |
| agent-desktop 工作区 | **MVP Done** | Workspace 首页 + threads 列表 + L2 desktop 边界 |
| Agent Workbench 架构 | **Phase 0 Done** | 领域语言、ADR、目录蓝图、路线图与 Admin baseline 已落盘 |
| Template Platform Monorepo | **Phase 1 Done（through 1C）** | Admin 源、tooling、Admin assets 与合同已对齐 |
| Minimal Foundation seam | **Phase 2A Done** | `@uilab/foundation` Button/Input/tokens；Admin + Workbench 均经 `@/components/ui/*` 兼容 re-export；`check:foundation`；init copy-and-own |
| Agent Workbench Shell | **Phase 3 Done** | 静态 Shell / task-scoped layout / placeholder Host；`check:workbench`；Playwright 证据；**无** Runtime / 具体 Surface |
| Workbench inset layout polish | **Phase 3A Done** | sidebar 平面 + 272px Navigator + 8px inset Workspace + 合并顶栏 + pointer/keyboard 分源动效；Playwright/动效证据；**无** Runtime / Surface / Phase 4 |
| Workbench pane chrome + motion | **Phase 3B Done** | Task/Work 44px peer toolbars；右锚定 Work drawer vs keyboard instant；Codex 语义图标；Context 140ms entry；Playwright/动效证据；**无** Runtime / Surface / Phase 4 |
| Full Phase 2 Foundation | **Not complete** | 第二消费者已有；仍缺更广 primitives/providers 与共享 theme Provider |
| Electron/Tauri host | **Not started** | 仅 L1+L2 host-ready |
| Browser test suite | **Green** | Foundation 2/8；Admin 18/108；Workbench 2/21；共 137 tests |
| 模板“产品打磨/去 demo 化” | **Planned** | 在 Monorepo 稳定后继续 |
| npm 全局发布 CLI | **Not started** | 当前 repo-local |

**结论：**
Phase 1、**Phase 2A Foundation seam**、**Phase 3 Workbench Shell 骨架** 已完成并有独立验收证据。**Phase 3A** 与 **Phase 3B** 为 Workbench 布局/动效 polish（非 Phase 4），均已通过 Playwright 与动效验收。完整 Phase 2 仍未完成（primitives/providers 范围）。Runtime / Surface / CLI Workbench 生成均未开始；Phase 4 明确暂停。`agent-desktop` 仅作 Admin 兼容基线。

## 3. 已锁定决策（勿回退）

1. 独立仓库，不进 UI Lab monorepo
2. 学 shadcn-admin 的壳/页面模式，不整包搬 Radix
3. 官方 shadcn Base UI（`render`，禁止 `asChild` / Radix 回潮）
4. 中文 UI + 英文标识
5. Admin 内部布局差异走 preferences / scenario；跨 Archetype 使用平级、独立的 Shell
6. Skill 负责判断编排，CLI 负责确定性落盘
7. 创建方式：`uilab-admin init` 为主，兼容 `apply-scenario`
8. 当前 agent-desktop：L1 + L2 兼容基线；长期 Agent Workbench 保持 Web Renderer + 可选 Desktop Host Adapter
9. CLI 命令名：`uilab-admin`
10. Agent Workbench 是独立 Archetype，不是 Admin scenario；Derived Application 使用 copy-and-own

架构真源：`CONTEXT.md`、`docs/adr/*`、`docs/architecture/agent-workbench-module-layout.md` 与 `docs/plans/agent-workbench-template-roadmap.md`。

## 4. 仓库结构（当前）

```text
uilab-templates/
  AGENTS.md / README.md / PROJECT_STATUS.md / CHANGELOG.md   # 平台合同
  pnpm-workspace.yaml
  package.json                 # 根编排（Admin + Workbench + Foundation）
  cli/uilab-admin.mjs          # 兼容 wrapper → tooling/template-cli
  scripts/check-ai.mjs         # 兼容 wrapper → tooling/quality-gates
  scripts/check-foundation.mjs
  scripts/check-workbench.mjs
  skill/uilab-admin/           # 外部可发现 skill 前门
  tooling/
    template-cli/uilab-admin.mjs
    quality-gates/check-ai.mjs
    quality-gates/check-foundation-boundaries.mjs
    quality-gates/check-workbench-boundaries.mjs
  archetypes/admin/            # Admin 源应用 + Admin-owned 资产与应用合同
    AGENTS.md / README.md      # Admin / 派生应用硬合同（init 原样带入）
    src/
    docs/ai/                   # bootstrap/cli/patterns/scenarios
    scaffolds/                 # data-table-list / settings-section
    desktop/README.md
    AGENT_BRIEF.md
  archetypes/agent-workbench/  # Phase 3 Workbench Shell 源应用
    AGENTS.md / README.md / APP_BRIEF.md
    src/ modules + shell + composition
  packages/foundation/         # Phase 2A：Button / Input / tokens（source-consumed）
  docs/                        # ADR / plans / evidence / research（平台级）
```

## 5. 能力地图

### 5.1 运行时页面（Admin 模板本体）

| 路径 | 模块 | 备注 |
|---|---|---|
| `/` | dashboard（默认）/ workspace（agent-desktop init 后） | agent 场景会改首页 |
| `/tasks` | data-table 完整参考 | faceted filter |
| `/settings/*` | 设置分段 | profile/account/appearance/notifications/display |
| `/sign-in` 等 | auth | 无 Clerk 强绑定 |
| `/workspace` | Agent 主画布 | Admin 兼容基线 |
| errors | 401/403/404/500/503 | 保留 |

### 5.2 Skill（`$uilab-admin`）

本地已桥接：Claude / Codex / Agents / Grok。
平台 skill 位于根 `skill/uilab-admin/`，Markdown 链到 `archetypes/admin/docs/ai/*`；`init` 生成应用时改写为本地 `docs/ai`。

| 模式 | 路线 | 作用 |
|---|---|---|
| bootstrap | `bootstrap` | 0→1 场景确认与初始化编排 |
| extend | `discover` | 只读地图 |
| extend | `scaffold` | 按 pattern 加页 |
| extend | `shell` | 改默认布局/导航 |
| extend | `review` | 只读门禁 |

### 5.3 CLI（`pnpm uilab-admin`）

| 命令 | 状态 | 作用 |
|---|---|---|
| `check` | shipped | AI 合同门禁 |
| `add data-table-list` | shipped | 列表页 scaffold + routeTree regen |
| `add settings-section` | shipped | 设置分段 scaffold + routeTree regen |
| `set-shell` | shipped | 写 `admin-preferences.ts` |
| `init` | shipped | 从模板创建应用并 apply scenario |
| `apply-scenario` | shipped | 对已有拷贝套场景 |
| `add auth-page` | planned | 暂手工仿 auth feature |

路径模型（三根）：Admin 源（含 Admin-local `AGENTS.md`/`README.md`）/ Admin assets（`docs/ai`+`scaffolds`）/ support（平台 skill+configs；平台根 `AGENTS`/`README` 不写入派生应用）。派生应用三根合一。

### 5.4 Scenarios

| id | shell 倾向 | bootstrap seed | 桌面 |
|---|---|---|---|
| `ops-console` | sidebar + compact | `tickets` 列表 | web |
| `saas-admin` | inset + default | `settings/billing` | web |
| `agent-desktop` | sidebar + full | `threads` + Workspace 首页 | L1+L2 host-ready |

## 6. 验收证据（最近一次）

### Phase 1 monorepo migration

- Batch 1A `9a7b582`：Admin 应用迁入 workspace
- Batch 1B `e22a8f4`：规范 tooling + 根兼容 wrapper
- Batch 1C `c84be8d`：Admin assets（`docs/ai` / `scaffolds`）迁入 `archetypes/admin`，CLI/门禁三根模型与合同对齐；**应用侧 AGENTS/README 归 Archetype 所有**，`init` 不再把平台根合同拷进派生应用
- 证据：`docs/evidence/phase-1-template-platform-migration.md`

### CLI-2 多场景

目录：`/Users/zhoujw/develop/tmp/uilab-admin-cli2-verify-20260801-121430`
证据：`EVIDENCE.md`

- init ops/saas/agent：PASS
- apply-scenario：PASS
- extend（members + set-shell）：PASS
- 冲突/未知 scenario 退出码：PASS
- typecheck/build（init apps）：PASS

### UI smoke（真实 dev）

目录：`/Users/zhoujw/develop/tmp/uilab-admin-ui-verify-20260801-122005`
证据：`UI_EVIDENCE.md` + `screenshots/`

| 场景 | 端口 | 结果 |
|---|---|---|
| ops-console | 5181 | PASS |
| saas-admin | 5182 | PASS |
| agent-desktop | 5183 | PASS |

关键经验：
- 多个派生 app **不要共享同一个 node_modules symlink**，否则 Vite optimize 缓存会互相污染导致空白页
- `add/init` 后必须 regen `src/routeTree.gen.ts`（CLI 已处理）

### Phase 0 Admin baseline

- `pnpm test`：17 files / 103 tests，全部通过
- `pnpm typecheck` / `pnpm build` / `pnpm check:ai`：PASS
- Playwright CLI（本机 headed Chrome）：登录按钮为 `type=submit`，空表单点击校验正常，console 0 error / 0 warning
- 证据：`docs/evidence/phase-0-quality-gates.md`、`docs/evidence/phase-0-playwright-baseline.md`

### Phase 1 current verification

- `pnpm test`：18 files / 108 tests，全部通过（新增 scenario-aware sidebar default resolver 覆盖）
- `ops-console` 派生应用：typecheck / build / 18 files / 108 tests / check:ai / CLI check 全通过
- `routeTree.gen.ts` SHA 保持 `ae8902e654f8393e3499dbd3f912d4ddcb0f133cedd328c6bf112e681c9652b4`
- 证据：`docs/evidence/phase-1-template-platform-migration.md`

### Phase 2A minimal Foundation

- 提交：`9d55b3c`
- `@uilab/foundation` Button/Input/tokens；Admin re-export；`check:foundation`；init materialization
- 证据：`docs/evidence/phase-2a-minimal-foundation.md`

### Phase 3 Workbench Shell skeleton

- 代码：`archetypes/agent-workbench`（本批提交；具体 hash 以 `git log` 为准）
- 静态 Shell + task-scoped layout + placeholder Work Surface Host + `check:workbench`
- **未包含**：Runtime、Surface Registry、Document/Browser/Review、CLI Workbench 生成、desktop host
- 证据：`docs/evidence/phase-3-workbench-shell-skeleton.md`

## 7. 已知缺口 / 技术债

### 与 Phase 1 迁移无关（已知债务，不计入 Phase 1 验收）

- **lint**：Admin 包内既有 eslint 问题（若存在）不作为本阶段迁移失败条件
- **knip**：既有 unused export / dependency 扫描债务不作为本阶段迁移失败条件

### P1（下一阶段优化优先）

1. **Phase 2 remainder**（共享 theme Provider / 更广 primitives；Workbench 第二消费者已有）
2. **Phase 4 Fake Runtime** 与 Task lifecycle
3. **模板去 demo 化**
4. **scenario 质量**（agent-desktop 噪音入口等）
5. **CLI 体验**（npm 发布、`auth-page` add、Workbench init 属 Phase 8）

### P2

1. agent-desktop 主画布仍是 mock，未接真实 Agent runtime
2. desktop host（Electron/Tauri）未实现
3. OpenAPI → list scaffold 未做
4. UI Lab 视觉弱接入未做
5. 更强 `check:ai`（页面三件套静态扫描、禁止 Select 主筛选等）

### P3

1. AI/CLI 自动化路径覆盖仍不足
2. 版本号仍 `0.0.1`，CHANGELOG 仍偏上游 shadcn-admin 历史

## 8. 建议的后续优化 backlog

### Wave 0 — Phase 2A Foundation seam（已完成）

1. ~~创建 `packages/foundation` 最小公开 Interface（Button/Input/tokens）~~
2. ~~Admin 兼容 re-export 消费~~
3. ~~依赖门禁 `check:foundation` + init materialization~~

### Wave 0b — Phase 2 remainder

1. 在双 Archetype 同语义基础上再扩 Dialog/Popover/…（按需）
2. Theme / direction providers 跨 Archetype 对齐

### Wave A — 模板打磨

1. 收敛默认侧栏 IA
2. 统一中文文案死角
3. scenario apply 时更积极地裁剪无关 demo
4. README / PROJECT_STATUS / AGENT_BRIEF 保持同步

### Wave B — Workbench（Phase 3 done → 4+）

1. ~~独立 `archetypes/agent-workbench` Shell 骨架~~（Phase 3）
2. Phase 4 Fake Runtime + projection
3. Phase 5–6 Surface Registry + Document/Browser/Review

### Wave C — 装配系统增强

1. `uilab-admin add auth-page`
2. CLI 发布策略
3. `check` 增强结构审计

## 9. 常用命令

```bash
# 模板本体（根编排 → Foundation / Admin / Workbench）
pnpm install
pnpm dev                 # Admin
pnpm dev:workbench
pnpm typecheck
pnpm build
pnpm test
pnpm check:foundation
pnpm check:workbench
pnpm check:ai
pnpm check

# 包级
pnpm --filter @uilab/admin typecheck
pnpm --filter @uilab/admin build
pnpm --filter @uilab/admin test
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench test

# CLI
pnpm uilab-admin --help
pnpm uilab-admin init my-ops --scenario ops-console --dir ../
pnpm uilab-admin init my-agent --scenario agent-desktop --dir ../
pnpm uilab-admin apply-scenario saas-admin --dir .
pnpm uilab-admin add data-table-list --domain orders --title 订单列表
pnpm uilab-admin set-shell --theme system --sidebar inset --layout default
pnpm uilab-admin check
```

## 10. 关键提交时间线

| Commit | 内容 |
|---|---|
| `93491f2` | AI contracts / skill / scaffolds |
| `a52e72b` | skill bridge + check:ai |
| `67f658f` | bootstrap/extend/scenario/CLI 合同 |
| `cf7245e` | CLI-1 check/add/set-shell |
| `d267261` | CLI-2 init/apply-scenario |
| `d459d3c` | agent-desktop Workspace 主画布与 bootstrap wiring |
| `81731f8` | Agent Workbench 架构 ADR / 路线图 |
| `4dd254e` | Phase 0 baseline 证据 |
| `f747719` | Browser 测试基线恢复（17/103 绿） |
| `9a7b582` | Phase 1 Batch 1A：Admin 迁入 workspace |
| `e22a8f4` | Phase 1 Batch 1B：tooling 规范路径 + 兼容 wrapper |
| `c84be8d` | Phase 1 Batch 1C：Admin assets + 三根路径模型 + 合同对齐 |
| `9d55b3c` | Phase 2A：minimal Foundation seam |
| （本批） | Phase 3 Workbench Shell skeleton；具体 hash 以 `git log` 为准 |

## 11. 状态更新约定

后续每次完成一个可交付阶段，至少更新：

1. 本文件 `PROJECT_STATUS.md`（阶段判断 / 缺口 / backlog）
2. `CHANGELOG.md` 的 Unreleased（若有用户可见变化）
3. 必要的 `README.md` / Admin `AGENT_BRIEF.md` 一句同步

不要把 planned 写成 shipped。
