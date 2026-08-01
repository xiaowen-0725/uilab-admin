---
name: uilab-admin
description: "uilab-admin 的单入口 model-invoked router：基于本中后台模板发现 pattern、scaffold 页面、调整 shell 默认与导航、只读 review。Use when building, extending, or reviewing apps forked from uilab-admin (Vite + React 19 + TS + Tailwind 4 + shadcn Base UI + TanStack), especially data-table lists, settings sections, auth pages, sidebar/nav, or layout preferences."
---

# uilab-admin

把本仓库当作 **AI-first 通用中后台装配模板**，不是一次性 demo。

每轮只进入 **一条** 互斥路线；做完或遇到门禁后再重新路由。  
硬规则以仓库根 [AGENTS.md](../../AGENTS.md) 为准；冲突时以 AGENTS.md 为准。

## 先路由

| 用户意图 | 路线 | 是否可改代码 | 行动前完整读取 |
|---|---|---:|---|
| 了解仓库结构、pattern、可落点、可删示例 | `discover` | 否 | [discover.md](references/discover.md)、[map.md](../../docs/ai/map.md)、[patterns.catalog.json](../../docs/ai/patterns.catalog.json) |
| 新增列表页 / 设置分段 / 认证页（或按 pattern 加页面） | `scaffold` | 是 | [scaffold.md](references/scaffold.md)、对应 `docs/ai/patterns/*.md`、[do-not.md](../../docs/ai/do-not.md)、[acceptance.md](../../docs/ai/acceptance.md) |
| 改默认布局、主题、侧栏样式、导航 IA、项目 defaults | `shell` | 是 | [shell.md](references/shell.md)、[admin-preferences.ts](../../src/config/admin-preferences.ts)、[sidebar-data.ts](../../src/components/layout/data/sidebar-data.ts) |
| 检查是否合规、是否回潮、是否缺 route/sidebar | `review` | 否 | [review.md](references/review.md)、[do-not.md](../../docs/ai/do-not.md)、[acceptance.md](../../docs/ai/acceptance.md) |

不确定时默认 `discover`。用户明确说“加一个 xxx 列表/设置页”再进 `scaffold`。

## 共同约束

1. **技术栈固定**  
   Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn **Base UI / base-nova** + TanStack Router / Query / Table。

2. **四层模型**  
   - Kernel：`src/components/ui|layout|data-table`、`src/context`（默认只读消费）  
   - Patterns：`docs/ai/patterns/*`  
   - App Config：`src/config/admin-preferences.ts`、`sidebar-data.ts`  
   - Features：`src/features/<domain>`（业务主写区）

3. **新页面三件套**  
   feature + route +（如需导航）sidebar 注册。route 薄、feature 厚。

4. **Base UI**  
   - 用 `render={...}`，禁止 `asChild`  
   - 禁止重新引入 `@radix-ui/*`  
   - 组件复用：pattern 参考 → `components/ui` → 才 bespoke

5. **列表页**  
   必须复用 `src/components/data-table/*` 与 tasks 模式；禁止裸 `Select` 充当主筛选 UX。

6. **布局差异**  
   走 preferences / Theme Settings 导出，不要分叉整套 layout。

7. **中文优先**  
   用户可见文案中文；标识符英文。

8. **与 UI Lab**  
   弱连接。不绑 UI Lab runtime / Design Package / Create 主链路。

## 完成边界

- `discover`：给出地图、推荐 pattern、建议落点与可删示例；不改代码。
- `scaffold`：按 pattern 落地 feature + route + 注册；跑 `pnpm typecheck` 与 `pnpm build`；中文主文案可用。
- `shell`：只改 config / sidebar / provider defaults；说明 runtime cookie 与项目默认的边界。
- `review`：只输出 `Pass` / `Block` / `Insufficient evidence`；`Pass` 不等于产品批准。

## 输出习惯

- 先说走了哪条 route，以及为何  
- 改代码前列出将触碰的路径  
- 结束后给验收命令与 residual risks  
- 不要声称“已完成”却没跑 typecheck/build（mutating 路线）
