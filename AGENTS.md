# AGENTS.md — uilab-admin (Template Platform)

本仓库是 **AI-first Template Platform**。当前可运行 Archetype：

- **Admin Console**：`archetypes/admin`（`@uilab/admin`）
- **Agent Workbench**：`archetypes/agent-workbench`（`@uilab/agent-workbench`，**Phase 3 Shell + Phase 4 Fake Runtime path**）

## 合同所有权与优先级

| 合同 | 路径 | 作用域 |
|---|---|---|
| **平台合同（本文件）** | 根 `AGENTS.md` | monorepo 结构、tooling、skill 前门、跨 Archetype 约定 |
| **Admin / 派生应用合同** | [`archetypes/admin/AGENTS.md`](archetypes/admin/AGENTS.md) | Admin 源应用与 **所有 `init` 生成应用** 的硬规则 |
| **Workbench 应用合同** | [`archetypes/agent-workbench/AGENTS.md`](archetypes/agent-workbench/AGENTS.md) | Agent Workbench 源应用硬规则（Shell + Fake Runtime path） |
| **Admin 应用 README** | [`archetypes/admin/README.md`](archetypes/admin/README.md) | 单应用视角的快速开始与结构说明 |
| **Workbench 应用 README** | [`archetypes/agent-workbench/README.md`](archetypes/agent-workbench/README.md) | Workbench 快速开始与 shipped/planned 边界 |

- 在 **Admin 应用代码、docs/ai、scaffolds、派生应用** 上工作时，硬规则以 **Admin-local** [`archetypes/admin/AGENTS.md`](archetypes/admin/AGENTS.md) 为准。
- 在 **Workbench 应用代码** 上工作时，硬规则以 [`archetypes/agent-workbench/AGENTS.md`](archetypes/agent-workbench/AGENTS.md) 为准。
- 在 **平台根、tooling、skill 前门、跨 Archetype 文档** 上工作时，以本文件为准。
- 与 Admin `AGENT_BRIEF.md` / `archetypes/admin/docs/ai/*` 冲突时：应用内行为以 Admin-local `AGENTS.md` 为准；平台布局与路径以本文件为准。

阶段状态与 backlog 见 [PROJECT_STATUS.md](PROJECT_STATUS.md)。

## 定位

- **Template Platform**：根目录承载共享合同、skill 发现入口、兼容 CLI/门禁 wrapper，以及跨 Archetype 文档
- **统一 UI 栈（全模板）**：后续所有 Archetype / 派生应用均基于 **Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn/ui（Base UI / `base-nova`）**。组件按需 `shadcn add` 进应用源码（`components.json` + `@/components/ui/*`）；**Base UI 约束**：`render={...}`，禁止 `asChild` 与 `@radix-ui/*`
- **Admin Archetype**：`archetypes/admin` — 上述 UI 栈 + TanStack Router / Query / Table 的中后台 Console 场景
- **Agent Workbench Archetype**：`archetypes/agent-workbench` — **同一 UI 栈**上的独立 Task-first Shell 场景（Phase 3 Shell + Phase 4 **Deterministic Fake** path；**无** production Runtime / 具体 Surface）
- 中文优先文案，代码标识英文
- 与 UI Lab **弱连接、强复用**：不依赖 UI Lab runtime / Design Package 主链路；Agent 复合交互优先经 **shadcn registry 安装** UI Lab 组件源码进应用。组件缺陷与能力优化以 **UI Lab 仓库为真源并回流**，模板侧不长期平行 fork
- **体验保真（尤其 Workbench）**：模板目标是「像真 Runtime 的本地产品体验」；未接远程后端 ≠ UI 只读演示。本地状态与交互应完整；诚实边界仅针对远程/后端未接通
- 目标：多个前端应用基于本模板装配，而不是每次重造壳层；Admin 与 Workbench **平级场景**，**共享 UI 栈与 Foundation**，**不**共享 UniversalShell

## 平台目录（当前）

