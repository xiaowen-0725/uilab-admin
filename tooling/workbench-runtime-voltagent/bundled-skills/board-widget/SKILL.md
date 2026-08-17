---
name: board-widget
description: 在对话里生成看板小组件与取数作业。工具面出现 board_* 时先读本 skill，再按固定配方分片写入。
version: "1.0.0"
tags:
  - board
  - widget
---

# 看板小组件（board-widget）

Board 是用户长期持有的看板资产，不隶属当前 Task。小组件是单文件 HTML，跑在无网络沙箱里；外部数据只能经取数作业提供。

工具面没有 `board_*` 时，不要声称能做看板。本 skill 仍可能出现在 `workspace_list_skills` 里，那不代表工具已暴露。

## 何时使用

- 用户要「做一块看板 / 小组件 / 仪表盘」
- 用户要给已有小组件补取数作业或改内容
- 工具面已经出现 `board_status`、`board_widget_*`、`board_commit`

## 固定配方（照抄，不要自由发挥）

建组件：

1. `board_status` — 先看已有板、已落库小组件和未提交草稿
2. `board_widget_begin` — 拿真实 `widgetId` / `buildId`
3. `board_widget_append` — 每片 2–4 KB，`seq` 从 1 连续
4. `board_widget_finish` — 静态校验；失败只补被点名的问题
5. 若需要外部数据：`board_job_begin`（此刻声明 `allowedHosts`）→ `board_job_append` → `board_job_finish`
6. `board_commit` — 一次提交进 IndexedDB

建作业（已有小组件）：`board_job_begin` → N × `append` → `board_job_finish` → `board_commit`。

`board_job_finish` **会停靠用户审批**。停靠不是失败，不要重试。批准后同一份代码可被重复静默执行。提交成功后宿主会自动首跑，不必自己触发。

## 何时该建取数作业

- 小组件要显示汇率、天气、公开 API、远程 JSON
- 不要在小组件里 `fetch` / XHR / WebSocket

纯本地交互（番茄钟、待办、计数）不必建作业。

## 硬规则摘要

- 小组件：单文件、无外链、无 `eval`、数据只从 `widget.data` / `onDataChange` 来、必须 `widget.ready()`
- 作业：零依赖、`export function run(ctx)`、主机写进 `allowedHosts`、只碰 `ctx.runDir`
- 全文与违反时的表现见 `references/widget-rules.md`、`references/job-runtime.md`
- SDK 逐方法见 `references/widget-sdk.md`
- 完整样本：`references/examples/tomato.html`（本地）、`references/examples/fx.html` + `fx-job.js`（数据驱动）

## 错误码自查

失败只回 `{ ok: false, error, hint }`，不回 HTML / 代码。对照 hint 修，不要整份重写。

| error | 常见原因 |
|---|---|
| `unknown_build` / `build_not_ready` | 编造了 buildId，或 finish 前就 commit |
| `hash_mismatch` | commit 的 contentHash / codeHash 与 finish 返回值不一致 |
| `validation_failed` / `csp_violation` / `sdk_contract_violation` | 触写作规范；见 `references/widget-rules.md` / `job-runtime.md` |
| `repair_budget_exhausted` | 同一草稿连续校验失败 3 次，停止自修，向用户说明 |
| `widget_limit_reached` / `board_limit_reached` | 先 `board_status` 看额度，改已有板或说明超限 |
| `unknown_board` / `unknown_widget` / `unknown_job` | 目标不存在；先 `board_status` |
| `already_running` / `runtime_unavailable` | 作业在跑或侧车不可用；不要重试 finish |
| `not_authorized` | 拉 staging 缺凭证——这是宿主的事，模型不要自己拉 |

## 已知弱化

`full-access`（完全访问）预设下 `board_job_finish` 不停靠审批，用户对作业授权无感知。用户可见的撤销入口在小组件 chrome 的「取数作业」弹窗。
