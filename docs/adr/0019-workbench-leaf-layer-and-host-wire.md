# Keep Workbench leaf layers framework-agnostic and share Host wire types

Agent Workbench 继续按 Deep Module 竖切所有权，不改成 OpenWork 式的 `domains/` 或全局 `shared/`。从 OpenWork 只收紧三样硬约束，并由 `check:workbench` fail-closed 执行：（1）叶层（`model` / `ports` / `adapters` / `protocol` / `projection` / `task/runtime` / `task-runtime` / `app/persistence` / `config` / `lib`，以及 Desktop 共用的 `local-root-path`）不得依赖 React；（2）`src/` 运行时 import 图禁止环；（3）Electron ↔ Renderer 的 IPC 通道名与 `WorkbenchHostBridge` 形状集中在 `modules/project/ports/host-wire.ts`，Desktop 只可进口该叶文件与 `local-root-path`，Renderer 禁止进口 `desktop/`。
