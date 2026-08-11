# Capability Surface 视觉回归矩阵

本目录固化 Capability Surface 的可复现交付基线（#56）。所有截图基于确定性 fixture（`fixed-state-snapshots.ts`），不依赖真实 sidecar 或远程服务。

## 固定状态矩阵

| 状态 | 截图基线 | 飞书 connector | GitHub connector | 视觉特征 |
|---|---|---|---|---|
| `new-task-default` | `baselines/add-menu-new-task-default.png` | connected, 未选中 | missing | 飞书 checkbox 未勾选；GitHub 显示「连接」 |
| `disconnected` | `baselines/add-menu-disconnected.png` | missing | missing | 两个 connector 都显示「连接」动作 |
| `connected-not-enabled` | `baselines/add-menu-connected-not-enabled.png` | connected, 未选中 | connected, 未选中 | checkbox `aria-checked="false"` |
| `connected-enabled` | `baselines/add-menu-connected-enabled.png` | connected, 已选中 | connected, 已选中 | checkbox `aria-checked="true"` + chips 可见 |
| `auth-in-progress` | `baselines/add-menu-auth-in-progress.png` | auth_in_progress | missing | 「等待授权」/「连接中」 |
| `auth-failed-recovery` | `baselines/add-menu-auth-failed-recovery.png` | expired | error | 「授权已过期」/「连接异常」 |
| `management-surface` | `baselines/management-surface.png` | connected | missing | 全局目录视图（taskId=null） |

## 运行方式

```bash
# 从仓库根目录
pnpm --filter @uilab/agent-workbench test tests/visual/

# 或从应用目录
cd archetypes/agent-workbench
pnpm test tests/visual/
```

测试会在 Vitest browser mode（chromium headless）中渲染每个状态的组件，执行 DOM 断言（防退化），并写入截图到 `baselines/`。

## 截图约定

- **一致视口**：1440×900（`vite.config.ts` browser 配置）
- **真实品牌资产**：飞书 `feishu-app-icon.png` + GitHub Octicon SVG（均入版本控制）
- **无敏感信息**：fixture 不含 token、device code、Client Secret 或用户文档内容
- **确定性时间戳**：所有 snapshot 使用固定 `generatedAt`

## 何时更新基线

- **有意变更 UI 时**（如调整布局、文案、品牌图标）：运行测试重新生成基线，人工确认截图变化符合预期后提交。
- **不要在无意变更时盲目提交**：如果截图变化是 bug 导致的，应先修复代码再更新基线。

## 文件清单

```
tests/visual/
├── README.md                              ← 本文件
├── fixed-state-snapshots.ts               ← 7 个确定性 CapabilitySnapshot fixture
├── capability-visual-matrix.test.tsx      ← 视觉矩阵测试（DOM 断言 + 截图）
├── capability-keyboard-paths.test.tsx     ← 键盘路径回归
└── baselines/                             ← 截图基线（入版本控制）
    ├── add-menu-new-task-default.png
    ├── add-menu-disconnected.png
    ├── add-menu-connected-not-enabled.png
    ├── add-menu-connected-enabled.png
    ├── add-menu-auth-in-progress.png
    ├── add-menu-auth-failed-recovery.png
    └── management-surface.png
```

> 注：`baselines/` 目录在首次运行测试时自动创建。`__screenshots__/`（Vitest 默认产物目录）被 `.gitignore` 忽略；`tests/visual/baselines/` 显式入版本控制。
