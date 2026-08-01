# UI Lab Admin

通用中后台项目模板（`uilab-admin`）。

基于 Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn/ui（Base UI / `base-nova`）+ TanStack Router / Query / Table。

本仓库是独立模板，不依赖 UI Lab 运行时；第一期也不接入 Create 导出或 Design Package 主链路。

## 快速开始

```bash
pnpm install
pnpm dev
```

构建：

```bash
pnpm build
pnpm preview
```

## 技术栈

- Vite 8 + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui（Base UI）
- TanStack Router（文件路由）
- TanStack Query
- TanStack Table
- 中文优先界面文案

## 第一期页面

- `/` 仪表盘
- `/tasks` 数据列表
- `/settings` 设置（个人资料 / 账户）
- `/sign-in`、`/sign-up` 认证页
- `/404` 错误页

## 目录约定

```text
src/
  components/
    layout/          # 应用壳：sidebar / header / main
    ui/              # shadcn 组件
  features/
    dashboard/       # 业务页面实现
    tasks/
    settings/
    auth/
    errors/
  routes/            # TanStack Router 文件路由（薄封装）
  hooks/
  lib/
```

规则：

1. **路由文件保持薄**：`routes/*` 只负责 `createFileRoute` 与挂载 feature。
2. **页面实现放 feature**：UI、表格、表单、mock data 都在 `features/<name>`。
3. **壳层复用 layout**：新后台页优先复用 `Header` + `Main` + `AppSidebar`。
4. **UI 原子层走 shadcn CLI**：`npx shadcn@latest add <component>`。

## 开新项目时怎么用

1. Clone 或使用本仓库作为模板。
2. 修改 `package.json` 名称、`index.html` 标题、侧边栏文案（`src/components/layout/data/sidebar-data.ts`）。
3. 删除不需要的示例 feature（见 `AGENT_BRIEF.md`）。
4. 按真实业务补数据源、鉴权与 API。

## 与 UI Lab 的关系

- 独立仓库，弱连接
- 可复用 UI Lab 的视觉/组件灵感，但当前不绑定其 runtime / Package lifecycle
- 后续若接入 Create/Preset，应作为可选增强，而不是模板启动前置条件

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 本地开发 |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm typecheck` | 仅类型检查 |
| `pnpm lint` | ESLint |
| `pnpm preview` | 预览构建产物 |
