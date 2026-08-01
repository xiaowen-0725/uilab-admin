# UI Lab Admin

通用中后台项目模板，基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin) 二创。

目标：保留成熟 admin shell / 页面模式 / data-table 交互，做成可直接开新项目的模板；与 UI Lab 弱连接，不绑定其 runtime。

## 当前状态

- 界面主路径已中文优先（侧栏/Dashboard/Tasks/Settings/Auth/错误页/Theme Settings）
- 代码标识保持英文

- 底稿：完整迁入 shadcn-admin 的 shell、theme settings、dashboard、tasks、settings、auth、errors
- 已删除：Clerk 整支、apps / chats / users 等过重 demo
- 组件底座：当前仍为参考仓库的 Radix shadcn（下一步切官方 Base UI）
- 增强：Theme Settings 支持导出 project defaults（JSON / code / agent prompt）

## 快速开始

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
pnpm typecheck
```

## 第一期页面

- `/` Dashboard
- `/tasks` Data Table List（完整 faceted filter / toolbar）
- `/settings/*` Settings
- `/sign-in` `/sign-up` 等 Auth 模式
- 错误页

## 目录约定

```text
src/
  components/layout/     # app shell
  components/data-table/ # 表格工具栏/筛选/分页模式
  features/              # 页面实现
  routes/                # TanStack Router 薄路由
  context/               # theme / layout / direction providers
  config/admin-preferences.ts  # 项目默认布局导出真源
```

## 布局设置

header 右侧 Theme Settings 可切换：

- Theme
- Sidebar（inset / floating / sidebar）
- Layout（default / compact / full）
- Direction（ltr / rtl）

运行时偏好走 cookie。若要固化到新应用，用设置面板底部 Export。

## 与 UI Lab 关系

独立仓库，弱连接。第一期不接 Create 导出 / Design Package 主链路。

## License

本仓库在 shadcn-admin（MIT）基础上二创，见 `LICENSE`。
