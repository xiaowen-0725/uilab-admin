# 调研：Workbench 现有「对话旁打开产物」通道盘点

- **Ticket:** [调研：Workbench 现有对话旁打开产物的通道盘点](https://github.com/xiaowen-0725/uilab-admin/issues/169)
- **地图:** [Wayfinder 地图：Workbench 对话旁现场产物（Cursor Canvas 职责）首版规格](https://github.com/xiaowen-0725/uilab-admin/issues/167)
- **Date:** 2026-08-27
- **Scope:** 只读盘点今天「在 Task Surface 旁边打开一块东西」已经有哪些通道；各通道 shipped / planned / 名存实亡。不设计新实体，不实施产品功能。
- **方法边界:** 只读本仓源码与已落地文档。未启动前端 / 侧车 / 浏览器 / Electron。需要运行时才能确认的量标【未验证】。`docs/research/20260824-agui-activity-canvas.md` 不在当前树、也不在 `xiaowen-0725/uilab-admin` 远程 `main`；AG-UI 结论以 [issue 155 Resolution 评论](https://github.com/xiaowen-0725/uilab-admin/issues/155#issuecomment-3238478333) 为准。
- **证据标签:** 【shipped】= 代码在仓库里且被产品装配 · 【planned】= 文档写了但代码里没有 · 【推断】= 由源码/文档推出，无直接运行时覆盖 · 【未验证】= 需要跑进程才能确认

---

## 0. 结论先行

今天「对话旁边打开一块东西」只有**一条宿主面**：`Work Surface Host`（ADR-0006 / 0007 / 0008）。新 Task 默认 Task-only；用户或渲染层打开 tab 后，Host 在 Task 右侧展开。Session 的 `openTabs` / 显隐 / 宽度按 Task 记在内存里（ADR-0008）。

往这条面送内容的通道已经分叉，**不是一条 Runtime 事件就能概括**：

| # | 通道 | 状态 | 一句话 |
|---|---|---|---|
| 1 | Work Surface Host + 内存 Surface Registry + Document / Browser / Board 预览 | Host / Document / Browser / Board 预览【shipped】；Registry「真实现」、Review / Terminal / 可编辑 Editor / Spreadsheet【planned】 | 产品打开面；Registry 是 Composition 内存表，不是可插拔真实现 |
| 2 | Timeline 点文件 / URL | 【shipped】 | 用户通道；路径走 Document，URL 走 Browser |
| 3 | Timeline 产物卡 +「查看所有产物」+ 本轮自动打开 | 【shipped】（文件型） | 聚合的是本 Turn 的 `file.changed`（及若存在的 `artifact.*`） |
| 4 | `artifact.created` / `artifact.updated` / `artifact.linked` | 协议 + 投影【shipped】；产品 Runtime **不发射** → 产品路径上**名存实亡** | VoltAgent mapper 只合成 `file.changed`，侧车零命中 `artifact.*` |
| 5 | `work_surface.open_requested` | 协议 + 消费接线【shipped】；产品发射**名存实亡** | 复核 #113：侧车仍零命中；唯一生产者仍是测试用 `ScriptedRuntimePort` |
| 6 | `board_commit` 后渲染层打开 Board 预览 | 【shipped】 | **不走**第 5 条事件；复用 `openWorkSurfaceFromRuntimePayload` 函数，由 client-side tool 成功回调触发 |
| 7 | Board 全页 destination | 【shipped】，但**不是**对话旁 | `destination.kind === 'board'` 时 stage 换成看板，Work 抽屉宽度为 0 |
| 8 | Artifact 目录 | 【planned】 | 无 store、无 Navigator 入口、无跨 Task 列表；PRODUCT.md 列为未交付 |

对地图 #167 的直接含义（只陈述事实，不选型）：

- **可复用的打开几何**已经在：Host + per-Task tabs + Composition 校验。
- **没有**「本次 Task 的可交互现场产物」一等实体或 Surface kind。Board Widget 是应用级全局网格单元（CONTEXT 明确 Avoid `Artifact`）；Document 把 `.html` 当源码高亮，不执行。
- **没有** Runtime→UI 已跑通的开面先例。#113 对 `work_surface.open_requested` 的证伪仍然成立。Board 预览证明的是「渲染层知道刚落库了什么，自己开 tab」。
- AG-UI（#155）：协议无一等 Canvas 事件；Cursor 类画布是「另一条面 + 聊天 card」，不要新造 `CANVAS_*` EventType。

---

## 1. Work Surface Host + Surface Registry + Document / Browser / Board 预览

### 状态

- Host chrome（显隐 / 调宽 / 最大化 / tabs）【shipped】。`WorkSurfaceHost` 始终挂载，靠 `visible` / `inert` 收起，好让抽屉带动效（`work-surface-host.tsx`）。
- Surface Registry【shipped 为 Composition 内存表】；PRODUCT.md / README / `AGENTS.md` 仍把「Surface Registry **真实现**」列为未交付。`createSurfaceRegistry()` 是 `Map<kind, definition>`，只允许 Composition 调用 `register`（`surface-registry.ts`）。
- 产品装配登记四种 kind（`surface-assembly.tsx` `createWorkbenchSurfaceRegistry`）：
  - `document`【shipped】
  - `browser`【shipped】
  - `test`【shipped】（测试 / `test:` 资源；非用户产品入口）
  - `board`【shipped】（有 Board wiring 时登记；渲染 `BoardPreviewLoader`）
- Review / Terminal / 可编辑 Editor / Spreadsheet【planned】（README、PRODUCT.md、ADR-0009）。未登记 kind 时 Host 走 `UnknownSurfaceFallback`。

ADR-0009 原文：「HTML 源码由 Document Surface 查看，渲染与交互由 Browser Surface 承载。」当前代码与此**不完全一致**：`format-router.ts` 把 `html` / `htm` 映射为 `code`（Shiki 源码），不是可执行预览；Browser 只认 `https:` / 本机 `http:` / `blob:` URL，不把工作区 `.html` 当交互页。

### 谁打开

| 入口 | 调用 | source |
|---|---|---|
| Timeline 文件 chip / 文件变更行 | `openWorkSurfaceFromFileRef` → `session.openWorkSurfaceTab` | 默认 `user` |
| 产物卡 /「查看所有产物」 | `openWorkSurfaceFromDeliverables` | `user` |
| 本会话亲眼看到 Turn 结束后的 featured 产物 | `useDeliverablePaneAutoOpen` | 标成 `runtime`，`focus: 'pane'` |
| `work_surface.open_requested` 监听 | `openWorkSurfaceFromRuntimePayload` | `runtime` |
| `board_commit` 成功 | `board-wiring` 的 `openPreview` → 同上函数，`kind: 'board'` | 函数参数是 `runtime`，**事件不是** `work_surface.open_requested` |

校验一律走 `resolveOpenWorkSurfaceIntent`：空 key / 非法路径 / 非法 URL / 未登记 kind 直接拒绝。`kind === 'board'` 时 **不做** 工作区路径规范化，`resourceKey` 就是 `boardId`。

Session 规则（`workbench-session` reducer）：

- 无选中 Task → 打开是 no-op。
- 同一 `(kind, resourceKey)` 去重，只激活已有 tab。
- `source === 'user'` 默认 `focus: 'pane'`（展开抽屉）。
- `source === 'runtime'` 默认：抽屉已开则切 tab，未开则只写入 `openTabs`、**不**把抽屉拉开（`focus: 'none'`）。Board 预览与产物自动打开都显式传了 `focus: 'pane'`，因此会拉开。

### 存什么

Tab 记录只有 `{ tabId, kind, resourceKey, title }`，存在 **当前进程** 的 per-Task `taskLayouts`（ADR-0008）。`tabId` 稳定为 `ws:${kind}:${resourceKey}`。

IDB `session` 行有可选字段 `taskLayoutsJson`（`workbench-idb-schema.ts`），但产品 persist 只写选中 Project / Task / `lastTaskByProject` / `navigatorOpen`，**不写** `taskLayoutsJson`（`workbench-app.tsx`）。【推断】刷新后右侧打开的 tab **不会**按 ADR-0008 字面「重新进入时恢复」；同会话内切 Task 仍会恢复，因为 reducer 还持有 `taskLayouts`。

实体权威不在 Host：

- Document：工作区文件字节（`WorkspaceDocumentSource` → HTTP `/workspace/file` 或本机目录）。
- Browser：URL 字符串；iframe `sandbox` 按信任分级（见 §4 对照）。
- Board 预览：全局 IDB `boards` / `boardWidgets` / …，`resourceKey = boardId`。

### 和 Task 的关系

Host 的 `taskId` 只传给 `SurfaceDefinition.render`。布局按 Task 隔离。Board **实体**不隶属 Task（ADR-0022）；预览 tab 只是「这个对话正在看哪块板」的引用（`docs/plans/workbench-board-spec.md` 已写过这点）。

Board **全页**不是对话旁：`ShellDestination` 的 `kind: 'board'` 时 `drawerWidth = 0`，`WorkSurfaceHost` 不可见（`workbench-shell.tsx`）。预览条「在看板中打开」走这条 destination。

### 缺口

- Registry 无可插拔持久化、无远程发现 → 文档里的「真实现」。
- `.html` 文件不能当交互面打开（源码预览）。
- Review / Terminal / Editor / Spreadsheet 未登记。
- 打开面布局跨刷新不落盘（schema 有洞、装配没写）。
- 没有「现场产物」kind。

---

## 2. Artifact 事件与 Timeline 产物卡

### 状态

协议声明了 `artifact.created` / `artifact.updated` / `artifact.linked`（`task/protocol/events.ts`）。投影会把它们收成 `category: 'artifact'` 行，并在 `turn.completed` 时与 `file.changed` 一起聚成 `readModel.deliverables`（`project-events.ts`）。单测覆盖这条路径（`project-events-step-artifact.test.ts`）。

产品 VoltAgent 路径**不发射**任一 `artifact.*`：

- `fullstream-to-envelope.ts` 对写/改/删工具成功后只 `push('file.changed', …)`。
- `rg artifact.created`（及 `artifact.updated` / `artifact.linked`）在 `tooling/workbench-runtime-voltagent/` **零命中**。
- `rg artifact` 在 `task-runtime/voltagent/fullstream-to-envelope.ts` **零命中**。

因此：协议与投影【shipped】；产品发射**名存实亡**。验收清单也写明本轮不验「`artifact.*` 投影」（`docs/plans/workbench-acceptance-round-2026-08-14.md`）。

用户看见的「产物」来自 **`file.changed` → deliverables**：

- 写工具白名单：`write` / `write_file` / `edit_file` / `delete_file` 等（`fullstream-to-envelope.ts` `isWriteTool`）。
- Timeline 底部 `DeliverableZone`：featured 预览卡 +「查看所有产物」。
- 正文里与产物同路径的引用收成纯文件名，不再出回形针 chip。
- 结算后，已被产物区覆盖的 file/artifact 行从过程轨拿掉（`apply-stream-gate.ts`）。
- `artifact` 行若真的出现，UI 复用 `FileChangeBlock`，没有单独「产物卡」组件。

可打开策略（`deliverable-presentation.ts`，**不**依赖 work-surface format-router）：

- 预览白名单：md / html / pdf / 图片 / docx / xlsx / txt 等 → featured + 自动打开候选。
- 源码白名单：ts / js / py / json … → 可点开，不当 featured。
- `doc` / `xls` / 未知扩展 / 已删除 → 不可开。

自动打开（`deliverable-pane-auto-open.ts`）：仅当本会话在该 Turn 还 `running` / 等待 HITL 时观察过、且本会话第一次看到 `turn.completed`。Hydrate / 回放不会开。用户关掉抽屉则本 Turn 不再开。

### 谁打开 / 存什么 / 和 Task 的关系

用户点卡，或本会话自动开 featured。存的是工作区**路径**，不是 Artifact 实体。`DeliverableRef` 挂在**最近一次完成的 Turn** 的 read model 上（`projection/types.ts`：「latest completed turn」）。信封强制 `taskId` + `turnId`（ADR-0020）。删 Task 会级联删 events / snapshot，产物投影一起没。

### 缺口

- 产品路径没有 `artifact.*`，也就没有独立 kind / title / linked 语义；只有文件变更。
- 产物列表不是目录：不跨 Turn 累积、不跨 Task、刷新后只靠事件重放。
- `.html` 产物会当 Document 源码打开，不是可交互页。
- 没有「对着这块产物继续聊」的回传，只有开文件预览。

---

## 3. `work_surface.open_requested`（复核 #113）

#113（2026-08-15）结论：这不是已跑通的 Runtime→UI 先例。侧车零命中；唯一生产者是测试用 `ScriptedRuntimePort`。地图 #111 相关表述已按此修正。

**2026-08-27 复核：仍然成立。**

| 层 | 现状 |
|---|---|
| 协议 | 仍声明；注释「Composition consumes; not a timeline fact」【shipped】 |
| 投影 | `project-events.ts` 显式 `break`，不写 timeline、不写 openTabs【shipped】 |
| Controller | `setWorkSurfaceOpenListener`；仅当 `envelope.taskId ===` 当前挂接 Task 才转发【shipped】 |
| Composition | `useWorkbenchSurfaceAssembly` 在 boot 后绑定监听 → `openWorkSurfaceFromRuntimePayload`【shipped】 |
| VoltAgent mapper | **无**该 `eventType` 分支【名存实亡】 |
| 侧车 `tooling/workbench-runtime-voltagent` | `rg work_surface` **零命中**【名存实亡】 |
| 产品生产者 | 仅 `modules/task/test/scripted-runtime-port.ts`（文件头：NOT a product runtime，不进 module index，不进 Composition） |

#114 调研曾把它写成「指针通道，不是数据通道」（`widget-data-job-sidecar-paths-2026-08-15.md` §4.2）。消费形状未变：`{ kind?, resourceKey, title?, focus? }`，必须通过 intent 校验。

Board 预览**没有**复活这条事件。`board_commit` 在渲染层执行；成功后 `BoardPreviewPolicy`（同一 Turn 首次 open、其后 update、用户关掉则 skip）调用 `openPreview`，再调用**同名打开函数**。`docs/plans/workbench-board-spec.md` 写明：不走 agent 主动打开，因为该事件通道已被证伪。

侧车自定义事件出口：#113 写过 Agent 流是 AI SDK `TextStreamPart` 固定集合，`writer` 只在 Workflow API。本次未再拆 `node_modules` dist。【推断】产品若要真发 `work_surface.open_requested`，仍得由 mapper 从 tool chunk **翻译**出来，侧车不能直接 emit 该信封。

【未验证】活侧车对话是否从未出现过该事件（静态零命中已足够证伪产品发射；端到端再扫一遍 SSE 不增加信息）。

---

## 4. Board Widget 不透明源沙箱与宿主桥（对「现场产物」只陈述事实与错配）

Board Widget 合同（CONTEXT + ADR-0021 / 0022）：Agent 生成的**单文件 HTML/JS**，跑在 **srcdoc + 不透明源** iframe；无网、无存储、无导航；外部数据只能经 Widget Data Source / Job **宿主桥**投入。CONTEXT 对 Board Widget 的 Avoid 明确包含 `Artifact`。

### 已落地约束（事实）

| 约束 | 落点 |
|---|---|
| 宿主 CSP | `index.html` meta：`frame-src 'self'`、`connect-src 'self' + 侧车`、`script-src 'self' 'nonce-…'`。#112 调研写「宿主当时无 CSP」；**ADR-0021 之后已有 CSP**，以 ADR + 当前 `index.html` 为准 |
| iframe | `sandbox="allow-scripts"`，**不加** `allow-same-origin`（ADR-0021：同给则可读宿主 DOM、写 localStorage、拆掉自己的 sandbox） |
| 子文档 CSP | `connect-src 'none'; frame-src 'none'; img-src data: blob:; font-src data:`（`widget-subdocument-policy.ts`） |
| 体积 | `BOARD_WIDGET_MAX_BYTES = 256 KiB`（`board-types.ts`） |
| 静态校验 `validateWidgetSource` | 禁外链 src/href、`fetch` / XHR / WebSocket、`eval` / `new Function` / 动态 `import()`、内联 `on*`、storage / cookie、alert/confirm、`window.open` / `location=`；必须有 `<script>`、必须 `widget.ready()`、必须读 `widget.data` 或 `onDataChange`（`board-validation.ts`） |
| 宿主改写 | 渲染层盖 nonce、注入 bridge、主题 CSS；widget 主脚本推迟到 `init`（`widget-document.ts`） |
| 桥协议 | Host→widget：`init` / `data` / `theme` / `ping` / `hint`。Widget→host：`ready` / `pong` / `resize` / `save-input` / `submit` / `open-link` / `wheel` / `error`。`save-input` 最多 16 key、单值 32 KiB；消息 512 KiB |
| 数据 | 刷新 / 作业 / query 在**宿主**求值，结果 `postMessage` 进去；widget 自己不能拉网 |
| 预览 | 对话旁是只读网格 + compact chrome；拖拽只在全页看板 |

对照调研（引用，不复述全文）：

- `docs/research/board-widget-srcdoc-sandbox-2026-08-15.md`（#112）：srcdoc 克隆宿主 policy container；不透明源下存储 API 抛 `SecurityError`；`postMessage` 的 `origin === "null"`；`targetOrigin` 只能 `'*'`，鉴别靠 `event.source` + MessageChannel token。
- `docs/research/board-write-channel-client-side-tool-2026-08-15.md`（#113）：整块 HTML 不该走单次 tool input；方案 D 已落地为「内容落侧车 staging + `board_commit` 小 payload」。
- `docs/research/widget-data-job-sidecar-paths-2026-08-15.md`（#114）：大字节走 `GET /workspace/file`；Board 全局 vs EventStore 硬 Task-scoped。后续 ADR-0022 / 0023 已把 Job 执行接到侧车 Deno，**不**再把 #114 当时的「侧车无 Job」当现状。

Browser Surface 的 iframe **不是**同一套政策：`sandboxForTrust` 对 trusted-preview 给 `allow-scripts allow-same-origin allow-forms allow-popups`（`url-utils.ts`）。门禁禁止 Board 复用 `sandboxForTrust()`（ADR-0021）。

### 对「现场产物」：复用形状 vs 错配（不选型）

**形状接近、可以当已有能力引用的：**

- 对话旁几何 = Work Surface Host + per-Task tab（Board 预览已经占用）。
- 「不透明 HTML 岛 + nonce + 无 `allow-same-origin`」是已测过的执行环境。
- 大字节不进事件流、不进模型上下文：Board 用 staging + HTTP；Document 用 `/workspace/file`。

**错配（事实，不是方案）：**

1. **实体范围。** Widget / Board 是应用级全局、不进 `deleteTaskCascade`；现场产物地图要的是「本次 Task 生成、对着它继续聊」。CONTEXT 禁止把 Widget 叫 Artifact。
2. **无网是硬合同。** `connect-src 'none'` + 校验禁 `fetch`。现场件若要自己拉数、连 CDN 图表、或直接打侧车，与现行 widget CSP **互斥**。宿主 `connect-src 'self'` 反而会让「只继承宿主、不加 iframe `csp=`」的子文档打到本机侧车（ADR-0021 反直觉事实）。
3. **单文件 + 必须桥。** 校验强制 `widget.ready()` 与 `widget.data` / `onDataChange`。没有取数、只展示本次对话分析结果的 HTML，按现行 `validateWidgetSource` **过不了**（`sdk_contract_violation`）。
4. **无存储。** 状态只能 `save-input`（16×32 KiB）。现场件若要本地草稿 / IndexedDB，与不透明源 + 禁 storage 规则冲突。
5. **回传面是 Board，不是对话。** 桥上的 `submit` / `save-input` 服务看板输入与作业，不是「把用户在产物上的操作变成下一条 Task 消息」。#155：ACTIVITY 不回传 Agent。
6. **打开面会逃出对话。** 预览「在看板中打开」切走 `destination`，Work 抽屉关掉。现场产物若必须始终贴着 Composer，全页 Board 不是同一条面。
7. **HTML 文件通道不会执行。** 工作区 `.html` 走 Document `code` renderer。把现场产物写成「Agent 写个 html 再点开」今天得到的是源码，不是沙箱页。
8. **生成体积。** Widget 上限 256 KiB，但模型一次吐整包 HTML 的墙仍在（#113）。现场产物若也是模型生成的整页，会撞同一堵墙，与「开哪条面」无关。

---

## 5. Artifact 目录（PRODUCT.md 未交付）缺什么

文档口径一致：README「无 Artifact 目录」；PRODUCT.md / `PROJECT_STATUS.md` 列为未交付；验收清单明确不验。

当前树里**没有**：

- `artifacts`（或同义）IDB store — v4 商店是 projects / tasks / events / snapshots / commands / session / metadata + Board 六表（`workbench-idb-schema.ts`）。
- Navigator 或 Context 的「产物」列表。
- 跨 Task / 跨 Turn 的 Artifact 实体。`DeliverableRef` 只覆盖**最近完成 Turn**。
- Resource Explorer（ADR-0006 / 0009 / `AGENTS.md` 未交付）。
- 产品 Runtime 的 `artifact.*` 发射。
- 把 Artifact 打开成可交互面的 kind（只有文件预览 / URL / Board 预览）。

相对 CONTEXT 对 Artifact 的定义（「由 Task 或 Turn 产生、可在 Work Surface 中查看或操作的持久结果」），缺口是：

| 缺失 | 现状对照 |
|---|---|
| 持久实体 | 只有事件重放出来的路径列表 |
| 目录 UI | 只有 Turn 末尾产物区 |
| 跨会话检索 | 无 |
| 与 Board / 文件的区分 | Board 是全局网格；文件是工作区路径；没有第三种 |
| 操作（不只阅读） | Document 只读预览；HTML 不执行；无 Review / Editor |
| Runtime 身份 | 没有 `artifactId`；打开键是 path / URL / boardId |

「查看所有产物」只是把**本 Turn 可打开文件**批量 `openWorkSurfaceTab`，不是目录页。

---

## 6. 通道对照（给地图 #167 用）

| 通道 | 状态 | 谁打开 | 存什么 | 和 Task 的关系 | 缺口 |
|---|---|---|---|---|---|
| Work Surface Host | 【shipped】 | Session 命令 | tab 指针 + 布局（内存） | per-Task 布局 | 跨刷新不落盘；无 Multi-pane（ADR-0007） |
| 内存 Surface Registry | 【shipped】装配 / 【planned】真实现 | 仅 Composition `register` | kind → render | 无实体 | 不可插拔、无持久化 |
| Document | 【shipped】打开文件 MVP | 用户点路径 / 产物自动开 | 工作区文件字节 | 读当前 Project 根 | HTML 当源码；无编辑 |
| Browser | 【shipped】 | 用户点 URL | URL 字符串 | 无 | 非工作区 HTML；sandbox 与 Widget 不同套 |
| Board 预览 tab | 【shipped】 | `board_commit` 渲染层 | `boardId` 引用 | tab 按 Task；板全局 | 只读网格；可跳走全页看板 |
| Board 全页 | 【shipped】非旁路 | Navigator / 预览「打开」 | 全局 Board | 不隶属 Task | 占满 stage，不是对话旁 |
| Timeline 产物卡 | 【shipped】 | 用户 / 自动开 featured | 本 Turn 文件路径 | Turn-scoped | 不是目录；依赖 `file.changed` |
| `artifact.*` | 协议【shipped】发射**名存实亡** | 无产品生产者 | — | 信封强制 taskId | mapper / 侧车不发 |
| `work_surface.open_requested` | 消费【shipped】发射**名存实亡** | 仅测试 ScriptedRuntime | 指针 payload | 只处理当前选中 Task | 侧车零命中；#113 结论仍成立 |
| Artifact 目录 | 【planned】 | — | — | — | 无 store / 无 UI / 无实体 |
| AG-UI Canvas | 无一等事件（#155） | — | — | — | 开独立面走已登记 CUSTOM 或宿主开面；不要 `CANVAS_*` |

---

## 7. 未验证

1. 活侧车 SSE 是否从未出现 `work_surface.open_requested` / `artifact.*`（静态已零命中）。
2. 刷新后 `openTabs` 是否全部丢失（persist 代码不写 `taskLayoutsJson`；未做刷新复现）。
3. 用户点工作区 `.html` 产物时，Document 源码预览的完整视觉（format-router 已定为 `code`）。
4. Board 预览与产物自动打开同时发生时的 tab 抢焦点（两套都 `focus: 'pane'`）。
5. #155 全文调研文件若补进树，是否还有本盘点未引用的协议槽细节；当前以 Resolution 评论为准。
