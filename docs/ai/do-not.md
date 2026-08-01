# Do Not

Agent 在本仓库中默认禁止：

1. 引入 `@radix-ui/*` 或把组件回潮到 Radix
2. 使用 `asChild`（Base UI 用 `render`）
3. 新建平行 UI 原子层（第二套 button/input/table）
4. 列表页不用 `components/data-table`，改用裸 Select 过滤
5. 只写 feature 不写 route，或只写 route 不注册 sidebar
6. 为换布局去复制/分叉整套 layout 组件（应改 preferences/profile/nav）
7. 绑定 Clerk / UI Lab runtime
8. 把用户可见文案留英文主路径（除非用户明确要求英文）
9. 把 sample mock 当成不可替换的业务真源
10. 声称完成但未跑 `pnpm typecheck` / `pnpm build`
11. 把 planned 的 `uilab-admin init` / Electron/Tauri host 说成已实现
12. 在 CLI 未落盘时声称 bootstrap 已成功创建应用
