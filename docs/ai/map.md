# Repository Map

给 Agent 的仓库地图。先读这个，再改代码。

## Kernel（默认只读消费）

| 路径 | 职责 |
|---|---|
| `src/components/ui/*` | shadcn Base UI 原子组件 |
| `src/components/layout/*` | sidebar / header / main / nav |
| `src/components/data-table/*` | 表格工具栏、筛选、分页、列头 |
| `src/context/*` | theme / layout / direction / search / font |
| `src/main.tsx` | Query + Router + providers |
| `src/routes/__root.tsx` | 根错误/404 |

## App Config（应用差异）

| 路径 | 职责 |
|---|---|
| `src/config/admin-preferences.ts` | 项目默认布局 |
| `src/components/layout/data/sidebar-data.ts` | 导航 IA |
| `components.json` | shadcn 配置（base-nova） |

## Features（业务主写区）

| 路径 | 模式参考 |
|---|---|
| `src/features/dashboard` | 概览卡/图表容器 |
| `src/features/tasks` | **data-table-list** 主参考 |
| `src/features/settings` | **settings-section** 主参考 |
| `src/features/auth` | **auth-page** 主参考 |
| `src/features/errors` | 错误页 |

## Routes（薄封装）

| 路径 | 对应 |
|---|---|
| `src/routes/_authenticated/*` | 登录后后台 |
| `src/routes/(auth)/*` | 认证 |
| `src/routes/(errors)/*` | 错误 |

## AI 文档与 Skill

| 路径 | 职责 |
|---|---|
| `docs/ai/patterns/*` | 人读 pattern 说明 |
| `docs/ai/patterns.catalog.json` | 机器可读 pattern 目录 |
| `docs/ai/do-not.md` | 禁止事项 |
| `docs/ai/acceptance.md` | 验收 |
| `skill/uilab-admin` | Agent 路由 skill |

## 新页面最小落点

```text
src/features/<domain>/index.tsx
src/routes/_authenticated/<domain>/index.tsx
src/components/layout/data/sidebar-data.ts  # 如需导航
```

列表页额外通常包括：

```text
src/features/<domain>/components/*-table.tsx
src/features/<domain>/components/*-columns.tsx
src/features/<domain>/data/*
```

## Scaffolds（复制起点）

| 路径 | 用途 |
|---|---|
| `scaffolds/data-table-list` | 列表页薄模板（占位符替换） |
| `scaffolds/settings-section` | 设置分段薄模板 |

完整交互细节仍以 `src/features/tasks` / `src/features/settings/*` 为准。
