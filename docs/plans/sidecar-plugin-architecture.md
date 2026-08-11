# Design: Sidecar Plugin Architecture（MCP / CLI / Skills / Tools）

**Status:** implemented baseline（2026-08-10 GitHub OAuth amendment）
**Scope:** Local VoltAgent sidecar (`tooling/workbench-runtime-voltagent`) + future Workbench Runtime plugins
**Provider ownership amendment:** [ADR 0017](../adr/0017-provider-owned-plugin-contract-and-dynamic-discovery.md)
**Non-scope (MVP):** Browser UI plugins, RuntimePort event-type extension, arbitrary remote code execution
**Related:** Office Profile O1–O5, RuntimePort / ADR-0012–0014
**References (high-maturity patterns):**

- OpenAI Codex plugins: packaging layer over **skills + MCP + apps/connectors** (not a replacement for MCP)
- Codex plugin layout: `.codex-plugin/plugin.json`, `skills/`, optional `.mcp.json`, optional `.app.json`
- Codex config: named `mcp_servers` (stdio/url + env), separate `[plugins."id"]` enable flags
- Channel ownership model: GitHub uses official **MCP**; Feishu uses official **domain CLI**; Hybrid is optional, not a default requirement
- Skills portability: folder + `SKILL.md` (Codex / Claude / community agents)
- Community lesson: plugins = **discoverability + bundle**, not reinventing transport

---

## 1. Problem

Current Office MCP wiring hardcodes `docs | calendar` connector IDs and dual env maps inside the sidecar kernel. That:

- Couples **stable assembly** to **unstable product connectors**
- Makes the next Feishu / GitHub / internal CLI a core change (Shotgun Surgery)
- Conflicts with the intended **plugin / marketplace** direction

We need an open **registration** model with clear stable/unstable seams, informed by Codex-class systems, while keeping Workbench’s RuntimePort honesty and security fail-closed defaults.

---

## 2. What a “plugin” is (product definition)

**Sidecar Plugin** = a versioned bundle that **contributes** capabilities to the **local Agent Runtime** (not to the browser shell).

Aligned with Codex wording:

> A plugin is **not** a replacement for an MCP server. It is a **packaging layer** that can include skills, MCP configuration, and related integrations so they are discoverable and installable together.

Our bundle additionally first-classes **domain CLI** (e.g. `feishu-cli`, in-house CLIs)—not free-form terminal.

---

## 3. Contribution surface (MVP)

| Contribute | Meaning | Codex analogue | Our notes |
| --- | --- | --- | --- |
| **connectors** | Provider-owned 产品 metadata、auth resource 引用、capabilities 与工具范围 | App/Connector metadata | Host 动态投影；Connector core 不写厂商业务命令 |
| **mcp** | Declare MCP server(s) the host client will connect | `.mcp.json` / mcpServers | Host owns **MCP client** (VoltAgent `MCPConfiguration`) |
| **cli** | Register **domain CLI** binaries + allowlisted subcommands | Provider-native CLI (current reference: `lark-cli`) | **Not** unrestricted shell |
| **skills** | Skill folders (`SKILL.md` + assets) | `skills/` in plugin | Prefer extra skill roots; optional seed into workspace |
| **tools** | In-process tools (TS `createTool` modules) | Less central in Codex plugins; common in agent frameworks | Optional when no binary/MCP |
| **policy** | Required env, read-only tool names, child env keys, approval defaults | Permissions / sandbox live in host config | **Host enforces**; plugin only **declares** |

### Explicit non-goals (MVP)

| Not a contribute | Why |
| --- | --- |
| Generic terminal / `bash -c` | Unbounded attack surface |
| RuntimePort event vocabulary | Kernel protocol |
| UI panels / routes | Separate UI plugin track later |
| Replacing Runtime adapter (fake/voltagent) | Composition Root choice |
| Silent auto-exec of setup scripts | Trust boundary |

### CLI meaning (locked)

**CLI capability** = Provider package 声明的 named domain command-line products (`lark-cli`, `openydt`, …)：

- Invoked via `execFile(command, argv[])` with **allowlisted** subcommands
- Structured args (prefer JSON stdout)
- Default `needsApproval` for non-read-only subcommands
- Provider 的命令/schema/Skill 契约必须留在 Provider-owned package；Host core 不得逐厂商复制
- 官方 Skill 兼容要求保留原始 CLI 契约或有版本化兼容层；curated tools 不自动等于 Skill 兼容

**Not** host UX CLI (`uilab-admin init`)—that is **operator surface** consuming the registry (`plugin list|doctor`), implemented by the host, not by each plugin injecting global commands (MVP).

---

## 4. Lessons from Codex & peers (avoid pits)

