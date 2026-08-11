# GitHub 平台托管 Connector OAuth Agent 架构评审

## 评审结论

- Outcome: Experiment-ready
- Architecture decision: adopt candidate
- Confidence: Medium
- Scope / excluded scope: [D] 范围是 `connector.github` 从 Workbench 点击连接，到 Sidecar 领取授权、写入 Keychain、热加载 GitHub MCP tools 的代码与 fake Broker 验证。排除真实 GitHub App 注册、生产 Broker、真实账号授权、租户隔离压测和生产监控；这些仍是 [U] 未验证外部服务。

## 范围与证据

| ID | Level [D/I/U] | Evidence | Claim / limitation |
|---|---|---|---|
| D1 | [D] | `tooling/workbench-runtime-voltagent/src/plugin/builtins.ts`、`manifest.ts` | GitHub builtin 固定为 `oauth2/managed_broker`，无 PAT、用户 App Client Secret 或本机 callback contribution。 |
| D2 | [D] | `tooling/workbench-runtime-voltagent/src/capability/connector-oauth.ts` | Sidecar 创建 Broker session、内存持有 claim capability、轮询 claim、将 token 写入 Keychain。 |
| D3 | [D] | `tooling/workbench-runtime-voltagent/src/capability/http-routes.ts` 及测试 | Renderer 只取得 authorization URL 和状态；本机 Provider callback 路由不存在。 |
| D4 | [D] | `tooling/workbench-runtime-voltagent/src/create-agent.test.ts` | fake Broker 授权后，Bearer 注入 MCP host 并热加载 `github__search_repositories`。 |
| D5 | [D] | `tooling/workbench-runtime-voltagent/src/plugin/discover.test.ts` | 外部 `plugin.json` 不能声明平台 `managed_broker` 所有权。 |
| D6 | [D] | 2026-08-10 `pnpm test` | Foundation 8、Admin 108、Workbench 316、Sidecar 267 项测试全部通过。 |
| D7 | [D] | 2026-08-10 `pnpm check`、`pnpm build` | 平台类型检查、Foundation/Workbench/AI 门禁和生产构建通过。 |
| I1 | [I] | GitHub 官方 OAuth 文档与 `github-mcp-server` governance 文档 | 远程 OAuth host 需要平台拥有并注册自己的 GitHub App；因此普通用户不应创建 App。 |
| U1 | [U] | 尚无生产 `UILAB_CONNECTOR_BROKER_URL` | 未执行真实 GitHub 账号授权、callback、refresh 和远程 MCP 调用。 |
| U2 | [U] | 尚无生产 Broker trace | claim 一次性、租户绑定、防重放、限流、审计和服务端 refresh token 保护尚未用运行证据证明。 |

## 问题契约

[D] 目标是让普通用户点击 GitHub「连接」后进入平台统一的 **UI Lab Connector** GitHub 授权页；用户不创建 GitHub App，不填写 PAT、Client ID 或 Client Secret。

[D] 代表性同负载如下：

1. 未授权用户在 Workbench 点击 GitHub「连接」。
2. Sidecar 向平台 Broker 创建一次授权 session，只把公开 authorization URL 返回 Renderer。
3. GitHub 在平台 hosted callback 完成授权后，Sidecar 轮询 claim。
4. Sidecar 将短期 access token 与 Broker refresh handle 写入 OS Keychain。
5. GitHub 官方远程 MCP 以 Bearer 连接，`tools/list` 的工具经 `github__` 稳定前缀热加载，无需重启。

[D] 输入是 `connector.github`、平台发行配置 `UILAB_CONNECTOR_BROKER_URL` 和用户在 GitHub 页面的授权决定。输出/副作用是 Keychain 中的访问材料、非密 AuthBinding、MCP 连接状态和动态工具集合；Renderer 不接收 secret。

[D] 约束是 HTTPS、15 秒单请求超时、授权 session 有过期时间和最小轮询间隔、MCP 工具默认审批、无 PAT/本机 App 凭据 fallback。验收门是 fake Broker 同负载通过、无 callback 路由、无 secret 穿越 Renderer、无 Broker 时诚实失败、平台全量门禁通过。

