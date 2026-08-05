# Spec: VoltAgent Runtime Adapter (Local Agent Runtime · M1–M3)

**Status:** ready-for-agent  
**Archetype:** Agent Workbench (`@uilab/agent-workbench`)  
**Domain language:** Task / Turn / Run / Agent Runtime Event / Runtime Command / Task Projection / RuntimePort  
**ADRs:** 0012 (Runtime outside Renderer), 0013 (project events into Task state), 0014 (Project/Task/Turn/Run)  
**Related research:** Obsidian `学习/ai-agent/VoltAgent 调研：能力边界与 Workbench Adapter 接入.md`  
**Seam confirmed:** `RuntimePort` (primary); pure fullStream→Envelope mapper (secondary)

---

## Problem Statement

Workbench 已具备 Phase 3 Shell、Phase 4 Fake Runtime 竖切，以及 capture progressive 回放（含飞行棋 densify）。从用户视角：

- 打开任务区后，默认仍是 **假执行** 或 **录像回放**；
- 无法用真实模型完成「发一句 → 流式回答 → 工具/审批 → 结束」的完整工作循环；
- Fake 与 capture 对 UI/金样有价值，但 **不足以构成可交付的 Agent 产品体验**。

用户需要：在 **不把模型密钥和工具副作用放进浏览器** 的前提下，把本机 **VoltAgent** 接成第一条真 **Agent Runtime**，任务区 Timeline 吃真实事件流。

---

## Solution

在 monorepo 内增加 **Local VoltAgent 侧车**（本机进程），并实现 **`VoltAgentRuntimeAdapter`**，挂到已有 **`RuntimePort`**：

1. 用户在 **empty / 新对话**（或显式启用的 Runtime 任务）中发送消息；
2. Composition Root 装配 Adapter（可切换 `fake | voltagent`）；
3. Adapter 将 **Application Command** 转为 VoltAgent API 调用，将 **fullStream / SSE** 译为 **`AgentRuntimeEventEnvelope`**；
4. 既有 **Projection → Timeline** 渲染；UI 不直接拼 stream chunk；
5. **Fake 与 capture 路径保留**，不删除、不冒充 production。

交付按里程碑：

| 里程碑 | 用户可见结果 |
| --- | --- |
| **M1** | 真模型流式正文出现在 Timeline（run 生命周期完整） |
| **M2** | 可取消；侧车不可达有诚实错误；capabilities 诚实 |
| **M3** | 工具行、审批、可选读/写工作区文件（`file.changed` 卡片） |

---

## User Stories

