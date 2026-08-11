# Spec: Workbench Capability Surface（连接器 / 插件 / 技能 / 专家）

**Status:** implemented / acceptance-in-progress（核心实现与黄金路径已落地；剩余手工剧本见 acceptance）
**Map:** https://github.com/xiaowen-0725/uilab-admin/issues/34
**ADR:** [0016-capability-surface-module-and-snapshot-port](../adr/0016-capability-surface-module-and-snapshot-port.md)
**Vocabulary:** root [`CONTEXT.md`](../../CONTEXT.md)
**Adversarial review:** [capability-surface-codex-adversarial-review-2026-08-09](../evidence/capability-surface-codex-adversarial-review-2026-08-09.md)
**Research:**

- [capability-surface-reference-models-2026-08-09](../research/capability-surface-reference-models-2026-08-09.md)
- [capability-surface-sample-sources-2026-08-09](../research/capability-surface-sample-sources-2026-08-09.md)
- [feishu-mcp-vs-cli-auth-comparison-2026-08-09](../research/feishu-mcp-vs-cli-auth-comparison-2026-08-09.md)（飞书 MCP vs CLI；WorkBuddy 对齐）
- [agent-plugin-connector-mainstream-landscape-2026-08-09](../research/agent-plugin-connector-mainstream-landscape-2026-08-09.md)（ChatGPT Apps / Cursor / Claude / Copilot / Dify 等主流分层）

**Related (do not reinvent):**

- [sidecar-plugin-system-spec](./sidecar-plugin-system-spec.md)（PluginRegistry MVP）
- [sidecar-plugin-product-followups-spec](./sidecar-plugin-product-followups-spec.md)（OAuth / Keychain；**本切片飞书不强制**）
- [sidecar-plugin-architecture](./sidecar-plugin-architecture.md)
- [sidecar-plugin-authorization](./sidecar-plugin-authorization.md) §5.2 Feishu CLI

**Revision notes:**

- **2026-08-09a:** Codex 对抗评审表态——effective 算法、ConnectorDescriptor、Snapshot 生命周期、黄金路径、Expert 临时 catalog。
- **2026-08-09b（历史决策）:** 飞书验证切片改为 **CLI-first（WorkBuddy 同构）**：Connected = `lark-cli` / `cli_session`；**不是**宿主 OAuth inject MCP。
- **2026-08-09c（作者确认 · 主流对齐）:** **Plugin = 能力包**；**Connector = 用户一等连接面**；平台支持 MCP 与 domain CLI，Composer「+」不把通道当主分栏。用户主路径 = 目录 → **去登录/去授权** → Connected → Task 选用。
- **2026-08-09d（历史决策 · 插件解耦）:** Provider-owned Plugin 拥有业务工具 schema、CLI 契约、Skills 与能力 metadata；Host 只做通用动态发现、可逆 identity、认证/审批/隔离和 Task gate。详见 [ADR 0017](../adr/0017-provider-owned-plugin-contract-and-dynamic-discovery.md)。
- **2026-08-09e（作者最终确认 · 通道归属）:** 平台双通道 ≠ 单 Connector 默认 Hybrid。当前两个产品级内置 Connector 为 **GitHub → 官方 MCP**、**飞书 → 官方 CLI**；各自保留 Provider 原生契约，互不转换。Hybrid 仅在某一 Provider 真实需要时另行设计。
- **2026-08-10a（中间方案，已被 10b 取代）:** 曾实现 Sidecar 自持 App 凭据/callback；不再作为 builtin GitHub 产品合同。
- **2026-08-10b（作者最终确认 · 一键授权）:** 普通用户不创建 GitHub App、不填写 PAT/Client Secret。平台统一注册 **UI Lab Connector** 并托管 callback/refresh；Sidecar 通过 managed Broker 创建授权会话、持有一次性 claim capability、轮询后写入 Keychain。删除 GitHub builtin 的本机凭据与 PAT fallback。
- **2026-08-09f（历史实现）:** 曾通过专用 Runtime tools 间接执行 `lark-cli`；此形态已被下一条决策完全替代。
- **2026-08-09g（作者最终确认 · 主流 Shell 形态）:** Office Runtime 暴露通用 `execute_command`；飞书 Plugin 只贡献官方 `lark-*` Skills、`lark-cli` command scope 与 CLI session auth，不再生成任何飞书业务 wrapper tools，不保留兼容路径。