[I] 基线失败是 Sidecar 自持 GitHub App 凭据或让用户粘贴 PAT：虽然可建立连接，但违反“一键授权、平台统一拥有 App、普通用户零配置”的产品合同，并形成第二个认证所有者。

## 双轴诊断

- C1 Perception: [D] 不适用；本切片不选择或压缩模型上下文信号。
- C2 Memory: [D] 适用但有限。pending claim 在 Sidecar 内存中，access/refresh material 在 Keychain，AuthBinding 单独持久化；进程重启后的 pending session 恢复尚未实现。
- C3 Reasoning: [D] 不适用；授权流程是确定性协议，不依赖模型判断。
- C4 Action: [D] 核心。动作链是 session → browser authorization → claim → Keychain → MCP hot-load，失败关闭且每步有明确输出。
- C5 Reflection: [D] 不适用；没有模型自我检查或经验沉淀。
- C6 Collaboration: [D] 不适用；没有多 Agent 分工或聚合。
- C7 Governance: [D] 核心。平台、Sidecar、Renderer 三方职责分离，外部插件不能取得平台 Broker 身份；[U] 生产租户与审计控制仍待 Broker 证据。
- T1 Chain: [D] 主拓扑。步骤有严格先后依赖，不能并行交换。
- T5 Loop: [D] 仅用于有界 claim polling；由 `expires_in`、`poll_interval` 和状态码终止，不构成开放式 Agent 循环。
- T2/T3/T4: [D] 不需要路由、并行或中心多任务编排；增加这些拓扑不会改善单次授权负载。
- T6 Hierarchy: [I] 只作为权限层级存在：平台 Broker 持 Provider 身份，Sidecar 持 claim 和用户 token，Renderer 只持公开状态；不是多 Agent 层级。

## 硬门槛

| Gate | Status (PASS/FAIL/UNKNOWN/N/A) | Evidence | Remediation |
|---|---|---|---|
| 目标、输出、负载 | PASS | [D] 问题契约、D1–D4 与同负载 fake Broker 测试一致。 | 真实 Broker 部署后复跑同一负载。 |
| 权限与高风险副作用 | PASS | [D] Renderer 无 secret；Keychain 持 token；MCP tools 默认审批；外部插件不能声明 managed Broker。 | 上线前核验 GitHub App 最小权限和组织安装范围。 |
| 预算与终止 | PASS | [D] Broker 请求 15 秒超时，session TTL 与最小 1 秒 poll interval 明确，404/410/过期均终止。 | 生产 Broker 增加每租户限流与告警。 |
| 幂等与恢复 | UNKNOWN | [U] pending claim 仅在 Sidecar 内存，尚无真实 Broker 重放、重复 claim 和 Sidecar 重启测试。 | Broker 保证 claim 一次性；增加重启后重新授权或安全恢复测试。 |
| 隐私、租户与不可信上下文 | UNKNOWN | [U] 代码隔离已完成，但生产 Broker 的 tenant/session binding、防重放、日志脱敏与 Provider token 存储未验证。 | 部署前完成威胁模型、租户隔离测试和密钥存储审计。 |
| 可观测与版本 | UNKNOWN | [D] 请求含 `schema_version=1`，但 [U] 无生产 session/claim/refresh trace、SLO 与审计链。 | Broker 记录脱敏 session 生命周期、错误码、延迟和版本。 |
| 评价与回归 | PASS | [D] 根测试全绿；Sidecar 覆盖 start/pending/authorized/fail-closed/hot-load/no-callback/no-external-owner。 | 增加真实账号 E2E 为发布门禁。 |
| 人工升级/降级 | PASS | [D] 用户可取消授权；缺 Broker 或失败时保持 Disconnected，不回退 PAT；运维可禁用 `mcp.github`。 | UI 增加可复制的支持关联 ID，避免暴露 secret。 |

## 最小基线

[I] 基线版本是“Sidecar 或终端用户持 GitHub App Client Secret/本机 callback，或 PAT/static bearer”。组成更少，但同负载要求普通用户配置凭据，且身份所有者从平台扩散到每台机器。

- Baseline result: FAIL
- [D] 失败门：普通用户零配置未满足；存在本机 Provider callback/PAT 第二入口；平台不能统一撤销、审计和租户治理。
- [D] 原始证据：`docs/plans/workbench-capability-surface-spec.md` 将 2026-08-10a 本机凭据方案标为已被 10b 取代；当前 builtin 和 HTTP route 已删除这些字段/路由。

