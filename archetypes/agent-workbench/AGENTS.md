# AGENTS.md — Agent Workbench application

本项目是 **AI-first Agent Workbench Archetype**（Vite + React 桌面优先工作台）。
硬规则以本文件为准；平台 monorepo 合同见仓库根 `AGENTS.md`。

## 定位（Phase 3 + 3A + 3B pane chrome）

- **技术栈（与平台统一）**：Vite + React 19 + TypeScript + Tailwind CSS 4 + 官方 shadcn/ui（**Base UI / base-nova**）+ TanStack Router（小型 code-defined 路由）
- **UI 装配**：`components.json`（base-nova）→ `@/components/ui/*`（按需 `shadcn add`）→ `@/lib/utils`（`cn`）
- **Foundation**：Button / Input / tokens 经 `@/components/ui/button|input` 兼容 re-export；tokens 经 `src/styles/tokens.css` 导入；**不**扩 Foundation exports
- 图标：包内 `lucide-react`（不扩 Foundation）
- **已交付**：静态 Workbench Shell 骨架（Navigator、Task Surface、Composer、Adaptive Context Panel、Single-pane + Tabs Work Surface Host）
- **已交付（Phase 3A）**：Admin inset / 工作台空间关系 — sidebar 背景平面、272px Navigator、8px inset Workspace、TaskSurface content-only、浮动 Composer、内容高度 Context 卡、pointer/keyboard 分源 Navigator 动效
- **已交付（Phase 3B）**：Task/Work 并列 44px pane chrome、语义图标、右锚定 reserved-space Work drawer（open 200ms / close 160ms / maximize-restore 180ms）与 keyboard instant 分源；Playwright/动效证据已落盘；**无** Runtime / 具体 Surface
- **未交付（勿伪装）**：Agent Runtime、event projection、Surface Registry、Document/Browser/Review Surface、Resource Explorer、持久化、Git、文件系统、Electron/Tauri、Phase 4

## 目录约定

```text
src/
  app/                 # bootstrap / providers / router / composition（唯一 Composition Root）
  shell/               # Workbench geometry、Navigator、responsive layout、快捷键
  modules/
    workbench-session/ # Task 选择 + 每 Task 布局状态（公开 index.ts）
    task/              # Task Surface / Composer / Context Panel
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
4. **UI 复用顺序** — Module / Shell 已有组件 → `@/components/ui/*`（shadcn Base UI）→ 才允许 bespoke；新增原子/复合控件优先 `shadcn add`，不要平行手写第二套 primitives。
5. **Foundation** — Button/Input 只经 `@/components/ui/*` re-export 或公开子路径；不扩 Foundation exports。Composer 输入走 `@/components/ui/textarea`，不要平行再写一套原生 textarea primitive。
6. **Base UI 约束** — `render={...}`；禁止 `asChild` 与 `@radix-ui/*`；禁止 Desktop/Node built-in 进入 renderer 源码。
7. **中文优先** — 用户可见文案中文；标识符英文。
8. **静态 fixture 诚实** — UI 必须标明 Phase 3 fixture；不得假装 Runtime 已接通。

## 完成定义（包级）

```bash
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
pnpm check:workbench
pnpm check:foundation
```