---

## Problem Statement

Workbench 已具备 Task 对话、Fake/侧车 Runtime，以及侧车 **Plugin** 打包（MCP / 领域 CLI / Skills / Auth）。但产品缺少对话内一等的 **Capability Surface**：用户无法在 Composer 路径浏览并选用 **连接器 / 技能 / 专家**，也无法从「+」就地走飞书授权回流。结果是：能力停在 doctor/env，验证不了「Agent 在对话里用上连接器与专家」的产品效果。

## Solution

1. **词汇**锁定（Capability Surface / Plugin / Connector / Skill / Expert / Enabled / Connected）。
2. **产品面**：Composer「+」三组；飞书 **CLI-first** 就地登录（本切片验收门，对齐 WorkBuddy）；Task 级选用；Expert/Skill 应用模型（**无 @**）。
3. **架构**：`modules/capabilities` + **CapabilitySnapshotPort**（query + invalidation）+ **侧车唯一** effective resolver；Expert 为**临时 static catalog**；RuntimePort 不膨胀。
4. **ConnectorDescriptor** 薄投影合同；GitHub 主贡献为**官方 MCP**，飞书主贡献为**领域 CLI（lark-cli）**。
5. 两个产品级**内置 Connector 样例** + **一条强制飞书黄金路径**（附录 A/B）。
6. **实现**按修订后的切片顺序另开会话。

**诚实边界：** 本机侧车 ≠ 多租户生产 Runtime；Fake 可演示目录与选用，不假装外呼成功，也不暗示已拉取连接器远程上下文。

---

## Goals / Non-goals

### Goals

- 对话路径（Composer「+」）可浏览 Connector / Skill / Expert 并完成 Task 级选用。
- **GitHub MCP 为动态发现基准**：官方 MCP `tools/list` → 通用 Host Adapter → 可逆 tool identity；Host 不复制 GitHub 业务 schema。
- **飞书 CLI-first 为本切片验收门**：未登录 →「+」触发 **飞书 CLI 登录**（`open.feishu.cn/page/cli` / `lark-cli auth login` 系）→ `cli_session` Connected → 领域 CLI 工具面可调用。
- **Effective capability set** 由**侧车**按规范算法计算；UI 不发明工具面语义。
- Expert 为配置包，进入侧车装配；与子 Agent/子 Run 正交。
- **强制黄金路径**证明：连接器 Task 选用会实质改变下一 Turn 工具面（取消选用则失败可观测）。
- Renderer 永不持有 secret；snapshot 字段白名单；**不把 CLI 登录成功宣传成宿主 OAuth inject**。

### Non-goals（本 Spec）

- 插件/技能市场、完整连接器矩阵。
- Expert 自动建议 / 静默切换 / Kun 式多专家自动路由。
- Expert = Supervisor 子 Agent 产品化。
- **飞书 MCP / 宿主 OAuth inject 验收**；当前飞书连接器按 CLI-only 实现，未来若新增 MCP 需独立决策。
- 浏览器持有 token 或在 Renderer 完成 code 交换。
- **`@专家` / `@技能` 输入语法**（本切片移除；后置另票）。
- IM Channel 与 Connector 混名（CodePilot Bridge ≠ 办公连接器）。
- 重写 Sidecar Plugin MVP 或 RuntimePort 事件宇宙。
- 设置页高保真 UX（实现可后置）。
- 将 Expert 临时 catalog 粉饰为「不是第二套发现机制」——**必须诚实标注**。
- 声称「命令行管理全飞书产品」若 allowlist 未覆盖——UI 须按真实子命令诚实。

---

## Vocabulary (normative pointers)

正式定义见 `CONTEXT.md`。实现与 UI 文案必须遵守：

