# Goal Contract: VoltAgent 真模型 E2E 验收（独立裁决 + 有界 Codex 设计评审）

## Objective

在本仓库 Agent Workbench 上，以 **本机 VoltAgent 侧车 + 真实模型** 跑通一套覆盖日常主流 Agent 场景与 Real Task Lifecycle 验收轴（规格 A1–A12 中可对真 Runtime 观察的项）的 **端到端验收**，并由 **独立裁决者** 基于新鲜证据给出通过/不通过；同时对为实现/修复而改动的代码完成 **有界（最多两轮）Codex 设计质量评审**，最终达到「场景裁决 PASS 且设计评审在边界内 PASS」。成功标准是证据与裁决，不是执行者自述。

## Deliverables

- 场景目录：`docs/evidence/voltagent-real-e2e-DATE/SCENARIO-CATALOG.md`（DATE 为跑测日 YYYY-MM-DD；编号 S*，每条含：意图、前置、操作步骤、可观察结果、对应 A#/能力标签、证据文件约定名）
- 可重复执行的 E2E 运行说明与产物目录：`docs/evidence/voltagent-real-e2e-DATE/`（含环境快照、命令日志、API/SSE 摘要、UI 截图或 Playwright 输出、git commit SHA）
- 执行者报告：`docs/evidence/voltagent-real-e2e-DATE/RUN-REPORT.md`
- 独立裁决产物：`docs/evidence/voltagent-real-e2e-DATE/VERDICT.json` 与 `VERDICT.md`（裁决者不等于执行者；只读证据与场景目录）
- 有界 Codex 设计评审：`docs/evidence/voltagent-real-e2e-DATE/CODEX-REVIEW-R1.md`，若有修复则 `CODEX-REVIEW-R2.md`；超出两轮禁止再开
- 若评审或裁决要求改代码：当前分支上的修复提交（可 `git log` / `git show` 指认）
- 最终 GOAL_EVIDENCE 块写入执行会话末条消息，并同步摘要到证据目录 `GOAL_EVIDENCE.md`

## Completion Criteria

### C1 — 场景目录齐全且可独立执行

- Result: 存在已编号场景目录，覆盖下表「必覆盖」集合，每条可独立按步骤复现。
- Evidence: 打开 `SCENARIO-CATALOG.md`；清点 S* 条目与必覆盖映射表。
- Pass rule: 下列 **必覆盖** 每一项至少映射到 ≥1 个 S*，且每条含「操作 + 可观察结果 + 证据文件名」；缺任一项 → FAIL。
  - **生命周期轴（对真 Runtime 可观察）**：A2 新对话 Runtime hub；A3 切换 Task；A4 硬删 Task；A6 Navigator 无 mock utility；A8 冷启动零 Task；A10 默认非 capture seed（A1 多 Project 建/切/改名若本会话不触达则在目录中标 `deferred-with-reason` 且不超过 2 项 deferred）
  - **主流 Agent 轴**：纯文本流式回复；只读工具（如 ls/read）并在 Timeline 可见；写/删类工具 **审批 HITL**（出现等待 → 批准或拒绝 → 可观察后续）；取消进行中 Run；侧车诚实文案（非 Fake 冒充）；侧车不可用时的诚实失败面
  - **门禁轴**：`pnpm --filter @uilab/agent-workbench typecheck|test|build` 与 `pnpm check:workbench` 在最终修复后仍可通过
- Proof timing: 场景目录定稿后、首轮跑测前；若跑测中增补场景，最终裁决前再扫一遍目录。

### C2 — 真模型 E2E 跑测完成并落新鲜证据

