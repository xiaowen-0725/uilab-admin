# Scenario Catalog — VoltAgent real-model E2E (2026-08-08)

**Goal:** `docs/plans/GOAL-voltagent-real-model-e2e-acceptance.md`  
**Runtime path:** `VITE_RUNTIME_ADAPTER=voltagent` + local sidecar `:3141` + real model (not Fake, not capture default).  
**Preferred profile:** `AGENT_PROFILE=office`  
**Workspace:** `output/voltagent-e2e-workspace/` (isolated; seeded `notes/seed.md`)  
**Evidence root:** `docs/evidence/voltagent-real-e2e-2026-08-08/`

## Coverage mapping (C1)

| Required coverage item | Scenario id(s) | Deferred? |
| --- | --- | --- |
| A2 新对话 Runtime hub | S01 | no |
| A3 切换 Task | S02 | no |
| A4 硬删 Task | S03 | no |
| A6 Navigator 无 mock utility rows | S04 | no |
| A8 冷启动零 Tasks | S05 | no |
| A10 默认非 capture seed | S06 | no |
| A1 多 Project 建/切/改名 | S07 | **deferred-with-reason** (automation cost; A2–A10 product path still proven; multi-Project unit/catalog exists but full UI multi-Project not required for mainstream agent E2E this run) |
| A9 刷新恢复 | S08 | **deferred-with-reason** (browser IDB refresh loop flaky under headless; not on non-deferrable axis) |
| 纯文本流式回复 | S10 | no |
| 只读工具 Timeline 可见 | S11 | no |
| 写/删工具 HITL（wait → approve/reject → follow-up） | S12 | no |
| 取消进行中 Run | S13 | no |
| 侧车诚实文案（非 Fake-as-real） | S14 | no |
| 侧车不可用诚实失败面 | S15 | no |
| Gates typecheck/test/build/check:workbench | S20 | no |

**Deferred count:** 2 (S07, S08) — within limit of 2. Non-deferrable A2/A4/A6/A8/A10 and mainstream agent axes are **not** deferred.

---

## Environment preconditions (all non-deferred S*)

1. Sidecar `.env` has non-empty API key (`DEEPSEEK_API_KEY` or `OPENAI_API_KEY`); never commit secrets.
2. Sidecar: `pnpm dev:workbench-runtime` with `AGENT_PROFILE=office`, `WORKSPACE_ROOT=<repo>/output/voltagent-e2e-workspace`, port `3141`.
3. Workbench: `VITE_RUNTIME_ADAPTER=voltagent pnpm dev:workbench` → `http://localhost:5174/`.
4. Isolated workspace seeded: `notes/seed.md` present under `WORKSPACE_ROOT`.
5. Record `git rev-parse HEAD` into evidence.

**Evidence filename convention:** `S{nn}-{short-slug}.{ext}` (e.g. `S10-text-stream.sse`, `S11-ls-timeline.png`). Shared env snapshot: `env-profile-snapshot.md` (no secrets). Sidecar boot: `sidecar-start.log`.

---

## Lifecycle scenarios

### S01 — A2 新对话 Runtime hub

| Field | Value |
| --- | --- |
| **Intent** | 新对话创建 Task 目录行并进入 Runtime empty hub（非 capture seed 时间线）。 |
| **Preconditions** | Workbench voltagent mode; IDB may be empty or have other tasks. |
| **Steps** | 1) 打开 `http://localhost:5174/`。2) 点击「新对话」或等价入口。3) 观察 Navigator 与主区。 |
| **Observable result** | 目录出现「新对话」（或新建 Task 标题）；主区为空 Runtime hub / Composer 可用；时间线无 capture fixture 金样回放内容；诚实条带为 VoltAgent 文案（见 S14）。 |
| **Tags** | A2, lifecycle, runtime-hub |
| **Evidence** | `S01-new-chat-runtime-hub.png`, `S01-new-chat-dom.txt` |

### S02 — A3 切换 Task

| Field | Value |
| --- | --- |
| **Intent** | 在 ≥2 个 Task 之间切换，选中指针与主区内容随 Task 变化。 |
| **Preconditions** | 至少 2 个 Task（可先 S01 新建 + 再新建或提交一轮生成第二 Task）。 |
| **Steps** | 1) 选中 Task A，记录主区特征。2) 选中 Task B。3) 再切回 A。 |
| **Observable result** | Navigator 高亮随选中变化；主区 Timeline/标题随 Task 切换；无跨 Task 内容错绑。 |
| **Tags** | A3, lifecycle, task-switch |
| **Evidence** | `S02-switch-task-a.png`, `S02-switch-task-b.png`, `S02-switch-notes.md` |

### S03 — A4 硬删 Task