| 词 | 要点 |
| --- | --- |
| Capability Surface | 对话内可浏览/选用的 Connector + Skill + Expert 及状态摘要 |
| Plugin | **能力包（packaging）**：侧车可版本化发现/启用单元；可**同时**贡献 MCP、domain CLI、Skills、auth；≠ 用户口语「连接器」，≠ MCP 协议本身 |
| Connector | **用户一等**外部服务面（GitHub/飞书…）：auth 状态 + 子能力 + toolScope；由 **ConnectorDescriptor** 从 Plugin contribution 投影；**不是**第二套 Plugin 内核 |
| Skill | 主流 Agent 技能包（通常 `SKILL.md`） |
| Expert | 可切换配置包；≠ 子 Agent |
| Enabled | Plugin/贡献已全局装配进 Runtime（侧车/设置）；**≠ Connected** |
| Connected | Connector 身份可用；与 Enabled、TaskSelected 分立。GitHub = 平台 UI Lab Connector 授权已由 Sidecar claim 并使官方 MCP 可用；飞书 = `cli_session`（`lark-cli auth status` 或等价）成功 |
| TaskSelected | 本 Task 选用了该 Connector/Skill/Expert（覆盖层） |
| primaryChannel / 实现通道 | `domain_cli` \| `mcp` \| `hybrid` \| `none`：Connector 的**实现细节**；平台支持两类通道，每个 Provider 自选一种或多种，**不默认 Hybrid**；Composer「+」不要求用户理解协议 |

### 行业对齐一句话（normative intent）

> **Plugin** 是可安装能力包；**Connector** 是可连接的外部服务面（连接/授权/选用）；**Skill/Expert** 是知识与配置；平台同时容纳 MCP 与 domain CLI，但具体 Connector 遵循 Provider 原生通道，用户主路径只看到「连接器 + 授权」。

（对照：ChatGPT App/Plugin、Cursor Plugin+MCP、Claude Plugin、Copilot Plugin→MCP、Dify Plugin/Tool/MCP——见 mainstream landscape 研究。）

---

## Normative: Effective capability algorithm

**唯一所有者：侧车（Runtime host）装配。** Workbench 只下发 selection / auth-start，并消费 snapshot；**禁止**在 renderer 内计算「最终工具列表」作为真相。

对下一 Turn（及之后尚未开始的 Turn）：

### Connectors / tools

一个 **Connector 的工具面**进入该 Task 的下一 Turn，当且仅当：

```text
pluginGloballyEnabled(connector)
  ∧ authStatus(connector) == connected
  ∧ taskSelected(connector)
  ∧ !taskMuted(connector)   // 预留；MVP 可用「取消选用」表达
```

- **全局 Enabled 但未 TaskSelected** → 工具面**完全不进入**该 Task 下一 Turn（不是降权，是缺席）。
- **TaskSelected 但未 Connected** → 芯片可保留；**工具面不进入**；调用路径若仍触发须失败为未授权。
- **外部撤销授权** → 保留 TaskSelected 芯片，Connected=false；调用时再拦 + 去授权 CTA（不自动清除选用）。

### Skills

```text
effectiveSkills =
  union(
    expertDefaultSkills(expertId) if expert applies to next turn,
    taskSelectedSkills
  )
  ∩ discoverableSkillRoots   // 侧车/workspace 实际可加载根
```

- Expert 的 `skills[]` **默认并入** effectiveSkills（当该 Expert 对下一 Turn 生效时）。
- 用户可在 Task 上额外 multi-select 附加 skills。

### Expert

- 单选或「无专家」；**仅后续 Turn**生效；进行中 Run 不热切换。
- `expert.connectors[]` **只 seed UI 推荐/提示**，**永不**自动 TaskSelect 或强制 Connected。
- Expert **不得**声明 Registry 不可见的幽灵工具为已可用；未知 connector id → 装载校验错误（doctor/snapshot 可报）。

### Fake

- Fake **不**产生 `authStatus=connected` 的外呼成功。
- Fake 可反映 chips/labels/本地选用；**不得**暗示已从连接器拉取远程事实。