- Result: 在 `VITE_RUNTIME_ADAPTER=voltagent` + 侧车真模型（非 Fake、非 capture 默认路径）下，对场景目录中 **非 deferred** 的 S* 全部执行并写入证据。
- Evidence: `RUN-REPORT.md` 中每条 S* 的状态（PASS/FAIL/BLOCKED）与对应证据路径；至少含：侧车启动日志片段、模型/ profile 配置快照（**不得**含明文密钥）、代表性 SSE/API 摘要或 Timeline 可观察导出、关键 UI 截图或浏览器测试输出；记录 `git rev-parse HEAD`。
- Pass rule: 非 deferred 场景全部有证据文件；`RUN-REPORT` 中无「仅模型口述完成」而无路径的条目；任一非 deferred 场景无证据 → C2 FAIL。
- Proof timing: 全部场景执行结束后、提交裁决前；最终代码修复后再对受影响场景重跑并更新时间戳。

### C3 — 独立裁决 PASS

- Result: 独立裁决者（新会话/子代理，**禁止**由跑测与改码同一上下文直接自判为最终裁决）仅根据 `SCENARIO-CATALOG.md` + 证据目录输出 `VERDICT.json`/`VERDICT.md`。
- Evidence: `VERDICT.json` 字段至少含：`adjudicator_id`、`evidence_dir`、`commit_sha`、`scenarios[]`（`id, verdict, evidence_paths, notes`）、`overall`（`pass|fail`）、`generated_at`；`VERDICT.md` 人类可读摘要。
- Pass rule: `overall === "pass"` **且** 每个非 deferred 场景 `verdict === "pass"`；裁决文中须引用证据路径；若裁决者声明「未读某证据」却标 pass → FAIL。执行者自写的 RUN-REPORT 不得替代 VERDICT。
- Proof timing: 最终一轮相关修复与证据刷新 **之后** 重新生成裁决（旧 VERDICT 作废）。

### C4 — 有界 Codex 设计评审在边界内通过

- Result: 对「本目标引入或修改的 Workbench/侧车相关代码与测试」完成 Codex 设计质量评审（设计原则、可维护性、可读性、模块边界），修复阻塞项后复评。
- Evidence: `CODEX-REVIEW-R1.md`；若 R1 有 P0/P1 修复则 `CODEX-REVIEW-R2.md` + 对应 commit；评审范围清单（文件路径）。
- Pass rule: 最多两轮评审（R1→修复→R2），禁止 R3 及以后；最终轮无 P0；P1 已修或在 RESIDUAL-RISKS.md 写明接受残留且不阻塞 C3；若 R2 仍有新 P0 则目标 Blocked 而非再开 R3。
- Proof timing: 代码侧最后一次为回应评审的提交之后；若 R2 无新代码，R2 可基于同一 tree 复评。

### C5 — 包级门禁在最终树仍绿

- Result: 最终代码树通过 Workbench 包门禁。
- Evidence: 在仓库根执行并保存完整日志到证据目录：
  - `pnpm --filter @uilab/agent-workbench typecheck`
  - `pnpm --filter @uilab/agent-workbench test`
  - `pnpm --filter @uilab/agent-workbench build`
  - `pnpm check:workbench`
- Pass rule: 上述四条命令 exit code 均为 0；日志文件存在于证据目录。
- Proof timing: 所有修复提交之后、最终 `GOAL_EVIDENCE` 之前。

## Scope

### In scope

- `@uilab/agent-workbench` 产品默认 Runtime 路径下的 VoltAgent Adapter 行为与 UI 投影
- `@uilab/workbench-runtime-voltagent` 本机侧车（`AGENT_PROFILE=office` 优先；`minimal` 仅当 office 阻塞且 catalog 声明 fallback）
- 真模型调用（侧车 `.env` 已配置的 DeepSeek/OpenAI 兼容端点）
- 场景设计、自动化或半自动 E2E（Playwright/浏览器集成/脚本 + 手工步骤）、证据采集
- 独立裁决流程与有界 Codex 设计评审及必要修复
- 与 Real Task Lifecycle 相关的可观察行为（目录、新对话、删除、Navigator、诚实边界）

### Out of scope