| Lesson | Pit if ignored | Our rule |
| --- | --- | --- |
| Plugin **packages** MCP/skills; host **runs** client | Reimplement protocol per connector | Always VoltAgent MCP client + registry |
| MCP 动态发现 + 可逆 identity | 宿主逐工具重写或不可逆改名 | `tools/list` 为真源；`publicName ↔ canonical identity` |
| Platform supports MCP and CLI; Provider chooses its native channel | Force every Connector to implement both | Plugin may ship mcp **or** cli; only genuine multi-channel cases ship both |
| Skills are **folders**, not single files | Broken discovery / partial sync | `skillsRoot` directory convention |
| Manifest + enable flags separate from server config | Can’t disable without deleting config | `enabled` in host state; manifest is identity |
| Secrets in **env**, not prompt / not browser | Key leak | Sidecar-only; child env allowlist + model-key hard deny |
| Permissions live in **host** | Plugin disables safety | Fail-closed defaults; plugin cannot set `needsApproval: false` globally |
| Marketplace / dual manifests for multi-host | Premature packaging complexity | MVP: **in-repo registry + local dirs**; marketplace later |
| Dynamic code load is high risk | Supply-chain | MVP: declarative JSON + builtin TS modules only |

---

## 5. Layering (stable vs unstable)

```text
┌─────────────────────────────────────────────────────────────┐
│ Workbench Renderer                                            │
│ RuntimePort only · no plugin SDK · no MCP · no CLI exec       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ Sidecar Kernel (STABLE)                                       │
│ PluginRegistry · Loader · SecurityPolicy · AgentAssembly      │
│ Operator CLI (list/doctor/enable) — host-owned                │
└───────┬───────────────────┬───────────────────┬─────────────┘
        │                   │                   │
   ┌────▼────┐        ┌─────▼─────┐       ┌─────▼─────┐
   │ Builtin │        │ Workspace │       │ User dir  │
   │ plugins │        │ plugins/  │       │ plugins/  │
   │ (TS/JSON)│        │ (JSON)    │       │ (JSON)    │
   └─────────┘        └───────────┘       └───────────┘
        contributes: mcp | cli | skills | tools | policy
```

| Layer | Change frequency | Examples |
| --- | --- | --- |
| Kernel | Rare | Registry, policy engine, path safety, Runtime stream mapping |
| Builtin plugins | Product releases | office-fs, office-skills, mcp-docs (env-shaped), feishu-cli bridge |
| External plugins | User/ops | Company MCP, private CLI packs |

**Migration:** today’s hard-coded docs/calendar become **two builtin plugin manifests**, not special-cased forever in kernel loops.

---

## 6. PluginManifest (canonical fields)

Schema version: `1`.

### 6.1 Identity & packaging

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | `1` | yes | |
| `id` | string | yes | Stable id, e.g. `mcp.feishu.docs`, `cli.feishu` |
| `name` | string | yes | Human name |
| `version` | semver string | yes | |
| `description` | string | no | |
| `kind` | `"builtin" \| "local"` | yes | MVP; `remote` later |
| `enabledByDefault` | boolean | no | default false for external; office builtins may true when profile=office |

### 6.2 `contributes.mcp[]`

| Field | Type | Notes |
| --- | --- | --- |
| `serverId` | string | Key in host MCP map |
| `transport` | `"http" \| "stdio"` | inferred if only url or command set |
| `url` | string | optional Provider-owned default endpoint；env override 优先 |
| `urlFromEnv` | string[] | first non-empty wins |
| `commandFromEnv` | string[] | |
| `argsFromEnv` | string[] | JSON array or CSV |
| `bearerTokenFromEnv` | string[] | optional |
| `cwd` | string | optional; default plugin root or workspace |
| `timeoutMs` | number | optional |
| `childEnvKeys` | string[] | allowlist into stdio child (never model keys) |
| `readOnlyToolNames` | string[] | exact names free of approval **within this server** (host still fail-closed) |
| `toolNamePrefix` | string | optional stable model-visible namespace；canonical originalName 保留 |

If neither default/env URL nor command resolves → contribution **skipped** (status `disabled`), not fatal.

### 6.3 `contributes.cli[]` (domain CLI)

| Field | Type | Notes |
| --- | --- | --- |
| `cliId` | string | e.g. `feishu` |
| `command` | string | binary name or absolute path |
| `commandFromEnv` | string[] | override path |
| `packageHint` | string | docs only, e.g. npm package |
| `versionConstraint` | string | optional doctor check |
| `commands[]` | object | see below |
| `childEnvKeys` | string[] | |
| `defaultCwd` | `"workspace" \| "plugin" \| string` | default workspace root |
| `output` | `"json" \| "text"` | prefer json |

