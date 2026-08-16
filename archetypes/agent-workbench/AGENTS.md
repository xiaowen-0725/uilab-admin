# AGENTS.md — Agent Workbench application

本项目是 **AI-first Agent Workbench Archetype**（Vite + React 桌面优先工作台）。
硬规则以本文件为准；平台 monorepo 合同见仓库根 `AGENTS.md`。

## 定位（Phase 3 Shell + Real Task Lifecycle + VoltAgent 侧车 Runtime）

- **技术栈（与平台统一）**：Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn/ui（**Base UI / base-nova**）+ TanStack Router（小型 code-defined 路由）
- **UI 装配**：`components.json`（base-nova）→ `@/components/ui/*`（按需 `shadcn add`）→ UI Lab registry 复合块（如 `agent-composer`）→ `@/lib/utils`（`cn`）
- **Foundation**：Button / Input / tokens 经 `@/components/ui/button|input` 兼容 re-export；tokens 经 `src/styles/tokens.css` 导入；**不**扩 Foundation exports
- 图标：包内 `lucide-react`（不扩 Foundation）
- **体验目标（模板产品要求）**：**尽量像真 Runtime 一样可交互**。未接后端接口 ≠ 没有 Runtime 概念；本地应用状态、菜单、chip、模型/权限切换、发送反馈等应完整可用，接近真实产品。诚实边界是「数据/执行未接远程后端」，不是「UI 只可看不可用」。
- **UI Lab 双仓**：复合 Agent 交互优先装 UI Lab 组件（registry / `shadcn add`）。若发现 UI Lab 组件缺陷、交互不足或需要优化，**在 UI Lab 仓库（`ui-components`）改真源并发布/同步**，再回装到本模板；禁止长期在 Workbench 内平行 fork 一套「改进版」却不回流。

### 已交付

- **Shell**：Navigator、Task Surface、Composer、Adaptive Context Panel、Single-pane + Tabs Work Surface Host；inset layout、pane chrome/motion
- **Real Task Lifecycle（会话管理）**：
  - `modules/project`：Project 实体 + Task **目录**权威；`ProjectCatalogPort`（Memory / IndexedDB）；**单根 `localRoot` / `rootSource`**；**HostPort**（选目录 / Projects Home / 侧车生命周期）
  - `modules/workbench-session`：仅 `selectedProjectId | null` + `selectedTaskId | null` + layout chrome + `lastTaskByProject`
  - 冷启动：**Composer-first** — 无选中 Task 时自动打开「新对话」empty hub，不把「还没有任务」当门闸。有 Desktop Host 且未选 Project 时自动建带根默认项目；无 Host（Web/测试）保留「默认项目」夹具
  - 新对话 → 目录 title「新对话」→ **Runtime** empty hub（产品默认路径）；未选 Project 时先 `ensureProjectForNewChat`
  - 硬删 Task（目录 + events + snapshot；确认文案强调不可恢复）；删光后再次自动打开「新对话」
  - Navigator：**仅**真目录。未指定工作根的对话在扁平「任务」；用户打开/新建的路径项目在「项目」文件夹下分组。侧栏文件夹只展开/收起，不切工作根；文件夹上的会话按钮在该项目下开新对话并切工作根；文件夹菜单可「从列表中移除」（不删本地文件夹）
  - 项目选择 / 打开本地文件夹 / 新建项目 / 不使用项目：只在 Composer 空态 chip，接到 Host 命令面。未指定工作根时 chip 显示「选择项目」，菜单不出现「不使用项目」（自动/默认项目仍挂对话，不出现在菜单列表）。已选指定项目后 chip 显示项目名，菜单才出现「不使用项目」。选项目只切工作根并回到该项目已有对话，不强制新开；文件夹上的会话按钮才新开对话
  - 统一 IndexedDB `uilab-agent-workbench`（目录 + EventStore 一 open）；测试默认 Memory
