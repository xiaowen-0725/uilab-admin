# Desktop Host — 最小 Electron（Spec-α）

本目录实现 Agent Workbench 的 **最小 Electron Desktop Host**：系统目录对话框、Projects Home、在 Home 下建子目录、以及以当前 Project 根启动/停止本机 VoltAgent 侧车。

诚实边界：

- **dev-mode 即可验收**，没有安装器、自动更新或签名公证
- 本机侧车 ≠ 多租户生产 Runtime
- Tauri 不在本切片

## 启动

先确保 Workbench 依赖已安装。然后：

```bash
pnpm --filter @uilab/agent-workbench dev:desktop
```

脚本会：

1. **先从源码**编译 `main.ts` / `preload.ts` 到 `desktop/electron/dist/`（`dist/` 不入库，禁止当真源）
2. 启动 Vite（`http://localhost:5174`），除非设置 `WORKBENCH_ELECTRON_SPAWN_VITE=0`
3. 打开 Electron 窗口并经 `window.__workbenchHost` 暴露 HostPort

不要直接 `electron desktop/electron/dist/main.js`。旧 `dist/` 会和当前 preload / 窗口 chrome 脱节（系统标题栏、`onBoardRefreshWake` 白屏都是这条路）。编译失败要修 `dev:desktop`，不要绕开。

侧车由 Host 在选中带根 Project 后 spawn（`WORKSPACE_ROOT=<root> PORT=3141`），健康检查 `GET /workspace/info`。需要侧车 `.env` 中的模型密钥。

## 约束

- Renderer（`src/` / `tests/`）**禁止** import `electron` 或 Node built-ins
- IPC 通道名与 `WorkbenchHostBridge` 形状在 `src/modules/project/ports/host-wire.ts`（无 React）；main/preload 与 Renderer 共用，禁止各写一份
- 纯逻辑（路径规范化、唯一目录名、Projects Home 解析）在 `src/modules/project/application/local-root-path.ts`，由浏览器单测覆盖
- 真实系统弹窗路径不在 CI 跑，标记为桌面手动验收
