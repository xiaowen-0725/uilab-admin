# 02 — 抽出 Runtime 接线（Fake / VoltAgent + Controller + busy）

**What to build:** 按运行时适配器模式挂上 Deterministic Fake 或本地侧车 Runtime、创建 TaskRuntimeController、维护 busy 任务集合、在交互路径驱动 Fake 时钟——产品行为不变，但接线集中在一处，Composition 不再手写长段 Runtime 初始化与 listener 绑定。

**Blocked by:** 01 — 抽出 Workbench Boot（需要 EventStore / 项目上下文来自 boot）

**Status:** done

- [x] Runtime 装配有明确边界 API（浏览器侧；不引入 Node/Electron）
- [x] 适配器选择（fake vs voltagent）与 controller 生命周期可测或有清晰单测替身
- [x] busy 投影与 `useTaskRuntime` 接线后，既有 runtime-slice 集成测绿
- [x] `WorkbenchApp` 中不再散落 Fake/Volt 双 ref + 多段 effect 的「第二套 Composition」
