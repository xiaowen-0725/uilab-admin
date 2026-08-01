# Scaffold: data-table-list

把本目录文件复制到 `src/features/<domain>/`，再补 route 与 sidebar。

## 占位符

| 占位符 | 示例 |
|---|---|
| `__domain__` | `orders` |
| `__Domain__` | `Orders` |
| `__DOMAIN_TITLE__` | `订单列表` |
| `__DOMAIN_DESC__` | `管理订单状态、优先级与检索。` |
| `__DomainItem__` | `Order` |
| `__domainItem__` | `order` |

## 落点

```text
src/features/__domain__/
  index.tsx
  components/__domain__-table.tsx
  components/__domain__-columns.tsx
  data/schema.ts
  data/data.ts
src/routes/_authenticated/__domain__/index.tsx
src/components/layout/data/sidebar-data.ts  # 注册
```

## 完成后

1. 按真实字段改 schema / columns / filters
2. mock 换成 API / query
3. `pnpm typecheck && pnpm build`
