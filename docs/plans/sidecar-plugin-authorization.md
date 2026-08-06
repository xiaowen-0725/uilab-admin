# Design Note: Plugin Authorization & Credential Storage

**Status:** research + design-for-alignment  
**Depends on:** [sidecar-plugin-architecture.md](./sidecar-plugin-architecture.md)  
**Scope:** How users authorize GitHub / Feishu CLI / MCP plugins; where secrets live; what the host guarantees  
**Audience:** product + security + implementers  

---

## 1. Why this must be designed before coding Registry

Installing a plugin is **not** the same as authorizing a user/tenant:

| Step | Meaning |
| --- | --- |
| **Install / enable plugin** | Host discovers manifest, may enable contribution types |
| **Authorize / login** | User grants access to **their** GitHub / Feishu / calendar identity |
| **Runtime inject** | Sidecar process gets short-lived or referenced credentials for tool calls |
| **Revoke** | User disconnects; tokens invalid; plugin may stay installed |

If we only copy “env in `.env`”, we conflate **ops config** with **user OAuth**, leak tokens into agent context, and cannot support multi-account or refresh.

---

## 2. Industry patterns (survey)

### 2.1 MCP Authorization Spec (remote servers)

- Remote MCP (HTTP) is expected to use **OAuth 2.1 + PKCE** (client = host, resource = MCP server, AS = IdP).
- Tokens must be stored **securely** (platform best practice); short-lived access + refresh.
- **STDIO MCP SHOULD NOT** use that browser OAuth path the same way: credentials come from **environment** or local libraries (desktop OS login, etc.).

**Takeaway:** Auth strategy is **transport-dependent**.

### 2.2 OpenAI Codex / ChatGPT plugins & MCP

- Plugin package = skills + MCP/app config (**packaging**), not the auth server itself.
- Remote MCP: OAuth 2.1 contract for published servers; CLI also supports **`bearer_token_env_var`** (token lives in env, config only stores the **env var name**).
- Host config example shape: `mcp_servers.<name>.url` + `bearer_token_env_var = "GITHUB_PAT"` — secret not inlined in config file.
- Host identity (Codex login) is separate (`auth.json`-style store for **product** auth). Security research warns: **plaintext/home-dir tokens are stealable**; sandbox must not freely read credential files.

**Takeaway:** Prefer **reference by env name** or **OS secret store**, not tokens in git-tracked JSON. Separate **host login** from **connector login**.

### 2.3 Claude / managed agents

- Vault-style credentials: categories like `mcp_oauth`, `static_bearer`, `environment_variable`.
- OAuth credentials keyed by **mcp_server_url**; optional refresh handled by platform.
- Community pressure for **keychain** + not putting secrets in model context.
- Pit: tools that **silently load `.env` into agent context** — secrets must not be dumped into prompts/logs.

**Takeaway:** Typed credential records + inject at process boundary, never into LLM messages.

### 2.4 Domain CLI (gh, feishu-cli, in-house)

- CLIs typically use **their own auth store**:
  - `gh auth login` → OS keychain / `~/.config/gh`
  - Feishu/Lark CLIs → app id/secret or user token files
- Agent host does **not** re-implement OAuth for every CLI; it **requires pre-auth** or launches `cli auth login` and then invokes CLI with inherited trusted env.

**Takeaway:** **CLI auth is delegated** to the CLI product; host does doctor + “logged in?” checks.

### 2.5 Common pits (avoid)

| Pit | Consequence |
| --- | --- |
| Tokens in repo `plugin.json` / committed `.env` | Leak via git |
| Tokens in Timeline / tool args echo | Model + logs see secrets |
| One global token file readable by all plugins | Cross-plugin exfiltration |
| OAuth refresh broken silently | Tools fail mid-session (Codex issues on refresh) |
| Sandbox/agent can read credential store | Token theft |
| Browser holds production keys | Violates ADR-0012 |

---

## 3. Auth modes we must support (by contribution type)

| Contribution | Primary auth modes | Who owns the flow |
| --- | --- | --- |
| **MCP stdio** | Env secrets, CLI-embedded login, local config of that server | Server process / user pre-config |
| **MCP HTTP remote** | OAuth 2.1 (user), or static bearer (PAT) via env ref | Host client (OAuth) or ops (PAT) |
| **Domain CLI** | CLI’s own login (`auth login`), app credentials for bot | CLI binary + user |
| **In-process tools** | Env / secret store injection into sidecar only | Host |

