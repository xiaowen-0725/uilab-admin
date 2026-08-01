# Route: scaffold

按 pattern 新增页面。可改代码。

## 行动前

1. 确认 pattern（只选一个）：
   - `data-table-list`
   - `settings-section`
   - `auth-page`（可选，优先仿现有 auth feature）
2. 完整阅读对应 `docs/ai/patterns/<id>.md`
3. 阅读 [do-not.md](../../../docs/ai/do-not.md) 与 [acceptance.md](../../../docs/ai/acceptance.md)
4. 需要模板时，优先复制：
   - `scaffolds/data-table-list/*`
   - `scaffolds/settings-section/*`
   再对照 `src/features/tasks` / `src/features/settings/*` 补全细节

## 通用步骤

1. 定 domain / section 英文 slug（路由与目录用）
2. 写 feature（厚）
3. 写 route（薄）
4. 注册导航：
   - 列表/普通页 → `src/components/layout/data/sidebar-data.ts`
   - 设置分段 → `src/features/settings/index.tsx` 的 `sidebarNavItems`
5. 中文主文案
6. 跑验收：

```bash
pnpm typecheck
pnpm build
```

## data-table-list

### 必建

```text
src/features/<domain>/
  index.tsx
  components/<domain>-table.tsx
  components/<domain>-columns.tsx
  data/schema.ts
  data/data.ts            # 或接 API 的 query 层
src/routes/_authenticated/<domain>/index.tsx
sidebar-data.ts 条目
```

### 可选

- provider / dialogs / primary-buttons / row-actions / bulk-actions
- URL search state（参考 tasks 的 `validateSearch` + `useTableUrlState`）

### 硬要求

- 使用 `src/components/data-table/*`
- 使用 TanStack Table
- Header + Main 壳层与 tasks 一致
- 不要用两个裸 Select 当主筛选

### 替换清单（从 scaffold 复制后）

- `__domain__` → `orders` 等
- `__Domain__` → `Orders`
- `__DOMAIN_TITLE__` → `订单列表`
- `__DOMAIN_DESC__` → 中文描述
- route path / sidebar title / icon

## settings-section

### 必建

```text
src/features/settings/<section>/
  index.tsx
  <section>-form.tsx
src/routes/_authenticated/settings/<section>.tsx
src/features/settings/index.tsx 中 sidebarNavItems
```

### 硬要求

- 复用 `ContentSection` + settings `sidebar-nav`
- react-hook-form + zod + `components/ui/form`
- 提交可先 `showSubmittedData` / toast mock
- 中文 label / description / message

## auth-page

### 必建

```text
src/features/auth/<flow>/...
src/routes/(auth)/<flow>.tsx
```

### 硬要求

- 放在 `(auth)` 组，不进 `_authenticated` shell
- 复用 auth-layout 与既有 form 控件
- 不默认绑定 Clerk

## 完成输出

```md
## Scaffold

### Pattern
...

### 变更文件
- ...

### 导航注册
- ...

### 验收
- pnpm typecheck: pass/fail
- pnpm build: pass/fail

### 后续可替换
- mock data / API adapter
```
