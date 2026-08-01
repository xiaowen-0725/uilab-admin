# AGENT_BRIEF — uilab-admin

## 定位

通用中后台模板。学 shadcn-admin 的完整壳与页面模式，而不是手搓近似版。

## 当前阶段（方案 A）

1. ✅ 整仓拷贝 shadcn-admin 底稿
2. ✅ 删除 Clerk / apps / chats / users 等过重 demo
3. ✅ 保留 dashboard / tasks / settings / auth / errors / theme settings
4. ⏳ 下一步：组件底座迁官方 shadcn Base UI
5. ⏳ 中文优先文案系统化

## 硬规则

- 不要再把关键交互简化成 Select / 自造布局设置
- data-table 以 `src/components/data-table/*` 为准
- shell 以 `src/components/layout/*` + `src/context/*` 为准
- 新增页面：feature 厚、route 薄
- 与 UI Lab 弱连接，不引入 UI Lab runtime

## 可删示例

- `src/features/tasks/*` mock 数据
- `src/features/dashboard/*` 假指标
- auth 多变体中不需要的页面
- settings 子页中不需要的项

## 新页面落点

| 事项 | 路径 |
| --- | --- |
| 新后台页 | `src/features/<name>` + `src/routes/_authenticated/<name>` |
| 导航 | `src/components/layout/data/sidebar-data.ts` |
| 表格模式 | 复用 `src/components/data-table/*` |
| 布局默认 | `src/config/admin-preferences.ts` + providers |

## 验收

- `pnpm install && pnpm dev`
- `pnpm build`
- Theme Settings 动效/布局切换可用
- Tasks faceted filter 可用
- 无 Clerk 依赖