1. As a Workbench 用户, I want 在新对话里发送消息并得到真实模型回复, so that 产品能真正帮忙而不只是演示。
2. As a Workbench 用户, I want 回复以流式出现在任务区主列, so that 体验接近 Codex 类产品而非整段闪现。
3. As a Workbench 用户, I want 看到回合进行中与结束后的状态（如处理中 / 已处理 / 失败）, so that 我知道系统是否仍在工作。
4. As a Workbench 用户, I want 在生成过程中停止当前 Run, so that 我可以打断错误或过长的执行。
5. As a Workbench 用户, I want 当本机 Runtime 未启动或断开时看到明确错误而非空白假成功, so that 我知道要启动侧车或检查配置。
6. As a Workbench 用户, I want 默认 seed 任务的 capture 回放仍然可用, so that 我能离线看飞行棋等金样。
7. As a Workbench 用户, I want empty/新对话走真 Runtime 路径（在配置启用时）, so that 我能区分「录像」与「真干活」。
8. As a Workbench 用户, I want Composer 发送后 draft 按既有 command 结果清空, so that 交互与 Fake 路径一致。
9. As a Workbench 用户, I want 运行中的 live status 反映真实阶段（思考/生成/工具）, so that 状态条不是摆设。
10. As a Workbench 用户, I want 工具调用在 Timeline 以工具行展示（名称、状态、可折叠细节）, so that 我能审计 Agent 做了什么。
11. As a Workbench 用户, I want 敏感工具在执行前请求我批准或拒绝, so that 危险操作不会静默发生。
12. As a Workbench 用户, I want 批准后工具继续、拒绝后有可读结果, so that HITL 闭环完整。
13. As a Workbench 用户, I want 写文件类工具完成后看到文件变更摘要（路径与增删提示）, so that 产物可发现。
14. As a Workbench 用户, I want 只读工具（如读文件/列目录）的结果可展开查看, so that 我能核对上下文。
15. As a Workbench 用户, I want reasoning 摘要在可用时与正文分离展示, so that 不把思考当成助手终稿。
16. As a Workbench 用户, I want 不支持的能力（如 steer/queue）不要假装可用, so that 我不会点到无效控件。
17. As a developer, I want Runtime 密钥与工具副作用留在侧车进程, so that 浏览器与打包产物不持有生产密钥。
18. As a developer, I want 通过配置在 Fake 与 VoltAgent 间切换, so that CI 与无 Key 环境仍可跑。
19. As a developer, I want 所有真执行仍经 RuntimePort, so that 以后可换 Pi 或其它 Adapter 而不重写 Timeline。
20. As a developer, I want 未知上游事件变成 unsupported-event 而非崩溃, so that 协议演进可渐进。
21. As a developer, I want 事件带 taskSequence 与 eventId, so that 去重、排序与恢复有稳定锚点。
22. As a developer, I want Command 幂等与 ack 语义与 Fake 一致, so that Application 层无需分叉。
23. As a developer, I want 映射层可单测（chunk 列表 → envelope 列表）, so that 不依赖真实 LLM 做回归。
24. As a developer, I want 集成测只断言 Port 可观察行为, so that 测试不绑 DOM 实现细节。
25. As a template 维护者, I want Fake ≠ production 的诚实边界写在 UI 或披露文案中, so that 模板声明不被破坏。
26. As a template 维护者, I want capture 金样路径不被本功能删除, so that 像素/密度回归仍可用。
27. As a Workbench 用户, I want 多轮对话在同一 Task 内连续, so that conversation 作用域对齐 taskId。
28. As a Workbench 用户, I want Run 失败时看到错误信息而非无限转圈, so that 我能重试或改 prompt。
29. As a Workbench 用户, I want retry（若已有入口）创建新 Run 而非改写旧事件, so that 历史可审计。
30. As a Workbench 用户, I want 工具 progress（若有）更新同一工具行而非刷屏, so that 时间线可读。
31. As a developer, I want shell 类工具可映射为 command 类呈现或 toolKind=command, so that 与 Codex 命令行密度接近。
32. As a developer, I want write 成功后 Adapter 可合成 file.changed, so that 上游无该事件时 UI 仍有文件卡。
33. As a Workbench 用户, I want 审批 UI 复用既有 Timeline approval / Composer 能力, so that 不另起第三套交互。
34. As an operator, I want 侧车一键或文档化启动方式, so that 本地开发可复现。
35. As an operator, I want 环境变量配置模型与工作区根, so that 不同机器可安全运行。
36. As a Workbench 用户, I want 取消后 Composer 恢复可发送, so that 不会卡在 cancelling。
37. As a developer, I want capabilities.cancel=true 且 approval 在 M3 为 true（当注册 needsApproval 工具时）, so that 矩阵反映真实能力。
38. As a developer, I want steer/queue 默认 false 或 unsupported, so that 不承诺未实现行为。
39. As a Workbench 用户, I want 长回复不阻塞整页, so that 流式 delta 可合并投影。
40. As a developer, I want monorepo 边界清晰（侧车包不污染 renderer 的 Node built-in 禁令）, so that check:workbench 仍过。
41. As a Workbench 用户, I want 同一 Task 切换离开再回来时（M3 不强制 IndexedDB）至少当次会话状态一致, so that 开发体验可接受。
42. As a security-conscious user, I want 写盘默认限制在配置的工作区根内, so that 工具不能任意改系统目录。
43. As a Workbench 用户, I want 拒绝审批后助手能继续说明原因, so that 流程不黑箱中断。
44. As a developer, I want 文档说明 VoltAgent 版本与 fullStream 映射表, so that 升级可对照。
45. As a product owner, I want 本功能不宣称已接生产远程集群 Runtime, so that 营销/文档诚实。
46. As a Workbench 用户, I want 中文优先的错误与状态文案, so that 与产品语言一致。
47. As a developer, I want 类型与 domain 词使用 Task/Turn/Run 而非把 VoltAgent conversation 泄漏到 UI 文案, so that 词汇统一。
48. As a QA engineer, I want 无 API Key 时明确失败或跳过真模型测, so that CI 不红。
49. As a developer, I want 可选进程内 SDK 模式与 HTTP 侧车模式在 Spec 中二选一为主、另一为后置, so that 实现不发散。
50. As a Workbench 用户, I want 真 Runtime 任务在导航中可识别（非 capture 标签混淆）, so that 我知道当前模式。

---

## Implementation Decisions

### Architecture

1. **执行位置**：Agent Runtime 在 Renderer 外的 **本机侧车进程**（或同 monorepo 的 Node 服务）；符合 ADR-0012。
2. **唯一对外 seam**：**`RuntimePort`**。UI、Application dispatch、Projection **不** import VoltAgent。
3. **Adapter 名**：`VoltAgentRuntimeAdapter`（Task Module 的 runtime 适配实现；装配在 Composition Root）。
4. **双路径保留**：
   - capture / local-sim：既有行为不变；
   - empty / 新对话 / 显式 runtime 任务：可挂 VoltAgent；
   - Fake：测试与无侧车默认。
