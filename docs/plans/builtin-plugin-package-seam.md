# Builtin Plugin Package 接缝 (#49)

> 在现有 PluginRegistry 旁新增独立 `BuiltinPluginPackage` 注册接缝，使一个包可以打包多个 manifest + 品牌资产引用 + Fake catalog 数据，通过 package contribution 统一注册。

## 所有权

| 层 | 拥有 | 不拥有 |
|---|---|---|
| **BuiltinPluginPackage** | manifests 数组 + `brandIconKey`（纯字符串 key）+ `fakeCatalog`（确定性非 secret 数据） | 文件系统路径解析、secret 凭证、Renderer 图标资产 |
| **PluginManifest** | mcp/cli/skills/auth/connectors 贡献 + version + kind | package 级别的 brand/catalog 聚合 |
| **Host core (Registry)** | manifest 合并、connector descriptor 投影、fakeCatalog 收集 | Provider 业务语义（无 `if pluginId === ...` 分支） |
| **Renderer** | brandIconKey → 实际图标资产的映射 | sidecar 内部的 brandIconKey 解析 |

**核心约束**：sidecar 永不将 `brandIconKey` 解析为文件路径。它是纯字符串 key，由 Renderer 侧映射到实际图标资产。

## 版本

- 每个 `PluginManifest` 有 `version: string`（语义版本）
- `BuiltinPluginPackage` 整体有 `id: string`（稳定标识符）
- `schemaVersion: 1` 是 manifest 级别的不变量；外部 `plugin.json` 的 `schemaVersion` 必须为 `1`（discover.ts 强制校验）
- **版本升级**：package 内 manifest 的 version 升级 = 功能迭代；breaking change 需要 `schemaVersion` 升级（当前未规划）

## 发现

| 来源 | 机制 | 信任级别 |
|---|---|---|
| **Builtin Plugin Package** | 代码内声明（如 `DEMO_EXAMPLE_PACKAGE`），通过 `createPluginRegistry({ packages })` 或 `createPluginRegistryFromEnv` 注册 | `kind: 'builtin'`（受信任） |
| **External plugin.json** | `PLUGIN_PATHS` 环境变量发现，`discover.ts` 解析 | `kind: 'local'`（不受信任，受限贡献） |

### 外部 plugin.json 安全约束（不变）

- ❌ 不能贡献 `contributes.tools`（禁止任意 JS）
- ❌ 不能声明 `auth.cliSession`（仅受信任 builtin Provider）
- ❌ 不能声明 `auth.oauth.strategy = 'managed_broker'`（仅平台受信 builtin）
- ❌ 不能声明 `auth.secretRef.backend = 'keychain'`（防跨插件凭据盗用）
- ❌ 不能声明 `skills.installedSource`（仅受信任 builtin）
- ❌ 不能声明 `cli.commands[].passthroughArgvParam`（仅受信任 builtin）
- ❌ `brandIconKey` 从外部 JSON 解析时被静默忽略（不透传到 descriptor）
- ❌ `fakeCatalog` 不存在于 `PluginManifest` 类型上（外部 JSON 无法贡献 Fake catalog）

## 升级

| 场景 | 操作 |
|---|---|
| package 增加新 connector | 在 `manifests[].contributes.connectors` 追加；可选在 `fakeCatalog` 补对应 entry |
| package 升级 manifest version | 修改 `manifests[].version` |
| package 需要 breaking schema change | 需要新的 `schemaVersion`（当前为 1，未规划升级） |
| 外部 plugin.json 升级 | 修改 `plugin.json` 的 `version`；Host 不保证向后兼容 |

## 实现

### 新增类型

- `plugin-package.ts`：`BuiltinPluginPackage` + `FakeCatalogEntry` 类型
- `manifest.ts`：`ConnectorContribution` 增加可选 `brandIconKey?: string`
- `connector-descriptor.ts`：`ConnectorDescriptor` 增加可选 `brandIconKey?: string`，投影透传

### Registry 接缝

- `CreatePluginRegistryOptions` 增加可选 `packages?: BuiltinPluginPackage[]`
- `createPluginRegistry` 把 packages 展开为 manifests，与 builtins 合并（first-wins 去重）
- `PluginRegistry` 增加 `listFakeCatalog(): FakeCatalogEntry[]`
- `createPluginRegistryFromEnv` 默认包含 `DEMO_EXAMPLE_PACKAGE`

### 演示包

- `demo-package.ts`：`DEMO_EXAMPLE_PACKAGE` — 通过 `PLUGINS_ENABLED=mcp.demo` 启用
- 验证接缝通用性：连接器 + 授权 + MCP 执行通道 + 品牌 key + Fake catalog 全部通过 package 注册

## 与 #50/#51/#52 的关系

- **#50（迁移 GitHub 为独立内置插件包）**：将 `BUILTIN_MCP_GITHUB_PLUGIN` 重构为通过 `BuiltinPluginPackage` 注册
- **#51（迁移飞书为独立内置插件包）**：将 `BUILTIN_CLI_FEISHU_PLUGIN` 重构为通过 `BuiltinPluginPackage` 注册
- **#52（移除旧 Builtin 与 Renderer Provider 分支）**：移除 Renderer 侧 `connectorBrandIconNode` 的硬编码 switch，改为从 descriptor `brandIconKey` 映射

本工单（#49）建立了接缝；#50/#51 做实际迁移；#52 清理旧分支。
