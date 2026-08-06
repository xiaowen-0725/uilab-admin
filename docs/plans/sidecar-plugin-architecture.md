# Design: Sidecar Plugin Architecture（MCP / CLI / Skills / Tools）

**Status:** draft-for-alignment  
**Scope:** Local VoltAgent sidecar (`tooling/workbench-runtime-voltagent`) + future Workbench Runtime plugins  
**Non-scope (MVP):** Browser UI plugins, RuntimePort event-type extension, arbitrary remote code execution  
**Related:** Office Profile O1–O5, RuntimePort / ADR-0012–0014  
**References (high-maturity patterns):**

- OpenAI Codex plugins: packaging layer over **skills + MCP + apps/connectors** (not a replacement for MCP)
- Codex plugin layout: `.codex-plugin/plugin.json`, `skills/`, optional `.mcp.json`, optional `.app.json`
- Codex config: named `mcp_servers` (stdio/url + env), separate `[plugins."id"]` enable flags
- Hybrid model (GitHub plugin): **connector-first**, local **domain CLI** (`gh` / `git`) only for gaps
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
| **mcp** | Declare MCP server(s) the host client will connect | `.mcp.json` / mcpServers | Host owns **MCP client** (VoltAgent `MCPConfiguration`) |
| **cli** | Register **domain CLI** binaries + allowlisted subcommands | Hybrid CLI fallbacks in skills (e.g. `gh`) | **Not** unrestricted shell |
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

**CLI capability** = named domain command-line products (`feishu-cli`, `lark-cli`, `openydt`, …):

- Invoked via `execFile(command, argv[])` with **allowlisted** subcommands
- Structured args (prefer JSON stdout)
- Default `needsApproval` for non-read-only subcommands

**Not** host UX CLI (`uilab-admin init`)—that is **operator surface** consuming the registry (`plugin list|doctor`), implemented by the host, not by each plugin injecting global commands (MVP).

---

## 4. Lessons from Codex & peers (avoid pits)

| Lesson | Pit if ignored | Our rule |
| --- | --- | --- |
| Plugin **packages** MCP/skills; host **runs** client | Reimplement protocol per connector | Always VoltAgent MCP client + registry |
| **Hybrid**: connector/MCP first, CLI for gaps | Force everything through one channel | Plugin may ship mcp **and/or** cli; skill documents routing |
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
| `urlFromEnv` | string[] | first non-empty wins |
| `commandFromEnv` | string[] | |
| `argsFromEnv` | string[] | JSON array or CSV |
| `bearerTokenFromEnv` | string[] | optional |
| `cwd` | string | optional; default plugin root or workspace |
| `timeoutMs` | number | optional |
| `childEnvKeys` | string[] | allowlist into stdio child (never model keys) |
| `readOnlyToolNames` | string[] | exact names free of approval **within this server** (host still fail-closed) |

If neither url nor command resolves → contribution **skipped** (status `disabled`), not fatal.

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

### 6.7 Example (conceptual)

```json
{
  "schemaVersion": 1,
  "id": "office.feishu.hybrid",
  "name": "飞书办公",
  "version": "0.1.0",
  "kind": "builtin",
  "contributes": {
    "mcp": [
      {
        "serverId": "feishu_docs",
        "urlFromEnv": ["MCP_FEISHU_DOCS_URL", "MCP_DOCS_URL"],
        "bearerTokenFromEnv": ["MCP_FEISHU_DOCS_BEARER_TOKEN", "MCP_DOCS_BEARER_TOKEN"],
        "childEnvKeys": ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
        "readOnlyToolNames": []
      }
    ],
    "cli": [
      {
        "cliId": "feishu",
        "command": "feishu-cli",
        "commandFromEnv": ["FEISHU_CLI_PATH"],
        "packageHint": "@company/feishu-cli",
        "childEnvKeys": ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
        "output": "json",
        "commands": [
          {
            "name": "docs_get",
            "argv": ["docs", "get", "--id", "{{documentId}}"],
            "argsSchema": {
              "type": "object",
              "required": ["documentId"],
              "properties": { "documentId": { "type": "string" } }
            },
            "needsApproval": false,
            "readOnly": true
          },
          {
            "name": "docs_write",
            "argv": ["docs", "write", "--id", "{{documentId}}"],
            "argsSchema": {
              "type": "object",
              "required": ["documentId", "content"],
              "properties": {
                "documentId": { "type": "string" },
                "content": { "type": "string" }
              }
            },
            "needsApproval": true
          }
        ]
      }
    ],
    "skills": {
      "roots": ["./skills"],
      "seedIntoWorkspace": false
    },
    "policy": {
      "requiredEnv": [],
      "optionalEnv": ["MCP_FEISHU_DOCS_URL", "FEISHU_CLI_PATH"]
    }
  }
}
```

---

## 7. Host kernel responsibilities

### 7.1 PluginRegistry

- Discover: builtin list + `PLUGIN_PATHS` (dirs containing `plugin.json`)
- Resolve enablement: host config / env `PLUGINS_ENABLED=id1,id2` / profile defaults
- Load contributions in isolation (one failure → status `failed`, others continue)
- Expose: `list()`, `doctor()`, `collectTools()`, `skillRoots()`, `disconnect()`

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