5. **模式开关**：环境或 app 配置 `runtimeAdapter: 'fake' | 'voltagent'`（命名可调整，语义不变）。
6. **中游协议不变**：继续使用已声明的 **`AgentRuntimeEventType` + Envelope**；M1–M3 **不新增大批 eventType**。
7. **未知上游事件**：映射为合法 envelope 且投影 `unsupported-event`，或安全忽略非关键噪声；**禁止**让 UI 崩溃。
8. **子 Agent**：若出现 subAgent 元数据，填 `parentRunId` / payload；默认不要求多 Agent 产品化。

### Upstream mapping (VoltAgent → Envelope)

9. 优先消费 **fullStream**（进程内）或 **`POST /agents/:id/stream` SSE**（HTTP）；不把 `/chat` UI message 流当作唯一真源。
10. 核心映射：
    - start / run 边界 → `run.started`（必要时合成 `turn.created`）
    - text-* → `output.delta` / `output.completed`
    - reasoning-* → `reasoning.*`
    - tool-call / tool-result / tool-error → `tool.called` / `tool.completed`（error 态在 payload 或 status）
    - 流式 tool yield → `tool.progress`
    - finish → `run.completed`（含 usage 可放 payload）
    - abort → `run.cancel_requested`? + `run.cancelled`
    - error → `run.failed`
11. **M3 合成规则**（Adapter 职责）：
    - 写文件类 tool 成功 → 额外 `file.changed`（path、additions/deletions 尽力而为）；
    - bash/shell 类 → `command.*` 或 `tool.*` + `toolKind: command`（与投影约定一致即可，Spec 要求可测、一致）。
12. **commentary**：无独立 type；并入 `output.*`；可选 `payload.phase`。
13. **Envelope 填充**：Adapter 生成 `eventId`、单调 **`taskSequence`**、`taskId`/`turnId`/`runId`、`occurredAt`/`receivedAt`、`schemaVersion`。

### Downstream mapping (Command → VoltAgent)

14. `submitTurn` → 启动/继续一次 stream（`conversationId` 对齐 `taskId`，userId 可用固定 dev 或 session 级）。
15. `cancelRun` → AbortController / 断开 SSE / 上游 abort。
16. `respondToApproval` → VoltAgent tool approval 响应协议。
17. `provideRunInput` → 若 M3 注册澄清类流程则接；否则 `unsupported`。
18. `queueFollowUp` / `steerRun` → 本 Spec **默认 `unsupported`**（capabilities 为 false），除非实现者超额完成。
19. `retryTurn` → 新 `runId` 的新 stream；旧 Run 只读。
20. `reconcileInterruptedRun` → M1–M3 可 `unsupported` 或最小 stub；不阻塞主路径。

### Capabilities (honest matrix)

21. M1 结束：`cancel` 可先 false 直至 M2。
22. M2：`cancel: true`；steer/queue/approval/runInput 按实现填写。
23. M3：至少一组 tool；若含 `needsApproval` 则 `approval: true`；`runInput` 按是否实现填写。
24. UI 不得展示未支持能力为可用（与既有 Composer/runtime 行为一致）。

### Sidecar / packaging

25. 侧车为 workspace 内可启动的 Node/TS 服务（推荐默认 **HTTP :3141 或可配置端口**，与 VoltAgent hono 习惯一致）；密钥仅侧车 env。
26. **Renderer 禁止**直接依赖 Node built-in / 文件系统 API（既有 check:workbench）。
27. 工作区根（M3 写盘）：环境变量配置；默认限制在仓库或显式目录内。
28. 模型 Provider：通过 VoltAgent/ai-sdk 配置；文档列出最小 env（如 `OPENAI_API_KEY` 等）。
29. **不**将 VoltOps 托管 Memory/resumable 作为默认硬依赖；本地 dev 默认 in-memory 或 LibSQL 文件可选。
30. **Resumable streaming** 与 **abort 互斥**（上游文档）：本 Spec 默认 **优先 cancel**，resumable 不作为 M1–M3 必做。

### Projection / UI

31. 复用现有 `projectEvents` 与 Timeline；**不**为 VoltAgent 新建第二套主列组件。
32. capture `ExecutionStream` 不改为本 Spec 必改项。
33. 用户可见文案中文优先；标识符英文。
34. 披露：真 Runtime 模式可标注「本机 VoltAgent / 非远程生产集群」。

### Testing seam (confirmed)

35. **主 seam：`RuntimePort`** — 对 Adapter 发 Command，断言 `subscribe` 的 envelope 序列与 ack。
36. **辅 seam：纯函数映射** — 固定 fullStream chunk 列表 → 固定 envelope 列表（无网络、无 LLM）。
37. 可选：Composition 开关的一条集成测（fake vs voltagent 装配）。
38. 真 LLM 测试：可选、可跳过（无 Key）；不作为 CI 门禁硬依赖。

