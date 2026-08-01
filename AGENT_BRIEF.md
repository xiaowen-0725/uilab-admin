# AGENT_BRIEF — uilab-admin

给 Agent / 协作者的短简报。硬规则以 [AGENTS.md](AGENTS.md) 为准。

## 一句话

通用中后台模板：用稳定壳层 + 可点名页面模式，让 AI 后续持续装配业务应用。

## 当前真源

- 技术栈：Vite + React 19 + TS + Tailwind 4 + **shadcn Base UI (base-nova)** + TanStack
- 中文主路径已落地
- 布局 defaults：`src/config/admin-preferences.ts`
- 主题设置可导出 JSON / defaults 代码 / Agent 提示词
- AI 合同：`AGENTS.md` + `docs/ai/*` + `skill/uilab-admin`

## 先读

1. [AGENTS.md](AGENTS.md)
2. [docs/ai/map.md](docs/ai/map.md)
3. [docs/ai/patterns.catalog.json](docs/ai/patterns.catalog.json)
4. 对应 pattern 文档（list / settings / auth）

## 常见任务怎么走

| 任务 | 模式/路线 |
|---|---|
| 新开一个应用 | `bootstrap` + scenario（ops-console / saas-admin / agent-desktop） |
| 了解仓库 | extend → `discover` |
| 新加列表页 | extend → `scaffold` + `data-table-list` |
| 新加设置段 | extend → `scaffold` + `settings-section` |
| 改默认布局/导航 | extend → `shell` |
| 检查是否合规 | extend → `review` |

## 可删示例

- `src/features/tasks/data/*` mock
- `src/features/dashboard/*` 假指标
- 不需要的 auth 变体页
- 不需要的 settings 子页

删除后同步 route + sidebar。

## 不要做

- 不要引入 Clerk / UI Lab runtime
- 不要把表格退回简单 Select 过滤
- 不要回潮 Radix / `asChild`
- 不要只改 feature 不改 route/sidebar

## 场景与 CLI

- 场景目录：`docs/ai/scenarios.catalog.json`
- Bootstrap 合同：`docs/ai/bootstrap.md`
- CLI 合同：`docs/ai/cli.md`（命令名 `uilab-admin`）
- CLI-1 已可用：`check` / `add` / `set-shell`；`init` 仍 planned
- 桌面端：L1 可运行 web 构成 + L2 host-ready 边界；完整 Electron/Tauri 后置

## 门禁

```bash
pnpm check:ai
```
