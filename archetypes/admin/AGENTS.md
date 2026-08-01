# AGENTS.md — Admin application

本项目是 **AI-first Admin 模板 / 派生中后台应用**（Vite + React Admin Console）。  
Agent 默认按本文件执行；与 `AGENT_BRIEF.md` / `docs/ai/*` 冲突时，以本文件硬规则为准。

## 定位

- 技术栈：Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn/ui（**Base UI / base-nova**）+ TanStack Router / Query / Table
- 中文优先文案，代码标识英文
- 与 UI Lab **弱连接**：不依赖 UI Lab runtime / Design Package 主链路
- 目标：在稳定壳层上持续装配业务页面，而不是每次重造壳层

## 目录约定（应用根）

```text
src/                 # 应用源码
docs/ai/             # AI 合同、patterns、scenarios
scaffolds/           # 页面薄模板
skill/uilab-admin/   # 本地 skill 入口
cli/                 # 本地 uilab-admin CLI
scripts/             # 本地 check:ai / check:foundation 门禁
packages/foundation/ # 派生应用：copy-and-own Foundation（平台 monorepo 内为 workspace 包）
```

## Foundation 兼容层（Phase 2A）

- **Button / Input / design tokens** 的实现位于 `@uilab/foundation`（公开子路径：`ui/button`、`ui/input`、`styles/tokens.css`）。
- 应用代码**继续**从 `@/components/ui/button`、`@/components/ui/input` 导入；这两个文件是兼容 re-export，不含平行实现。
- `src/styles/theme.css` 兼容导入 Foundation tokens；`src/styles/index.css` 用 Tailwind 4 `@source` 注册 Foundation 包源。
- 不要在 Admin 内再实现一套 Button/Input/tokens；不要把 providers、Shell、data-table、Router/Query 抽进 Foundation（未在 Phase 2A 范围）。

## 四层模型

1. **Kernel（少动）**：`src/components/ui/*`（含 Foundation 兼容 re-export）、`layout/*`、`data-table/*`、`context/*`、路由/Query 基建
2. **Patterns（优先复用）**：见 `docs/ai/patterns/*` 与 `docs/ai/patterns.catalog.json`
3. **App Config（表达差异）**：`src/config/admin-preferences.ts`、`src/components/layout/data/sidebar-data.ts`
4. **Features（业务可变）**：`src/features/<domain>/*`

## 硬规则

1. **新页面三件套必须齐全**
   - `src/features/<domain>/...`
   - `src/routes/_authenticated/<domain>/...`（或 auth/errors 对应区）
   - `src/components/layout/data/sidebar-data.ts` 注册（若需导航）
2. **feature 厚，route 薄**
   - route 只 `createFileRoute` + 挂 feature
   - 页面实现、表格、表单、mock/API 适配放 feature
3. **表格页必须复用 data-table pattern**
   - 用 `src/components/data-table/*`
   - 禁止退化成裸 `Select` 过滤替代 faceted toolbar（除非用户明确要求极简）
4. **组件复用顺序**
   - 已有 pattern / feature 参考 → `components/ui`（shadcn Base UI）→ 才允许 bespoke
   - 禁止平行造第二套 Button/Input/Table 体系
5. **Base UI 约束**
   - 组合用 `render={...}`，不要回潮 `asChild`
   - 不要重新引入 `@radix-ui/*` 依赖
   - `DropdownMenuLabel` 必须可在 Group 语义下工作（当前实现已 auto-wrap）
6. **布局差异走配置**
   - 项目默认：`src/config/admin-preferences.ts`
   - 用户运行时：cookie / Theme Settings
   - 不要为了换 inset/floating 去分叉 layout 组件
7. **中文优先**
   - 用户可见文案中文
   - 路由、组件名、类型、文件名英文
8. **示例可删，模式保留**
   - sample data / demo 文案可替换
   - kernel 与 pattern 参考实现不要随便删空

## 完成定义（任何改动后）

至少：

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm check:foundation   # Foundation 边界与 Admin 消费合同（派生应用为本地脚本）
pnpm check:ai           # AI 合同 / skill / pattern 门禁
```

若改了路由/页面，还需目视或说明：

- 导航可到
- 关键交互未回归（搜索、表格筛选、设置抽屉、用户菜单）

## 推荐 AI 路线

使用 skill：`skill/uilab-admin`（`$uilab-admin`）

### 模式

- **bootstrap（0→1）**：新应用初始化 / 场景推荐 / 套 scenario pack
- **extend（1→100）**：已有派生应用上增量装配

### 路线

- `bootstrap`：0→1 场景确认与初始化编排（CLI `uilab-admin init` / `apply-scenario`）
- `discover`：只读地图与 pattern
- `scaffold`：按 pattern 加页面
- `shell`：改布局默认/导航 IA
- `review`：只读门禁检查

场景包：`docs/ai/scenarios.catalog.json`  
CLI 合同：`docs/ai/cli.md`  
Bootstrap 合同：`docs/ai/bootstrap.md`

本地 CLI：

```bash
pnpm uilab-admin check
pnpm uilab-admin add data-table-list --domain <id> --title <中文标题>
pnpm uilab-admin add settings-section --section <id> --title <中文标题>
pnpm uilab-admin set-shell --theme system --sidebar inset --layout default --direction ltr
```

详细见 `docs/ai/` 与 skill references。

薄模板目录：`scaffolds/data-table-list`、`scaffolds/settings-section`（复制后替换占位符，再对照 feature 参考补全）。