---

## Normative: ConnectorDescriptor

侧车（或共享 contract 包）拥有薄投影，**不是**第二套 Plugin 内核：

| 字段 | 含义 |
| --- | --- |
| `id` | 产品稳定 id，如 `connector.feishu` |
| `name` / `description` | 中文优先显示 |
| `pluginRefs[]` | 贡献来源 plugin id（可多） |
| `capabilities[]` | **子能力**（见下） |
| `authSummarySource` | 聚合 auth 状态的资源键 |
| `toolScope` | 该连接器暴露的工具名/前缀范围（装配用） |
| `commandScopes` | 该连接器允许通用 Workspace Shell 调用的原生命令 basename |
| `availability` | `sidecar` / `fake-catalog-only` 等 |

### 实现通道（MCP ∪ domain CLI）

- ConnectorDescriptor **应**能表达 `primaryChannel`；当前 GitHub=`mcp`、飞书=`domain_cli`。
- **Plugin 可选择** `contributes.mcp`、`contributes.cli` 或在确有需要时同时贡献；不因平台支持两类通道就强制 Hybrid，且同一 Provider 的产品 id 不按通道分裂。
- **Provider-owned contract：** 工具 schema、CLI 命令、Skills 与能力 metadata 归 Plugin package；Host core 禁止逐条重写 Provider 业务命令。
- Domain CLI 经通用 Workspace `execute_command` 进入 Runtime；Provider 只声明命令范围、Skills 和认证，Host 不重新定义其业务 argv。
- MCP 工具面以 MCP `tools/list` 为真源，Host 动态适配并在发现后执行 filter / approval；allowlist **不是**重新定义工具 schema 的来源。
- Tool canonical identity = `(pluginId, channelId, originalName)`；模型公开名允许可逆 namespacing，但调用必须映射回原始 identity。
- 工程师可在 doctor/snapshot 看到通道；**Composer 主路径不要求用户选择通道。**

### GitHub（官方 MCP）

- 产品 id：`connector.github`；Provider plugin：`mcp.github`；`primaryChannel: mcp`。
- 默认远程端点：`https://api.githubcopilot.com/mcp/`，可用 `MCP_GITHUB_URL` 覆盖。
- auth kind：`oauth2`，strategy=`managed_broker`；平台统一持有 GitHub App Client ID/Secret 与 hosted callback。
- Sidecar 向 Broker 创建授权 session，只在 Node 内存持有高熵 claim token；Renderer 只收到 GitHub authorization URL。
- Workbench 刷新状态时由 Sidecar 轮询 claim；成功后 access token 与 Broker refresh handle 写入 Keychain，MCP 动态工具热加载，无需重启。
- GitHub builtin 无 PAT、无本机 Client Secret、无本机 Provider callback。Broker 未部署时诚实失败，不降级为第二套用户凭据流程。
- 工具以官方 MCP `tools/list` 为真源；模型公开名使用 `github__<originalName>`，同时保留 canonical identity `(mcp.github, github, originalName)`。
- GitHub 不附带 `gh` CLI fallback；若未来确有缺口，以新 Provider contribution 与独立验收引入。

### 飞书（CLI-first · 对齐 WorkBuddy）