| Field | Value |
| --- | --- |
| **Intent** | 删除 Task 后目录与事件不可再打开；选中落点正确。 |
| **Preconditions** | 至少 1 个可删 Task。 |
| **Steps** | 1) 记下 Task id/标题。2) 执行删除。3) 确认目录无该项；无法再打开其 Timeline。 |
| **Observable result** | 目录行消失；若曾选中被删 Task，选中落到其它 Task 或空壳；刷新后仍不出现。 |
| **Tags** | A4, lifecycle, hard-delete |
| **Evidence** | `S03-before-delete.png`, `S03-after-delete.png`, `S03-delete-notes.md` |

### S04 — A6 Navigator 无 mock utility

| Field | Value |
| --- | --- |
| **Intent** | Navigator 仅投影真实 Task 目录，无 mock utility 行（拉取请求/站点/已安排/插件假行）。 |
| **Preconditions** | Workbench 已加载。 |
| **Steps** | 1) 打开 Navigator。2) 枚举可见列表项文案。 |
| **Observable result** | 列表仅为 Project/Task 真实项；不出现 mock utility 固定假行（如「拉取请求」「站点」类 fixture 行，若产品已移除）。 |
| **Tags** | A6, lifecycle, navigator |
| **Evidence** | `S04-navigator-items.txt`, `S04-navigator.png` |

### S05 — A8 冷启动零 Task

| Field | Value |
| --- | --- |
| **Intent** | 空库冷启动展示零 Task 空壳，无 fixture seed 任务。 |
| **Preconditions** | 干净 profile / 清空 IDB（或新 browser context）；voltagent mode。 |
| **Steps** | 1) 以干净存储打开 Workbench。2) 观察 Navigator 与主区空状态。 |
| **Observable result** | 零 Task；空壳「还没有对话」+「新对话」类 CTA；无 `task-a` / phase3 capture seed。 |
| **Tags** | A8, lifecycle, cold-start |
| **Evidence** | `S05-cold-start-empty.png`, `S05-cold-start-dom.txt` |

### S06 — A10 默认非 capture seed

| Field | Value |
| --- | --- |
| **Intent** | 默认 boot 不自动加载 phase3 capture `task-a` 金样。 |
| **Preconditions** | 默认产品入口（非 test harness force-capture）。 |
| **Steps** | 1) 默认打开 Workbench。2) 检查初始 Task 列表与 Timeline。 |
| **Observable result** | 无默认 capture seed Task；空壳或用户真实目录；非 local-sim capture 回放默认。 |
| **Tags** | A10, lifecycle, no-capture-default |
| **Evidence** | `S06-default-path.png`, `S06-default-path-notes.md` |

### S07 — A1 多 Project（DEFERRED）

| Field | Value |
| --- | --- |
| **Intent** | 多 Project 建/切/改名。 |
| **Status** | `deferred-with-reason` |
| **Reason** | 本会话主流轴与 A2–A10 优先；多 Project UI 自动化成本高，且不阻塞真模型 Agent 轴。后续会话可补。 |
| **Tags** | A1, deferred |
| **Evidence** | n/a (deferred) |

### S08 — A9 刷新恢复（DEFERRED）

| Field | Value |
| --- | --- |
| **Intent** | 刷新后 IDB 恢复目录与选中。 |
| **Status** | `deferred-with-reason` |
| **Reason** | 真浏览器 IDB + headless 刷新环不稳定；非 C1 禁止 deferred 轴。 |
| **Tags** | A9, deferred |
| **Evidence** | n/a (deferred) |

---

## Mainstream agent scenarios (real model)

### S10 — 纯文本流式回复

| Field | Value |
| --- | --- |
| **Intent** | 真模型纯文本流式回复（不强制工具）。 |
| **Preconditions** | Sidecar office + model up；Workbench voltagent 或直打 sidecar stream。 |
| **Steps** | 1) 新对话或 API `POST /agents/workbench/stream`。2) 输入：「不要调用任何工具。只回复四个字：办公就绪」。3) 收集 SSE。 |
| **Observable result** | SSE 含 `text-delta`；组装文本含「办公就绪」或等价中文短答；`finish` 无 tool 400。 |
| **Tags** | agent, text-stream, real-model |
| **Evidence** | `S10-text-stream.sse`, `S10-text-stream-summary.json`, optional `S10-text-ui.png` |

### S11 — 只读工具 Timeline 可见

| Field | Value |
| --- | --- |
| **Intent** | 模型调用只读工具（ls/read）并在 Timeline 或 SSE 中可见 tool-call/result。 |
| **Preconditions** | Workspace 含 `notes/`；sidecar office tools 含 `ls`。 |
| **Steps** | 1) 提交：「列出工作区根目录，使用 ls 工具」。2) 观察 SSE/UI Timeline。 |
| **Observable result** | `tool-call` toolName=`ls`（或 read）；`tool-result` 含 `notes`/`output`；后续文本摘要；Timeline 可见工具行（UI 路径）。 |
| **Tags** | agent, readonly-tool, timeline |
| **Evidence** | `S11-ls-stream.sse`, `S11-ls-summary.json`, `S11-ls-timeline.png` |

