# AGENTS.md — uilab-admin (Template Platform)

本仓库是 **AI-first Template Platform**。当前可运行 Archetype 为 Admin Console（`archetypes/admin`）。

## 合同所有权与优先级

| 合同 | 路径 | 作用域 |
|---|---|---|
| **平台合同（本文件）** | 根 `AGENTS.md` | monorepo 结构、tooling、skill 前门、跨 Archetype 约定 |
| **Admin / 派生应用合同** | [`archetypes/admin/AGENTS.md`](archetypes/admin/AGENTS.md) | Admin 源应用与 **所有 `init` 生成应用** 的硬规则 |
| **Admin 应用 README** | [`archetypes/admin/README.md`](archetypes/admin/README.md) | 单应用视角的快速开始与结构说明 |

- 在 **Admin 应用代码、docs/ai、scaffolds、派生应用** 上工作时，硬规则以 **Admin-local** [`archetypes/admin/AGENTS.md`](archetypes/admin/AGENTS.md) 为准。
- 在 **平台根、tooling、skill 前门、跨 Archetype 文档** 上工作时，以本文件为准。
- 与 Admin `AGENT_BRIEF.md` / `archetypes/admin/docs/ai/*` 冲突时：应用内行为以 Admin-local `AGENTS.md` 为准；平台布局与路径以本文件为准。

阶段状态与 backlog 见 [PROJECT_STATUS.md](PROJECT_STATUS.md)。

## 定位

- **Template Platform**：根目录承载共享合同、skill 发现入口、兼容 CLI/门禁 wrapper，以及跨 Archetype 文档
- **Admin Archetype**：`archetypes/admin` — Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn/ui（**Base UI / base-nova**）+ TanStack Router / Query / Table
- 中文优先文案，代码标识英文
- 与 UI Lab **弱连接**：不依赖 UI Lab runtime / Design Package 主链路
- 目标：后续多个前端后台应用都基于本模板装配，而不是每次重造壳层；后续可增加 `archetypes/agent-workbench` 等平级 Archetype

## 平台目录（当前）

```text
uilab-templates/
  archetypes/admin/          # Admin 源应用 + Admin-owned docs/ai + scaffolds + AGENTS/README
  packages/foundation/       # Phase 2A 最小 Foundation（Button / Input / tokens）
  tooling/template-cli/      # 规范 CLI 实现
  tooling/quality-gates/     # 规范 check:ai / check:foundation 实现
  skill/uilab-admin/         # 外部可发现 skill 前门（兼容入口）
  cli/uilab-admin.mjs        # 根兼容 wrapper → tooling/template-cli
  scripts/check-ai.mjs       # 根兼容 wrapper → tooling/quality-gates
  scripts/check-foundation.mjs  # 根兼容 wrapper → Foundation 边界门禁
  docs/                      # 平台 ADR / plans / evidence（不含 Admin docs/ai）
```

生成的派生应用在**自身根目录**自包含：Admin-local `AGENTS.md` / `README.md`、`docs/ai`、`scaffolds`、`skill/uilab-admin`、本地 `packages/foundation`（copy-and-own mini-workspace）与本地 CLI/门禁（规范实现副本，非根 wrapper）。

### Foundation（Phase 2A）

- 包名：`@uilab/foundation`（private，**source-consumed**，本阶段不发 npm）
- 公开 Interface 仅：
  - `@uilab/foundation/ui/button`
  - `@uilab/foundation/ui/input`
  - `@uilab/foundation/styles/tokens.css`
- 禁止根 barrel；`cn` 为包内 private Implementation
- 依赖方向：`archetypes/*` → `@uilab/foundation`；Foundation 不得反向依赖任何 Archetype
- 门禁：`pnpm check:foundation`（规范实现 `tooling/quality-gates/check-foundation-boundaries.mjs`）
- Admin 仍通过 `@/components/ui/*` 兼容 re-export 消费；应用代码勿直接扩散 Foundation 子路径（除非新 Archetype）

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
5. **Base UI 约束**：`render={...}`；禁止 `asChild` 与 `@radix-ui/*`
6. **布局差异走配置**（`admin-preferences` / cookie / Theme Settings）
7. **中文优先**（用户可见文案）
8. **示例可删，模式保留**

## 完成定义（平台根）

至少：

```bash
pnpm typecheck          # Foundation → Admin
pnpm build              # Foundation → Admin
pnpm check:foundation   # Foundation 边界 / 导出 / Admin 消费合同
pnpm check:ai           # AI 合同 / skill / pattern 门禁
```

`pnpm check` = typecheck + foundation + AI。根命令委托到 `@uilab/foundation` / `@uilab/admin` 或平台门禁。包级也可：

```bash
pnpm --filter @uilab/foundation typecheck
pnpm --filter @uilab/foundation test
pnpm --filter @uilab/admin typecheck
pnpm --filter @uilab/admin build
pnpm --filter @uilab/admin check:ai
pnpm --filter @uilab/admin check:foundation
```

派生应用**不要**使用 `--filter @uilab/admin`；见 Admin-local 完成定义。

若改了路由/页面，还需目视或说明：

- 导航可到
- 关键交互未回归（搜索、表格筛选、设置抽屉、用户菜单）

## 推荐 AI 路线

使用 skill：`skill/uilab-admin`（`$uilab-admin`）— 根目录兼容前门；平台内文档指向 `archetypes/admin/docs/ai/*`。  
Admin / 派生应用硬规则：[`archetypes/admin/AGENTS.md`](archetypes/admin/AGENTS.md)。

### 模式

- **bootstrap（0→1）**：新应用初始化 / 场景推荐 / 套 scenario pack
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