- 产品 id：`connector.feishu`，显示名 **「飞书」**（单一连接器，不是「飞书 MCP」+「飞书 CLI」两行）。
- **主通道（本切片）：领域 CLI** — 官方 **`lark-cli@1.0.85`**（或兼容 pin）；仓内 `cli.feishu` 演进：`command`/`packageHint`/`statusCommand` 对齐 `lark-cli`，auth kind = **`cli_session`**；`primaryChannel: domain_cli`。
- **原生能力：** 运行时完整同步已安装的官方 `lark-*` Skill 包，Agent 读取 Skill 后通过通用 `execute_command` 执行原生 `lark-cli` argv。Host 不把日历/IM/Base/Docs 重新转换成业务工具。
- **Runtime 工具：** 只有 `execute_command`；`toolScope=[]`，`commandScopes=['lark-cli']`。
- **文案诚实：** 当前可写「官方 lark-* Skills + 原生 CLI 契约」；Skills 来源不存在、包不完整或含符号链接时不宣称可用。
- **Connected：** `statusCommand`（如 `lark-cli auth status`）成功；**不是**侧车 Keychain oauth2 binding；**不是** MCP bearer 已注入。
- **登录 UX：** 「+」→ 去授权/去登录 → 打开/委托 **飞书 CLI 授权页**（`open.feishu.cn/page/cli?...&from=cli` 或 `lark-cli auth login`）→ 完成后 snapshot refresh → 绿点。
- **Token：** 留在 CLI/OS 凭据存储；宿主 **不**复制 token 进 Renderer；侧车只 probe + 受控 Provider invocation。
- **执行安全：** `lark-cli` 必须满足 Plugin enabled + CLI Connected + active Task selected；Provider adapter 固定可执行文件、丢弃模型 env、限制超时/输出，所有 `execute_command` 始终需 Host 审批。
- **子能力（capabilities）** 本切片以 CLI 子命令域表达，例如：
  - `native_cli` — 官方 Skills + 通用 Shell + 原生 `lark-cli`
  - 日历/IM/Base/Docs 等领域不再由 Host 建子能力工具清单；以官方 Skill 和 CLI 自身为真源
- **后置：** 飞书 MCP 不属于当前默认路线；若未来新增，需重新定义 Provider、认证与多通道状态合同。

---

## Normative: CapabilitySnapshotPort lifecycle

Snapshot **不只是**静态目录读，而是 status-safe **版本化读模型** + **失效合同**。

### 查询

- `getSnapshot(taskId?)` → versioned payload：connectors / skills / experts + Enabled / Connected / TaskSelected + loginHint + 子能力可用性。
- **字段白名单**：仅允许实现清单内的非 secret、最小 PII 字段；**禁止**把 raw AuthBinding / OAuth metadata 整包给 Renderer。

### Invalidation / refresh 触发（至少）

| 原因 | 行为 |
| --- | --- |
| `authStarted` | UI 可 optimistic「授权中」 |
| `authCompleted` / `authFailed` / `authCancelled` | **必须** invalidation + **主动 refresh**；禁止靠整页重启 |
| `taskSelectionChanged` | refresh 或本地乐观 + 与侧车确认 |
| `externalAuthRevoked` / logout residual（含 issue #33 类） | refresh；芯片保留选用，Connected 更新 |
| `pluginEnableChanged` | refresh |

MVP 可不做长连接 push；**完成事件后的主动 refresh 是硬要求**（非纯盲轮询作为唯一成功路径）。

---

## User Stories

1. As a Workbench 用户, I want 在「+」看到连接器/技能/专家三组, so that 我在对话里配置能力。
2. As a Workbench 用户, I want 点飞书未登录时就地走 **飞书 CLI 登录**并回流绿点, so that 体验对齐 WorkBuddy 类产品。
3. As a Workbench 用户, I want 为本 Task 启用已连接的飞书, so that 后续 Turn **真正**挂上飞书 **CLI 工具面**。
4. As a Workbench 用户, I want 取消飞书选用后相关工具不再可用, so that 选用不是装饰。
5. As a Workbench 用户, I want 选用会议纪要专家与技能, so that Agent 按配置工作。
6. As a Workbench 用户, I want 芯片显示当前专家/技能/已选连接器, so that 状态可扫描。
7. As a Workbench 用户, I want Run 中改专家不影响当前 Run, so that 执行不被热切换打断。
8. As a Workbench 用户, I want 专家依赖未连时仍能先选专家, so that 配置与授权可分步。
9. As a Workbench 用户, I want 外部撤销授权后芯片仍在但显示断开, so that 我能再授权而非丢配置。
10. As a Workbench 用户, I want Fake 下诚实目录, so that 演示不撒谎。
11. As an operator / developer, I want 侧车 effective 算法与 ConnectorDescriptor 可测, so that UI 无法私自定义语义。
12. As a security-conscious user, I want snapshot 白名单与无 token, so that 密钥与多余 PII 不进浏览器。

