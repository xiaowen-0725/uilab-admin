# Pattern: settings-section

设置页中的分段表单。

## 参考实现

- `src/features/settings/*`
- route group: `src/routes/_authenticated/settings/*`

## 何时用

- 个人资料 / 账户 / 外观 / 通知 / 显示
- 应用配置页、偏好页

## 标准落点

```text
src/features/settings/<section>/
  index.tsx          # ContentSection 包装
  <section>-form.tsx # 表单实现
src/routes/_authenticated/settings/<section>.tsx
src/features/settings/index.tsx 中 sidebarNavItems 注册
```

## 必须复用

- `features/settings/components/content-section`
- `features/settings/components/sidebar-nav`
- `components/ui/form` + 既有输入控件

## 禁止

- 在 settings 外另造一套设置布局还不复用 sidebar-nav
- 表单无 FormMessage / 无提交反馈

## 验收

- 侧栏可切换到该段
- 表单可提交（可先 toast mock）
- 中文标签与说明
- typecheck + build
