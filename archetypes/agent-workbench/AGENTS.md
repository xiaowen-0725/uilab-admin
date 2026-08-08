# AGENTS.md — Agent Workbench application

本项目是 **AI-first Agent Workbench Archetype**（Vite + React 桌面优先工作台）。
硬规则以本文件为准；平台 monorepo 合同见仓库根 `AGENTS.md`。

## 定位（Phase 3 Shell + Real Task Lifecycle + Fake/侧车 Runtime）

- **技术栈（与平台统一）**：Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn/ui（**Base UI / base-nova**）+ TanStack Router（小型 code-defined 路由）
- **UI 装配**：`components.json`（base-nova）→ `@/components/ui/*`（按需 `shadcn add`）→ UI Lab registry 复合块（如 `agent-composer`）→ `@/lib/utils`（`cn`）
- **Foundation**：Button / Input / tokens 经 `@/components/ui/button|input` 兼容 re-export；tokens 经 `src/styles/tokens.css` 导入；**不**扩 Foundation exports
- 图标：包内 `lucide-react`（不扩 Foundation）
- **体验目标（模板产品要求）**：**尽量像真 Runtime 一样可交互**。未接后端接口 ≠ 没有 Runtime 概念；本地应用状态、菜单、chip、模型/权限切换、发送反馈等应完整可用，接近真实产品。诚实边界是「数据/执行未接远程后端」，不是「UI 只可看不可用」。
- **UI Lab 双仓**：复合 Agent 交互优先装 UI Lab 组件（registry / `shadcn add`）。若发现 UI Lab 组件缺陷、交互不足或需要优化，**在 UI Lab 仓库（`ui-components`）改真源并发布/同步**，再回装到本模板；禁止长期在 Workbench 内平行 fork 一套「改进版」却不回流。

### 已交付

- **Shell**：Navigator、Task Surface、Composer、Adaptive Context Panel、Single-pane + Tabs Work Surface Host；inset layout、pane chrome/motion
- **Real Task Lifecycle（会话管理）**：
  - `modules/project`：Project 实体 + Task **目录**权威；`ProjectCatalogPort`（Memory / IndexedDB）
  - `modules/workbench-session`：仅 `selectedProjectId` + `selectedTaskId | null` + layout chrome + `lastTaskByProject`
  - 冷启动：`project-default` /「默认项目」+ **零 Task** 空壳
  - 新对话 → 目录 title「新对话」→ **Runtime** empty hub（产品默认路径）
  - 硬删 Task（目录 + events + snapshot；确认文案强调不可恢复）
  - Navigator：**仅**真目录；无 mock utility；busy = RunStatusIndex（queued|running|cancelling）
  - 统一 IndexedDB `uilab-agent-workbench`（目录 + EventStore 一 open）；测试默认 Memory
- **Runtime path（产品默认）**：Deterministic Fake Runtime 或可选 VoltAgent 侧车 → projection → Timeline
- **Phase 4B–4F Kernel**：Commands/Events、RuntimePort、VirtualClock、reasoning/tool/approval、queue/steer、长文折叠/滚动
- **Fake ≠ 生产 Runtime** — 无远程 Agent、无真实工具副作用（除非本机侧车经审批写文件）

### 可选 Local VoltAgent 侧车

`VITE_RUNTIME_ADAPTER=voltagent` + `pnpm dev:workbench-runtime`：本机 `RuntimePort` Adapter，**不是**多租户生产 Runtime；密钥与工具副作用在侧车进程。侧车 `AGENT_PROFILE=minimal|office`。

### Capture / local-sim（非产品默认）

- Capture JSON **保留**在 `config/captures`；仅 **test harness / 显式 dev** 入口使用
- 产品 boot **不**使用 `phase3SessionSeed` / 默认 capture `task-a`
- Launch cards → Runtime `promptStub`，**不** force capture 流

### 未交付（勿伪装）

