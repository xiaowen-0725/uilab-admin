# 03 — 抽出 Task 生命周期命令（新对话一次 / 硬删）

**What to build:** 用户点「新对话」时，若当前已是未使用的空白草稿则只重选不重复创建；删除任务时 best-effort 取消 busy run、级联清目录与事件、更新会话指针——行为与现网一致，逻辑可单测，Shell 仍只收回调不写 IDB。

**Blocked by:** 01 — 抽出 Workbench Boot

**Status:** done

- [x] blank-draft「新对话只开一次」有单元覆盖（标题约定与现网一致）
- [x] 删除路径：busy 取消超时/失败不阻断硬删；cascade + 指针更新可测或有回归测
- [x] 删除确认仍须用户确认；确认 UI 可暂留 Composition（见可选 06）
- [x] Shell 不直写 IDB / EventStore；只通过 Composition 注入的 commands
