# Pattern: data-table-list

通用中后台列表页。

## 参考实现

- `src/features/tasks/*`
- `src/components/data-table/*`
- route: `src/routes/_authenticated/tasks/index.tsx`

## 何时用

- 订单/工单/设备/用户/审计等资源列表
- 需要搜索、筛选、分页、行操作、批量操作

## 标准落点

```text
src/features/<domain>/
  index.tsx                 # 页面壳：Header + Main + table
  components/
    <domain>-table.tsx
    <domain>-columns.tsx
    <domain>-primary-buttons.tsx   # 可选
    <domain>-dialogs.tsx           # 可选
    <domain>-provider.tsx          # 可选
  data/
    schema.ts
    data.ts / data.tsx
src/routes/_authenticated/<domain>/index.tsx
sidebar-data.ts 注册
```

## 必须复用

- `Header` / `Main`
- `DataTableToolbar` / `DataTablePagination` / column header 等
- TanStack Table

## 禁止

- 用两个裸 `Select` 充当筛选主交互（除非用户明确要求极简）
- 把 API 请求直接写死在 ui 原子组件里
- 不注册 route/sidebar

## 验收

- 能打开列表
- 搜索/筛选/分页可用
- 中文主文案
- typecheck + build