- 云上多租户 Agent Runtime、Surface Registry 真实现、Document/Browser/Review
- Resource Explorer、Git 全量集成、Electron/Tauri Desktop Host
- 删除 Project 及级联、跨标签页 IDB 同步、会话导出/导入

## 目录约定

```text
src/
  app/                 # bootstrap / providers / router / composition（唯一 Composition Root）
    persistence/       # 统一 IndexedDB shell（Composition 打开一柄）
  shell/               # Workbench geometry、Navigator、responsive layout、快捷键
  modules/
    project/           # Project 实体 + Task 目录 + ProjectCatalogPort
    workbench-session/ # 选择指针 + 每 Task 布局（无 projects/tasks 数组）
    task/              # Runtime / EventStore / projection / Task Surface UI
    work-surface/      # Host + Registry + Document/Browser + WorkspaceDocumentSource
  components/ui/       # shadcn Base UI（Button/Input 为 Foundation 兼容 re-export）
  lib/                 # cn 等应用侧工具
  config/              # fixtures / captures（capture 非产品默认 boot）
  styles/              # tokens + shell CSS（含 shadcn/tailwind.css）
tests/integration/     # 浏览器集成测试
components.json        # shadcn 配置（base-nova）
```

## 硬规则

1. **Composition Root 唯一装配** — `src/app/composition` 打开 IDB、hydrate catalog、挂 Runtime controller 与 Shell。
2. **Module 边界** — 只通过 `@/modules/<name>` 根 `index.ts` 消费；禁止跨 Module 引用内部路径。
3. **禁止 dumping-ground** — 不建 `shared/`、`common/`、全局 `ports/`。
4. **Task model 禁止 Project 实体** — 仅可有 `ProjectId`；目录权威在 `modules/project`。
5. **Shell 禁止**直写 IDB / Runtime / 业务级联删除；只绑定公开 commands/views。
6. **runStatus 不进 catalog/IDB** — 仅内存 RunStatusIndex。
7. **UI 复用顺序** — Module / Shell 已有 → UI Lab 复合块 → `@/components/ui/*` → 才允许 bespoke。
8. **UI Lab 回流** — 改 UI Lab 能力时先/同步改 `ui-components` 真源。
9. **Foundation** — Button/Input 只经 `@/components/ui/*` re-export；不扩 Foundation exports。
10. **Base UI 约束** — `render={...}`；禁止 `asChild` 与 `@radix-ui/*`；禁止 Desktop/Node built-in 进入 renderer 源码。
11. **中文优先** — 用户可见文案中文；标识符英文。
12. **本地 Runtime 体验 + 远程诚实** — 交互应像真产品；凡未接远程处须诚实，不得把「未接后端」做成「控件不可用」。
13. **Document 内容源** — 状态与绑定 UI 归属 `modules/work-surface`（`WorkspaceDocumentSource` / `useWorkspaceDocumentSource` + `WorkspaceDocumentEmptyExtra` / `WorkspaceDocumentToolbarTrailing`）；Composition 只选 `runtimeMode` 并 **挂载** 模块组件，**禁止**在 `workbench-app` 内联绑定 Button / 探测 `showDirectoryPicker`。
14. **路径策略** — 公开入口优先 `toWorkspaceResourceKey`（`coerceWorkspaceResourceKey` 为同实现别名，新代码勿直接用 coerce 名）；已规范化 key 用 `normalizeWorkspaceResourceKey`。adapter / intent **禁止**自写 peel 或 `includes('..')`（段级 `..` 由 normalize 处理，允许 `v1..v2.md`）。
15. **IO 失败 vs 渲染失败** — DocumentPanel：Port 失败 / Port throw → `read-failed`（及 not-found 等）；重型渲染/解码失败 → `render-failed`。用 `mapPortFailureToViewState`；禁止把 IO 映射成 `render-failed`。

## 完成定义（包级）

```bash
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
pnpm check:workbench
pnpm check:foundation
```