**`commands[]` entry:**

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | tool suffix, e.g. `docs_get` → tool `cli.feishu.docs_get` |
| `argv` | string[] | template, e.g. `["docs","get","--id","{{id}}"]` |
| `argsSchema` | JSON Schema / zod-serializable | structured inputs only |
| `needsApproval` | boolean | default **true** |
| `readOnly` | boolean | if true and host allows, may skip approval |

**Invocation rule:** host builds argv from schema only; **no** shell interpolation of free text into a shell string.

**Ownership rule:** `commands[]` 是 Provider package 的 curated 声明，不是 Host core 的厂商能力表。完整 Provider 优先通过 MCP 动态发现；需要原生 CLI Skills 时由通用 CLI/Skill Runtime 保留原命令契约。

### 6.4 `contributes.skills`

| Field | Type | Notes |
| --- | --- | --- |
| `roots` | string[] | paths relative to plugin root |
| `seedIntoWorkspace` | boolean | default false (Codex-like: don’t clobber user skills) |
| `seedMode` | `"missing-only"` | if seeding |

### 6.5 `contributes.tools`

| Field | Type | Notes |
| --- | --- | --- |
| `module` | string | builtin only in MVP: TS module id resolved by host allowlist |
| `exportName` | string | factory `() => Tool[]` |

External JSON plugins **cannot** load arbitrary JS in MVP.

### 6.6 `contributes.policy` (optional aggregate)

| Field | Type | Notes |
| --- | --- | --- |
| `requiredEnv` | string[] | doctor / fail soft |
| `optionalEnv` | string[] | |
| `globalReadOnlyToolNames` | string[] | merged exact allowlist |

### 6.7 `contributes.auth[]`

Auth resource 只声明认证所有权和状态探测，不把 secret 放进 manifest：

| Kind / strategy | Provider-owned declaration | Host-owned behavior |
| --- | --- | --- |
| `oauth2 / managed_broker` | Provider id、MCP server、Broker URL 引用 | session / claim / Keychain / MCP hot-load |
| `cli_session / device_flow` | command、最低版本、bootstrap/start/complete argv、允许 URL host、child env keys | 通用 `begin/reconcile/dispose`；`device_code` 仅 Sidecar 内存 |
| `static_bearer` | env/SecretRef 引用 | closed child env / HTTP bearer 注入 |

可执行 `cliSession` 与平台 `managed_broker` 只允许受信 builtin；外部 `plugin.json` 不能借授权入口执行任意命令或取得平台 OAuth 身份。

### 6.8 Current product-facing builtin pair (conceptual)

```json
{
  "schemaVersion": 1,
  "id": "mcp.github",
  "name": "GitHub MCP",
  "version": "0.2.0",
  "kind": "builtin",
  "contributes": {
    "connectors": [{
      "id": "connector.github",
      "name": "GitHub",
      "description": "GitHub official MCP",
      "primaryChannel": "mcp",
      "authResourceId": "mcp:github",
      "authKind": "oauth2",
      "capabilities": [{
        "id": "collaboration",
        "name": "代码托管与协作",
        "channel": "mcp",
        "toolNames": [],
        "available": true
      }],
      "toolScope": ["github__"],
      "availability": "sidecar"
    }],
    "mcp": [
      {
        "serverId": "github",
        "url": "https://api.githubcopilot.com/mcp/",
        "urlFromEnv": ["MCP_GITHUB_URL"],
        "bearerTokenFromEnv": [],
        "toolNamePrefix": "github__"
      }
    ],
    "auth": [{
      "resourceId": "mcp:github",
      "kind": "oauth2",
      "oauth": {
        "strategy": "managed_broker",
        "mcpServerId": "github",
        "providerId": "github",
        "brokerBaseUrlFromEnv": ["UILAB_CONNECTOR_BROKER_URL"]
      }
    }]
  }
}
```

`cli.feishu` 以同一 `contributes.connectors` 合同投影 `connector.feishu`，但只贡献
官方 Skills 安装源、`commandScopes=['lark-cli']` 与 `cli_session`，通过通用 Workspace Shell 保留官方 `lark-cli` 命令契约，不生成 Provider wrapper tools。二者证明 Host 可同时装配 MCP
与 CLI；不表示 GitHub 也要封装 `gh`，或飞书必须再叠加 MCP。

GitHub 产品「连接」只走 managed Broker：平台持有 GitHub App secret/callback；Sidecar 创建
授权会话并保管一次性 claim token，Renderer 只接收授权 URL。Broker 完成 Provider callback
后，Sidecar claim access token + Broker refresh handle，写入 Keychain 并热加载 MCP。GitHub
builtin 不接受 PAT 或本机 App Secret。