## 候选模式

[D] 候选是平台托管 OAuth Broker，坐标为 C4 Action + C7 Governance，拓扑为 T1 Chain + 有界 T5 Loop。

- [D] 解决的基线失败：用户零凭据、平台唯一 App 所有者、Renderer 不持 secret、连接后热加载 MCP。
- [I] 前提：平台能注册 GitHub App 并提供 HTTPS callback/Broker；GitHub 官方远程 OAuth host 的治理要求与该所有权模型一致。
- [U] 成本与风险：新增高价值 Broker 服务、租户隔离、token custody、限流、审计、可用性和迁移责任。
- [U] 反证信号：Broker 无法做到一次性 claim 或租户绑定；真实 E2E 需要用户自行配置 App/PAT；refresh handle 泄露 Provider refresh token；授权后工具不能稳定热加载。
- [D] 拒绝替代方案：PAT、Sidecar 本机 App Secret/callback、把 GitHub 改为 CLI，以及让外部 plugin.json 自称平台 Broker。

## 接缝与工件

| Artifact / seam | Producer | Consumer | Owner / write rule | Version / failure / authorization |
|---|---|---|---|---|
| `OAuthContribution.managed_broker` | builtin `mcp.github` | Sidecar OAuth runtime | [D] 平台代码；外部 plugin.json 禁止写 | schemaVersion 1；缺 Broker fail-closed |
| `POST /v1/oauth/sessions` | Sidecar | Broker | [D] Sidecar 只写 provider/connector/client/transport | v1；非 2xx 失败；HTTPS + timeout |
| authorization URL | Broker | Renderer/browser | [D] 公开工件；不得包含 claim/access/refresh token | HTTPS；只用于导航 |
| claim capability | Broker | Sidecar memory | [D] Renderer 与持久 AuthBinding 禁止读取 | 短期高熵；[U] 生产需一次性、租户绑定、防重放 |
| `POST /v1/oauth/sessions/{id}/claim` | Sidecar | Broker | [D] Bearer claim；202 pending，404/410 终止 | v1；authorized 才允许下游写入 |
| access token / refresh handle | Broker | Sidecar SecretStore | [D] 只写 OS Keychain，不进入 Renderer、manifest、日志 | 过期刷新；失败转 expired/disconnected |
| AuthBinding | Sidecar | Registry/auth status | [D] 只含 Keychain ref、expiry 和 Broker token endpoint | 非密 schema；revoke 优先 |
| MCP tool identity | GitHub MCP `tools/list` | Agent registry | [D] Provider 原名为真源，Host 仅加 `github__` 可逆前缀 | 空工具/连接失败不宣称 Connected |

[D] Broker refresh 接缝使用标准 form：`grant_type=refresh_token`、不透明 refresh handle 和公开 `client_id`；Broker 服务端持真实 Provider refresh token 和 GitHub App Secret。

## 验证计划与结果

[D] 所有比较使用同负载：未授权点击连接 → 完成授权 → Connected → GitHub MCP 工具热加载。

- Baseline result: FAIL — 本机凭据/PAT 基线违反零配置和唯一身份所有者合同。
- Full candidate result: PASS — fake Broker 返回 session/pending/authorized，Keychain 收到 token，mock MCP 收到 Bearer，`github__search_repositories` 无重启热加载。
- Ablation result: DEGRADED — 删除 `UILAB_CONNECTOR_BROKER_URL` 时连接明确失败为平台服务未配置，且没有 PAT fallback；省略 reconcile 时 HTTP 测试不能进入授权完成；外部 plugin.json 声明 managed Broker 被拒绝。
- [D] 回归：`pnpm test` 全部通过，其中 Foundation 8、Admin 108、Workbench 316、Sidecar 267；`pnpm check` 和 `pnpm build` 通过。
- [U] 未完成：真实 GitHub App callback、真实 Broker refresh、重复 claim、租户 A/B 隔离、Broker 故障恢复、真实 GitHub MCP 调用和生产 trace。

## 健康扫描

