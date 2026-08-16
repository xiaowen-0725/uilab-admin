# Agent Workbench（`@uilab/agent-workbench`）

桌面优先的 Agent Workbench Archetype：Workbench Shell + **Project / Task 目录** + 本机 **VoltAgent 侧车** Runtime 投影。独立于 Admin Console，不共享 UniversalShell。

本机侧车 ≠ 远程生产集群。最小 Electron（Spec-α）≠ 安装器 / 自动更新 / 签名。

## 当前状态（shipped vs planned）

| 能力 | 状态 |
| --- | --- |
| Workbench Shell + Navigator + inset / pane chrome | **shipped** |
| Project / Task 目录（产品默认 IndexedDB） | **shipped** |
| 本机 VoltAgent Runtime → Timeline 投影（ADR-0018） | **shipped**（需侧车；无侧车时报错事实，不装 Fake） |
| Permission Preset + Approval Dock | **shipped**（帮我批准 / 完全访问） |
| Question Request（`ask_user_question`） | **shipped**（Timeline 内联卡片；`provideRunInput` 已转正；Preset 不得自动作答） |
| Plan 只读投影（Context + Timeline） | **shipped**（需侧车 `update_plan`） |
| Work Surface Host + Document / Browser | **shipped**（点文件 / URL 打开；无 Artifact 目录） |
| Capability Surface（连接器 / 技能 / 专家） | **shipped**（打开 / 状态 / 选用；OAuth 产品化未做） |
| 最小 Electron Desktop Host（Spec-α） | **shipped**（`dev:desktop`；无安装器） |
| Board（看板 / 小组件 / 取数作业） | **planned**（设计已全部定案，见 [workbench-board-spec](../../docs/plans/workbench-board-spec.md)；首版不含定时调度，实施排在事件协议 v2 之后） |
| Review / Terminal / 可编辑 Editor / Spreadsheet | **planned** |
| Artifact 实体目录、steer、Runtime retry | **planned** |
| `uilab-admin init` 生成 Workbench | **planned**（Phase 8） |
| Tauri / 安装器 / 自动更新 / 签名 | **not started** |

## 快速开始

在仓库根：

```bash
pnpm install
pnpm dev:workbench              # Web（无 Host：打开文件夹禁用，默认项目夹具）
pnpm dev:workbench-desktop      # 桌面优先验收（Spec-α Electron）
pnpm dev:workbench-runtime      # 仅侧车；桌面路径通常由 Host 按项目根 spawn
```

包级：

```bash
pnpm --filter @uilab/agent-workbench dev
pnpm --filter @uilab/agent-workbench dev:desktop
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
```

- Web Dev：`http://localhost:5174/`
- Preview：`pnpm preview:workbench`（根）或包内 `preview`（4174）
- 桌面：见 [`desktop/electron/README.md`](./desktop/electron/README.md)
- 本轮验收清单：[`docs/plans/workbench-acceptance-round-2026-08-14.md`](../../docs/plans/workbench-acceptance-round-2026-08-14.md)

## 空间模型（Phase 3A + 3B）

```text
Sidebar background plane
├── Navigator（宽屏 reserved 272px；中/窄 overlay）
└── Inset Workspace（前景平面）
    └── Workbench Stage
        ├── Task pane
        │   ├── 44px Task toolbar（compat testid workspace-top-bar）
        │   └── Task Surface（content-only：execution · Composer · Context）
        └── Work pane（Work Surface Host）
            ├── 44px tab toolbar + maximize/close icons
            └── Document / Browser（或空态）
```

- 根背景为 `sidebar` plane；Workspace 为唯一前景平面（desktop/medium：8px inset、12px radius、border/shadow；narrow full-bleed）。
- 新 Task 默认 **Task-only**。
- Context / Work Surface 显隐、宽度、活动 tab、最大化 **按 Task 保存**。
- Context Panel：宽 Task 用 reserved-space，窄 Task 用 overlay（CSS container query）；卡片按内容高度/最大高度，不默认满高。
- Navigator pointer 切换：180ms `cubic-bezier(0.32, 0.72, 0, 1)`；键盘 `Ctrl/Cmd+B` 瞬时；动效源在 Shell，不进 Session。
- **Phase 3B**：pointer Work 使用右锚定 reserved-space drawer，右边界固定、内容不缩放；open 200ms drawer curve、close 160ms strong ease-out、maximize/restore 180ms strong ease-in-out；keyboard Work / Escape / Context 为 instant；Context pointer 打开 140ms opacity+translateY entry。Task toolbar 使用 `SlidersHorizontal`（Context）与 `PanelBottom`（Work）语义图标。

## 快捷键

| 快捷键             | 行为                                   |
| ------------------ | -------------------------------------- |
| `Ctrl/Cmd+B`       | 切换 Navigator（瞬时，无动画）         |
| `Ctrl/Cmd+I`       | 切换 Context Panel（瞬时）             |
| `Ctrl/Cmd+Shift+W` | 切换 Work Surface Host（瞬时）         |
| `Escape`           | 退出 Work Surface 最大化（优先，瞬时） |

## UI 栈（shadcn Base UI）

与 Admin / 平台统一：

- `components.json` — 官方 shadcn **base-nova**
- `@/components/ui/*` — 按需安装的 shadcn 组件；Button / Input 为 Foundation 兼容 re-export
- `@/lib/utils` — `cn`（`clsx` + `tailwind-merge`）
- 样式：`shadcn/tailwind.css` + `tw-animate-css` + Archetype `tokens.css`

## Foundation

Button / Input / tokens 经兼容层消费（实现仍在 `@uilab/foundation`）：

- `@/components/ui/button` → `@uilab/foundation/ui/button`
- `@/components/ui/input` → `@uilab/foundation/ui/input`
- `src/styles/tokens.css` → `@uilab/foundation/styles/tokens.css`

图标：Workbench 包自有 `lucide-react`（不扩 Foundation）。
Composer 使用 `@/components/ui/textarea`（shadcn）；Foundation 仍仅公开 Button / Input / tokens。

## 相关文档

- 平台合同：仓库根 [`AGENTS.md`](../../AGENTS.md)
- 本应用合同：[`AGENTS.md`](./AGENTS.md)、[`APP_BRIEF.md`](./APP_BRIEF.md)
- 本轮验收：[`docs/plans/workbench-acceptance-round-2026-08-14.md`](../../docs/plans/workbench-acceptance-round-2026-08-14.md)
- 模块布局：[`docs/architecture/agent-workbench-module-layout.md`](../../docs/architecture/agent-workbench-module-layout.md)
- 路线图：[`docs/plans/agent-workbench-template-roadmap.md`](../../docs/plans/agent-workbench-template-roadmap.md)
- Phase 3A work order：[`docs/plans/phase-3a-workbench-inset-layout-polish-work-order.md`](../../docs/plans/phase-3a-workbench-inset-layout-polish-work-order.md)
- Phase 3A evidence：[`docs/evidence/phase-3a-workbench-inset-layout-polish.md`](../../docs/evidence/phase-3a-workbench-inset-layout-polish.md)
- Phase 3B work order：[`docs/plans/phase-3b-codex-pane-chrome-motion-work-order.md`](../../docs/plans/phase-3b-codex-pane-chrome-motion-work-order.md)
- Phase 3B evidence：[`docs/evidence/phase-3b-codex-pane-chrome-motion.md`](../../docs/evidence/phase-3b-codex-pane-chrome-motion.md)
