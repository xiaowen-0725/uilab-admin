# ADR 0017：Provider-owned Plugin Contract 与动态工具发现

- **Status:** Accepted
- **Date:** 2026-08-09
- **Amended:** 2026-08-10（GitHub 平台托管 OAuth；飞书 Provider-owned CLI Device Flow）
- **Scope:** Agent Workbench 本地侧车的 Plugin / Connector / MCP / domain CLI / Skill 接缝
- **Supersedes:** 宿主逐条声明/转换飞书 CLI 业务命令的方向，以及“单连接器默认走 MCP+CLI Hybrid”的方向

## Context

早期 `cli.feishu` 在宿主仓内把 `lark-cli` 子命令手工转换为专用 structured tools。该实现证明了固定二进制、Task 选用门禁、
认证探测和写入审批可以成立，但它同时让宿主知道第三方 Provider 的具体业务命令，
并改变了飞书官方 Skill 所依赖的 `lark-cli <domain> <command>` 契约。

主流 Agent Runtime 的共同做法是：从 MCP / Plugin 动态取得工具 schema，经过通用
Adapter 进入模型 Tool Registry；宿主可以过滤、命名空间化和审批，但不在宿主源码中
逐条重写 Provider 业务工具。飞书官方也分别提供 `larksuite/cli`（CLI + Skills）和
`lark-openapi-mcp`（MCP 动态工具）两套上游契约，二者不能互相冒充。

## Decision

### 1. 语义所有权

- **Provider-owned Plugin package** 拥有 icon、产品 metadata、能力 metadata、原始工具
  schema、CLI 命令契约、Skills、认证实现及可选风险提示。
- **Workbench Host** 只拥有 Plugin 生命周期、通用协议 Adapter、Task 选用、身份映射、
  凭据隔离、超时、审计和 `allow | ask | deny` 策略。
- Host core 禁止出现 Provider 业务语义，例如“飞书文档读取必须执行
  `docs +fetch --doc`”。若某 Provider 需要专用适配，该实现必须位于 Provider-owned
  package 内，并通过稳定 Plugin interface 接入。

### 2. 工具发现与身份

- MCP 工具以 `tools/list` 返回的 name/schema 为真源，Host 做通用动态装配。
- Tool 的 canonical identity 是 `(pluginId, channelId, originalName)`。
- 模型公开名因模型命名约束或冲突可做 namespacing/normalize，但必须保存
  `publicName ↔ canonical identity` 的可逆映射；调用时使用 `originalName` 回到 Provider。
- allowlist 是**发现后的过滤/策略**，不是宿主重新定义第三方全部工具的来源。

### 3. Skills 与 CLI

- Skill 的 CLI 名、工具名、脚本、附属文件和执行环境都是其运行契约。
- 要宣称兼容官方 `larksuite/cli` Skills，运行环境必须保留其 `lark-cli` 命令契约，
  或由 Provider package 提供经过版本化与回归验证的兼容层；不能仅凭名称近似宣称兼容。
- Office Runtime 只对 Agent 暴露一个通用 Workspace `execute_command`；它使用 `command + args[]`，不把 Provider 业务命令变成新的 Function Tools。
- 当前 builtin `cli.feishu` 只贡献 Connector metadata、`commandScopes=['lark-cli']`、CLI session auth 和官方 Skills 安装源。Host 不再为 Calendar/Base/IM/Docs 逐条转换业务工具。
- 已安装的官方 `lark-*` Skill 包会完整同步到 Workspace 受管目录，保留 `SKILL.md`、references、scripts 和 assets；外部声明式 Plugin 不得请求主机路径。
- Provider command 必须满足 Plugin enabled、CLI session Connected 与 active Task selected；执行时固定可执行路径、丢弃模型 env、限制超时/输出，并拒绝可见的 shell 间接绕过。
- 所有 `execute_command` 都始终需要 Host 审批；审批是任意命令执行的最终用户边界。

### 4. Connector 产品投影

