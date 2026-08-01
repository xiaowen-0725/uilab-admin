# Agent Workbench（`@uilab/agent-workbench`）

生产级 Agent Workbench Archetype 的 **Phase 3 静态 Shell 骨架**。
独立于 Admin Console，不共享 UniversalShell。

## 当前状态（shipped vs planned）

| 能力 | 状态 |
|---|---|
| Workbench Shell + Navigator | **shipped**（Phase 3） |
| Task Surface + Composer + Adaptive Context Panel | **shipped**（静态 fixture） |
| Work Surface Host（Single-pane + Tabs，显隐/调宽/最大化） | **shipped**（占位内容） |
| Agent Runtime / 流式投影 | **planned**（Phase 4） |
| Surface Registry | **planned**（Phase 5） |
| Document / Browser / Review Surfaces | **planned**（Phase 6） |
| `uilab-admin init` 生成 Workbench | **planned**（Phase 8） |
| Electron / Tauri desktop host | **not started** |

## 快速开始

在仓库根：

```bash
pnpm install
pnpm dev:workbench
```

包级：

```bash
pnpm --filter @uilab/agent-workbench dev
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
```

- Dev：`http://localhost:5174/`
- Preview：`pnpm preview:workbench`（根）或包内 `preview`（4174）

## 空间模型

```text
Workbench Shell
├── Navigator
└── Workbench Stage
    ├── Task Surface（execution fixture · Composer · Context Panel）
    └── Work Surface Host（placeholder tabs）
```

- 新 Task 默认 **Task-only**。
- Context / Work Surface 显隐、宽度、活动 tab、最大化 **按 Task 保存**。
- Context Panel：宽 Task 用 reserved-space，窄 Task 用 overlay（CSS container query）；视觉均为浮动卡片。

## 快捷键

| 快捷键 | 行为 |
|---|---|
| `Ctrl/Cmd+B` | 切换 Navigator |
| `Ctrl/Cmd+I` | 切换 Context Panel |
| `Ctrl/Cmd+Shift+W` | 切换 Work Surface Host |
| `Escape` | 退出 Work Surface 最大化（优先） |

## Foundation

通过公开子路径消费：

- `@uilab/foundation/ui/button`
- `@uilab/foundation/ui/input`
- `@uilab/foundation/styles/tokens.css`

不扩 Foundation 出口。Composer 使用原生 `textarea`（Foundation 尚无 textarea Interface）。

## 相关文档

- 平台合同：仓库根 [`AGENTS.md`](../../AGENTS.md)
- 本应用合同：[`AGENTS.md`](./AGENTS.md)、[`APP_BRIEF.md`](./APP_BRIEF.md)
- 模块布局：[`docs/architecture/agent-workbench-module-layout.md`](../../docs/architecture/agent-workbench-module-layout.md)
- 路线图 Phase 3：[`docs/plans/agent-workbench-template-roadmap.md`](../../docs/plans/agent-workbench-template-roadmap.md)
