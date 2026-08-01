# Desktop Host (L2 readiness)

本目录是 **desktop host 扩展点**，不是已实现的 Electron/Tauri 应用。

当前模板默认可运行面仍是 Vite web（`pnpm dev`）。  
选择 `agent-desktop` 等 scenario 时，表示应用在信息架构上按工作台组织，并保留后续接入桌面宿主的边界。

## 分层

```text
src/                 # renderer / app UI（路由、feature、shell、preferences）
desktop/             # native host（窗口、菜单、深链、自动更新、系统能力）
bridge (planned)     # src 与 host 之间的 IPC/类型契约
```

## 硬约束

1. `src/` 内 feature **不要**直接依赖 `electron` / `@tauri-apps/*`
2. 换 host（Electron ↔ Tauri）不应要求重写 data-table / settings 等 pattern
3. 需要原生能力时，经 bridge 接口；第一期可先不实现，只保留此合同
4. 不要为了桌面端分叉整套 `src/components/layout`

## 后续接入清单（planned）

### Electron 方向（示例）

- `desktop/electron/main.ts` — BrowserWindow / 生命周期
- `desktop/electron/preload.ts` — 安全暴露 API
- `src/lib/desktop-bridge.ts` — renderer 侧类型与调用

### Tauri 方向（示例）

- `desktop/tauri/` — Tauri 配置与 Rust 命令
- 同样经 bridge 供 `src/` 调用

## 什么时候算进入实现

只有当出现真实 host 入口、可启动的 desktop dev 命令、以及 bridge 类型时，才能宣称 desktop host shipped。  
在此之前：

- 可以说 **desktop-host-ready（L2）**
- 不可以说 **已支持 Electron/Tauri 产品化**

## 与 scenario 的关系

见 `docs/ai/scenarios/agent-desktop.md` 与 `docs/ai/bootstrap.md`。