- **Runtime path（产品默认）**：本机 VoltAgent 侧车 → projection → Timeline（ADR-0018 移除了 Deterministic Fake Runtime）
- **Phase 4B–4F Kernel**：Commands/Events、RuntimePort、VirtualClock、reasoning/tool/approval、queue/steer、长文折叠/滚动
- **Question Request**：侧车 `ask_user_question`（client-side tool，无 execute / 无 needsApproval）→ `input.requested` → Timeline 内联卡片；用户点选项 / Other / 跳过 / Composer 直接回复后走 `provideRunInput`（`runInput: true`）恢复 Turn。任何 Permission Preset 都不得自动作答。steer 仍未交付。
- **VoltAgent 侧车 ≠ 远程生产集群** — 本机执行；批准后可能写入工作区文件。无 Desktop Host（Web/测试降级）时，写盘范围由侧车自身 `WORKSPACE_ROOT` 环境决定，不受项目选择约束；桌面产品路径才有项目根写盘约束。

### 可选 Local VoltAgent 侧车

`VITE_RUNTIME_ADAPTER=voltagent` + `pnpm dev:workbench-runtime`：本机 `RuntimePort` Adapter，**不是**多租户生产 Runtime；密钥与工具副作用在侧车进程。侧车 `AGENT_PROFILE=minimal|office`。

默认包级 `test` 不要求侧车，也不打真 Runtime submit。submit → 「已处理」只走 `test:live-runtime`（需先 `pnpm dev:workbench-runtime`，且侧车可达）；否则 skip。不把 Fake Runtime 装回产品 boot（ADR-0018）。

### Capture / local-sim（非产品默认）

- Capture JSON **保留**在 `config/captures`；仅 **test harness / 显式 dev** 入口使用
- 产品 boot **不**使用 `phase3SessionSeed` / 默认 capture `task-a`
- Launch cards → Runtime `promptStub`，**不** force capture 流

### 未交付（勿伪装）

- 云上多租户 Agent Runtime、Surface Registry 真实现、Document/Browser/Review
- Resource Explorer、Git 全量集成、Tauri、完整安装器/自动更新/签名
- 磁盘级联删除 Project、跨标签页 IDB 同步、会话导出/导入
- Spec-α 已交付最小 Electron Host（`desktop/electron/`，dev-mode）；不等于产品级桌面安装体验

## 目录约定

```text
src/
  app/                 # bootstrap / providers / router / composition（唯一 Composition Root）
    persistence/       # 统一 IndexedDB shell（Composition 打开一柄；叶层，无 React）
  shell/               # Workbench geometry、Navigator、responsive layout、快捷键
  modules/
    project/           # Project 实体 + Task 目录 + ProjectCatalogPort
      ports/host-wire.ts  # Electron ↔ Renderer IPC 线协议（叶层，无 React）
    workbench-session/ # 选择指针 + 每 Task 布局（无 projects/tasks 数组）
    task/              # Runtime 契约 / EventStore Port / projection / Task Surface UI
    task-runtime/      # VoltAgent Adapter + EventStore 实现（叶层，无 React）
    work-surface/      # Host + Registry + Document/Browser + WorkspaceDocumentSource
    capabilities/      # 连接器 / 技能 / 专家 snapshot 与选择
    board/             # Board 实体 + BoardStorePort（IDB v3）；UI / 作业运行时未交付
  components/ui/       # shadcn Base UI（Button/Input 为 Foundation 兼容 re-export）
  lib/                 # cn 等应用侧工具（叶层，无 React）
  config/              # fixtures / captures / runtime-adapter（叶层，无 React）
  styles/              # tokens + shell CSS（含 shadcn/tailwind.css）
desktop/electron/      # 最小 Desktop Host；只进口 host-wire + local-root-path
tests/integration/     # 浏览器集成测试
components.json        # shadcn 配置（base-nova）
```

## 硬规则