- 云多租户生产 Runtime、跨设备会话同步
- Surface Registry / Document/Browser/Review 真实现
- Electron/Tauri Desktop Host、删 Project
- 以 Fake Runtime 或 capture 金样替代本目标的「真模型」证明（capture/Fake 仅可作对照，不得作为 C2/C3 唯一证据）
- 无界多轮「再 review 再修」循环（超过 C4 两轮即停）
- 向 git 提交密钥、`.env` 明文、生产密钥轮换
- 未获批准的外发 MCP 写操作（飞书写回等）；本目标默认只验证只读或本地工作区副作用

## Context and Starting Points

- 生命周期规格与 A1–A12：`docs/plans/real-task-lifecycle-spec.md` §12
- ADR 目录与 IDB：`docs/adr/0015-workbench-project-catalog-and-unified-idb.md`
- Workbench 合同：`archetypes/agent-workbench/AGENTS.md`
- VoltAgent Adapter / Office Profile：`docs/plans/voltagent-runtime-adapter-spec.md`、`docs/plans/voltagent-office-profile-spec.md`
- 侧车实现：`tooling/workbench-runtime-voltagent/`（`pnpm dev:workbench-runtime`；`.env.example`）
- 既有 O1 smoke 证据形态参考：`docs/evidence/office-o1-smoke/`（注意其中历史失败点：多步 tool 续写、诚实文案；本目标须用 **当前 HEAD** 重证）
- 开发入口：`VITE_RUNTIME_ADAPTER=voltagent` + Workbench `pnpm dev:workbench`；侧车默认端口 `3141`
- 真源实现会话近期落地：Real Task Lifecycle（catalog / 空壳冷启动 / Runtime 默认）

## Constraints and Authority

### Allowed

- 读写本仓库应用与侧车代码、测试、文档、`docs/evidence/voltagent-real-e2e-*`
- 启动/停止本机侧车与 Workbench dev server；使用已有本地 `.env`（不打印密钥）
- 在隔离 `WORKSPACE_ROOT`（建议 `output/voltagent-e2e-workspace/`）内创建/修改测试文件
- 运行包级 typecheck/test/build 与 `check:workbench`
- 派生子代理：跑测执行者、**独立裁决者**、Codex 评审（或本地 `/review` / codex 救援通道，以仓库可用工具为准）
- 为修 FAIL 场景或 P0/P1 评审项提交 git commit（当前分支）

### Ask first

- 使用或轮换新的付费 API 配额策略变更、更换未在 `.env` 中已配置的模型供应商
- 启用会外发的 MCP 写操作或真实飞书/日历写入
- 将证据目录中的日志公开发布到仓库外
- 强制 push、改写已推送历史、删除远程分支
- 打开第三轮及以上 Codex 设计评审

### Never

- 把 API Key、Token、Cookie 写入 git 跟踪文件或证据 Markdown 明文
- 用 Fake Runtime / capture 默认路径冒充「真模型 E2E 通过」
- 由执行者自己填写 `VERDICT.json` 并宣称独立裁决
- 无限 review 循环或通过放宽 C1–C5 字面标准自称完成
- 在 renderer 中引入 Node/Electron API 或破坏 `check:workbench` 模块边界
- 删除用户工作区根外的文件

## Execution Policy

- Start with: 确认侧车 `.env` 可用（有 Key 无明文落盘）；创建 `docs/evidence/voltagent-real-e2e-DATE/`；起草 `SCENARIO-CATALOG.md` 并完成 C1 自检映射表。
- Work in checkpoints:
  1. 场景目录锁定 → C1
  2. 起侧车 + Workbench → 逐场景跑测写证据 → C2
  3. 派 **新** 裁决上下文读证据出 VERDICT → C3；失败则诊断修复并重跑受影响场景（裁决作废重开）
  4. Codex R1 → 修 P0/P1 →（可选）R2 → C4
  5. 全量门禁 → C5 → 汇总 `GOAL_EVIDENCE`