### S12 — 写工具 HITL（wait → approve → follow-up）

| Field | Value |
| --- | --- |
| **Intent** | 写/删类工具触发审批；用户批准或拒绝后有可观察后续。 |
| **Preconditions** | Office needsApproval for write；Adapter 支持 approve resume。 |
| **Steps** | 1) 提交：「在 /output/e2e-hitl.txt 写入一行 e2e-ok（使用 write_file）」。2) 等待 approval。3) 批准一次。4) 观察续跑与磁盘。 |
| **Observable result** | 出现 `tool-approval-request` / UI「需要审批」；批准后 `approval.resolved` 或续跑；优先验证文件写出或明确 residual。拒绝路径可选：拒绝后不写盘。 |
| **Tags** | agent, hitl, write-approval |
| **Evidence** | `S12-write-approval.sse` (or UI notes), `S12-waiting-approval.png`, `S12-after-approve.png`, `S12-workspace-file.txt` |

### S13 — 取消进行中 Run

| Field | Value |
| --- | --- |
| **Intent** | 运行中取消 Run，Composer 可再次发送。 |
| **Preconditions** | 可触发较长回复或工具循环。 |
| **Steps** | 1) 提交长任务提示（如「慢慢数到 50 并逐步解释」）。2) 运行中点停止/取消。3) 再发短消息。 |
| **Observable result** | UI/事件出现 cancelled / 停止态；Composer 重新可提交；非卡死 loading。 |
| **Tags** | agent, cancel |
| **Evidence** | `S13-cancel-notes.md`, `S13-cancel-ui.png` (and/or adapter unit proof + UI) |

### S14 — 侧车诚实文案

| Field | Value |
| --- | --- |
| **Intent** | voltagent 模式 UI 不声称 Deterministic Fake Runtime。 |
| **Preconditions** | `VITE_RUNTIME_ADAPTER=voltagent`。 |
| **Steps** | 1) 打开任意 Runtime Task。2) 读取 Timeline/Composer 诚实文案。 |
| **Observable result** | 文案含「本机 VoltAgent」或等价；**不含**「Deterministic Fake Runtime」作为当前 Runtime 身份。 |
| **Tags** | honesty, voltagent |
| **Evidence** | `S14-honesty.png`, `S14-honesty-dom.txt` |

### S15 — 侧车不可用诚实失败

| Field | Value |
| --- | --- |
| **Intent** | 侧车 down 时展示可读失败，不假成功。 |
| **Preconditions** | 可停 :3141。 |
| **Steps** | 1) 停止 sidecar。2) 在 UI 提交一条消息（或 adapter 直连失败）。3) 观察错误面。4) 恢复 sidecar。 |
| **Observable result** | 可见错误（连接失败 / HTTP / 侧车不可用）；Timeline 非「假装成功完成」。 |
| **Tags** | honesty, failure-surface |
| **Evidence** | `S15-sidecar-down.png`, `S15-sidecar-down-notes.md` |

---

## Gates

### S20 — Package gates

| Field | Value |
| --- | --- |
| **Intent** | 最终树 Workbench 门禁全绿。 |
| **Steps** | 从仓库根跑四条命令，日志写入本目录。 |
| **Observable result** | exit 0 for typecheck, test, build, `pnpm check:workbench`. |
| **Tags** | gates |
| **Evidence** | `gate-typecheck.log`, `gate-test.log`, `gate-build.log`, `gate-check-workbench.log` |

---

## Shared evidence files

| File | Purpose |
| --- | --- |
| `env-profile-snapshot.md` | Profile/model/ports; **no secrets** |
| `sidecar-start.log` | Boot log snippet (`profile=office` …) |
| `agent-tools.json` | `GET /agents/workbench` tools list |
| `RUN-REPORT.md` | Per-S* PASS/FAIL/BLOCKED + paths + HEAD |
| `VERDICT.json` / `VERDICT.md` | Independent adjudicator only |
| `CODEX-REVIEW-R1.md` (+ optional R2) | Design review |
| `RESIDUAL-RISKS.md` | Accepted non-blocking P1 if any |
| `GOAL_EVIDENCE.md` | C1–C5 package |

## Execution notes

- Prefer **office** profile; if office blocked, set fallback in this catalog and re-map — do not silently use Fake.
- UI path preferred for lifecycle S01–S06; agent S10–S12 may use **sidecar SSE** as primary proof plus UI screenshot when Playwright available.
- S13 cancel may combine Adapter abort unit behavior with UI stop control if long-run flaky.
- Never paste API keys into evidence files.
