# AGENTS.md — Agent Workbench application

本项目是 **AI-first Agent Workbench Archetype**（Vite + React 桌面优先工作台）。
硬规则以本文件为准；平台 monorepo 合同见仓库根 `AGENTS.md`。

## 定位（Phase 3 + Phase 4 Fake path template-complete）

- **技术栈（与平台统一）**：Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn/ui（**Base UI / base-nova**）+ TanStack Router（小型 code-defined 路由）
- **UI 装配**：`components.json`（base-nova）→ `@/components/ui/*`（按需 `shadcn add`）→ UI Lab registry 复合块（如 `agent-composer`）→ `@/lib/utils`（`cn`）
- **Foundation**：Button / Input / tokens 经 `@/components/ui/button|input` 兼容 re-export；tokens 经 `src/styles/tokens.css` 导入；**不**扩 Foundation exports
- 图标：包内 `lucide-react`（不扩 Foundation）
- **体验目标（模板产品要求）**：**尽量像真 Runtime 一样可交互**。未接后端接口 ≠ 没有 Runtime 概念；本地应用状态、菜单、chip、模型/权限切换、发送反馈等应完整可用，接近真实产品。诚实边界是「数据/执行未接远程后端」，不是「UI 只可看不可用」。
- **UI Lab 双仓**：复合 Agent 交互优先装 UI Lab 组件（registry / `shadcn add`）。若发现 UI Lab 组件缺陷、交互不足或需要优化，**在 UI Lab 仓库（`ui-components`）改真源并发布/同步**，再回装到本模板；禁止长期在 Workbench 内平行 fork 一套「改进版」却不回流。
- **已交付**：静态 Workbench Shell 骨架（Navigator、Task Surface、Composer、Adaptive Context Panel、Single-pane + Tabs Work Surface Host）
- **已交付（Phase 3A/3B/3C）**：inset layout、pane chrome/motion、Composer 产品保真
- **已交付（Phase 4A–4F Fake path）**：
  - **4B Kernel**：领域 / Commands / Events / RuntimePort / VirtualClock / Run 状态机
  - **4C dual-path**：默认 seed `task-a` → capture + `local-sim`（`不会调用 Agent Runtime`，无 `data-runtime-run`）；empty / 新对话 → Fake → projection → Timeline
  - **4D**：reasoning / plan / tool / command / file / source / approval / input 投影与 Timeline；Fake 场景含审批/澄清/工具流
  - **4E**：`MemoryEventStore` 追加与重放；`queueFollowUp` / `steerRun` / `reconcileInterruptedRun`（Fake）
  - **4F**：长文折叠、智能滚动 follow/pin、「有新内容」
  - **Fake ≠ 生产 Runtime** — 无远程 Agent、无真实工具副作用
- **可选 Local VoltAgent 侧车**（`VITE_RUNTIME_ADAPTER=voltagent` + `pnpm dev:workbench-runtime`）：本机 `RuntimePort` Adapter，**不是**多租户生产 Runtime；密钥与工具副作用在侧车进程。侧车 `AGENT_PROFILE=minimal|office`：`minimal` 为 DIY 读写；`office` 为 **Agent + Workspace Node FS**（写/删 needsApproval），仍非远程集群
- **未交付（勿伪装成已接远程）**：云上多租户 Agent Runtime、Surface Registry 真实现、Document/Browser/Review、Resource Explorer、**IndexedDB** EventStore、Git 全量集成、Electron/Tauri

## 目录约定

```text
src/
  app/                 # bootstrap / providers / router / composition（唯一 Composition Root）
  shell/               # Workbench geometry、Navigator、responsive layout、快捷键
  modules/
    workbench-session/ # Task 选择 + 每 Task 布局状态（公开 index.ts）
    task/              # Task Surface / Composer / Context Panel + 4B–4F Kernel/Fake/projection/timeline
    work-surface/      # placeholder Host
  components/ui/       # shadcn Base UI（Button/Input 为 Foundation 兼容 re-export）
  lib/                 # cn 等应用侧工具
  config/              # 静态 fixture
  styles/              # tokens + shell CSS（含 shadcn/tailwind.css）
tests/integration/     # 浏览器集成测试
components.json        # shadcn 配置（base-nova）
```

## 硬规则

1. **Composition Root 唯一装配** — `src/app/composition` 创建 session controller 并挂 Shell。
2. **Module 边界** — 只通过 `@/modules/<name>` 根 `index.ts` 消费；禁止跨 Module 引用内部路径。
3. **禁止 dumping-ground** — 不建 `shared/`、`common/`、全局 `ports/`。
4. **UI 复用顺序** — Module / Shell 已有 → UI Lab 复合块（registry）→ `@/components/ui/*`（shadcn Base UI）→ 才允许 bespoke；禁止平行手写第二套 primitives / 第二套 agent-composer。
5. **UI Lab 回流** — 改 UI Lab 组件能力或修缺陷时，先/同步改 `ui-components` 真源；模板侧只做装配与场景 wiring，不长期维护分叉副本。
6. **Foundation** — Button/Input 只经 `@/components/ui/*` re-export 或公开子路径；不扩 Foundation exports。
7. **Base UI 约束** — `render={...}`；禁止 `asChild` 与 `@radix-ui/*`；禁止 Desktop/Node built-in 进入 renderer 源码。
8. **中文优先** — 用户可见文案中文；标识符英文。
9. **本地 Runtime 体验 + 远程诚实** — 交互与本地状态应尽量像真产品（可点、可切换、可反馈）；凡未接远程后端处须诚实（文案/状态/fixture 标识），**不得**把「未接后端」做成「控件不可用」。

## 完成定义（包级）

```bash
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
pnpm check:workbench
pnpm check:foundation
```