- 平台同时支持 MCP 与 domain CLI，但**通道选择属于每个 Provider Plugin**，不是要求每个 Connector 同时实现两套协议。
- 当前两个产品级内置 Connector 固定为：`connector.github` → `mcp.github`（官方 MCP），`connector.feishu` → `cli.feishu`（官方 CLI）。两者不是同一 Provider 的通道拆分。
- 同一 Provider 若未来确有多通道需求，Renderer 仍只显示一个产品级 Connector；不得按 MCP / CLI 拆成两行让用户选择协议。
- ConnectorDescriptor 从 Plugin contribution 动态投影，不在 Connector core 内硬编码
  Provider 工具名。
- Hybrid 是可表达的例外形态，不是默认终态；存在时分别报告认证与可用性，一个 channel 的 Connected 不得替另一个变绿。

### 5. GitHub OAuth 的所有权边界

- `mcp.github` 只声明 `oauth2/managed_broker`、平台 Broker 地址引用和 MCP server 关联；不声明用户或 Sidecar 持有的 GitHub App 凭据。Provider 业务工具仍以 MCP `tools/list` 为真源。
- 平台 Connector Broker 拥有 GitHub App Client Secret、Provider callback、GitHub refresh token 与租户治理；它是 Provider OAuth 的唯一身份所有者。
- Sidecar 创建 Broker session、仅持有一次性 claim capability，claim 后将 access token 与 Broker refresh handle 写入 Keychain，并负责 MCP 热加载。
- Renderer 只接收授权 URL 与脱敏状态，不接收 claim token、access token 或 refresh token。
- GitHub builtin 不接受 PAT/static bearer 或本机 Client Secret fallback；缺 Broker 时 fail-closed。通用 OAuth/PAT 基础设施仍可服务其他明确自托管的 Plugin，但不能成为 builtin GitHub 的第二入口。

Broker v1 接缝固定如下：

1. `POST /v1/oauth/sessions` 接收 `schema_version=1`、`provider=github`、
   `connector_id=connector.github`、`client=uilab-agent-workbench` 与
   `transport=local-sidecar-poll`；返回 `session_id`、公开的
   `authorization_url`、仅供 Sidecar 使用的高熵 `claim_token`、Broker
   `token_endpoint`、公开 `client_id`、`expires_in` 与 `poll_interval`。
2. Broker 完成 hosted callback 后，Sidecar 以
   `POST /v1/oauth/sessions/{session_id}/claim` 和
   `Authorization: Bearer <claim_token>` 领取结果。`202` 表示 pending，
   `404/410` 表示无效或过期；成功返回 `status=authorized`、短期
   `access_token`、可选 `expires_in/scope` 与不透明的 Broker
   `refresh_token` handle。
3. Sidecar 后续向 Broker 返回的 `token_endpoint` 发送标准
   `grant_type=refresh_token` 表单。Broker 解析 handle、在服务端使用其持有的
   Provider refresh token，并只向 Sidecar 返回新的短期 access token/handle。
4. `claim_token` 必须短期、一次性、不可预测，并绑定 session/租户/Provider；Broker
   必须限流、防重放、记录脱敏审计并在 claim 或过期后销毁 session。上述服务端控制是
   真实部署验收项，Sidecar 不能替代它们。

### 6. CLI Device Flow 的所有权边界

- `AuthResourceContribution.cliSession` 由受信 builtin Provider 声明：可执行文件、最低版本、首次配置命令、用户授权命令、完成命令、允许的 HTTPS host、domain 参数和子进程环境白名单。
- Host 只实现通用 `begin/reconcile/dispose` 状态机，不知道 `config init`、`auth login` 或任何 Provider id。外部 `plugin.json` 不能声明可执行 CLI auth flow。
- 首次飞书连接按官方 CLI 合同执行两步：`config init --new` 输出 `open.feishu.cn/page/cli`；完成后 `auth login --no-wait --json` 输出用户授权 URL；Sidecar 再用私有 `device_code` 恢复轮询。
- Renderer 只接收 `verificationUrl`、`step`、状态和脱敏文案；`device_code`、token、App Secret 不跨越 Sidecar seam。
- 当前 builtin 固定依赖 `@larksuite/cli@1.0.85` 并默认启用；Provider executable 进入 Agent 前仍需满足 Plugin enabled、auth connected、Task selected 与 Host approval。

## Deep-module seams