| Dimension | Relevance | Maturity | Evidence / risk |
|---|---|---:|---|
| C1 Perception | N/A（无模型上下文感知） | — | [D] 确定性 OAuth 协议。 |
| C2 Memory | Required | 2 | [D] Keychain/AuthBinding 已实现；pending session 仅内存，[U] 重启恢复未验证。 |
| C3 Reasoning | N/A（无模型推理） | — | [D] 状态机由 HTTP 状态与 schema 驱动。 |
| C4 Action | Required | 3 | [D] session/claim/persist/hot-load 和失败路径均有绑定负载测试。 |
| C5 Reflection | N/A（无自我修正） | — | [D] 不需要 Agent reflection。 |
| C6 Collaboration | N/A（无多 Agent） | — | [D] 平台/Sidecar/Renderer 是组件边界，不是 Agent 协作。 |
| C7 Governance | Required | 2 | [D] 所有权和 secret 边界已实现；[U] 生产 Broker 治理未验证。 |
| Topology Fit | Required | 3 | [D] T1 顺序链和有界 T5 polling 与依赖关系一致，无额外编排。 |
| Composition Seams | Required | 3 | [D] manifest、session、claim、Keychain、AuthBinding、MCP identity 均有生产者/消费者和失败规则。 |
| Verification Maturity | Required | 2 | [D] fake 合同和全量回归充分；[U] 缺生产 Broker/真实账号 E2E 与运行监控。 |

## 优化路线

1. [U] 平台团队注册 UI Lab Connector GitHub App，部署 v1 HTTPS Broker 与 hosted callback；优先级最高，因为它是当前唯一真实验收阻塞项。
2. [U] 在 Broker 落地一次性 claim、session/tenant/provider 绑定、限流、防重放、加密 token custody、脱敏审计和最小 GitHub 权限。
3. [U] 用两个测试租户执行真实同负载 E2E：授权、取消、过期、refresh、重复 claim、撤销和远程 MCP `tools/list/call`。
4. [U] 增加 session 生命周期 trace、支持关联 ID、SLO 和告警；Renderer 只显示脱敏关联 ID。
5. [D] 真实 E2E 稳定后再评估 pending session 是否需要跨 Sidecar 重启恢复；若不实现，明确让用户重新点击授权。

## 回退与重开

[D] 回退动作是由平台发行配置禁用 `mcp.github`，或不下发 Broker URL；用户看到 Disconnected/平台服务不可用，已有本地能力和飞书 CLI 不受影响。禁止恢复 PAT 或本机 GitHub App Secret 作为临时回退。负责人应为平台 Connector/Broker owner，而不是终端用户。

[U] 以下触发重开问题契约：GitHub 官方 OAuth/MCP 政策变化；Broker 无法满足租户隔离或一次性 claim；真实延迟超过产品门槛；GitHub MCP 改变 token/refresh 契约；产品要求组织级安装或管理员审批。

## 证据索引

- [D] `tooling/workbench-runtime-voltagent/src/plugin/manifest.ts`
- [D] `tooling/workbench-runtime-voltagent/src/plugin/builtins.ts`
- [D] `tooling/workbench-runtime-voltagent/src/plugin/discover.ts`
- [D] `tooling/workbench-runtime-voltagent/src/plugin/discover.test.ts`
- [D] `tooling/workbench-runtime-voltagent/src/capability/connector-oauth.ts`
- [D] `tooling/workbench-runtime-voltagent/src/capability/connector-oauth.test.ts`
- [D] `tooling/workbench-runtime-voltagent/src/capability/http-routes.ts`
- [D] `tooling/workbench-runtime-voltagent/src/capability/http-routes.test.ts`
- [D] `tooling/workbench-runtime-voltagent/src/create-agent.ts`
- [D] `tooling/workbench-runtime-voltagent/src/create-agent.test.ts`
- [D] `docs/adr/0017-provider-owned-plugin-contract-and-dynamic-discovery.md`
- [D] `docs/plans/workbench-capability-surface-spec.md`
- [D] `docs/plans/workbench-capability-surface-acceptance.md`
- [I] https://github.com/github/github-mcp-server/blob/main/docs/policies-and-governance.md
- [I] https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app
- [U] 生产 Broker 部署、真实账号 E2E、租户隔离与运行 trace。