- Validate during work: 每完成一个 S* 立即落证据文件；禁止攒到最后补造；关键 FAIL 先 `diagnosing-bugs` 式定位再改代码。
- On failed checks: 保留失败日志与截图；改实现或测试 harness，**不**删减必覆盖场景；不修改 Pass rule 文本来「过关」。
- On external/background work: 侧车与 dev server、长时模型流必须在写 VERDICT 前确认进程状态；子代理完成后回收其输出路径再继续。

## Terminal States

- Complete when: C1–C5 全部 PASS，且最终消息含完整 `GOAL_EVIDENCE`（含裁决 overall=pass、两轮内评审结论、四条门禁日志路径、commit SHA）。
- Blocked when: 同一阻塞在穷尽安全替代后仍存在——例如：无有效模型密钥且无法配置；真模型提供商持续 4xx/5xx 导致全部 tool 多步场景不可跑；R2 后仍有新 P0 且用户未批准 R3；独立裁决通道不可用。须报告证据与所需决策。
- Limit reached when: No user-specified limit; report only platform-enforced limits

## Final Evidence

- Report format: `GOAL_EVIDENCE`
- Include: C1–C5 逐条 verdict 与证据路径；SCENARIO-CATALOG、RUN-REPORT、VERDICT.json 路径与 overall；CODEX-REVIEW-R1（及 R2）P0/P1 计数与残留；四条门禁命令与 exit code；git rev-parse HEAD 与修复 commit 列表；Assumptions 变更与 residual risks；生命周期状态 complete|blocked|limit_reached
- Freshness: 最终相关代码变更与场景重跑之后重新生成 VERDICT 与门禁日志；禁止复用过期 O1 smoke 作为 C3 唯一依据

## Assumptions

- A1 [confirmed]: 本机 `tooling/workbench-runtime-voltagent/.env` 已存在（侦察时 `has_env=yes`）；执行时仍须验证 Key 有效，失败则 Blocked 而非伪 PASS。
- A2 [inferred]: 「真实模型」指侧车经 OpenAI 兼容 API 调用已配置模型（默认 DeepSeek 系如 `deepseek-v4-flash`/`VOLTAGENT_MODEL`）；若错误，改用 `.env` 中实际模型并在 RUN-REPORT 写明。
- A3 [inferred]: 独立裁决可通过「新子代理 + 只读证据目录」实现；若运行时无子代理，则用 **新会话** 仅加载证据目录产出 VERDICT，仍禁止执行者自裁。
- A4 [inferred]: Codex 设计评审指仓库可用的 code-review / Codex review 通道（如 `/review`、codex 子代理或既有 `CODEX-REVIEW.md` 形态）；以实际可调用工具为准，输出文件名固定为 `CODEX-REVIEW-R*.md`。
- A5 [inferred]: A1 多 Project 与 A9 刷新恢复在浏览器真 IDB 下可测；若自动化成本过高，允许各 ≤1 项标 `deferred-with-reason`，但 A2/A4/A6/A8/A10 与 Agent 主流轴不得 deferred。
- A6 [unknown]: 当前 HEAD 是否已修复历史上 O1 的「tool 多步 400」与「UI 仍显示 Fake」；本目标必须用新鲜跑测证明，不得假设已修。

## Invocation

- Target runtime: Generic（可粘贴到 Codex Goal Mode / Claude Code `/goal` / 本机执行会话）
- Start instruction: 执行 `docs/plans/GOAL-voltagent-real-model-e2e-acceptance.md`；先 C1 场景目录，再真模型 E2E，再独立裁决，再有界 Codex 评审，最后门禁与 `GOAL_EVIDENCE`。
- Lifecycle preflight: 确认无冲突进行中的同名目标；确认可写 `docs/evidence/`；确认可启动侧车与 Workbench；确认评审与裁决工具可用；密钥仅环境变量注入。