```text
uilab-templates/
  archetypes/admin/            # Admin 源应用 + Admin-owned docs/ai + scaffolds + AGENTS/README
  archetypes/agent-workbench/  # Workbench 源应用（Shell + Fake Runtime path）
  packages/foundation/         # Phase 2A 最小 Foundation（Button / Input / tokens）
  tooling/template-cli/        # 规范 CLI 实现
  tooling/quality-gates/       # 规范 check:ai / check:foundation / check:workbench
  skill/uilab-admin/           # 外部可发现 skill 前门（兼容入口）
  cli/uilab-admin.mjs          # 根兼容 wrapper → tooling/template-cli
  scripts/check-ai.mjs         # 根兼容 wrapper → tooling/quality-gates
  scripts/check-foundation.mjs # 根兼容 wrapper → Foundation 边界门禁
  scripts/check-workbench.mjs  # 根兼容 wrapper → Workbench 边界门禁
  docs/                        # 平台 ADR / plans / evidence（不含 Admin docs/ai）
```

生成的 **Admin** 派生应用在**自身根目录**自包含：Admin-local `AGENTS.md` / `README.md`、`docs/ai`、`scaffolds`、`skill/uilab-admin`、本地 `packages/foundation`（copy-and-own mini-workspace）与本地 CLI/门禁（规范实现副本，非根 wrapper）。

**Workbench 派生生成尚未 shipped**（Phase 8）；当前仅 monorepo 内源应用可运行。

### UI 栈与 shadcn Base UI（平台硬约束）

- **所有模板**（Admin、Workbench、后续新 Archetype）默认同一条 UI 装配链：
  1. 应用根 `components.json`（`style: base-nova`）
  2. 原子 / 复合组件：`src/components/ui/*`（官方 shadcn 源码进仓，按需安装）
  3. `cn`：`src/lib/utils.ts`（`clsx` + `tailwind-merge`）
  4. 样式：`shadcn/tailwind.css` + `tw-animate-css` + Archetype tokens
- **禁止**再走「Workbench 无 shadcn、只手写 Tailwind」的旁路；场景差异体现在 Shell / Module / fixture，不体现在 UI 基座分叉
- **Base UI 约束**（跨 Archetype）：`render={...}`；禁止 `asChild` 与 `@radix-ui/*`

### Foundation（Phase 2A）

- 包名：`@uilab/foundation`（private，**source-consumed**，本阶段不发 npm）
- 公开 Interface 仅：
  - `@uilab/foundation/ui/button`
  - `@uilab/foundation/ui/input`
  - `@uilab/foundation/styles/tokens.css`
- 禁止根 barrel；Foundation 内 `cn` 为包内 private Implementation
- 依赖方向：`archetypes/*` → `@uilab/foundation`；Foundation 不得反向依赖任何 Archetype
- **与 shadcn 的关系**：Foundation 是跨 Archetype 的 **最小共享 primitives / tokens**；应用侧仍通过 `@/components/ui/button|input` **兼容 re-export** 消费（Admin 与 Workbench 同模式），其余 UI 走 shadcn 按需安装。仍**不**宣称完整 Phase 2（无共享 theme provider / 更广 primitives）
- 门禁：`pnpm check:foundation`（规范实现 `tooling/quality-gates/check-foundation-boundaries.mjs`）

### Agent Workbench（Phase 3 Shell + Phase 4 Fake path template-complete）

- 包名：`@uilab/agent-workbench`
- UI 栈：与 Admin 相同的 shadcn Base UI（`components.json` / `@/components/ui/*` / Foundation re-export）
- Composition Root + Deep Modules：`workbench-session` / `task` / `work-surface`
- Shell：Navigator、Task Surface、Composer、Adaptive Context Panel、placeholder Work Surface Host
- **Dual-path Task**：默认 capture `local-sim`；empty/新对话走 Deterministic Fake Runtime → projection → Timeline（4A–4F）
- Fake 深度含 reasoning/tool/approval、MemoryEventStore、queue/steer、长文折叠/滚动 — **Fake ≠ production Runtime**
- **无** production Agent Runtime、**无** Surface Registry、**无** Document/Browser/Review、**无** IndexedDB 持久化
- 门禁：`pnpm check:workbench`

## 四层模型（Admin）

路径相对 `archetypes/admin/`（派生应用中等同于应用根）：