飞书产品「连接」走 Provider-owned CLI Device Flow：项目固定 `@larksuite/cli@1.0.85`；首次由 manifest 启动 `config init --new`，完成后自动衔接 `auth login --no-wait --json`，Sidecar 私有保存 `device_code` 并恢复轮询。Renderer 只看到两次公开 HTTPS URL 和脱敏状态。

---

## 7. Host kernel responsibilities

### 7.1 PluginRegistry

- Discover: builtin list + `PLUGIN_PATHS` (dirs containing `plugin.json`)
- Resolve enablement: host config / env `PLUGINS_ENABLED=id1,id2` / profile defaults
- Load contributions in isolation (one failure → status `failed`, others continue)
- Expose: `list()`, `doctor()`, `collectTools()`, `skillRoots()`, `disconnect()`
- Project `contributes.connectors` into product descriptors; reject duplicate connector ids until aggregation semantics is defined
- Register reversible tool identities across channels; namespacing is collision handling, not semantic replacement

### 7.2 SecurityPolicy (always host)

| Rule | Default |
| --- | --- |
| MCP tools approval | **all** need approval unless exact name on allowlist (env ∪ plugin declare) |
| CLI tools approval | per-command `needsApproval`; default true |
| Model API keys in child env | **hard deny** even if listed |
| Path / workspace | existing containment helpers; CLI cwd default workspace |
| DIY minimal FS | realpath containment (already fixed) |

### 7.3 AgentAssembly

Thin composition:

1. Resolve workspace + memory + summarization (profile)
2. `registry.loadEnabled(env)`
3. Mount skill roots + tools (MCP + CLI + in-process)
4. Build Agent; stream path unchanged

### 7.4 Operator CLI (host, not plugin contribute)

Suggested commands (name TBD: `uilab-runtime` or `pnpm workbench-runtime`):

- `plugin list` — id, version, status, contributes summary
- `plugin doctor` — missing env, binary missing, MCP connect smoke
- `plugin enable|disable <id>` — host state

Does **not** mean plugins register arbitrary global shell commands in MVP.

---

## 8. Mapping from current code (migration)

| Today | Tomorrow |
| --- | --- |
| `office-mcp.ts` dual docs/calendar | Builtin plugins + generic MCP loader |
| `OFFICE_SKILL_IDS` seed | Builtin `office.skills` plugin |
| `workbenchTools` minimal DIY | Builtin `minimal.tools` or non-plugin profile path |
| `create-agent` mega branch | Registry + thin assembly |
| Hardcoded env tables | Manifest `urlFromEnv` / `commandFromEnv` |

**Compatibility:** keep accepting `MCP_DOCS_URL` / `MCP_CALENDAR_*` as aliases on the first builtin manifests.

---

## 9. Phased delivery

| Phase | Deliverable | Success |
| --- | --- | --- |
| **P0** | Types + Registry + SecurityPolicy; migrate docs/calendar to 2 builtins | No `McpConnectorId` union in kernel; tests green; env aliases work |
| **P1** | `contributes.cli` executor (allowlist argv) | Can register feishu-like CLI without core change |
| **P2** | `plugin.json` discovery from `PLUGIN_PATHS` | External declarative plugins (no arbitrary JS) |
| **P3** | Operator CLI list/doctor | Ops UX |
| **P4** | Trusted dynamic modules / marketplace | Optional; separate ADR |

---

## 10. Testing strategy

| Layer | Tests |
| --- | --- |
| Manifest parse | Valid/invalid JSON, missing fields |
| Registry | Enable/disable, isolated failure |
| MCP loader | disabled / connected / failed empty tools |
| CLI executor | allowlist only; rejects shell metacharacters; approval flags |
| Security | model key never in child env; symlink path still blocked |
| Assembly | Fake path / minimal profile unaffected |

No live Feishu required for CI (mock MCP host + fake CLI binary).

---

## 11. Open decisions (product)

1. **Host CLI name:** new `uilab-runtime` vs `pnpm --filter workbench-runtime` scripts only for P0–P2.
2. **Default enabled plugins for `AGENT_PROFILE=office`:** skills always; MCP/CLI only when env resolves.
3. **Skill seed vs rootPaths only:** recommend rootPaths-first (Codex-like non-clobber).

---

## 12. Summary

- **Plugin supports (MVP):** MCP, **domain CLI**, Skills, optional Tools, Policy declarations.
- **Does not mean:** unrestricted terminal.
- **Codex-aligned:** plugin = bundle + discovery; host owns client, permissions, enablement.
- **Kernel stays open via registration;** Feishu/docs/calendar become plugins, not enums.

---

*Next implementation step when approved: P0 Registry + migrate existing MCP env aliases into two builtin manifests.*
