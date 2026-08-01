# AGENT_BRIEF — uilab-admin

给 Agent / 协作者的项目简报。

## 项目定位

`uilab-admin` 是**通用中后台模板**，目标是让新项目直接复用：

- App shell（sidebar + header + theme）
- 文件路由骨架
- Dashboard / Data Table / Settings / Auth 页面模式

它不是某个具体业务系统，也不依赖 UI Lab 运行时。

## 技术决策（已锁定）

- Vite + React 19 + TypeScript
- 官方 shadcn/ui，Base UI 底座（`base-nova`）
- TanStack Router / Query / Table
- 中文优先文案，代码标识英文
- 独立仓库：`xiaowen-0725/uilab-admin`

## 目录落点

| 你要做的事 | 放哪里 |
| --- | --- |
| 新后台页面 | `src/features/<feature>/` + `src/routes/_authenticated/<feature>/` |
| 新登录/注册变体 | `src/features/auth/` + `src/routes/(auth)/` |
| 新错误页 | `src/features/errors/` + `src/routes/(errors)/` |
| 导航菜单 | `src/components/layout/data/sidebar-data.ts` |
| 壳层布局 | `src/components/layout/*` |
| shadcn 原子组件 | `src/components/ui/*`（优先 CLI 生成） |

## 可删示例

第一期示例均可删，不影响模板结构：

- `src/features/dashboard/*` 指标卡片与假数据
- `src/features/tasks/*` 任务表 mock
- `src/features/settings/*` 表单示例
- `src/features/auth/*` 演示登录/注册
- 侧边栏中对应菜单项

删除后请同步：

1. 对应 `src/routes/**`
2. `sidebar-data.ts`
3. README 页面清单

## 新页面推荐模式

1. 在 `features/<name>/index.tsx` 实现页面。
2. 在 `routes/_authenticated/<name>/index.tsx` 挂路由：

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { MyPage } from "@/features/my-page"

export const Route = createFileRoute("/_authenticated/my-page/")({
  component: MyPage,
})
```

3. 页面内复用：

```tsx
<>
  <Header fixed>...</Header>
  <Main>...</Main>
</>
```

4. 把入口加到 `sidebar-data.ts`。

## 明确不做（第一期）

- 不塞进 UI Lab monorepo
- 不接 UI Lab Create 导出 / Design Package 主链路
- 不绑定 Clerk 或其它强制 Auth SaaS
- 不追求“从 UI Lab 一键生成该模板”

## 验收清单

- [ ] `pnpm install && pnpm dev` 可运行
- [ ] `pnpm build` 通过
- [ ] 中文界面可用
- [ ] Dashboard / Tasks / Settings / Auth 可访问
- [ ] 不依赖 UI Lab 运行时

## 给执行 Agent 的约束

- 学 shadcn-admin 的结构与模式，不要整包搬 Radix 组件实现
- Base UI 组件组合优先使用 `render={...}`，不要假设 Radix 的 `asChild`
- 小步提交，保持路由薄、feature 厚
- 改完至少跑 `pnpm typecheck` 与 `pnpm build`