```text
GitHub Plugin                 Feishu Plugin
`mcp.github`                  `cli.feishu`
      │ tools/list                  │ lark-* Skills + command scope
      └──────────────┬──────────────┘
                     ▼
             PluginRegistry.load()
                     │
                     ├── ToolIdentityRegistry (unified, cross-channel)
                     ├── security-policy decide*NeedsApproval (boolean)
                     ├── tool-gate gateConnectorToolInvoke (allow|deny)
                     └── ConnectorProjection
                     ▼
       Agent Tool Registry + WorkspaceSandbox + Capability Snapshot
```

三个外部测试 seam 的**当前实现状态**（2026-08-12 修订）：

1. **`PluginProvider.list/call`** — **目标态，未实现**。ADR 原文命名了 `PluginProvider.list/call`，但实际发现接缝是 `PluginRegistry.load()`（返回扁平快照含 `toolNames` + `toolIdentities`），调用委托给 VoltAgent 的 `Tool.execute` 分发。Host 不按 public name 调用工具。未来是否引入真正的 `list()`/`call()` 取决于是否出现第二个 Agent Runtime（目前只有 VoltAgent）。
2. **`ToolIdentityRegistry`** — **已实现（统一实例）**。MCP loader 和 CLI loader 共用一个 `sharedIdentityRegistry`（在 `createPluginRegistry` 闭包内创建，传递给初始加载和 `loadMcpPlugin` 热加载）。`PluginRegistryLoadResult.resolveToolIdentity(publicName)` 可反查任何模型可见名到 Provider canonical identity。跨通道重名在注册时检测。
3. **`PolicyEngine (allow | ask | deny)`** — **目标态，未实现**。当前策略是 `security-policy.ts` 中的 standalone 纯函数（`decideToolNeedsApproval` 返回 boolean，`decideCliCommandNeedsApproval` 返回 boolean）+ `tool-gate.ts` 的 `gateConnectorToolInvoke`（binary allow/deny）+ sandbox 的 `ConnectorCommandAccess` 判别联合（`{ allowed: true } | { allowed: false; reason }`）。没有统一的 `decide(context) → PolicyDecision` 入口，也没有 `ask` 状态。"不复制 Provider schema" 的不变量是 emergent property（gates 只操作 tool name 和 connector scope），不是 engine 强制的合约。

**不再添加无行为的命名别名**（如 `PluginProvider = PluginRegistry` 或未接线的 `PolicyEngine` 接口）。ADR 合同只能通过行为、接口和测试满足，不能通过 grep 满足。当真正需要 `list()`/`call()` 或 `decide()` 时，再以行为 PR 实现。

## Consequences

### Positive

- Provider 升级、工具增删和 Skill 版本变化集中在 Provider package。
- Host 安全策略对 MCP、CLI 和未来通道复用，避免每个 Connector 重写。
- 产品 UI 与底层实现通道解耦，同时保持状态诚实。

### Costs / risks

- 需要版本化 Tool identity 与 connector contribution schema。
- CLI Skills 若需要 Shell/Code Execution，必须增加受控执行环境和更严格信任模型。
- 动态工具集合需要缓存、`tools/list_changed`、冲突处理和回归测试；这些能力分阶段交付。

## Migration

1. 删除所有宿主手写的飞书 business wrapper tools。
2. 将 Connector metadata 从 `connector-descriptor.ts` 迁入 Plugin contribution。
3. 引入可逆 Tool identity registry，并让 MCP loader 注册原始身份。
4. 接入 `mcp.github`：连接 GitHub 官方 MCP 远程端点，以 `tools/list` 动态发现工具，并保留 `github__publicName ↔ originalName` 可逆映射。
5. 保持 `connector.feishu` 为 CLI-only 基准；挂载已安装官方 `lark-*` Skills，并用通用 Workspace Shell 执行原生 argv。
6. 未来是否增加飞书 MCP 由 Provider 契约与产品需求重新决策，不把 Hybrid 当默认路线。

## Reopen conditions

- 上游协议无法表达必要风险或认证 metadata；
- 动态发现对模型上下文/延迟造成不可接受的可复现回归；
- 官方 CLI Skills 改为稳定工具协议，不再依赖命令执行环境；
- 同一 Connector 的多 Provider 聚合需要新的所有权/冲突规则。
