# UI Lab Admin

AI-first **Template Platform**，当前可运行产品为：

- 通用中后台 **Admin Archetype**（`archetypes/admin`）
- **Agent Workbench Archetype** Phase 3 静态 Shell（`archetypes/agent-workbench`）

基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin) 二创：保留成熟 admin shell / 页面模式 / data-table 交互，改用官方 shadcn **Base UI**，并补齐中文优先与 AI 装配约定。

> 仓库已完成 Phase 1 目录迁移、**Phase 2A 最小 Foundation seam**，以及 **Phase 3 Workbench Shell 骨架**。
> Foundation 提供 Button / Input / tokens；Admin 与 Workbench 均为消费者。完整 Phase 2（共享 providers / 更广 primitives）**尚未**完成。
> **未交付**：Agent Runtime、具体 Work Surface（Document/Browser/Review）、Workbench CLI 生成、desktop host。
> Admin 源与 Admin-owned 资产位于 `archetypes/admin`，Workbench 源位于 `archetypes/agent-workbench`，规范 CLI / 质量门禁位于 `tooling/*`，根目录保留兼容命令与 `$uilab-admin` skill 前门。
> **应用侧合同**见 [`archetypes/admin/AGENTS.md`](archetypes/admin/AGENTS.md)、[`archetypes/agent-workbench/AGENTS.md`](archetypes/agent-workbench/AGENTS.md)。
> 路线与状态见 [实施路线](docs/plans/agent-workbench-template-roadmap.md) 与 [项目状态](PROJECT_STATUS.md)。

## 快速开始

```bash
pnpm install
pnpm dev                 # Admin（默认兼容入口）
pnpm dev:admin
pnpm dev:workbench       # Workbench Shell → :5174
```

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm check:foundation
pnpm check:workbench
pnpm check:ai
pnpm check
```

根命令委托到 `@uilab/foundation` / `@uilab/admin` / `@uilab/agent-workbench` 与平台门禁；也可：

```bash
pnpm --filter @uilab/admin dev
pnpm --filter @uilab/agent-workbench dev
pnpm --filter @uilab/foundation typecheck
pnpm --filter @uilab/admin typecheck
pnpm --filter @uilab/agent-workbench typecheck
```

## 技术栈

- Vite + React 19 + TypeScript
- Tailwind CSS 4
- 官方 shadcn/ui（Base UI / `base-nova`）— 主要用于 Admin；Foundation Button/Input 同栈
- TanStack Router / Query / Table（Admin）；Workbench 使用小型 code-defined Router
- 中文优先文案，代码标识英文

## 平台形状（当前）

```text
uilab-templates/
  archetypes/
    admin/                   # 可运行 Admin 源应用
      AGENTS.md              # Admin / 派生应用硬合同（init 原样带入）
      README.md
      src/
      docs/ai/
      scaffolds/
    agent-workbench/         # Phase 3 可运行 Workbench Shell
      AGENTS.md
      README.md
      APP_BRIEF.md
      src/
  packages/
    foundation/              # Phase 2A：Button / Input / tokens（source-consumed）
  tooling/
    template-cli/            # 规范 uilab-admin CLI
    quality-gates/           # check:ai + check:foundation + check:workbench
  skill/uilab-admin/         # 外部可发现 skill 前门
  cli/ / scripts/            # 根兼容 wrapper
  docs/                      # 平台 ADR / plans / evidence
