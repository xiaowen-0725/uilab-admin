# UI Lab Admin

AI-first 通用中后台应用模板（Admin Console）。

基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin) 二创：保留成熟 admin shell / 页面模式 / data-table 交互，改用官方 shadcn **Base UI**，并补齐中文优先与 AI 装配约定。

## 快速开始

```bash
pnpm install
pnpm dev
```

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm check:ai
```

## 技术栈

- Vite + React 19 + TypeScript
- Tailwind CSS 4
- 官方 shadcn/ui（Base UI / `base-nova`）
- TanStack Router / Query / Table
- 中文优先文案，代码标识英文

## 当前页面

- `/` 仪表盘（`agent-desktop` init 后为工作区）
- `/workspace` Agent 主画布
- `/tasks` 数据列表（完整 faceted filter / toolbar）
- `/settings/*` 设置
- `/sign-in` `/sign-up` 等认证页
- 错误页

## 目录约定

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
scaffolds/         # 页面薄模板
skill/uilab-admin/ # Agent skill 入口
```

## 布局差异怎么做

1. 在页面 Theme Settings 试布局
2. 导出 JSON / defaults 代码 / Agent 提示词
3. 写入 `src/config/admin-preferences.ts` 作为项目默认

运行时个人偏好仍走 cookie；项目默认用于不同应用的默认壳。

## AI-first

面向 Agent 装配，分两种模式：

- **bootstrap（0→1）**：按 scenario 开新应用（`uilab-admin init`）
- **extend（1→100）**：在已有应用上 scaffold / shell / review

内置场景：

- `ops-console` 运营中后台
- `saas-admin` SaaS 管理端
- `agent-desktop` Agent 工作台兼容基线（L1 web + L2 desktop-host-ready）

本地文档：

- [docs/ai/bootstrap.md](docs/ai/bootstrap.md)
- [docs/ai/cli.md](docs/ai/cli.md)
- [docs/ai/scenarios.catalog.json](docs/ai/scenarios.catalog.json)
- [AGENTS.md](AGENTS.md) — 硬规则
- [AGENT_BRIEF.md](AGENT_BRIEF.md) — 短简报

本地 skill：`$uilab-admin`。  
门禁：`pnpm check:ai`。

```bash
pnpm uilab-admin check
pnpm uilab-admin add data-table-list --domain orders --title 订单列表
pnpm uilab-admin add settings-section --section billing --title 账单
pnpm uilab-admin set-shell --theme system --sidebar inset --layout default --direction ltr
```

## 与 UI Lab 关系

弱连接：不绑定 UI Lab runtime / Create / Design Package 主链路。

## License

基于 shadcn-admin（MIT）二创，见 `LICENSE`。