A single plugin (e.g. “飞书办公”) may combine:

- MCP docs (OAuth or app secret)  
- `feishu-cli` (app id/secret or user token via CLI store)  
- Skills (no secret)

---

## 4. Credential model (design)

### 4.1 Concepts

| Concept | Definition |
| --- | --- |
| **Credential** | Opaque secret material or OAuth token set for one **principal** + **provider** |
| **AuthBinding** | Links `pluginId` (+ optional `serverId`/`cliId`) → Credential id |
| **SecretRef** | Non-secret pointer: env name, keychain account, or vault path — **safe to store in config** |
| **Principal** | For local template MVP: single OS user / “local operator”. Multi-tenant later. |

### 4.2 Credential kinds (typed)

```text
CredentialKind =
  | env_ref          # value lives in process env / dotenv (dev)
  | static_bearer    # PAT stored in secret store; injected as Bearer
  | oauth2           # access + refresh + expiry + scopes + token_endpoint
  | cli_session      # “use this CLI’s existing login”; no host-stored token
  | app_client       # client_id + client_secret (machine/app), not end-user OAuth
```

### 4.3 Storage layers (recommended)

| Layer | Path / mechanism | Contains | Git |
| --- | --- | --- | --- |
| **A. Config (non-secret)** | `~/.uilab/runtime/config.json` or workspace `.uilab/runtime.json` | plugin enable, SecretRef, mcp url, scopes requested | optional (no secrets) |
| **B. Secret store** | **OS keychain** (macOS Keychain / libsecret / Windows Credential Manager) preferred; fallback encrypted file `~/.uilab/runtime/secrets.enc` | token values, refresh, client secrets | never |
| **C. Dev convenience** | sidecar `.env` (gitignored) | env_ref values for local demos | never commit |
| **D. Process inject** | env of stdio MCP / CLI child only | short-lived view of secrets | n/a |

**MVP recommendation for uilab template:**

1. **Dev/default:** `env_ref` + gitignored `.env` (matches today).  
2. **Product path:** OS keychain for `static_bearer` / `oauth2` / `app_client`.  
3. **CLI plugins:** `cli_session` — host does not copy tokens; runs `feishu-cli` after user ran `feishu-cli auth login` (or documents it).

Never store secrets in:

- plugin manifest  
- Timeline / RuntimePort payloads  
- Vite `VITE_*` env  
- unencrypted workspace files under agent-writable roots (agents can read workspace)

### 4.4 Identity isolation

- One binding per `(principal, pluginId, resourceKey)` e.g. `(local, office.feishu, mcp:docs)`.  
- Plugin A must not read Plugin B’s credentials from the store API.  
- Agent tools receive **results**, not raw tokens (CLI/MCP servers use tokens internally).

---

## 5. User journeys

### 5.1 GitHub-style (PAT or OAuth MCP)

```text
1. Enable plugin "github"
2. doctor → missing auth
3a. PAT path: user creates token → host "set secret GITHUB_PAT" → SecretRef env_ref or keychain
3b. OAuth path: host opens browser PKCE → stores oauth2 credential → binding
4. MCP HTTP uses bearer from resolved secret
5. Tools work; revoke deletes binding + secret
```

### 5.2 Feishu CLI plugin

```text
1. Enable plugin "feishu-cli"
2. doctor → binary missing? install hint
3. doctor → not logged in? instruct: `feishu-cli auth login` (or app_client secrets for bot mode)
4. Host invokes allowlisted subcommands; CLI reads its own store / env
5. Optional: plugin declares app_client secrets for server-to-server APIs without user OAuth
```

### 5.3 Hybrid plugin (Codex GitHub pattern)

- Prefer MCP/app connector when available.  
- CLI for gaps (branch/PR push, logs).  
- Skill documents routing; **two auth surfaces** may both be required (connector OAuth + `gh auth status`).

---

## 6. Host API surface (conceptual)

| API | Purpose |
| --- | --- |
| `auth.status(pluginId)` | connected / missing / expired / scopes |
| `auth.beginOAuth(pluginId, resource)` | browser PKCE; returns pending id |
| `auth.completeOAuth(...)` | store tokens |
| `auth.setSecret(ref, value)` | PAT / app secret into keychain |
| `auth.clear(pluginId)` | revoke local binding |
| `auth.resolveForChild(pluginId)` | map to env for stdio/CLI **without logging values** |
| `plugin doctor` | human-readable auth gaps |

