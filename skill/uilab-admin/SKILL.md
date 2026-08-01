---
name: uilab-admin
description: "uilab-admin 的单入口 model-invoked router：支持 0→1 bootstrap（场景推荐/初始化编排）与 1→100 extend（discover/scaffold/shell/review）。Use when creating apps from the uilab-admin template, extending forked admin apps, choosing scenario packs (ops-console/saas-admin/agent-desktop), scaffolding data-table/settings/auth pages, changing shell defaults, or reviewing template compliance under Vite + React 19 + TS + Tailwind 4 + shadcn Base UI + TanStack."
---

# uilab-admin

把本仓库当作 **AI-first 通用中后台装配模板**，不是一次性 demo。

每轮先判断模式，再进入 **一条** 互斥路线；完成或遇门禁后重路由。  
硬规则以 [AGENTS.md](../../AGENTS.md) 为准。  
0→1 / 1→100 合同见 [bootstrap.md](../../archetypes/admin/docs/ai/bootstrap.md)。

## 先选模式

| 模式 | 何时 | 说明 |
|---|---|---|
| `bootstrap` | 新应用、从模板初始化 | 场景确认 → init/apply-scenario 编排 |
| `extend` | 已有派生应用上增量 | discover / scaffold / shell / review |

不确定且用户只是问“模板怎么用” → `discover`（extend 族）。  
用户说“我要做一个新的 Agent 桌面端/运营后台” → `bootstrap`。

## 路由表

| 用户意图 | 模式 | 路线 | 改代码 | 行动前完整读取 |
|---|---|---|---:|---|
| 从 0 开新应用 / 选场景 / 初始化模板 | bootstrap | `bootstrap` | 是（CLI 或受控手工） | [bootstrap.md](references/bootstrap.md)、[docs/ai/bootstrap.md](../../archetypes/admin/docs/ai/bootstrap.md)、[scenarios.catalog.json](../../archetypes/admin/docs/ai/scenarios.catalog.json)、[cli.md](../../archetypes/admin/docs/ai/cli.md) |
| 了解仓库结构、pattern、可落点 | extend | `discover` | 否 | [discover.md](references/discover.md)、[map.md](../../archetypes/admin/docs/ai/map.md)、[extend.md](references/extend.md) |
| 新增列表/设置/认证页 | extend | `scaffold` | 是 | [scaffold.md](references/scaffold.md)、对应 pattern、[do-not.md](../../archetypes/admin/docs/ai/do-not.md)、[acceptance.md](../../archetypes/admin/docs/ai/acceptance.md) |
| 改默认布局/导航 | extend | `shell` | 是 | [shell.md](references/shell.md)、`admin-preferences.ts`、`sidebar-data.ts` |
| 合规检查 | extend | `review` | 否 | [review.md](references/review.md)、[do-not.md](../../archetypes/admin/docs/ai/do-not.md)、[acceptance.md](../../archetypes/admin/docs/ai/acceptance.md) |

## 场景包（bootstrap 用）

见 `docs/ai/scenarios.catalog.json`：

- `ops-console`：运营中后台
- `saas-admin`：通用 SaaS 管理端
- `agent-desktop`：Agent 工作台（L1 web 可运行 + L2 desktop-host-ready）

布局/模块差异靠 scenario pack，不维护多套模板分叉。

## 共同约束

1. **技术栈**：Vite + React 19 + TypeScript + Tailwind CSS 4 + shadcn **Base UI** + TanStack  
2. **四层模型**：Kernel / Patterns / App Config / Features  
3. **页面三件套**：feature + route + nav（如需）  
4. **Base UI**：`render`；禁止 `asChild` 与 `@radix-ui/*` 回潮  
5. **列表**：必须 data-table pattern  
6. **布局差异**：preferences / scenario shell，不 fork layout  
7. **中文优先**  
8. **Desktop**：当前 L1+L2；可后续接 Electron/Tauri，但第一期不实现完整 host  
9. **CLI 名**：`uilab-admin`（确定性动作）
   - shipped：`check` / `add` / `set-shell`
   - shipped：`init` / `apply-scenario`（CLI-2）
   - 未实现命令不得假装已执行  
10. **弱连接 UI Lab**，不绑 Create/Package 主链路

## Skill vs CLI

- Skill：场景判断、确认卡、编排、解释、review
- CLI：`init` / `apply-scenario` / `add` / `set-shell` / `check` 等确定性落盘

CLI 合同：[docs/ai/cli.md](../../archetypes/admin/docs/ai/cli.md)

## 完成边界

- `bootstrap`：场景确认 + 新应用落盘（或明确 manual fallback）+ APP_BRIEF + 可运行说明
- `discover`：地图与推荐；不改代码
- `scaffold`：按 pattern 落地并 typecheck/build
- `shell`：只改 config/nav defaults
- `review`：仅 `Pass` / `Block` / `Insufficient evidence`

## 输出习惯

- 先说 mode + route
- 改代码前列出路径或 CLI 命令
- 区分 shipped vs planned
- mutating 后给验收命令与 residual risks