1. **Composition Root 唯一装配** — `src/app/composition` 打开 IDB、hydrate catalog、挂 Runtime controller 与 Shell。
2. **Module 边界** — 只通过 `@/modules/<name>` 根 `index.ts` 消费；禁止跨 Module 引用内部路径。
3. **禁止 dumping-ground** — 不建 `shared/`、`common/`、全局 `ports/`。
4. **Task model 禁止 Project 实体** — 仅可有 `ProjectId`；目录权威在 `modules/project`。
5. **Shell 禁止**直写 IDB / Runtime / 业务级联删除；只绑定公开 commands/views。
6. **turnStatus 不进 catalog/IDB** — 仅内存 TurnStatusIndex。
7. **UI 复用顺序** — Module / Shell 已有 → UI Lab 复合块 → `@/components/ui/*` → 才允许 bespoke。
8. **UI Lab 回流** — 改 UI Lab 能力时先/同步改 `ui-components` 真源。
9. **Foundation** — Button/Input 只经 `@/components/ui/*` re-export；不扩 Foundation exports。
10. **Base UI 约束** — `render={...}`；禁止 `asChild` 与 `@radix-ui/*`；禁止 Desktop/Node built-in 进入 renderer 源码。
11. **中文优先** — 用户可见文案中文；标识符英文。
12. **本地 Runtime 体验 + 远程诚实** — 交互应像真产品；凡未接远程处须诚实，不得把「未接后端」做成「控件不可用」。
13. **Document 内容源** — 状态与绑定 UI 归属 `modules/work-surface`（`WorkspaceDocumentSource` / `useWorkspaceDocumentSource` + `WorkspaceDocumentEmptyExtra` / `WorkspaceDocumentToolbarTrailing`）；Composition 只选 `runtimeMode` 并 **挂载** 模块组件，**禁止**在 `workbench-app` 内联绑定 Button / 探测 `showDirectoryPicker`。
14. **路径策略** — 公开入口优先 `toWorkspaceResourceKey`（`coerceWorkspaceResourceKey` 为同实现别名，新代码勿直接用 coerce 名）；已规范化 key 用 `normalizeWorkspaceResourceKey`。adapter / intent **禁止**自写 peel 或 `includes('..')`（段级 `..` 由 normalize 处理，允许 `v1..v2.md`）。
15. **IO 失败 vs 渲染失败** — DocumentPanel：Port 失败 / Port throw → `read-failed`（及 not-found 等）；重型渲染/解码失败 → `render-failed`。用 `mapPortFailureToViewState`；禁止把 IO 映射成 `render-failed`。
16. **Composition 接线层** — `workbench-app.tsx` 只做产品装配接线与薄 chrome（boot 全屏、删除确认等）。**禁止**在 App 内联：冷启动 boot 业务、Runtime 初始化与 busy 投影、新对话 blank-draft / 硬删级联、Surface Registry 工厂与 open 通道校验。上述能力分别落在 composition 子单元（`workbench-boot` / `runtime-wiring` / `task-lifecycle-commands` / `surface-assembly` 等），保持可单测；目标是主文件可读接线，避免再堆回巨型 Composition。
17. **叶层无 React** — `model` / `ports` / `adapters` / `protocol` / `projection` / `task/runtime` / 整个 `task-runtime` / `app/persistence` / `config` / `lib`，以及 Desktop 共用的 `local-root-path.ts` / `sidecar-workspace-ready.ts`，不得 import `react` / `react-dom`，不得为 `.tsx`，也不得进口 `components` / `shell` / `ui`。`application` 与 `ui` 可以依赖 React。ADR-0019。
18. **运行时 import 无环** — `src/`（不含测试文件）运行时 import 图必须为零环；由 `check:workbench` 执行（等价 `madge --circular`）。
19. **Host 线协议单点** — Electron preload/main 与 Renderer 共用 `modules/project/ports/host-wire.ts`（IPC 通道名 + `WorkbenchHostBridge`）。Desktop 只可再进口 `local-root-path.ts` 与 `sidecar-workspace-ready.ts`（纯函数）。Renderer / tests **禁止**进口 `desktop/`。

## 完成定义（包级）

```bash
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
pnpm check:workbench
pnpm check:foundation
```

无侧车时包级 `test` 应为 0 failed（submit → 「已处理」skip）。活侧车 Runtime 切片：先 `pnpm dev:workbench-runtime`，再 `pnpm --filter @uilab/agent-workbench test:live-runtime`。
