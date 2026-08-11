# Capability Surface：Provider-owned Plugin 基础迁移证据

- **Date:** 2026-08-09
- **Decision:** [ADR 0017](../adr/0017-provider-owned-plugin-contract-and-dynamic-discovery.md)
- **Scope:** Connector metadata 动态投影、可逆 Tool identity、MCP/CLI Registry 接线
- **Not shipped:** 官方 `larksuite/cli` Skills 受控执行环境；完整 `lark-openapi-mcp` 飞书 channel

## Outcome

现有两条飞书文档工具保留为 `curated/experimental`，不再作为完整插件系统的扩展模板。
飞书产品 metadata 已从 Connector core 迁入 `cli.feishu` Plugin contribution；外部
`plugin.json` 也可以贡献 Connector，Host 通过同一投影接口生成 Capability Snapshot。

```text
Provider-owned PluginManifest
  contributes.connectors / mcp / cli / skills / auth
                    │
                    ▼
      projectConnectorDescriptors
                    │
        PluginRegistry + Agent Bundle
                    │
          Capability Snapshot / Task gate

MCP / CLI discovered tool
                    │
                    ▼
 ToolIdentityRegistry
 publicName ↔ (pluginId, channelId, originalName)
                    │
          approval / auth / execute
```

## Evidence map

| Contract | Evidence |
| --- | --- |
| Provider connector schema | `src/plugin/manifest.ts` · `ConnectorContribution` |
| 外部 plugin.json 支持 | `src/plugin/discover.ts` + `discover.test.ts` |
| 通用 Connector 投影 | `src/plugin/connector-descriptor.ts` + test |
| 飞书 metadata 归 Plugin | `src/plugin/builtins.ts` · `BUILTIN_CLI_FEISHU_PLUGIN.contributes.connectors` |
| Registry / Snapshot 接线 | `src/plugin/registry.ts`、`src/create-agent.ts`、`src/capability/http-routes.ts` |
| 可逆工具 identity | `src/plugin/tool-identity.ts` + MCP/CLI loader tests |
| 写操作 fail-closed | MCP exact read allowlist tests；CLI docs_write approval test |

## Verification

- Provider migration 定向测试：**67/67**。
- VoltAgent sidecar 全量：**233/233**。
- Agent Workbench：**313/313**。
- Sidecar / Workbench typecheck：PASS。
- `pnpm check:workbench`：PASS。
- `pnpm check:foundation`：PASS。
- VoltAgent 模型注册表自动刷新仍会打印非致命网络超时；测试退出码为 0。

## Remaining acceptance

1. 接入官方 `lark-openapi-mcp` channel，并验证上游工具增删无需改 Host core。
2. 若要求官方 CLI Skills，提供同版本 Skills + 受控 `lark-cli` 执行环境和真实回归。
3. ~~将 Feishu startAuth 的 Provider-specific 行为从 Capability HTTP module 迁入 Plugin auth adapter。~~ **2026-08-10 已完成**：`cliSession` manifest + 通用 `connector-cli-auth` 状态机；HTTP/Renderer 不再持有飞书命令或 `device_code`。
4. 定义同一 Connector 多 Provider contribution 的合并/冲突规则；当前 duplicate id fail-closed。
