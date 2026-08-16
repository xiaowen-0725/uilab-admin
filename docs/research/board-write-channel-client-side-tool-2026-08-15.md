# 研究：VoltAgent client-side tool 承载 Board 变更的上限

- **Date:** 2026-08-15
- **Ticket:** [#113](https://github.com/xiaowen-0725/uilab-admin/issues/113)（地图 [#111](https://github.com/xiaowen-0725/uilab-admin/issues/111)；前置结论 [#106](https://github.com/xiaowen-0725/uilab-admin/issues/106)）
- **方法:** **纯静态**——只读本仓库源码 + `node_modules` 内 dist 真实源码 + 一手官方文档。**未启动**侧车 / dev server / 浏览器 / Electron，**未做任何真机往返实测**（ticket「范围收窄」约定）。
- **版本锚点:** `@voltagent/core` 2.9.2、`@voltagent/server-core` 2.1.20、`@voltagent/server-hono` 2.0.14、`hono` 4.12.33、`ai`（AI SDK）6.0.242
- **证据分级:** 【源码】= 本次实际读到的代码行；【文档】= 官方文档明文；【推断】= 由前两者推导，未直接验证；【未验证】= 需实施期 spike 确认。

dist 源码路径在下文简写，完整前缀为
`node_modules/.pnpm/<pkg>@<ver>_<hash>/node_modules/<pkg>/dist/index.mjs`。

---

## 0. 结论速览

| # | 问题 | 结论 |
|---|---|---|
| 1 | payload 体积 | **传输层无上限、无截断**（SSE/HTTP/JSON 全链路都是整包 `JSON.stringify`）。**真正的墙在模型侧**：30 KB HTML 作为 tool **input** 需要模型一次吐出约 8–12k output token 的转义 JSON，而侧车**没有配置 `maxOutputTokens`**，走 provider 默认值 → 高概率被截断成非法 JSON。**结论：能走，但不该走整块 HTML 单次输出；应改为分次追加写入。** |
| 2 | 单 Run 内多次挂起/恢复 | **机制支持，次数无硬上限**（每次恢复 = 一次全新 `POST /agents/:id/stream`，`maxSteps` 每次重置）。**顺序在「串行一次一个」时有保证**；**parallel tool calls 会真的丢调用**——现有 Adapter 一次恢复只带一个 tool part，其余挂起调用会被 VoltAgent 的 `filterIncompleteToolCallsForModel` 从 prompt 里静默剔除。开销来自「每次恢复重建整段 prompt + 重新走一遍 memory 读写」。 |
| 3 | 失败与中断 | **失败回传有一等公民通道**：tool part `state:'output-error'` + `errorText`（官方文档 + AI SDK 源码双证），但**现有 Adapter 的类型只允许 `approval-responded` / `output-available`，需要扩**。**没有任何超时回收**：pending 挂起只活在渲染端内存，无 timer、无侧车侧驻留状态。切 Task → 该 Run 后续事件**静默丢失且不入库**；刷新 → 挂起被记为 `run.interrupted`，**永远无法恢复**（不是「卡住」，是「作废」）。 |
| 4 | approval / Permission Preset | **两条通道当前互不干扰**（`decideApprovalResponse` 只吃 `approval.requested`，注释明写 Question Request 不得自动作答）。但**Adapter 层共用一个 `activeAbort` 与一次一个 tool part 的恢复形态**——同一 Run 内同时出现 approval 与 client-side tool 时会互相打断。`needsApproval` + 无 `execute` **可以共存于同一工具**（AI SDK 先判审批再判 execute），但**恢复语义未文档化且现有 Adapter 不支持**。 |
| 5 | 替代方案（侧车事件 → 投影落库） | **现有事件协议不能直接承载 Board**：`AgentRuntimeEventEnvelope.taskId` 是**必填**，IDB events store 主键就是 `['taskId','taskSequence']`，硬 Task-scoped。`work_surface.open_requested` **不是**已跑通的 Runtime → UI 先例——**侧车里没有任何代码发这个事件**，只有测试用 ScriptedRuntimePort 发。且侧车 `/agents/:id/stream` 的 chunk 类型是 AI SDK `TextStreamPart` 固定集合，**没有自定义事件出口**（`writer` 只存在于 Workflow API），所以「侧车发结构化事件」在物理上仍得寄生在 tool-call / tool-result chunk 里。 |

---

## 1. Payload 体积：传输层无限制，模型层是真墙

### 1.1 侧车 → 渲染端（SSE 下行）：无上限、无截断【源码】

`/agents/:id/stream` 的 SSE 就是把每个 fullStream part 整包 `JSON.stringify` 后作为一行 `data:` 发出：

```js
// @voltagent/server-core 2.1.20 · dist/index.mjs L2724–2728（handleStreamText）
for await (const part of fullStream) {
  const data = `data: ${safeStringify(part)}\n\n`;
  controller.enqueue(encoder.encode(data));
}
```

`safeStringify` 只做循环引用保护，**没有任何长度上限或截断**：

```js
// @voltagent/internal 1.0.3 · dist/utils/index.mjs L73–80
function safeStringify(input, { indentation } = {}) {
  try {
    const seen = new WeakSet();
    return JSON.stringify(input, safeStringifyReplacer(seen), indentation);
  } catch (error) { return `SAFE_STRINGIFY_ERROR: ...`; }
}
```

渲染端解析同样没有行长上限——按 `\n` 切分 + 跨 chunk 缓冲，一行 33 KB 只是内存开销：

- `archetypes/agent-workbench/src/modules/task-runtime/voltagent/voltagent-runtime-adapter.ts` L954–967（`reader.read()` → `buffer.split('\n')` → 余量回填）
- 同文件 L206–221 `parseSseDataLine`（`JSON.parse`，解析失败静默丢该行）

> ⚠️ 一个副作用：`JSON.parse` 失败是 `return null`（静默丢弃），所以**上行/下行任何一处把大 payload 弄坏，表现是「这条 chunk 消失了」而不是报错**。

### 1.2 渲染端 → 侧车（恢复上行）：无 body 限制【源码】

Hono 的 `bodyLimit` 中间件是**可选**的，本仓库与 `@voltagent/server-hono` 都**没有装**：

```js
// @voltagent/server-hono 2.0.14 · dist/index.mjs L6624
const server = serve({ fetch: app.fetch.bind(app), port, hostname: ... });
```

`serve()` 只传了 `fetch/port/hostname`，无 `serverOptions`，即 Node `http.Server` 默认值。全仓 `rg bodyLimit` 在 server-core / server-hono 的 dist 里零命中。

**【推断】** 因此恢复请求（`resumeWithToolPart` 里那个包含完整 `input` + `output` 的 UIMessage 数组，见 adapter L756–783）体积上仅受本机内存约束。Node 默认 `requestTimeout` 为 300 s，但它只约束「接收请求」耗时，本机 loopback 上 100 KB 级 body 不构成风险。**【未验证】** 未实测超大 body（>10 MB）的行为。

### 1.3 模型侧的现实上限：这才是决定性约束

**事实一：侧车没有设 `maxOutputTokens`。**
`tooling/workbench-runtime-voltagent/src/model.ts` 全文只构造 provider + `provider.chat(modelId)`（L95–124），`create-agent.ts` 的 `new Agent({...})`（L248–295 / L338–355）也没有 `maxOutputTokens`。**【推断】** 因此单次模型输出的上限完全由 provider 默认值决定。默认模型是 `deepseek-v4-flash`（`model.ts` L15）。**【未验证】** 该模型的默认/最大 output token 具体数值本次没有查证，不编造。

**事实二：30 KB HTML 作为 tool 参数，成本是「模型输出」而不是「模型输入」。**
tool input 由模型生成，要经过 JSON 字符串转义（`"` → `\"`、换行 → `\n`），HTML 本身 token 密度又高。**【推断】** 30 KB HTML 转义后约 33–40 KB，按 HTML/代码 3–4 字符/token 估，需要模型**一次连续吐出约 8k–12k output token**。这在多数 chat 模型的默认 `max_tokens` 下会被硬截断，而截断发生在 JSON 中途 → tool input 非法。

**事实三：AI SDK 对非法 tool input 的处理是「变成 tool-error」，不是重试。**

```js
// ai 6.0.242 · dist/index.mjs L6767–6780
if (toolCall.invalid) {
  if (!toolCall.providerExecuted) {
    enqueueToolResult({ type: "tool-error", ..., error: getErrorMessage5(toolCall.error), dynamic: true });
  }
  break;
}
```

除非配置 `experimental_repairToolCall`（本仓库未配），否则模型只能靠看到 tool-error 后自己重试整块 HTML —— 而重试会再次撞同一堵墙。

**事实四：多次大 payload 会挤爆上下文预算。**
office profile 的 summarization 触发阈值是 **80 000 token**、`keepMessages: 12`（`tooling/workbench-runtime-voltagent/src/office-runtime-defaults.ts` L63–72）；memory 回灌默认只取最近 **10** 条消息（`@voltagent/core` dist L13046 `contextLimit = 10`）。**【推断】** 12 个 widget × 33 KB ≈ 400 KB ≈ 10 万 token 级，必然触发摘要，而摘要会重写工具历史 → 模型对「已经写了哪些 widget」的记忆不可靠。

**事实五：envelope 里的落库尺寸不对称。**
`tool.called` 的 `args` **原样入库不截断**（`fullstream-to-envelope.ts` L354–362），而 `tool.completed` 的 `output` 会过 `sanitizeToolOutputForEnvelope`，字符串字段被截到 **4 000 字符**（`tool-output-normalize.ts` L7 / L178–198）。**【推断】** 若 HTML 走 tool **input**，每次调用都会往 IDB events store 塞一份完整 33 KB；若走 tool **output**，envelope 里反而只剩 4 KB 残片，**投影方案想拿完整 HTML 必须在 mapper 里新开分支读原始 chunk**。

### 1.4 问题 1 的直接答案

> **30 KB HTML 走 tool 参数到底行不行？**

**传输层：行，毫无问题。** SSE、Hono、`JSON.parse`/`stringify` 全链路无上限无截断【源码】。
**模型层：不建议，且大概率不行。** 没有配 `maxOutputTokens` + 需要一次吐 8k–12k token + 截断即非法 JSON + 无 repair 兜底【源码 + 推断】。
**工程建议（事实层面）：** 若坚持 client-side tool，应把 HTML 拆成「创建 widget（含元数据）→ 多次 `append_widget_html(chunk)` → `finalize`」的分次追加写入，把单次输出压到 2–4 KB 量级；此时挂起次数会从 12 次涨到数十次，与问题 2 的开销直接相关。

---

## 2. 单 Run 内多次挂起/恢复

### 2.1 挂起是怎么发生的【源码】

AI SDK 只有在「本步所有 client 工具调用都拿到了输出」时才继续循环：

```js
// ai 6.0.242 · dist/index.mjs L8137–8170（streamText 的 step 收尾）
const clientToolCalls  = stepToolCalls.filter(tc => tc.providerExecuted !== true);
const clientToolOutputs = stepToolOutputs.filter(to => to.providerExecuted !== true);
...
if ((clientToolCalls.length > 0 && clientToolOutputs.length === clientToolCalls.length
     || pendingDeferredToolCalls.size > 0) && !await isStopConditionMet({...})) {
  // 继续下一步
} else {
  controller.enqueue({ type: "finish", finishReason: stepFinishReason, ... });
}
```

无 `execute` 的工具产不出 output（`executeToolCall` 在 `tool.execute == null` 时直接 `return void 0`，dist L2908–2912），所以数量对不上 → **流正常 `finish` 收尾**。这不是「流悬停」，而是「流结束、等前端补结果后重发」——与 #106 结论一致。

### 2.2 次数：机制上无上限【源码 + 推断】

每次恢复都是 Adapter 重新 `POST /agents/:id/stream`（adapter L756–783 `resumeWithToolPart` → L836+ `streamAgent`），侧车侧是**全新一次 `Agent.streamText`**，`maxSteps`（office 默认 80，`office-runtime-defaults.ts` L18）每次重置。**【推断】** 十余次挂起/恢复在机制上完全成立，不存在计数上限；真正的天花板是上下文与延迟。

### 2.3 顺序保证【源码】

- **事件顺序**：SSE 是单条有序流，Adapter 按行顺序消费并单调分配 `taskSequence`（adapter L460–485 / L940–951），**下行顺序有保证**。
- **串行挂起顺序**：模型「拿到上一个结果才发下一个调用」时天然串行，与 Kimi 那 12 次调用的依赖形态（拿 id 才能建绑定）一致，顺序有保证。

### 2.4 parallel tool calls：会**真的丢调用**【源码】

这是本次调研最需要警惕的一条。

1. 现有 `resumeWithToolPart`（adapter L756–783）构造的恢复消息**只含一个 assistant 消息、只有一个 tool part**。
2. VoltAgent 在送给模型前会剔除所有「没有输出」的 tool part：

```js
// @voltagent/core 2.9.2 · dist/index.mjs L28467–28483（filterIncompleteToolCallsForModel）
const parts = message.parts.filter((part) => {
  if (!isToolLikePart(part)) return true;
  if (hasToolOutput(part)) return true;
  ...
  const state = typeof part.state === "string" ? part.state : "input-available";
  if (state === "input-streaming" || state === "input-available"
      || state === "approval-requested" || state === "approval-responded") {
    mutated = true; return false;   // ← 静默丢弃
  }
  return true;
});
```
（该函数由 `sanitizeMessagesForModel` 在 `prepareMessages` 末尾调用，dist L28379–28396 / L34400。）

**【推断】** 若模型在一步里并行发出 `board_write × 3`，Adapter 只能逐个恢复；每次恢复时另外两个调用要么不在消息里、要么被上面这段剔除 → **模型看不到它们，可能重复下发或直接遗漏**。同时 Adapter 的 `pendingQuestions` 是 Map（adapter L814–834），确实能记住多个，但 `handleProvideRunInput`（L686–754）一次只消一个并**立刻 abort 当前流重发**（L719–722），第二个恢复会打断第一个恢复流。

**结论：Board 工具族必须显式压制并行调用**（工具描述里要求串行，或在侧车侧用 `prepareStep`/`toolChoice` 约束），否则顺序不可靠。**【未验证】** 未实测 DeepSeek 在本 prompt 下的并行倾向。

### 2.5 每次恢复的开销来自哪里【源码】

1. **重建整段 prompt**：`prepareMessages` 每次都重新读 memory（最近 `contextLimit = 10` 条，dist L13046–13060）+ 拼 system message + 追加输入消息（dist L34330–34395）。
2. **memory 读写往返**：office 默认 memory 是 workspace 下的 LibSQL 文件（`office-runtime-defaults.ts` L104–125），每次恢复都触发一次读 + 一次后台写。`saveCurrentInput` 对数组输入是**逐条 `saveMessage`**（core dist L13208–13226），即每次恢复都会把「重复的 user 文本 + 带完整 payload 的 assistant tool part」再写一次库。
3. **prompt 去重靠 message id**：`prepareMessages` 会按 id 把 memory 里的同 id 消息删掉再追加输入（core dist L34381–34393）。Adapter 用的 id 是 `user-${taskId}-${this.seq}` / `asst-${taskId}-${this.seq}`，而 `this.seq` **只在 submitTurn 时自增**（adapter L487–494、L768–778）→ 同一 Turn 内所有恢复复用同一组 id，**prompt 侧不会重复**。**【未验证】** LibSQL 存储层是否也按 id 幂等（会不会累积重复行）没有读 `@voltagent/libsql` 的 `addMessage` 实现。
4. **一次完整模型往返**：每次恢复都要重新预填全部历史 token（无 prefix cache 保证）。**【推断】** 12 次恢复 ≈ 12 次完整 prompt 预填，这是延迟与费用的主要来源，且随 payload 增大呈线性放大。

---

## 3. 失败与中断语义

### 3.1 渲染端执行失败如何回传给 Agent：有一等公民通道【文档 + 源码】

**文档**：VoltAgent《Tools》与 AI SDK《Chatbot Tool Usage》都明写用 `state: 'output-error'` + `errorText` 回报客户端工具失败：

- <https://voltagent.dev/docs/agents/tools/>（"Client-Side Tools" 一节，示例里 geolocation 失败走 `{ state: "output-error", tool, toolCallId, errorText }`）
- <https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage>（`addToolOutput({ ..., state: 'output-error', errorText })`）

**源码**：`UIToolInvocation` 的 `output-error` 分支携带 `errorText: string`（`ai` 包 `src/ui/ui-messages.ts`），`convertToModelMessages` 把它转成标准 tool-result：

```js
// ai 6.0.242 · dist/index.mjs L9177–9190
case "output-error":
case "output-available": {
  content2.push({ type: "tool-result", toolCallId, toolName,
    output: await createToolModelOutput({ ..., output: toolPart.state === "output-error" ? toolPart.errorText : toolPart.output,
                                          errorMode: toolPart.state === "output-error" ? "text" : "none" }) });
}
// L1813–1814：errorMode === "text" → { type: "error-text", value: getErrorMessage3(output) }
```

即**模型会看到一条明确的「这个工具失败了，原因是 X」的 tool result，可以自修重试**。这正是 Board 写入失败（IDB quota、schema 冲突、widget 超限）该走的路。

**本仓库缺口【源码】**：`voltagent-runtime-adapter.ts` L96–104 的 `UiToolPart` 类型只声明了 `'approval-responded' | 'output-available'`，`handleProvideRunInput` 也硬编码 `state: 'output-available'`（L748）。**要用错误回传通道必须先扩这个类型 + 加一条 `output-error` 恢复路径。**

### 3.2 渲染端超时：**完全没有**【源码】

通读 `voltagent-runtime-adapter.ts` 全文（1000 行）：`pendingApprovals` / `pendingQuestions` 两个 Map 上**没有任何 timer、TTL 或回收逻辑**。挂起状态只会被三件事清掉：

- `handleCancel`（L578–615，用户主动取消）
- 新的 `handleSubmitTurn`（L562–563 `pendingApprovals.clear(); pendingQuestions.clear()`）
- 页面销毁（内存丢失）

侧车侧**不存在**驻留的挂起状态——流已经 `finish` 了，进程里没有任何东西在等。**所以「Run 永久卡住」的准确描述是：渲染端 UI 永远停在等待态，侧车早已空闲。**

配套后果：`emitCompleted` 在有 pending 时会拒绝发 `run.completed`（adapter L895–912），所以 UI 上这个 Run 既不完成也不失败。

### 3.3 用户关页 / 刷新：挂起被判定作废，不可恢复【源码】

1. Adapter 的所有挂起状态是**纯内存** `Map`（L262–264 `taskState`），刷新即丢。
2. 重新 attach 时，Controller 从 EventStore 回放事件；若回放出的 `runStatus` 非终态（`waiting_for_input` 属于非终态，见 `modules/task/model/run-transitions.ts` L48），会**追加一条 `run.interrupted`**：

```ts
// modules/task/application/task-runtime-controller.ts L859–893（ensureInterruptedOnRehydrate）
eventType: 'run.interrupted', ... payload: { reason: 'rehydrate' }
// UI notice：「上次运行在刷新前未结束，已标记为中断」
```

3. `interrupted` 永不回到 running（`run-transitions.ts` L51 注释明写）。
4. 即便 UI 侧还留着卡片，`provideRunInput` 也会因为 `pendingQuestions` 为空而被拒（adapter L699–706 `question_not_found`）。

**【推断】** 对 Board 的直接含义：一次「写 12 个 widget」的 Run 在中途刷新，**已落库的 widget 会留下，剩余的永远不会补齐，而且 Agent 无从得知自己被打断**。Board 的写入协议必须自带幂等 + 可续写语义（例如以 boardId + widgetId 为幂等键，允许用户下一轮说「继续」时 Agent 先读现状）。

### 3.4 切换 Task：事件静默丢失【源码 + 推断】

- 全应用只有**一个** `TaskRuntimeController`，随选中 Task 反复 attach/detach（`app/composition/runtime-wiring.ts` L201–229；`task-lifecycle-commands.ts` L140 / L259 调 `detach()`）。
- `detach()`（controller L295–301）只是取消订阅，**不 abort 侧车流**。
- Adapter 的 `emit` 在没有 listener 时直接 return（L443–447），而**入库是 Controller 干的**（`onSubscriptionEvent` → `applyProjectedEnvelopes([...], { persist: true })`，L642–654）。

**【推断】** 结论：**切走 Task 后，该 Task 这次 Run 剩余的所有事件既不进 UI 也不进 EventStore，`taskSequence` 却继续自增** → 切回来时序号出现缺口。**【未验证】** 缺口是否会触发 `gap` 分支（controller L651+）本次未追到具体判定逻辑。对 Board 而言，这意味着**后台生成时用户切走 = 生成中断且无痕**。

---

## 4. 与 approval / Permission Preset 的关系

### 4.1 策略层：当前**完全隔离**，且是刻意设计【源码】

```ts
// modules/task/application/permission-preset.ts L66–88
/**
 * Question Request (`ask_user_question` / `run.input_requested`) never
 * enters this path — presets must not auto-answer questions.
 */
export function decideApprovalResponse(preset, toolName) { ... }
```

自动批准的触发点只订阅 approval（`modules/task/ui/task-surface/task-surface.tsx` L132–159：`findPendingApproval` → `decideApprovalResponse` → `onApprove`），client-side tool 的 `tool-call` 走的是另一条 `run.input_requested` 分支（`fullstream-to-envelope.ts` L325–333）。白名单也只有 5 个文件写工具（`permission-preset.ts` L16–22）。

**【推断】** 所以「Board 写入做成 client-side tool」**天然绕过 Permission Preset**——不需要审批，也**无法**通过档位控制。这是事实，不是缺陷：Board 写的是渲染层自己的 IDB，不是磁盘。若产品上希望「首次建 Board 要确认」，得另建机制，不能复用 preset。

### 4.2 传输层：**会互相打断**【源码】

Adapter 每个 Task 只有一个 `activeAbort`（L78），且 approval 与 question 两条恢复路径都会先 abort 再重发：

- `handleApproval` L644–647（注释已自陈「多个 approval 并行时可能切掉上一次恢复流」）
- `handleProvideRunInput` L719–722（同构）

`emitCompleted` 的抑制条件把两者混在一起判（L899–900：`pendingApprovals.size > 0 || pendingQuestions.size > 0`）。

**【推断】** 若一个 Run 里既有 `write_file`（需审批）又有 `board_write`（client-side），两者的挂起/恢复会互相 abort，且只能逐个恢复 → 与 §2.4 的并行问题同源。**Board 工具族与文件写工具最好不要出现在同一个 Turn 的同一步。**

### 4.3 `needsApproval` + 无 `execute` 能否共存？可以进入审批，但恢复语义未定义【源码】

AI SDK 的审批判定发生在 `execute` 判定**之前**：

```js
// ai 6.0.242 · dist/index.mjs L6795–6814
if (await isApprovalNeeded({ tool: tool2, toolCall, messages, experimental_context })) {
  ... enqueueToolResult({ type: "tool-approval-request", approvalId, toolCall, ... });
  break;                                  // ← 先审批
}
if (tool2.execute != null && toolCall.providerExecuted !== true) { ... }   // ← 后执行
```

即一个无 `execute` 的工具**确实能发出 `tool-approval-request`**。但批准后的恢复路径会走 `executeToolCall`，而它在没有 execute 时 `return void 0`（dist L2908–2912）→ **不产生任何输出**，该 tool call 变成孤儿，随后被 `filterIncompleteToolCallsForModel` 剔除。

**【推断】** 要走通就得让渲染端在**同一个 tool part 上同时带 `approval:{approved:true}` 与 `state:'output-available'`+`output`**（`convertToModelMessages` 的两段逻辑确实会分别产出 `tool-approval-response` 与 `tool-result`，dist L9151–9158 / L9177–9190），但这**没有任何官方文档支持**（VoltAgent Tools 文档只说 approval 是"instead of executing"），且现有 Adapter 完全不支持。**【未验证】** 不要在设计里依赖这条。

---

## 5. 替代方案的事实（只给事实，决策在 #116）

### 5.1 事件必须挂在 Task 上——这是硬约束，不是习惯【源码】

```ts
// modules/task/protocol/events.ts L6–22
export interface AgentRuntimeEventEnvelope {
  eventId: string
  eventType: ...
  projectId: string
  taskId: string          // ← 必填，无可选
  turnId?: string
  taskSequence: number    // ← Task-local 单调序号
  ...
}
```

```ts
// app/persistence/workbench-idb-schema.ts L75–81
const events = db.createObjectStore(STORE_EVENTS, { keyPath: ['taskId', 'taskSequence'] })
events.createIndex('eventId', 'eventId', { unique: true })
events.createIndex('taskId', 'taskId', { unique: false })
```

配套的 Task-scoped 约束遍布全链路：`RuntimePort.subscribe(taskId, cursor, listener)`、Controller 显式丢弃他 Task 事件（`task-runtime-controller.ts` L644：`if (event.envelope.taskId !== this.taskId) return`）、`IdbEventStore.read({ taskId })` 只按 `taskId` 索引取（`idb-event-store.ts` L90–95）、`deleteTaskData` 按 Task 级联删（L194–216）。

**【推断】** Board 是应用级全局实体（地图 #111 已定案），若走「投影落库」，要么给 Board 事件挂一个「生成它的那个 Task」的 taskId（→ **删除该 Task 会连带删掉 Board 的事件历史**，见 `deleteTaskData`），要么给 EventStore 引入非 Task-scoped 的第二条流（→ schema bump + 主键改造 + 投影分叉）。这是替代方案的主要结构性成本。

### 5.2 `work_surface.open_requested` 不是已跑通的 Runtime → UI 先例【源码】

- **消费侧存在**：`task-runtime-controller.ts` L646–648 识别并转发给 Composition 的 `workSurfaceOpenListener`；`surface-assembly.tsx` L77 注释「Runtime channel」；projection 显式不投 timeline（`project-events.ts` L1698）。
- **生产侧不存在**：`rg work_surface tooling/workbench-runtime-voltagent/src/` **零命中**；`fullstream-to-envelope.ts` 里**没有**任何分支产出该事件类型。唯一的生产者是测试专用的 `modules/task/test/scripted-runtime-port.ts`（文件头自陈「NOT a product runtime. NOT wired into composition root.」）。

**结论**：它是一个**已声明、已接线消费端、但从未被真实 Runtime 触发过**的通道。引用它作为「Runtime → UI 先例」时必须诚实标注。

### 5.3 侧车没有自定义事件出口【源码】

`/agents/:id/stream` 直接透传 AI SDK 的 `fullStream`（server-core dist L2718–2728），chunk 类型 = `TextStreamPart` 固定集合（`text-*` / `reasoning-*` / `tool-*` / `start` / `finish` / `abort` / `error` / `source` / `file` / `raw`）。VoltAgent 的 `writer`（可自由 emit 自定义事件的流写入器）只存在于 **Workflow** API（`@voltagent/core` dist/index.d.ts L11031 `writer: WorkflowStreamWriter`，及 L11925+ 的一系列 Workflow step 签名），Agent 的 `ToolExecuteOptions` 上没有。

**【推断】** 所以「侧车发结构化事件 → 渲染层投影」在物理层面仍然只能寄生在 `tool-call` / `tool-result` chunk 里，再由 `fullstream-to-envelope.ts` 翻译成新事件类型。它与 client-side tool 的**唯一实质差别**是：payload 方向从「模型生成的 tool input」变成「侧车 tool 返回的 tool output」，**Run 不挂起、不需要恢复往返**。

### 5.4 走 tool output 方向的体积事实【源码】

- 侧车 tool 返回值 → `createToolModelOutput` → `{ type:'json', value }` 全量进模型上下文（ai dist L1806–1822，**无截断**）。也就是说 HTML 会**在模型上下文里再走一遭**，除非侧车 tool 用 `toModelOutput` 只回摘要（AI SDK 支持，dist L1818–1820）。**这是投影方案相对 client-side tool 的一个真实优势位：payload 可以对模型隐藏。**
- 但落进 envelope 会被截断到 4 000 字符（`tool-output-normalize.ts` L7 / L178–198，经 `fullstream-to-envelope.ts` L395 调用）→ **投影方案要拿到完整 HTML，必须在 mapper 里为 board 工具新增一条读原始 `chunk.output` 的分支，不能复用 `tool.completed` 的 envelope。**

---

## 6. 未验证清单（实施期首个端到端 spike 负责确认）

1. **`deepseek-v4-flash`（及备选模型）的默认与最大 output token 数**，以及在 tool input 里连续吐 8k+ token 是否真会被截断。→ 决定「整块 HTML vs 分次追加」。
2. **单次 tool input 的实际可用体积上限**：从 2 KB 逐档抬到 40 KB，找到第一个失败点与失败形态（非法 JSON / tool-error / 静默丢 chunk）。
3. **十余次连续挂起/恢复的累计延迟与 token 成本**：每次恢复的 prompt 预填量、总耗时曲线。
4. **DeepSeek 在 board 工具族 prompt 下是否会并行发多个 tool call**，以及并行时现有 Adapter 的实际丢调用表现。
5. **`@voltagent/libsql` 的 `addMessage` 是否按 message id 幂等**（同 Turn 多次恢复会不会在 memory 库里累积重复行）。
6. **summarization 在 12 次大 payload 后的实际触发点与摘要质量**（会不会把「已写哪些 widget」摘丢）。
7. **切换 Task 后 `taskSequence` 缺口是否触发 Controller 的 `gap` 分支**，以及 UI 表现。
8. **`needsApproval` + 无 `execute` + 同一 tool part 携带 approval 与 output** 的实际行为（本文列为推断，不建议依赖）。
9. **超大恢复 body（>10 MB）在 `@hono/node-server` 下的行为**（本文只确认没有显式 bodyLimit）。
10. **IDB 在数十个 33 KB widget + 每次 tool.called 原样落库 args 之后的空间与 quota 表现**。
