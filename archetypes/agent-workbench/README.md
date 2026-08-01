# Agent Workbench（`@uilab/agent-workbench`）

生产级 Agent Workbench Archetype 的 **Phase 3 静态 Shell 骨架**，含 **Phase 3A inset 布局打磨**。
独立于 Admin Console，不共享 UniversalShell。

## 当前状态（shipped vs planned）

| 能力 | 状态 |
|---|---|
| Workbench Shell + Navigator | **shipped**（Phase 3） |
| Inset Workspace 空间模型 + 合并顶栏 + Navigator 动效 | **shipped**（Phase 3A layout polish） |
| Task Surface + Composer + Adaptive Context Panel | **shipped**（静态 fixture） |
| Work Surface Host（Single-pane + Tabs，显隐/调宽/最大化） | **shipped**（占位内容） |
| Agent Runtime / 流式投影 | **planned**（Phase 4，当前暂停） |
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

## 空间模型（Phase 3A）

```text
Sidebar background plane
├── Navigator（宽屏 reserved 272px；中/窄 overlay）
└── Inset Workspace（前景平面）
    ├── 单一 task-aware top bar
    └── Workbench Stage
        ├── Task Surface（content-only：execution · Composer · Context）
        └── Work Surface Host（placeholder tabs）
```

- 根背景为 `sidebar` plane；Workspace 为唯一前景平面（desktop/medium：8px inset、12px radius、border/shadow；narrow full-bleed）。
- 新 Task 默认 **Task-only**。
- Context / Work Surface 显隐、宽度、活动 tab、最大化 **按 Task 保存**。
- Context Panel：宽 Task 用 reserved-space，窄 Task 用 overlay（CSS container query）；卡片按内容高度/最大高度，不默认满高。
- Navigator pointer 切换：180ms `cubic-bezier(0.32, 0.72, 0, 1)`；键盘 `Ctrl/Cmd+B` 瞬时；动效源在 Shell，不进 Session。

## 快捷键

| 快捷键 | 行为 |
|---|---|
| `Ctrl/Cmd+B` | 切换 Navigator（瞬时，无动画） |
| `Ctrl/Cmd+I` | 切换 Context Panel |
| `Ctrl/Cmd+Shift+W` | 切换 Work Surface Host |
| `Escape` | 退出 Work Surface 最大化（优先） |

## Foundation

通过公开子路径消费：

- `@uilab/foundation/ui/button`
- `@uilab/foundation/ui/input`
- `@uilab/foundation/styles/tokens.css`

图标：Workbench 包自有 `lucide-react`（不扩 Foundation）。
Composer 使用原生 `textarea`（Foundation 尚无 textarea Interface）。

## 相关文档

- 平台合同：仓库根 [`AGENTS.md`](../../AGENTS.md)
- 本应用合同：[`AGENTS.md`](./AGENTS.md)、[`APP_BRIEF.md`](./APP_BRIEF.md)
- 模块布局：[`docs/architecture/agent-workbench-module-layout.md`](../../docs/architecture/agent-workbench-module-layout.md)
- 路线图：[`docs/plans/agent-workbench-template-roadmap.md`](../../docs/plans/agent-workbench-template-roadmap.md)
- Phase 3A work order：[`docs/plans/phase-3a-workbench-inset-layout-polish-work-order.md`](../../docs/plans/phase-3a-workbench-inset-layout-polish-work-order.md)
- Phase 3A evidence：[`docs/evidence/phase-3a-workbench-inset-layout-polish.md`](../../docs/evidence/phase-3a-workbench-inset-layout-polish.md)