### Milestone acceptance (normative)

**M1**

- submitTurn → 至少：`run.started`、一个或多个 `output.delta`、`output.completed` 或等价终态、`run.completed` 或 `run.failed`
- Timeline 出现流式助手正文
- Fake/capture 未回归

**M2**

- cancelRun → 终态 `run.cancelled`（或等价可观察取消）
- 侧车 down → subscribe/error 或 sendCommand 失败可观测，UI 诚实
- getCapabilities 与真实行为一致

**M3**

- 至少一种 tool 走通 tool.called → tool.completed 投影
- 至少一种 needsApproval 工具：approval.requested → respondToApproval → 继续或拒绝路径
- 可选：write tool → file.changed 出现文件类 Timeline/file card
- 工作区根外写盘被拒绝或不可达（安全底线）

---

## Testing Decisions

### What makes a good test

- 只断言 **外部行为**：Command ack、envelope 的 `eventType` 序、关键 payload 字段、Run 终态、capabilities。
- 不断言：React 组件结构、CSS、VoltAgent 内部类名、真实模型措辞。
- 映射测试使用 **冻结 fixture chunks**，不打网。
- 集成测可 mock fetch/SSE 或起本地 stub server；真模型测标记 skipIfNoKey。

### What to test

| 模块 | 内容 |
| --- | --- |
| Envelope mapper | chunk → envelope |
| VoltAgentRuntimeAdapter | RuntimePort 合同（M1–M3 场景表） |
| Composition / wiring | 开关装配（轻量） |
| 回归 | 既有 Fake runtime 测、capture-flychess 等保持绿 |

### Prior art in repo

- Fake runtime 与 `codex-style-stream-order`、`project-events-4d`、`fake-runtime` 测试：事件序与投影类别。
- `workbench-runtime-slice` 集成：Command → Timeline 竖切。
- capture 单测：fold/progressive（本功能不得破坏）。

### Suggested scenario table (Port-level)

1. happy path text stream (M1)
2. model/provider error → run.failed (M1/M2)
3. cancel mid-stream (M2)
4. tool call without approval (M3)
5. tool with needsApproval approve (M3)
6. tool with needsApproval reject (M3)
7. write tool → file.changed (M3 optional but if write tool shipped, required)
8. unknown chunk type → no crash (any)

---

## Out of Scope

- 生产远程多租户 Agent 集群 / 云托管 Runtime 作为默认
- Pi Agent Adapter（可后续第二条 Adapter）
- 完整 steer / queue 产品化（可 unsupported）
- IndexedDB EventStore 生产持久化（4E 深化）
- VoltOps Console 必选集成、Managed Memory 默认
- Resumable streaming 默认开启
- Composer 1:1 像素 / 任务区 CFV 像素收口（并行主线，非本 Spec）
- Workspace API 全量产品化（experimental 可用但非必达）
- Surface Registry、Document/Browser/Review 真实现
- 子 Agent 产品导航与并行多 Run 编排
- 修改 capture schema 放宽 fidelity 合同
- 提交无关 flychess 工作区产物与 playwright 大图

---

## Further Notes

### Protocol stability (pre-confirmed)

- 统一中游 **`AgentRuntimeEventType`（约 40 种）+ Envelope** 已覆盖主流 run/text/reasoning/tool/approval/cancel/file/command 主路径。
- M3 **不扩枚举**；file/command 靠 Adapter 映射与合成。
- 扩展靠：`eventType` 开放字符串、`payload`、`schemaVersion`、unsupported 投影、capabilities。
- capture `StreamEvent` 是旁路金样协议，**不是** production 事件真源。

### Design principles checklist

| 原则 | 本 Spec |
| --- | --- |
| Runtime outside Renderer | 侧车 + Adapter |
| Events project UI | 不改此方向 |
| Fake ≠ production | 开关与文案诚实 |
| Single high seam | RuntimePort |
| Open/closed for new backends | 新 Adapter 实现 Port |

### Docs to update when implementing

- Workbench AGENTS / README：说明如何启动侧车与 env
- 可选：`docs/plans` 或 evidence 记录 M1–M3 完成证据
- 映射表可落在侧车 README 或 architecture 短文

### Implementation order recommendation

1. 侧车 Hello Agent + stream  
2. Mapper + Adapter M1  
3. Composition 开关  
4. M2 cancel + errors  
5. M3 tools + approval + optional file write  
6. 文档与证据  

### Reference links

- VoltAgent docs: https://voltagent.dev/docs/  
- Agents/stream: fullStream event types  
- Tools: needsApproval, workspace  
- Repo design: `docs/superpowers/specs/2026-08-02-codex-task-pane-runtime-design.md`  
- Protocol: Task Module `protocol/events` + `protocol/commands` + `ports/runtime-port`
