# Scenario: agent-desktop

Agent 工作台（类似 Codex 桌面端的信息架构方向）。

## 适合

- Agent 会话/线程
- 主工作区画布
- 本地或桌面宿主设置

## 成熟度

- **L1**：Vite web 可运行的工作台构成
- **L2**：`desktop/` host-ready 说明与边界，便于后续接 Electron / Tauri
- **非目标（第一期）**：完整桌面安装包、自动更新、原生菜单实现

## 默认构成

- Shell：`sidebar + full + system`（内容区优先）
- 必装：workspace、thread-list、settings、errors
- 推荐：command palette、appearance
- 认证：可选（很多桌面 Agent 先本地/无登录）

## 模块含义（逻辑，不必一次全实现同名目录）

| 模块 | 含义 | 第一期落点建议 |
|---|---|---|
| workspace | 主画布/会话工作区 | `src/features/workspace`（init 后首页 `/`） |
| thread-list | 会话/任务线程列表 | `data-table-list` 或侧栏列表 pattern |
| settings | 模型/快捷键/外观 | `settings-section` |
| errors | 失败边界 | 现有 errors feature |

## Desktop 边界

```text
src/                 # renderer / app UI（框架无关）
desktop/             # host 层（Electron/Tauri 后续住这里）
desktop/README.md    # 接入合同
```

约束：

- feature 不直接 import `electron` / `@tauri-apps/*`
- 需要原生能力时走 bridge 接口（后续再加）
- 换 host 不应要求重写列表/设置 pattern

## 裁剪建议

- 去掉过重 SaaS dashboard demo
- 去掉多余 auth 变体与 Clerk 痕迹
- 导航文案偏“工作区/会话”，不是“客户/订单”

## Bootstrap 时 CLI 会做的事

- seed `threads` 列表
- 把首页 `/` 切到 `Workspace`
- 侧栏偏“工作区 / 会话列表”
- 保留 `desktop/README.md` L2 边界

## Extend 常见下一步

1. 用 `data-table-list` 做 threads/tasks
2. 加 settings：模型提供方、快捷键、外观
3. 再考虑 desktop host 接入（Electron/Tauri）