1. **Kernel（少动）**：`src/components/ui/*`、`layout/*`、`data-table/*`、`context/*`、路由/Query 基建
2. **Patterns（优先复用）**：见 Admin `docs/ai/patterns/*` 与 `docs/ai/patterns.catalog.json`（平台内路径：`archetypes/admin/docs/ai/*`）
3. **App Config（表达差异）**：`src/config/admin-preferences.ts`、`src/components/layout/data/sidebar-data.ts`
4. **Features（业务可变）**：`src/features/<domain>/*`

应用侧硬规则全文见 [`archetypes/admin/AGENTS.md`](archetypes/admin/AGENTS.md)（与下表摘要一致）。

## 硬规则（Admin 摘要；真源见 Admin-local AGENTS）

1. **新页面三件套必须齐全** — feature + route + sidebar（若需导航）
2. **feature 厚，route 薄**
3. **表格页必须复用 data-table pattern**
4. **组件复用顺序**：pattern / feature → `components/ui` → bespoke
5. **Base UI 约束**（平台级，Admin/Workbench 共用）：`render={...}`；禁止 `asChild` 与 `@radix-ui/*`
6. **布局差异走配置**（`admin-preferences` / cookie / Theme Settings）
7. **中文优先**（用户可见文案）
8. **示例可删，模式保留**

## 完成定义（平台根）

至少：

```bash
pnpm typecheck          # Foundation → Admin → Workbench
pnpm build              # Foundation → Admin → Workbench
pnpm test               # Foundation → Admin → Workbench
pnpm check:foundation   # Foundation 边界 / 导出 / Admin+Workbench 消费合同
pnpm check:workbench    # Workbench Module / Foundation / 禁止项门禁
pnpm check:ai           # AI 合同 / skill / pattern 门禁
```

`pnpm check` = typecheck + foundation + workbench + AI。根命令委托到各包或平台门禁。包级也可：

```bash
pnpm --filter @uilab/foundation typecheck
pnpm --filter @uilab/foundation test
pnpm --filter @uilab/admin typecheck
pnpm --filter @uilab/admin build
pnpm --filter @uilab/admin check:ai
pnpm --filter @uilab/admin check:foundation
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
```

开发入口：

```bash
pnpm dev                 # Admin（兼容默认）
pnpm dev:admin
pnpm dev:workbench
pnpm preview:workbench
```

派生应用**不要**使用 `--filter @uilab/admin`；见 Admin-local 完成定义。

若改了路由/页面，还需目视或说明：

- 导航可到
- 关键交互未回归（搜索、表格筛选、设置抽屉、用户菜单）

## 推荐 AI 路线

使用 skill：`skill/uilab-admin`（`$uilab-admin`）— 根目录兼容前门；平台内文档指向 `archetypes/admin/docs/ai/*`。
Admin / 派生应用硬规则：[`archetypes/admin/AGENTS.md`](archetypes/admin/AGENTS.md)。
Workbench 硬规则：[`archetypes/agent-workbench/AGENTS.md`](archetypes/agent-workbench/AGENTS.md)。

### 模式

- **bootstrap（0→1）**：新应用初始化 / 场景推荐 / 套 scenario pack（**当前仅 Admin**；Workbench 生成未 shipped）
- **extend（1→100）**：已有派生应用上增量装配

### 路线

- `bootstrap`：0→1 场景确认与初始化编排（CLI `uilab-admin init` / `apply-scenario`）
- `discover`：只读地图与 pattern
- `scaffold`：按 pattern 加页面
- `shell`：改布局默认/导航 IA
- `review`：只读门禁检查

场景包：`archetypes/admin/docs/ai/scenarios.catalog.json`
CLI 合同：`archetypes/admin/docs/ai/cli.md`
Bootstrap 合同：`archetypes/admin/docs/ai/bootstrap.md`

本地 CLI-1：

```bash
pnpm uilab-admin check
pnpm uilab-admin add data-table-list --domain <id> --title <中文标题>
pnpm uilab-admin add settings-section --section <id> --title <中文标题>
pnpm uilab-admin set-shell --theme system --sidebar inset --layout default --direction ltr
```

详细见 `archetypes/admin/docs/ai/` 与 skill references。

薄模板目录：`archetypes/admin/scaffolds/data-table-list`、`archetypes/admin/scaffolds/settings-section`（复制后替换占位符，再对照 feature 参考补全）。