Workbench UI (later): “连接 GitHub” button → calls sidecar auth API → shows connected chip.  
MVP can be **CLI-only** auth UX (`runtime auth login feishu`).

---

## 7. Interaction with SecurityPolicy & Agent

| Rule | Detail |
| --- | --- |
| Secrets never in model context | Tool schemas must not require users to paste tokens into chat as normal flow |
| Approval ≠ auth | HITL approval is **action** gate; OAuth is **identity** gate; both required for writes |
| Expired OAuth | Surface `auth_expired` error to Timeline; do not spin forever (learn from flaky refresh) |
| Workspace readability | Do not put secret files under `WORKSPACE_ROOT` agent can `read_file` |
| Multi-plugin | Each child process gets only its `childEnvKeys` |

---

## 8. MVP vs later (phased)

| Phase | Auth capability |
| --- | --- |
| **P0 (with Registry)** | `env_ref` + gitignored `.env`; SecretRef in config; doctor lists missing env; **no** tokens in manifests |
| **P1** | `cli_session` doctor (`which` + `cli auth status` if defined by plugin); domain CLI path |
| **P2** | OS keychain for static_bearer / app_client |
| **P3** | MCP remote OAuth 2.1 PKCE host flow + refresh |
| **P4** | Multi-principal / team vault (1Password/Infisical inject) |

**Do not block Registry P0 on full OAuth.** But **do** design SecretRef + kinds so we don’t paint into “everything is process.env forever”.

---

## 9. Proposed additions to PluginManifest

```text
contributes.auth?: {
  resources: [
    {
      resourceId: "mcp:docs" | "cli:feishu" | string
      kinds: ["oauth2" | "static_bearer" | "env_ref" | "cli_session" | "app_client"]
      # for env_ref / static_bearer
      envNames?: string[]           # e.g. ["FEISHU_APP_SECRET"]
      # for oauth2 (P3)
      authorizationServer?: string  # discovery URL
      scopes?: string[]
      # for cli_session
      statusCommand?: { command, argv, expectExitCode?: 0 }
      loginHint?: string            # "Run: feishu-cli auth login"
    }
  ]
}
```

Host merges auth requirements into `plugin doctor` and enablement gates (“enabled but unauthorized” is a first-class status).

---

## 10. Status model (user-visible)

```text
plugin: installed | not_found
enabled: true | false
auth: none_required | missing | connected | expired | error
runtime: tools_loaded | degraded | failed
```

Example UI/log line:

```text
feishu-cli  enabled  auth=missing  hint="feishu-cli auth login"
github-mcp  enabled  auth=connected  scopes=repo,read:org
```

---

## 11. Decisions to confirm

1. **MVP storage:** `.env` only vs start keychain immediately?  
   - Recommend: **SecretRef + .env for MVP**, keychain interface stubbed.  
2. **OAuth host:** browser open from sidecar vs require user paste PAT only for MVP?  
   - Recommend: **PAT/env + CLI login for MVP**; OAuth P3.  
3. **Workspace vs user-global credentials:**  
   - Recommend: **user-global** (`~/.uilab/runtime/`) default; workspace may override refs only (no secret files in repo).  
4. **Can agent request “please login”?**  
   - Recommend: emit structured `auth_required` event → Timeline CTA; do not put secrets in chat.

---

## 12. Summary

| Question | Answer |
| --- | --- |
| How does user authorize GitHub plugin? | Enable plugin → connect via **PAT (env/keychain)** or later **OAuth**; binding stored as SecretRef + secret material outside git |
| How does Feishu CLI plugin authorize? | Prefer **CLI’s own login** (`cli_session`); optional **app_client** secrets for bot mode |
| Where saved? | Config: non-secret refs; Secrets: **keychain** (prod) / **gitignored .env** (dev); never workspace agent-readable files |
| Who injects? | Sidecar only, into child processes; browser never holds tokens |
| Relation to HITL approval? | Orthogonal: identity (auth) vs action (approval) |

---

*Align on §11 before implementing Registry so auth hooks are not bolted on later.*
