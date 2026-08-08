# 06 — 删除确认对话框抽离为纯 UI（可选）

**What to build:** 「删除任务？」确认对话框从 Composition 主文件挪到独立 presentational 组件；文案、a11y（dialog / 取消 / 确认 testid）与现网一致，Composition 只传 open 状态与回调。

**Blocked by:** 03 — 抽出 Task 生命周期命令

**Status:** done

- [x] 独立 presentational 组件；保留 `delete-task-dialog` / cancel / confirm 等 testid
- [x] 中文文案与破坏性操作确认行为不变
- [x] 可由 05 同批合入或紧随 05；不单独阻塞 05 的「接线可读」主目标
