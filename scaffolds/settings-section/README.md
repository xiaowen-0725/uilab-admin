# Scaffold: settings-section

复制到 `src/features/settings/<section>/`，并补 route + settings 侧栏注册。

## 占位符

| 占位符 | 示例 |
|---|---|
| `__section__` | `billing` |
| `__Section__` | `Billing` |
| `__SECTION_TITLE__` | `账单` |
| `__SECTION_DESC__` | `管理账单联系人与发票偏好。` |

## 落点

```text
src/features/settings/__section__/
  index.tsx
  __section__-form.tsx
src/routes/_authenticated/settings/__section__.tsx
src/features/settings/index.tsx  # sidebarNavItems
```