```

`uilab-admin init` 会把 Foundation 复制进派生应用 `packages/foundation`，并写入迷你 `pnpm-workspace.yaml`（**仅 Admin 生成**；Workbench 生成属 Phase 8，未 shipped）。

## 当前页面（Admin）

- `/` 仪表盘（`agent-desktop` init 后为工作区）
- `/workspace` Agent 主画布（Admin 兼容基线，非长期 Workbench Kernel）
- `/tasks` 数据列表（完整 faceted filter / toolbar）
- `/settings/*` 设置
- `/sign-in` `/sign-up` 等认证页
- 错误页

## Agent Workbench（Phase 3）

- 独立包 `@uilab/agent-workbench`，`pnpm dev:workbench`
- Navigator + Task Surface + Composer + Adaptive Context Panel + placeholder Work Surface Host
- 静态 fixture；**无** Runtime / 真实 Surface
- 详见 [Workbench README](archetypes/agent-workbench/README.md)

完整状态与 backlog 见 [PROJECT_STATUS.md](PROJECT_STATUS.md)。  
单应用视角说明见 [Admin README](archetypes/admin/README.md)。

## Admin 目录约定

路径相对 `archetypes/admin/`（派生应用在应用根自包含同等结构）：

```text
src/
  components/
    layout/        # App shell
    data-table/    # 表格模式
    ui/            # shadcn Base UI
  features/        # 业务页面（厚）
  routes/          # 文件路由（薄）
  context/         # theme / layout / direction / search
  config/          # 项目默认布局等
docs/ai/           # AI 合同与 pattern 文档
scaffolds/         # 薄 scaffold 模板
```

平台内完整路径：`archetypes/admin/docs/ai`、`archetypes/admin/scaffolds`。  
根 skill 入口：`skill/uilab-admin/`。  
Admin / 派生应用硬规则：[archetypes/admin/AGENTS.md](archetypes/admin/AGENTS.md)。

## 布局差异怎么做

1. 在页面 Theme Settings 试布局
2. 导出 JSON / defaults 代码 / Agent 提示词
3. 写入 `src/config/admin-preferences.ts` 作为项目默认

运行时个人偏好仍走 cookie；项目默认用于“应用 A / 应用 B 不同默认壳”。

## AI-first

本仓库面向 Agent 装配，分两种模式：

- **bootstrap（0→1）**：按 scenario 开新应用（`uilab-admin init`，**当前仅 Admin**）
- **extend（1→100）**：在已有派生应用上 scaffold / shell / review

内置场景：

- `ops-console` 运营中后台
- `saas-admin` SaaS 管理端
- `agent-desktop` Agent 工作台兼容基线（L1 web + L2 desktop-host-ready；长期独立 Workbench 见 `archetypes/agent-workbench`，**勿**与 Phase 3 Shell 混淆）

合同文档：

- **平台**：本 README、根 [AGENTS.md](AGENTS.md)
- **Admin / 派生应用**：[archetypes/admin/AGENTS.md](archetypes/admin/AGENTS.md)、[archetypes/admin/README.md](archetypes/admin/README.md)
- **Workbench**：[archetypes/agent-workbench/AGENTS.md](archetypes/agent-workbench/AGENTS.md)、[archetypes/agent-workbench/README.md](archetypes/agent-workbench/README.md)
- **Admin AI**：[bootstrap.md](archetypes/admin/docs/ai/bootstrap.md)、[cli.md](archetypes/admin/docs/ai/cli.md)、[scenarios.catalog.json](archetypes/admin/docs/ai/scenarios.catalog.json)

本地 skill 入口：`$uilab-admin`。  
仓库门禁：`pnpm check:ai`、`pnpm check:foundation`、`pnpm check:workbench`。

CLI-1（可执行）：

```bash
pnpm uilab-admin check
pnpm uilab-admin add data-table-list --domain orders --title 订单列表
pnpm uilab-admin add settings-section --section billing --title 账单
pnpm uilab-admin set-shell --theme system --sidebar inset --layout default --direction ltr
```

`init` / `apply-scenario` 已可用（CLI-2）。生成应用携带 Admin-local AGENTS/README，而非平台根合同。Workbench 生成 **未** 接入 CLI。

典型能力：

- 场景推荐与初始化编排
- 发现 pattern / 落点
- 按 `data-table-list` / `settings-section` / `auth-page` scaffold
- 改 shell 默认与导航
- review 门禁

## 与 UI Lab 关系

独立仓库，弱连接。  
不绑定 UI Lab runtime / Create / Design Package 主链路；后续若接视觉，只作为可选增强。

## License

基于 shadcn-admin（MIT）二创，见 `LICENSE`。
