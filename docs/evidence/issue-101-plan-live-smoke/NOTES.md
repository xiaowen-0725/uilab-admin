# Issue #101 live smoke — Plan 机制端到端

**Date:** 2026-08-13  
**HEAD at start:** see `git-head.txt`  
**Sidecar:** `profile=office` `port=3141` `model=deepseek-v4-flash` `modelApi=chat`  
**Workbench:** Vite `http://localhost:5175/`（5174 已被占用）  
**Workspace:** `output/voltagent-e2e-workspace`  
**Task id:** `task-msrp9buq-1`

## Prompt

请先列出计划再执行，每完成一步立刻更新计划。任务分三步：1) 列出工作区根目录有哪些文件；2) 阅读 notes 下已有文件；3) 把三句话摘要写到 /output/plan-smoke-notes.md。计划步骤用中文短语，至少两步，开始时恰好一步进行中。

## Observations

| Spec / #101 项 | 结果 |
|---|---|
| Agent 实际调用 `update_plan` | **通过**。面板从空态变为 1/3 → 3/3，Timeline 出现「计划已更新」 |
| 面板进度 N/M + 状态样式 | **通过**。中途 1/3（completed / in_progress / pending）；结束 3/3 全 completed |
| Timeline 计划卡同 Run 原地刷新 | **通过**。仅一张 `timeline-item-plan-update:run-task-msrp9buq-1-1` |
| 无重复 `update_plan` 工具行 | **通过**。工具行是列出/搜索/读取/写入，没有 `update_plan` tool-group |
| Turn chrome「N 个动作」 | **通过**。`已处理 27s · 8 个动作`，未用「步」计动作 |
| 刷新后 IndexedDB 回放 | **通过**。刷新后同一 Task 仍 3/3；状态条「已从本地存储恢复时间线」 |
| 计划更新免审批 | **通过**。未见针对 `update_plan` 的审批卡；写文件走了「帮我批准」自动批准 |

## Screenshots

- `01-empty-plan-block.png` — 提交前空态「本次任务暂无计划」
- `02-plan-mid-run.png` — 进行中 1/3 + Timeline「计划已更新」
- `03-plan-completed.png` — 完成态 3/3
- `04-plan-card-in-fold.png` — 完成后计划卡收进过程折叠（展开可见）
- `05-after-refresh-idb.png` — 刷新后计划仍在。首次截图与 `03` 字节相同，已重截；SHA-256：`03` `4c3a7e6d…`，`05` `b03cf93d…`。配套 `05-idb-restore-dom.json`（`已从本地存储恢复时间线` + 3/3 completed）

## Notes

- 工作区当时没有 `notes/` 目录；Agent 把第 2 步改成「核查并确认空缺」并写入摘要。这是夹具缺口，不是计划链路失败。
- 完成后 Timeline 把 `plan-update` 收进「已处理 · N 个动作」折叠（`isProcessFoldItem` 含 `plan-update`）。折叠展开后卡片仍在。与 spec「每 Run 一张卡」兼容；进行中未折叠时卡片可见。
- 本轮未打到「计划更新失败」警示行（spec 失败路径）；成功路径已覆盖。
- 默认 `pnpm test` 仍不要求侧车。Live 切片见包级 `test:live-runtime`（memory persistence，不替代上面的 IndexedDB 刷新证据）。