---

## Product surface

### Composer「+」

- 打开 **Capability Surface 面板**，默认三组：**连接器 / 技能 / 专家**（对齐主流「目录 → 授权 → 选用」；**不是** MCP / CLI 两个主 tab）。
- Plugin 名仅次要来源标注（如「来自 cli.feishu」），**不设「插件」主 tab**，不要求用户理解 packaging。
- 每个 **Connector** 一行产品名（当前「GitHub」「飞书」）+ 状态 + 子能力摘要；未 Connected 时主 CTA **「连接」/「去授权」**（`startAuth`），已登录以 Switch 控制本 Task 选用——对齐 WorkBuddy 的目录 + 开关形态。
- **禁止**在「+」主列表拆成「飞书 MCP」与「飞书 CLI」两个连接器逼用户选通道；通道只出现在诚实 note / `primaryChannel` / 高级文案。
- GitHub 展示官方品牌图标、MCP/OAuth 提示；飞书展示本机官方应用图标、CLI/`cli_session` 提示。两行是不同 Provider，不是同一连接器的通道拆分。
- 飞书本切片展示：产品名「飞书」+「原生 CLI / 官方 Skills」+ 诚实标注 CLI/`cli_session`（非宿主 OAuth）；可选提示安装 `lark-cli`。
- 状态徽章：Enabled、Connected/未登录/CLI 缺失、授权中、需本地 Runtime、本 Task 已选用、`capabilityEffective`（若有）。

### 通用授权路径（产品合同）

```text
+ → 连接器条目 → Connected=false
  → CTA「去登录」/「去授权」+ loginHint
  → startAuth(connectorId)
  → 侧车按该 Connector 的 auth model 启动登录
       · domain_cli / cli_session → 领域 CLI login（本切片飞书）
       · mcp / oauth2 managed broker → 打开 Provider 授权页，Sidecar claim 后自动刷新（当前 GitHub）
  → 完成 → status 探测 → snapshot refresh → Connected
  → 用户 Task 选用 → capabilityEffective（须满足 effective 算法）
```

### 飞书授权路径（验收门 · CLI-first）

```text
+ → 连接器「飞书」→ Connected=false
  → CTA「去登录」/「去授权」+ loginHint（中文；可提示安装 lark-cli）
  → Workbench 发 startAuth(connector.feishu) 或等价「开始 CLI 登录」意图
  → 侧车/宿主打开或委托：lark-cli auth login / 飞书 open.feishu.cn/page/cli
  → CLI 完成登录（token 在 CLI 侧）
  → 侧车 cli_session statusCommand 探测成功
  → authCompleted → snapshot refresh
  → 面板：Connected（cli_session）| 取消 | 失败（中文；含 binary missing）
```

- 设置页「连接」同一 **cli_session** 合同；验收主路径是「+」。
- Renderer **不**持 token；**不**把 CLI 成功写成「宿主 OAuth 已注入」。
- **未安装 CLI 或 status 失败，不得绿点。**

### Task 级选用与持久化

| 类型 | 选用语义 |
| --- | --- |
| Connector | TaskSelected；**仅当 Connected** 时进入 effective 工具面 |
| Skill | 多选附加 |
| Expert | 单选或无；仅后续 Turn |

- **持久化：** 按 Task **本地持久**直至 Task 删除（desktop-first）。
- 切换 Runtime 适配器后须 **refresh snapshot** 并重新校验 Connected；不自动清空 TaskSelected。
- **本切片无 @ 路径。**

### Skill / Expert 应用

- 显式选用仅「+」。
- 无自动建议。
- 选用进入**侧车装配**；禁止仅浏览器拼 prompt 作为唯一机制。
- UI：顶栏/Composer 芯片；Timeline 工具/技能活动可扫描。

### Fake

- 可打开目录；可选本地 Expert/Skill **标签语义**。
- 需外呼 Connector：需本地 Runtime；禁止假 Connected 外呼成功。
- **禁止**暗示已加载连接器远程上下文。

