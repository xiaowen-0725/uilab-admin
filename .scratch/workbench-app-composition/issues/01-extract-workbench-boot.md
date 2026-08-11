# 01 — 抽出 Workbench Boot（持久化 + 目录 hydrate + 指针）

**What to build:** 冷启动时打开本地存储（或测试用 Memory）、hydrate 项目目录与会话指针、IDB 失败时诚实降级到 Memory 仍能进入工作台——这些行为保持不变，但实现从 `WorkbenchApp` 内联逻辑迁到可单独测试的 Boot 单元；Composition 只消费 boot 结果（catalog / eventStore / ready / error / db 柄等）。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 存在可测的 Boot 单元（controller / hook / factory）：输入 `persistence` 与可选 `idbName`，输出 catalog 控制器、EventStore、bootReady、bootError、以及用于 hydrate 的初始指针
- [x] Memory 成功路径与 IDB 失败降级路径有单元覆盖（中文 bootError 诚实）
- [x] `WorkbenchApp` 不再内联大块 boot `useEffect` 业务，只接线 Boot 单元
- [x] 既有 workbench shell / runtime 集成测通过；`check:workbench` 不因跨模块内路径 import 失败
