# 04 — 抽出 Surface 装配与打开通道

**What to build:** Composition 装配 Surface Registry（Document / Browser / test）、挂载 Document 内容源 empty/toolbar chrome、处理 Timeline 点文件与 Runtime `work_surface.open_requested` 打开工作面——用户与 Runtime 打开通道仍通，但实现不堆在 `WorkbenchApp` 中部。

**Blocked by:** None — can start immediately（可与 01 并行；Document 源已在 work-surface module）。

**Status:** done

- [x] Registry 注册顺序与策略保持：Document 先于 test；Host 仍不 import 具体 Surface
- [x] Document empty / toolbar 只挂 module 组件，遵守 AGENTS 规则 13
- [x] 用户通道与 Runtime 通道均经 open intent 校验；既有 open / shell 相关测绿
- [x] `WorkbenchApp` 中打开监听与 registry 工厂迁到 composition 子模块（或等价边界）