### Timeline

- 未授权 vs 业务错误可区分；可选「去连接」CTA。
- 不内嵌完整连接器管理。

---

## Architecture

### Workbench

```text
modules/capabilities/     # 新 Deep Module
  ports/                  # Snapshot (query+invalidate), selection, auth-start
  model/                  # Task selection persistence (no secrets)
  ui/                     # + panel, chips
modules/task/             # Timeline/审批；不拥有 effective 真相
modules/workbench-session/# 可协助 per-task selection 持久化存储
app/composition/          # 唯一装配
```

### Sidecar / Runtime host

- PluginRegistry：packaging 真相（mcp/cli/skills/auth）。
- **ConnectorDescriptor 投影** + **effective resolver**（本 Spec 算法）。
- **Expert：临时 static catalog**
  - 路径：`tooling/workbench-runtime-voltagent/experts/`（或文档等价）
  - **诚实：** 本切片 **不是** Plugin packaging 真相；有独立发现根与信任边界
  - **迁移目标：** 后置 `contributes.experts`
  - 信任规则：仅仓库内置 / 显式配置根；碰撞按 id 唯一，重复 id 装载失败
- GitHub：Descriptor 映射官方 MCP（OAuth2 + 动态 `tools/list` + `github__` 公开名前缀）。
- 飞书：Descriptor 映射 **CLI 主路径**（`lark-cli` + `cli_session`）；当前不叠加 MCP。

### Seams

| Seam | 职责 |
| --- | --- |
| CapabilitySnapshotPort | versioned status-safe 读模型 + invalidation/refresh |
| Selection / AuthStart | Task 选用；开始授权；无 secret |
| Sidecar effective resolver | 下一 Turn 真工具/技能集 |
| RuntimePort | 执行流、工具、审批 |
| Fake adapters | 诚实 catalog/selection |

### Testing seams

- Effective 算法单测（全局 off / 未选 / 未连 / 已选已连）。
- Snapshot 无 secret、符合字段白名单。
- authCompleted 后 snapshot 收敛。
- 黄金路径：选用则工具出现；取消选用则缺席/失败。
- Fake 无假 Connected 外呼与假远程上下文。

---

## Implementation Decisions (normative)

1. 词汇以 `CONTEXT.md` 为准；UI 中文优先。
2. Module：`capabilities`；跨 module 只经根 `index.ts`。
3. PluginRegistry 仍是 packaging 真相；ConnectorDescriptor 是投影；Expert catalog 是临时旁路（诚实文档化）。
4. GitHub auth = **`oauth2/managed_broker`**（无用户 PAT/Client Secret）；飞书 auth = **`cli_session`**。二者独立解析与刷新；Renderer 不持 secret。
5. Expert Profile 字段：`id`, `name`, `description`, `instruction`, `skills[]`, `connectors[]`（recommend only）。禁止 subAgents / 自动路由 / 任意 shell。
6. Skills vendor：missing-only；pin 见附录 A。
7. **实现顺序（双 Provider 修订）：**
   1. 锁 effective 算法 + Provider-owned ConnectorDescriptor
   2. 接入 `mcp.github`：官方端点、static bearer、动态工具、可逆 identity
   3. 保持 `cli.feishu`：`command=lark-cli`（pin 1.0.85）、statusCommand、实验 docs allowlist
   4. startAuth 按 auth kind 分流 + status 回流 + Snapshot invalidation
   5. 侧车 effective（MCP/CLI 各自工具面）+ Snapshot
   6. **飞书黄金路径 E2E**（CLI 已登录 + Task 选用 + 可观测 CLI 工具行）
   7. 「+」面板、官方图标与 WorkBuddy Switch
   8. Expert catalog + 辅助样例

---

## Appendix A — Built-in samples

