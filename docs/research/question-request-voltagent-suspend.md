# 调研：VoltAgent 挂起/恢复能否承载 Question Request（run.input 通道可行性）

- 工单：[#106](https://github.com/xiaowen-0725/uilab-admin/issues/106)（地图 [#105](https://github.com/xiaowen-0725/uilab-admin/issues/105)）
- 调研对象版本：`@voltagent/core` 2.9.2、`@voltagent/server-core` 2.1.20、`ai`（AI SDK）6.0.242、`@ai-sdk/provider-utils` 4.0.41（均为本仓库 `tooling/workbench-runtime-voltagent` 实际锁定版本，源码路径以 pnpm 安装的 dist 产物为准）
- 结论速览：**A 路线（结构化 `run.input_requested` + `provideRunInput`）在侧车端可行**，但不是靠 VoltAgent 的「通用 run 级 suspend/resume」——Agent 聊天流上没有这种机制；可行的承载体是 **client-side tool（无 `execute` 的工具，前端补 tool result 恢复）**，其恢复载荷天然是任意结构化 JSON。`needsApproval` 的 `reason` 字段也能干净携带 JSON 并被侧车 tool 读到，可作为「server-side tool 中途要答案」的备选。

---

## 1. VoltAgent 是否有通用 suspend/resume-with-payload 或 elicitation 机制？

分三类，逐一核对官方文档与源码：

### 1.1 Workflow suspend/resume：有，且带任意 payload —— 但只在 Workflow API 上

- 官方文档：[Suspend & Resume & Cancellation](https://voltagent.dev/docs/workflows/suspend-resume/)、[Execute Function API](https://voltagent.dev/docs/workflows/execute-api/)、[Schemas](https://voltagent.dev/docs/workflows/schemas/)。`suspend(reason?, data?)` 挂起，`resume(resumeData, options?)` 恢复；`suspendSchema` / `resumeSchema` 用 Zod 校验双向 payload；恢复后该 step 重跑并拿到 `resumeData`。
- HTTP 端点（[API Reference](https://voltagent.dev/docs/api/api-reference/)）：`POST /workflows/:id/executions/:executionId/suspend|resume`；`resumeData: z.any()` 任意结构。源码：`@voltagent/server-core/dist/index.mjs` L344–391（`WorkflowSuspendRequestSchema` / `WorkflowResumeRequestSchema`）、L925（workflow SSE stream「The stream remains open during suspension and continues after resume」）、L973–。
- 类型定义：`@voltagent/core/dist/index.d.ts` L10154–10196（`WorkflowSuspensionMetadata.suspendData` / `WorkflowSuspendController.suspend(reason?)`）、L10264–10309（`resume` 返回可再次挂起的执行结果）。
- **对本仓库的适用性：不适用。** 侧车走的是 `Agent.streamText` + `/agents/:id/stream`（`tooling/workbench-runtime-voltagent/src/create-agent.ts`、`server.ts`；前端 Adapter `voltagent-runtime-adapter.ts` L716），不是 Workflow。要用 Workflow suspend/resume 就得把整个对话 run 重写成 workflow，放弃现有 agent loop / memory / approval 链路，改造成本远超收益。

### 1.2 Agent 聊天流：没有通用 run 级 suspend/resume；有两种「工具级」挂起

Agent 路径的流式循环完全委托给 AI SDK v6 `streamText`（`@voltagent/core/dist/index.mjs` L31963 `const streamResult = streamText({ model, messages, tools, ... })`）。AI SDK 在这条路上只有两种「流结束、等外部输入、带历史重发恢复」的机制：

1. **Tool approval（`needsApproval`）**：官方文档 [Tools — Tool Execution Approval](https://voltagent.dev/docs/agents/tools/)。模型调工具 → 流内发 `tool-approval-request` chunk → 流正常收尾（`finish`）→ 客户端带 `approval: { id, approved, reason? }` 的 UIMessage 重发 → 新流里执行（approve）或发 `tool-output-denied`（deny）。恢复载荷形态见 §2。
2. **Client-side tool（无 `execute` 的工具）**：官方文档同页「What Makes a Tool Client-Side?」——「A tool without an `execute` function is automatically client-side」。模型调工具 → 流内发正常 `tool-call` chunk 后收尾 → 前端执行/收集用户输入 → 以 tool part `state: 'output-available'` + **任意结构化 `output`** 的 UIMessage 重发 → 模型在下一步拿到该结构化结果继续。文档明确：「You must call `addToolResult` to send the tool result back to the model.」这就是官方推荐的「工具向前端要任意结构化数据」通道。

两者的「挂起」都不是流悬停，而是「流收尾 + 带扩展历史重发」。这与本仓库 approval 链路已验证的恢复方式完全一致（`voltagent-runtime-adapter.ts` L637–671：resume 即重新 POST `/agents/:id/stream`，input 为 UIMessage 数组）。

### 1.3 Elicitation：存在，但只是进程内 MCP 桥，不经 HTTP API

- `@voltagent/core/dist/index.d.ts` L8650–8651：`OperationContext` 上有 `/** Optional elicitation bridge for requesting user input */ elicitation?: (request: unknown) => Promise<unknown>`。
- 来源：`@voltagent/core/dist/index.mjs` L33622（`options?.elicitation ?? options?.parentOperationContext?.elicitation`，即 generateText/streamText 的**进程内调用选项**）与 L41288+（MCP client 的 `UserInputBridge`，服务 MCP 协议的 elicitation 请求）。
- 它是一个 JS 回调函数，`/agents/:id/stream` 的 JSON body 无法携带，server-core 的 `processAgentOptions` 也不暴露它。**浏览器前端经 HTTP 无法使用**，排除。

### 1.4 小结（问题 1 答案）

VoltAgent **没有** Agent 聊天流上的通用「run 级 suspend/resume-with-payload」或经 HTTP 可用的 elicitation。带任意 payload 的挂起/恢复只存在于：Workflow API（不适用本仓库架构）、tool approval（payload 限 `reason: string`）、client-side tool（payload 为任意 JSON tool output，**最贴合 Question Request**）。

---

## 2. `needsApproval` 恢复载荷能否干净携带结构化答案？侧车 tool 能否读到？

**能携带、能读到。** 全链路证据：

1. **前端 → ModelMessage 转换保留 `reason`**：Adapter 以 UIMessage tool part `state: 'approval-responded'`、`approval: { id, approved, reason? }` 恢复（`voltagent-runtime-adapter.ts` L639–650）。侧车端 `@voltagent/core` 用 AI SDK 的 `convertToModelMessages` 转换输入（`@voltagent/core/dist/index.mjs` L33321）；转换实现把 `approval.reason` 原样写进 `tool-approval-response` part（`ai/dist/index.mjs` L9151–9158：`{ type: "tool-approval-response", approvalId, approved, reason: toolPart.approval.reason, ... }`；ModelMessage 侧同样保留，L1612–1618）。`reason` 类型是自由 `string`（`ai/dist/index.d.ts` L1758–1766），装 JSON 字符串没有任何校验/截断。
2. **approve 路径：tool 在侧车端能读到载荷**。恢复流里 AI SDK 收集 approvals（`ai/dist/index.mjs` L7561 `collectToolApprovals({ messages: initialMessages })`，实现 L2831–2881），对 approved 的 tool call 直接执行 `executeToolCall({..., messages: initialMessages, ...})`（L7605–7615）；`executeToolCall` 把 `messages` 放进工具执行 options（L2894–2960：`options: { toolCallId, messages, abortSignal, experimental_context }`）。VoltAgent 的工具包装层把它透传为 `executionOptions.toolContext.messages`（`@voltagent/core/dist/index.mjs` L35249–35262；类型见 `index.d.ts` L817–826 `ToolExecuteOptions.toolContext`）。**侧车 tool 的 `execute(args, options)` 只需在 `options.toolContext.messages` 里反向扫描 `role === 'tool'` 消息中 `type === 'tool-approval-response'` 且 `approvalId` 匹配的 part，`JSON.parse(part.reason)` 即得结构化答案。**
3. **deny 路径：`reason` 直接喂给模型**。denied approval 会变成 `output: { type: "execution-denied", reason: approvalResponse.reason }` 的 tool result 进入模型上下文（`ai/dist/index.mjs` L4605–4623），流内同时发 `tool-output-denied` chunk（L7593–7600）。即「拒绝 + reason 承载答案」也能让模型看到内容，但语义是「工具被拒」，模型可能当失败处理，不推荐作为主通道。
4. **approve 路径的 reason 不会泄漏进 prompt**：发给 LLM 的 prompt 转换会滤掉非 provider-executed 工具的 `tool-approval-response` part（`ai/dist/index.mjs` L1595–1597）。模型看到的是 tool 的正式 output——即由侧车 tool 决定把答案以什么形态回给模型，干净可控。

**代价与风险**：

- `reason` 无 schema 校验（对比 workflow `resumeSchema`），JSON 合同只能靠两端约定 + 侧车 tool 防御性 parse。
- 从 `toolContext.messages` 捞 approval-response 属于「利用透传的 AI SDK 内部消息结构」，不是 VoltAgent 文档承诺的公开 API（文档只演示 `approved/reason` 由模型侧感知 deny 语义）；AI SDK minor 升级有破坏风险，需要用侧车测试钉住。
- 若未来启用 `experimental_toolApprovalSecret`（HMAC，`ai/dist/index.d.ts` L1463–1465），签名只绑定 approval 请求与 tool call，不覆盖 `reason`，现有 Adapter 原样回传即可，不受影响。
- 语义污染：把「审批」复用为「提问」，Timeline/审计里会显示为 approval 事件，需要 Adapter 侧翻译，长期可读性差——这正是更推荐 client-side tool 的原因（§4）。

---

## 3. SSE fullStream 挂起/恢复相关 chunk 清单与前端映射缺口

侧车 `/agents/:id/stream` 的 SSE 就是逐条 `JSON.stringify(fullStream part)`（`@voltagent/server-core/dist/index.mjs` L2718–2740），因此 chunk 类型全集 = AI SDK v6 `TextStreamPart`（`ai/dist/index.d.ts` L2433–2518）：

`text-start` / `text-delta` / `text-end`、`reasoning-start` / `reasoning-delta` / `reasoning-end`、`tool-input-start` / `tool-input-delta` / `tool-input-end`、`tool-call`、`tool-result`、`tool-error`、**`tool-output-denied`**（L1550–1558）、**`tool-approval-request`**（L724–738：`{ approvalId, toolCall: { toolCallId, toolName, input }, signature? }`）、`source`、`file`、`start-step` / `finish-step`、`start`、`finish`、`abort`、`error`、`raw`。

与挂起/恢复直接相关：

| chunk | 何时出现 | `fullstream-to-envelope.ts` 现状 |
|---|---|---|
| `tool-approval-request` | approval 挂起点 | 已映射 → `approval.requested`（L442–465） |
| `tool-call`（无 execute 的 client tool） | client-tool 挂起点 | 已映射 → `tool.called`（L267–301）；**Question Request 需在 Adapter/mapper 识别专用工具名，改发 `run.input_requested`** |
| `finish` | 挂起时流也正常收尾（finishReason `tool-calls`） | 已映射 → `run.completed`；Adapter 已有 pendingApprovals 抑制（adapter L764–780），**client-tool 路线需同样的 pendingQuestions 抑制** |
| `tool-output-denied` | deny 恢复流开头 | **未映射（default no-op）**——deny 后前端看不到工具被拒的终态事件，建议映射为 `tool.completed`（status: denied）或对应 approval 终态 |
| `tool-result`（approve 恢复流开头，L7627 直接 enqueue） | approve 恢复 | 已映射 → `tool.completed` |

其余未映射 chunk（`text-start`、`tool-input-start/delta/end`、`start-step`/`finish-step`、`file`、`raw`）与挂起/恢复无关，维持 no-op 安全。

**前端需要新增的映射工作**：① `tool-output-denied` → 终态事件；② 专用提问工具的 `tool-call` → `run.input_requested`（含结构化问题 payload = tool input）；③ `provideRunInput` → Adapter 侧合成 `run.input_provided` 并按 §4 形态重发流（答案不经 SSE 回来，属于请求侧历史）。

---

## 4. 结论：A 路线可行性与推荐载荷形态

### A 路线（结构化 `run.input_requested` + `provideRunInput`）：**侧车端可行**

前端协议事件（`archetypes/agent-workbench/src/modules/task/protocol/` 已声明 `run.input_requested` / `run.input_provided` / `provideRunInput`）可以完整落在 VoltAgent 现有 Agent API 上，**推荐用 client-side tool 承载**：

1. 侧车注册专用工具 `request_user_input`（或 `ask_user`）：`createTool({ name, description, parameters: z.object({ question, kind, options?, schema? }), /* 无 execute */ })` —— 无 `execute` 即官方 client-side tool（[Tools 文档](https://voltagent.dev/docs/agents/tools/)「A tool without an execute function is automatically client-side」）。
2. 流内出现该工具的 `tool-call` chunk 时，Adapter 不发 `tool.called`，改发 `run.input_requested`（payload = tool input，天然结构化、有 Zod schema 兜底），并像 pendingApprovals 一样抑制 `run.completed`。
3. `provideRunInput` 到达后，Adapter 复用 approval-resume 的重发模式（adapter L637–671），把 tool part 改为：

```jsonc
{
  "type": "tool-request_user_input",
  "toolCallId": "<原 toolCallId>",
  "state": "output-available",
  "input": { /* 原提问 payload */ },
  "output": { /* 前端回传的结构化答案，任意 JSON */ }
}
```

4. `convertToModelMessages` 把它转成标准 tool-result，模型下一步直接拿到结构化答案继续；Adapter 同时本地合成 `run.input_provided` 事件。

相比 approval 路线的优势：恢复载荷是**一等公民 tool output（任意 JSON）**而非塞进 `reason` 字符串；不污染审批语义；全部落在官方文档明示的机制上（文档甚至给了 clipboard/位置授权这类交互式示例）。

边界：client-side tool 意味着「答案由模型消费」，侧车端没有工具代码在恢复后继续跑。若未来确需「**server-side tool 执行中途**拿到答案再继续执行」，Agent 路径只有 §2 的 `needsApproval` + `reason` JSON 方案（tool 从 `options.toolContext.messages` 读取），或整体迁移 Workflow suspend/resume——按当前 Question Request 需求（模型发问、用户作答、模型继续）不需要走到这一步。

### B 路线（仿 approval 专用 tool）：作为备选，恢复载荷建议

若不采用 client-side tool 而沿用 approval 机制：专用工具 `ask_user`（`needsApproval: true`，`execute` 从 `options.toolContext.messages` 反扫匹配 `approvalId` 的 `tool-approval-response.reason` 并 `JSON.parse`，把答案作为 tool output 返回给模型）；前端恢复载荷固定为 `approval: { id, approved: true, reason: JSON.stringify(answer) }`（**始终 approve**，deny 只用于「用户取消提问」）。风险与代价见 §2。

### 推荐路径

**A 路线，client-side tool 承载**：协议不变（`run.input_requested` / `run.input_provided` / `provideRunInput` 从 unsupported 转正），侧车加一个无 `execute` 工具，Adapter 新增 pendingQuestions 状态 + `tool-output-denied` 映射 + `output-available` 重发。改动面与已跑通的 approval 链路同构，风险最低。
