# Pattern: auth-page

认证相关页面。

## 参考实现

- `src/features/auth/*`
- routes: `src/routes/(auth)/*`

## 何时用

- 登录 / 注册 / 忘记密码 / OTP
- 自定义认证落地页

## 标准落点

```text
src/features/auth/<flow>/
  index.tsx
  components/*-form.tsx
src/routes/(auth)/<flow>.tsx
```

## 必须复用

- `features/auth/auth-layout`
- Card + Form 模式
- 既有 input/password 组件

## 禁止

- 强绑 Clerk 或其他 SaaS auth（除非用户明确要求）
- 把认证页塞进 `_authenticated` 布局

## 验收

- 未登录布局正确（无后台 sidebar）
- 表单校验与提交反馈可用
- 中文主文案
- typecheck + build