| 产品 id | 显示名 | 角色 | 来源 / pin | 备注 |
| --- | --- | --- | --- | --- |
| `connector.github` | GitHub | **MCP 动态发现基准** | 官方 `github/github-mcp-server` 远程端点；builtin `mcp.github`；auth=`oauth2` | `github__publicName ↔ originalName`；不内置 `gh` CLI fallback |
| `connector.feishu` | 飞书 | **黄金路径必需** | 官方 **`lark-cli@1.0.85`**；builtin `cli.feishu` 对齐该二进制；auth=`cli_session` | WorkBuddy 同构；Connected=CLI 已登录；P0 allowlist 含 docs 只读 |
| `expert.office-meeting` | 会议纪要专家 | **黄金路径必需** | 仓内 profile + `meeting-notes` | 可与飞书 CLI 文档能力组合演示 |
| `skill.meeting-notes` | （经专家默认） | 黄金路径 | 已 bundled | 可经 Expert 默认 skill 进入 |
| `skill.planning-and-task-breakdown` | 任务拆解 | **辅助** | `addyosmani/agent-skills` @ `f49337711b7a` | 不单独证明连接器 |
| `expert.xhs-cover` | 小红书封面专家 | **辅助 UX** | 仓内薄 profile | **不得**作为架构证明唯一路径 |

**不作为 Runtime 依赖：** OpenClaw channel 整包、冒充官方的社区 npm `feishu-cli`（非 lark-cli）、浏览器持 token、把 CLI 登录假称宿主 OAuth。

---

## Appendix B — Acceptance（见完整剧本）

完整勾选：[`workbench-capability-surface-acceptance.md`](./workbench-capability-surface-acceptance.md)。

**强制黄金路径（缺一不可）：**

1. 本机可用 `lark-cli`；CLI 登录成功使 `connector.feishu` **cli_session Connected**。
2. TaskSelected 飞书 + `expert.office-meeting`。
3. Turn 中出现**可观测**飞书 **CLI 工具**活动（至少 docs 只读子命令）。
4. 取消 TaskSelected 飞书后，同等提示下工具面缺席或失败可解释。
5. Fake 不假 Connected / 不假 CLI 外呼。

---

## Out of scope（重申）

- 自动建议 Expert/Skill
- `@` 语法
- 多专家 Supervisor UI
- 插件市场 P0
- Channel/IM Bridge 与 Connector 合并
- Desktop Host 专有能力
- **飞书宿主 OAuth / MCP inject 验收**

---

## Open items for implementation tickets

- Expert/Skill vendor 拷贝脚本
- `lark-cli` 安装与 PATH / `FEISHU_CLI_PATH` operator 文档
- allowlist 与官方 lark-cli 子命令真实映射表
- Snapshot 字段白名单最终表
- 设置页 IA 高保真
- `contributes.experts` 迁移票
- 平台 UI Lab Connector 的真实 GitHub App 注册、Broker 域名与 hosted callback 部署；当前代码与 fake Broker 合同已实现，真实账号验收待外部服务

---

## Resolution trail

| 决策 | 来源 |
| --- | --- |
| 词汇 | [#35](https://github.com/xiaowen-0725/uilab-admin/issues/35) |
| 参考模型 / 样例研究 | [#36](https://github.com/xiaowen-0725/uilab-admin/issues/36), [#37](https://github.com/xiaowen-0725/uilab-admin/issues/37) |
| Composer「+」/OAuth 初稿 | [#38](https://github.com/xiaowen-0725/uilab-admin/issues/38) |
| Skill/Expert 应用初稿 | [#39](https://github.com/xiaowen-0725/uilab-admin/issues/39) |
| 架构边界初稿 | [#40](https://github.com/xiaowen-0725/uilab-admin/issues/40) |
| Spec 初稿 | [#41](https://github.com/xiaowen-0725/uilab-admin/issues/41) |
| Codex 对抗评审 | [evidence](../evidence/capability-surface-codex-adversarial-review-2026-08-09.md) |
| 作者逐条表态修订 | 2026-08-09 grilling |
| 飞书 MCP vs CLI 研究 | [research](../research/feishu-mcp-vs-cli-auth-comparison-2026-08-09.md) |
| **飞书验证切片拍板 CLI-first（B）** | 2026-08-09 用户决策（本修订） |
