# AGENTS.md — Agent Workbench application

本项目是 **AI-first Agent Workbench Archetype**（Vite + React 桌面优先工作台）。
硬规则以本文件为准；平台 monorepo 合同见仓库根 `AGENTS.md`。

## 定位（Phase 3 + 3A layout polish）

- 技术栈：Vite + React 19 + TypeScript + Tailwind CSS 4 + TanStack Router（小型 code-defined 路由）
- 消费 `@uilab/foundation` 公开子路径：`ui/button`、`ui/input`、`styles/tokens.css`
- 图标：包内 `lucide-react`（不扩 Foundation）
- **已交付**：静态 Workbench Shell 骨架（Navigator、Task Surface、Composer、Adaptive Context Panel、Single-pane + Tabs Work Surface Host）
- **已交付（Phase 3A）**：Admin inset / Codex 空间关系 — sidebar 背景平面、272px Navigator、8px inset Workspace、合并 task-aware 顶栏、TaskSurface content-only、浮动 Composer、内容高度 Context 卡、pointer/keyboard 分源 Navigator 动效
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
  config/              # 静态 fixture
  styles/              # tokens 兼容导入 + shell CSS
tests/integration/     # 浏览器集成测试
```

## 硬规则

1. **Composition Root 唯一装配** — `src/app/composition` 创建 session controller 并挂 Shell。
2. **Module 边界** — 只通过 `@/modules/<name>` 根 `index.ts` 消费；禁止跨 Module 引用内部路径。
3. **禁止 dumping-ground** — 不建 `shared/`、`common/`、全局 `ports/`。
4. **Foundation** — 只走公开子路径；不扩 Foundation exports；Composer 可用原生 textarea。
5. **Base UI 约束** — 禁止 `asChild` 与 `@radix-ui/*`；禁止 Desktop/Node built-in 进入 renderer 源码。
6. **中文优先** — 用户可见文案中文；标识符英文。
7. **静态 fixture 诚实** — UI 必须标明 Phase 3 fixture；不得假装 Runtime 已接通。

## 完成定义（包级）

```bash
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench build
pnpm --filter @uilab/agent-workbench test
pnpm check:workbench
pnpm check:foundation
```
