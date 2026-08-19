# ADR 0024：Widget Data Source 三 kind 模型与 Product Identity 分层

- **Status:** Accepted（设计定稿；实施拆票，本 ADR 不随附代码）
- **Date:** 2026-08-18
- **Scope:** Board 数据供给的一等抽象、需鉴权业务数据的进入路径、调度归属、垂直应用身份分层、插件贡献面
- **Tickets:** [#143](https://github.com/xiaowen-0725/uilab-admin/issues/143)（模型与迁移）/ [#144](https://github.com/xiaowen-0725/uilab-admin/issues/144)（identity 模块）/ [#145](https://github.com/xiaowen-0725/uilab-admin/issues/145)（求值器）/ [#146](https://github.com/xiaowen-0725/uilab-admin/issues/146)（query 通道）/ [#147](https://github.com/xiaowen-0725/uilab-admin/issues/147)（调度）/ [#148](https://github.com/xiaowen-0725/uilab-admin/issues/148)（预置看板）/ [#149](https://github.com/xiaowen-0725/uilab-admin/issues/149)（agent 面契约）
- **Revision:** 2026-08-18b 按 Codex 对抗评审修订：查询声明补 `requiredPermissions`（fail-closed）、渲染层调度补租约认领与 execution key 提交栅栏
- **Spec:** [workbench-board-spec](../plans/workbench-board-spec.md)（首版规格不变，本 ADR 是其演进设计）
- **Supersedes-in-part:** ADR-0023 §6「首版只访问公开端点」——该限制仍是 v1 事实，但演进路径由本 ADR 定义

## Context

首版 Board（ADR-0021/0022/0023）里 widget 外部数据的唯一来源是 Widget Data Job：模型写的零依赖 Deno 代码，只能访问公开域名，手动触发。这在三个方向上撑不住即将到来的垂直派生应用（讨论用例：停车 SaaS 值班 Agent）：

1. **需鉴权的业务数据进不来。** 停车 SaaS 的接口要登录、要租户，且同一套鉴权下混着危险写操作（改费率、远程开闸）。把凭据交给模型写的、批准一次后静默重复执行的代码，等于给模型一把能开闸的钥匙——不是风险偏高，是不能做。
2. **没有身份概念。** 现有 Connector（GitHub、飞书）是可选的、按 Task 勾选的第三方服务；而停车 Agent 的登录是产品前提，决定租户、可访问车场与每场权限。把它硬塞进 Connector 概念会让权限、调度、登出语义全部搅在一起。
3. **没有调度。** 全仓零 `setInterval`/cron；`WidgetDataJobRecord.trigger` 只是预留字段。而「每天早上自动新」是这类看板的核心预期。

同时 `CONTEXT.md` 里 Widget Data Job 的 `_Avoid_: 定时任务` 与「补定时」直接冲突，逼出词表决策：定时是 Job 的属性，还是一个更上层概念的属性。

## Decision

### 1. 新一等概念 Widget Data Source，三种 kind；widget 与来源保持 1:1

```
Widget Data Source
├─ kind: 'preset'   预填数据；无执行、无凭据（示例板迁入，不再是特例）
├─ kind: 'job'      已批准的零依赖 Deno 代码；仅公开域名、无凭据（今天的 Widget Data Job 降为此 kind 的实现载体）
└─ kind: 'query'    插件声明的结构化查询；侧车以 Product Identity 加签执行，凭据不出侧车
```

- `trigger`（manual / onOpen / schedule）**挂在 Data Source 上，不挂在 Job 上**：`preset` 不需要触发、`query` 需要、`job` 两者皆可，挂上层才统一。Job 保持它精确的含义——一段被批准过的零依赖取数代码——词表 `_Avoid_: 定时任务` 对 Job 继续成立。
- **一个 widget 只绑一个数据来源。** 多端点组合一律下沉到 `query` 的插件实现里（受信代码打多个上游端点、对齐口径后合并返回）；桥协议 `widget.data` 单槽位不动，`ui/` 整层（沙箱、CSP、桥）不动。
- 实体落 `modules/board/model`；现有 `BoardJobRuntimePort` 演进为 `WidgetDataSourcePort`；求值器是 `application/board-refresh.ts` 的扩写。

### 2. `query`：Agent 只能选指标、填参数，不能写请求

- 查询由垂直插件经既有 PluginManifest 机制声明（新 contribution），形如 `charge_report(lotIds, window, compare?)`；实现由插件作者写、跑在侧车（与垂直方自家前端同级的受信代码），端点知识只存在于插件实现内。
- **参数逐字段校验**：声明中标注资源引用参数（如 `lotIds: { type: 'resource', resourceType: 'parking-lot' }`），求值前逐项比对当前身份的授权资源集合。端点级校验（方案 B 代理）不够——模型仍可把 `lotId` 换成无权限的场。
- **权限声明（`requiredPermissions`），fail-closed**：每个查询（可细到资源参数）必须声明所需权限；校验不止 membership（资源在授权集合内），还须 `resource.permissions ⊇ requiredPermissions`——否则只有基础查看权的用户能调收入类指标。渲染层求值闸与侧车各校验一次（侧车持凭据，是 fail-closed 的最后一道）；**未声明权限的查询拒绝执行**，不默认放行。指标目录（§6）随目录返回 `requiredPermissions`，Agent 建卡时即可避开用户无权的指标。
- **不单独审批**：用户已用自己的账号登录，读的是本来就有权看的数；真正需要审批的是「出网」与「执行代码」，`query` 两者都没有。
- 指标口径（满位率、应收怎么算）沉淀在声明与实现里，不靠模型现编。

### 3. Product Identity：写进 Archetype，只定接口不定实现

- 新模块 `modules/identity` 拥有身份领域：应用级登录、租户、授权资源快照、失效通知。它与 Connector 是不同层——Connector 可选可缺，Product Identity 一旦缺失垂直应用没有意义。
- 授权资源用**类型化通用模型**，端口不出现领域词：

```ts
AuthorizedResource { type: string; id: string; name: string; permissions: string[] }
```

停车插件声明 `type: 'parking-lot'`，ERP 插件声明 `'warehouse'` / `'cost-center'`——求值器的逐字段校验自动泛化。

- 按「端口跟消费方走」的既有约定（ADR-0011 模式，同 `modules/task` 持 `RuntimePort`）：`modules/board/ports/identity-scope-port.ts` 是 Board 需要的窄接口（当前身份 id、授权资源集合、失效通知），`modules/identity` 提供 adapter，Composition Root 接线。模板自带「无身份」默认实现，行为等同今天；派生应用接真实现。
- 车场/仓库等**范围放在数据来源的参数里，不放 Board 上**：一块值班板天然混多个场，Board 级 scope 会逼用户按场建板；「能看哪些场」由身份层回答，不复制成 Board 属性。

### 4. 调度：trigger 建模在 Data Source，求值器只在渲染层

- IDB 是唯一权威（ADR-0015），侧车不得自跑定时再存一份——那会造出第二个权威。
- 分两层交付：**渲染层求值器**先做「打开即刷（15 min 陈旧阈值已定）+ 前台按 trigger 到点刷」，Web 与桌面通用；**真后台**推迟到 Desktop Host，由 Host 经 `HostPort` 唤醒信号唤起渲染层求值，Host 自己不取数。
- **多渲染实例的所有权与提交顺序**：调度认领落 IDB——带租约（lease）的 claim + 唯一 execution key，两个标签页/窗口不会同时认领同一到期来源；提交结果时校验 execution key、source generation 与身份代际，先发后至的旧结果被拒绝，不会覆盖更新的数据。租约过期即可被其他实例接管，无守护进程。
- 每次求值走**四道闸**（③ 开始时捕获身份代际，④ 提交前同事务栅栏），与失败语义的分类（网络错误 / 登录失效 / 权限回收）统一定义在 ADR-0025 §5；调度提交检查与该栅栏是同一机制。

### 5. 预置看板成为插件贡献物；示例板迁 `preset` kind

- **预置看板**（新概念）：插件贡献的看板模板——placements + widget HTML + `query` 绑定，安装后走真求值。复用既有 `presetId` / `presetVersion` 安装机制（`ensure-example-boards` 先例）。
- **示例板**（已有）迁为 `kind: 'preset'` 的普通数据来源：统一模型才真的统一，且示例板正好验证求值器在「无侧车、无身份」路径下可跑。

### 6. Agent 的领域知识：指标目录工具（动态）+ 指标 Skill（静态），端点清单哪都不放

- **动态目录**：扩展 `board_status`（或新增只读工具）返回插件声明的查询、参数 schema、当前身份下可用的授权资源。必须动态——每个用户授权范围不同。
- **静态语义**：插件贡献指标 SKILL.md（机制照抄 `board-widget` skill，懒读）：指标含义、参数填法、组合建议、完整示例。
- 端点永不进模型视野：模型知道端点就会想直接调，且端点粒度对不上用户语言。

### 7. 演进缝：作业调用声明查询（`ctx.query`），接口形状现在留、实现推后

行业正在收敛的 code-execution 模式（模型写编排代码，代码只能调已声明的工具，凭据封在工具边界后）映射到本设计，就是让 `job` 沙箱内可调 `ctx.query('charge_report', {...})`——侧车代理执行、参数照常逐字段校验、token 不进模型代码。长尾组合由此获得灵活性，而安全与口径边界不破。

v1 **不实现**，但两个接口形状按它设计：

- `JobContext`（spec §7.4）为 `query` 留位（可选能力，无身份/无声明时不存在）；
- 数据来源声明标注「可被作业引用」（`referencableByJob: boolean` 之类），原子指标默认可引用。

等需求来了再改这两个类型是一次破坏性迁移；现在留形状近零成本。

## Considered options

- **A. 凭据发给作业**（放开 env 或注入 token）：模型写的静默重跑代码持长期凭据，且同一鉴权下有物理写操作。直接排除。
- **B. 侧车自由代理**（作业打 127.0.0.1 受限端点，侧车加签转发）：比 A 安全但校验只到端点级，参数级越权（换 lotId）拦不住。降级为逃生口思路，其成熟形态即 §7 的 `ctx.query`。
- **widget 多数据槽位**：桥协议、校验、写作规范全要改，能力与「插件内合并」完全重叠，且把口径问题丢给模型。否。
- **Board 加 scope 字段 / 复用 Project 当租户**：前者逼用户按场建板；后者 Project 是本地目录语义，套不上租户。否。
- **把停车登录做成一个 Connector**：Connector 是可选的按 Task 勾选项，语义层级不对；权限、登出、调度语义会全部搅在一起。否。
- **侧车跑调度器**：侧车写不了 IDB，跑完等渲染层回灌 = 第二个权威。否。
- **端点清单知识库给模型**：诱导直调、粒度错位。否。

## Consequences

- 本轮只出设计与词条（`CONTEXT.md` 新增 Widget Data Source / Product Identity / 预置看板 / Authorized Resource），实施拆票。持久化 schema、审批语义在模型钉死后再动，降低返工。
- `modules/board` 的 `ui/` 层与 `board_widget_*` 写入通道不动；commit 时可带数据来源声明而不只是作业代码。
- 换垂直场景（ERP 等）= 换插件四样交付物：身份适配器、查询声明+实现、预置看板、指标 Skill。模板层一行领域词不出现。
- 已知推迟：ERP 多账套的身份级 active scope（首版当查询参数）；查询结果沿用 512 KiB 上限（逼服务端聚合，视为正确约束）；真后台仅桌面路径可得，Web 退化为打开即刷 + 前台到点刷。
- 失败与缓存数据的身份语义（遮蔽 / 清除 / 保留）单独成文：ADR-0025。
