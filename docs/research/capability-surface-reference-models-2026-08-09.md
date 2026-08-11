# 研究：参考仓如何建模连接器 / 技能 / 专家

> **调研日**：2026-08-09
> **Issue**：[#36](https://github.com/xiaowen-0725/uilab-admin/issues/36) · Map [#34](https://github.com/xiaowen-0725/uilab-admin/issues/34)
> **分支**：`research/capability-surface-reference-models`
> **非目标**：不改产品代码；不重写 CONTEXT / product specs；不实现 Composer「+」或 Expert UI。
> **主源（一手）**：本地参考仓 openworker / Kun / CodePilot；本仓 sidecar plugin 规格与实现；Codex/Claude 公开插件文档（Web 摘要 + openai/plugins README）。
> **扩读**：主流 Agent 词表与授权路径见 [`agent-plugin-connector-mainstream-landscape-2026-08-09.md`](./agent-plugin-connector-mainstream-landscape-2026-08-09.md)（ChatGPT Apps、Cursor、Claude、Copilot、Dify 等）。
> **既定产品决策（不可反）**：Plugin = 打包层；Connector = 外部服务贡献面（MCP / domain CLI）；Skill = 可加载 SOP；Expert = 可切换配置包（persona + 默认 skills + 建议 tools/connectors），**不是**多 Agent supervisor 产品化；侧车装配真实能力；Workbench 经 RuntimePort / capability summary 消费状态；浏览器永不持有 secrets；主 UX = Composer「+」；Fake 诚实展示 catalog/selection、不假外呼。

---

## Executive summary

1. **四层概念在参考仓里几乎从不对齐命名，但职责可对齐到我们的 charting：**
   **打包层（Plugin/Extension）**、**外部服务面（Connector/MCP/Channel）**、**可加载 SOP（Skill）**、**可切换角色包（Persona/Agent Profile/Expert）**。
2. **openworker** 最接近「连接器 + 人格」一等产品：`ConnectorDescriptor` 驱动目录与 OAuth/token 向导；`PersonaManifest` 声明 tools/skills/mcp/`recommends`；会话内 **Access** 用「账号已连 ∧ persona 默认 ∧ session 覆盖」求 `effective`。Skill 是 Anthropic `SKILL.md` 渐进披露。**Messaging adapter** 与 **integration connector** 共用「connectors」词，需拆开借鉴。
3. **Kun** 最接近「扩展打包 + 技能 + 子代理 profile」：Extension（`.kunx`）= 可执行打包（UI/tools/providers/agent profiles）；Skill/MCP 独立；**Agent Profile / subagent** 是 `delegate_task` 派发目标，内置 45 角色 + 自动 BM25/LLM 路由——**这是我们明确不抄的 supervisor 产品化**。可抄：Skill 目录约定、project MCP 信任 digest、enable ≠ secret。
4. **CodePilot** 把侧边栏 **「扩展」** 拆成 Skills / MCP / CLI 三 tab；Claude **Plugin** 当 manifest 打包（skills/commands/agents）；**ChannelPlugin** 是 IM Bridge 适配器（入站/出站），不是办公 Connector。对话内用 **slash badge / selectedSkills** 显式挂技能，比纯自动激活更可教。
5. **Codex / Claude 公开模型**一致：**Plugin = packaging**（skills + MCP + apps/connectors 等同装），**不是** MCP 替代；Skill = `SKILL.md` 包；Connector/App = 外部服务绑定。与我们 sidecar 规格已对齐。
6. **本仓已 ship**：`PluginManifest` 贡献 `mcp | cli | skills | auth`；`enable ≠ login`；SecretRef + doctor；浏览器不装 MCP。**缺口**：一等 **Connector** 产品名、**Expert** 配置包、会话内 catalog/「+」选择、Fake 诚实 catalog、Workbench capability summary 消费。
7. **规格建议主线**：保留侧车 Plugin 为打包；对外产品词用 Connector / Skill / Expert；对话内「+」只暴露 status-safe 摘要；Expert 只做 profile package，禁止自动 subagent 路由产品化；Fake 只展示本地 catalog。
8. **工具暴露补充（§3.4）**：**CodePilot/Codex 本地能力 = 通用 Shell**；**Codex Apps = connector_id + MCP tools**；**本仓飞书 CLI-first = 官方 Skills + `lark-cli` command scope + 通用 `execute_command`**。Host 不再逐条转换 Provider 业务命令。

---

## 1. 各项目一等概念表

| 项目 | Plugin / 打包 | Connector / 外部服务面 | Skill / SOP | Persona / Expert / Profile |
| --- | --- | --- | --- | --- |
| **openworker** | **无** Codex 式 plugin 包；能力由 coworker 后端 + GUI 组装 | **Connector** 一等：`ConnectorDescriptor`（auth、fields、mcp_url、managed OAuth、experimental）+ `tool_defs` 钉死工具面；另有 **messaging** `BasePlatformAdapter`（Slack 等）同目录语义偏 channel | **Skill**：`SKILL.md` + `load_skill` 渐进披露；catalog 只注入 name/description | **Persona** 一等：`PersonaManifest`（tools from closed `catalog`、skills、mcp、`recommends` connector/mcp、family）；物化为 `Agent`（system prompt + tool_factory）。Builtin e.g. `ops` |
| **Kun** | **Extension**（`.kunx`）一等打包：workbench UI、tools、providers、accounts、**agent profiles**；与 Skill/MCP/UI appearance pack **分轨** | **无**「Connector」产品词；外部工具 = **MCP Server**（user `~/.kun/mcp.json` + project `.kun/project.json`）；账号/OAuth 走 Extension accounts / MCP OAuth | **Skill** 一等：manifest + triggers + `load_skill` + 自动激活预算；project/global roots；conventional `.claude/.codex/.kun/skills` | **Agent Profile / Subagent Profile** 一等：内置 + `.kun/agents/*.md` + Extension profiles；主运行时固定 `kun`，**profile 用于 delegate_task 子代理**，非用户「换专家聊天」主路径 |
| **CodePilot** | **Claude Plugin**：扫描 marketplace/`enabledPlugins`；`PluginInfo` hasCommands/hasSkills/hasAgents。侧栏页名「扩展」聚合 Skills/MCP/CLI | **MCP** 一等（stdio/sse/http）；**ChannelPlugin** = IM Bridge（Feishu 等），非 SaaS 办公连接器。文档把 MCP 页叫 “MCP Plugins” | **Skill** 一等：global/project/installed/marketplace（skills.sh）；slash + **CommandBadge** / `selectedSkills` | **无**一等 Persona/Expert；subagent 是 runtime 能力（handover 文档），非用户可切换专家包 |
| **Codex（公开）** | **Plugin** = installable bundle：`.codex-plugin/plugin.json` + `skills/` + 可选 `.mcp.json` / `.app.json` / agents/commands/hooks | **Apps/Connectors**（`.app.json` 绑定外部 app id）；MCP 单独配置亦可 | **Skills** 目录 + `SKILL.md` | Role-specific plugin templates 存在（第三方 repo），本质仍是 **plugin 包**，不是 multi-agent 产品 |
| **Claude Code（公开）** | **Plugin** 可含 skills、agents、hooks、MCP servers；marketplace 分发 | **MCP** 连接外部工具；API 侧另有 MCP connector | **Skills** = 可复用 `SKILL.md` 工作流 | Plugin 可含 **agents** 组件（与我们 Expert 近，但是打包组件，不是 supervisor UI） |
| **uilab-admin sidecar（已 ship）** | **Plugin** 一等：`PluginManifest` 打包贡献 mcp/cli/skills/auth（+ 规划 tools/policy） | **贡献面是 mcp + domain cli**，产品文档称 hybrid connector，**无独立 Connector 类型**；builtin e.g. `mcp.docs`、`mcp.calendar` | **skills** 贡献：virtual root + missing-only seed；Office 内置 skill ids | **无 Expert**；无 Persona 包；装配是 profile/env 级 Office 侧车，非可切换专家 |

### 1.1 命名对照（读源时的易混点）

| 表面词 | openworker | Kun | CodePilot | 我们建议 |
| --- | --- | --- | --- | --- |
| Plugin | 基本不用 | Extension（更重） | Claude plugin + 页名「扩展」 | **Plugin = 侧车打包** |
| Connector | 集成 + 部分 messaging | （无） | ChannelPlugin = IM | **Connector = MCP/domain CLI 服务面** |
| Skill | SKILL.md | SKILL + triggers | SKILL + slash | **Skill = SOP** |
| Expert/Persona | Persona | Subagent Profile / Extension AgentProfile | （无） | **Expert = 配置包，非 supervisor** |

---

## 2. 启用 / 授权 / 对话内可见性

### 2.1 openworker

| 环节 | 机制 | 源 |
| --- | --- | --- |
| 连接账号 | Settings → Connectors：descriptor 驱动 manual token / managed OAuth / MCP-backed one-click；token 在 **SecretStore**；MCP OAuth tokens 不写 `mcp.json` | `coworker/connectors/descriptors.py`, `mcp/oauth.py`, GUI `ConnectorsSection.tsx` |
| Persona 安装/启用 | Personas 注册表；install 有 risk consent（catalog risk）；sidebar 可见性 settings | `personas/*`, GUI `PersonaView.tsx` |
| 会话有效连接器 | `effective = connected ∧ (session_override ?? persona_default ?? inherit-on)`；persona `recommends` 只 seed 默认，**不是**穷尽 allow-list | `coworker/connections.py` |
| 对话内可见 | 右侧 **Access** 折叠区：本 session Sources 开关、Recommended 就地连接、Channels 订阅；Composer 上 **SubscriptionsChip**（听哪些 channel） | `AccessSection.tsx`, `SubscriptionsChip.tsx` |
| Skills | 会话开始注入 catalog；模型 `load_skill(name)` 拉全文 | `coworker/skills/base.py` |
| MCP | 全局 `~/.config/coworker/mcp.json` + workspace `.coworker/mcp.json`；`${VAR}` → SecretStore；enabled / include_tools / auth=oauth | `coworker/mcp/config.py` |

**可借鉴：** 三层 gate（账号 / persona 默认 / session 覆盖）；对话内 Access 摘要 + 就地 connect；enable 与 connected 分离。

### 2.2 Kun

| 环节 | 机制 | 源 |
| --- | --- | --- |
| Skill | Settings / workbench MCP&Skills 面板；project `.kun/project.json` 控制 roots/disabledIds；自动 trigger + `load_skill` | `docs/project-mcp-skills.md`, `kun/src/skills/skill-runtime.ts`, `skill-tool-provider.ts` |
| MCP | 用户级 + project；**project 不能自批准**：digest 绑定 native 确认后才启动命令 | 同上 |
| Extension | 安装 `.kunx`、权限披露、Host/Webview；secrets 经 broker，Webview 不拿 raw secrets | `docs/extensions/README.en.md` |
| Agent Profile | 设置页按 surface 配置；主代理 `list_subagent_profiles` + `delegate_task`；自动 BM25→LLM Top-5 | `docs/kun-architecture.md` § Subagent |
| 对话内 | MCP/Skills 管理偏 Settings/面板；子代理在右侧面板；**不是** Composer「+ 选专家」主叙事 | renderer `mcp-skills-panel-model.ts` 等 |

**可借鉴：** project MCP 信任 lifecycle；Skill 与 Extension 分轨；secrets 不进 Webview。
**勿抄：** 45 角色自动路由 + `delegate_task` 作为默认 Expert 产品。

### 2.3 CodePilot

| 环节 | 机制 | 源 |
| --- | --- | --- |
| MCP | `/plugins` → MCP tab；stdio/sse/http；enable 字段；runtime 监控 | `apps/site/content/docs/en/mcp.mdx`, `src/components/plugins/*` |
| Skills | Skills tab + skills.sh marketplace；enable/disable；slash 触发 | `skills.mdx`, `src/lib/skill-discovery.ts`, `SkillsManager` |
| Claude Plugin | `plugin-discovery` 读 `enabledPlugins` 多层 settings；SDK 加载，CodePilot 不 inject plugins 列表 | `src/lib/plugin-discovery.ts` |
| Channel | Bridge 设置页配置 bot token；`ChannelPlugin` start/stop/authorize | `src/lib/channels/types.ts` |
| 对话内 | **CommandBadge** 多选 `agent_skill`；请求体 `selectedSkills`；CLI badge 独立 | `useCommandBadge.ts`, `types/index.ts` |

**可借鉴：** Composer 旁显式 skill badge；扩展页 Skills/MCP/CLI 三分；marketplace 后置。
**勿抄：** 把 ChannelPlugin 当成办公 Connector；把「Plugins」页与 MCP 混称导致用户以为 Plugin=协议。

### 2.4 Codex / Claude（公开）

- **Codex Plugin**：安装后作为可发现包；内含 skills、MCP 配置、apps/connectors；connector 仍受用户/源系统权限约束（Help Center / openai/plugins README）。
- **Claude Code Plugin**：打包 skills/agents/hooks/MCP；MCP 仍可单独 `claude mcp add`；Skills 可独立扩展。

与我们「Plugin 打包、MCP 仍是 MCP」一致。

### 2.5 本仓 sidecar（已 ship）

| 环节 | 机制 | 源 |
| --- | --- | --- |
| Discover/enable | Builtin manifests + `PLUGIN_PATHS`；`PLUGINS_ENABLED/DISABLED`；`enabledByDefault` | `plugin/registry.ts`, `discover.ts`, `builtins.ts` |
| Load | 隔离失败；聚合 tools / skillRoots；MCP/CLI loaders | `registry.ts`, `mcp-loader.ts`, `cli-loader.ts`, `skills-loader.ts` |
| Auth | `AuthStatus`：none_required / missing / connected / expired / error；**enable ≠ login**；SecretRef；OAuth/Keychain 在 follow-up | `types.ts`, `auth-status.ts`, `docs/plans/sidecar-plugin-*.md` |
| Operator | `plugin list|doctor|auth status` | `operator-cli.ts`, `plugin/operator.ts` |
| UI | **尚未** Composer「+」；Workbench 经 RuntimePort 看工具/审批；auth 摘要主要在侧车日志/doctor | system-spec, product-followups |
| Fake | 规格要求 Fake/capture 不加载侧车插件；诚实降级 | system-spec §Assembly |

---

## 3. 与我们模型的契合 / 冲突

### 3.1 契合（应保留或吸收）

| 决策 | 证据 |
| --- | --- |
| Plugin = packaging | Codex 公开模型；本仓 `sidecar-plugin-architecture.md` §2；Claude plugins 文档 |
| Connector = external surface (MCP ± domain CLI) | openworker hybrid `mcp_url` + tools；本仓 mcp+cli contributes；CodePilot MCP 页 |
| Skill = loadable SOP (`SKILL.md`) | openworker/Kun/CodePilot/Codex 一致；渐进披露 + `load_skill` 普遍 |
| enable ≠ login | openworker connected vs effective；本仓 auth tests；Kun project MCP grant |
| Secrets 仅宿主/侧车 | openworker SecretStore；Kun extension trust notices；本仓 SecretRef + browser 禁令 |
| Session/task 可覆盖能力可见性 | openworker session connection store；CodePilot selectedSkills |
| Fake 诚实 | 本仓 Fake 不装插件；openworker 有 fake connector 测试路径 |

### 3.2 冲突 / 明确不抄

| 参考做法 | 为何不抄 |
| --- | --- |
| Kun：**主产品 = 单 agent + 大量 subagent profiles 自动路由** | 与「Expert = 配置包，非 multi-agent supervisor 产品化」冲突；我们不做 BM25/LLM 自动派发专家 |
| openworker：**Agent/Persona = top-level surface（Code/Chat/Cowork）** 并驱动整壳布局 | 我们 Work Surface 是 Document/Browser 等产物面，不能把 Expert 变成壳路由 |
| openworker：**connectors 目录混 messaging adapter + SaaS integration** | 我们 Feishu 产品路径是 **sidecar plugin-auth + connector 贡献**，Bridge/channel 若做也要另命名 |
| CodePilot：**ChannelPlugin 当「插件」**、MCP 页称 MCP Plugins | 污染 Plugin=打包；IM 通道 ≠ Connector |
| CodePilot/Kun：**完整技能市场 / 扩展商店为 P0** | 本仓 MVP 本地 registry；市场后置（follow-ups 已写） |
| 任意参考仓：**浏览器持有 OAuth token** | 与我们「浏览器永不持有 secrets」冲突 |
| Kun Extension **可执行 Node main + Direct DOM** | 侧车插件 MVP 声明式 JSON + builtin TS；不给外部插件任意代码执行（architecture 已锁） |
| openworker **persona 物化为完整 Agent 工具工厂 + messaging 全家桶** | Expert 应是 **建议集 + prompt overlay**，真实工具仍由已启用 Connector/Plugin 装配，避免 Expert 绕过 Registry |

### 3.3 我们相对参考仓的独特约束（规格必须继续诚实）

1. **装配在侧车，消费在 Workbench RuntimePort**——不像 openworker GUI 直打 `/v1/connectors` 持有连接生命周期于同一桌面一体应用（我们更接近 Kun 的 serve 边界，但更薄）。
2. **RuntimePort 词表不因插件膨胀**——状态走 capability/auth **摘要**，不是新事件宇宙。
3. **Domain CLI ≠ shell**——参考仓多默许 shell/toolkit；我们 allowlist argv。
4. **Fake**：catalog/selection 可见，**无假外呼**。

### 3.4 工具暴露模型：per-command wrapping vs Bash vs MCP（2026-08-09 补充）

用户质疑点：**把 `lark-cli` 的每个子命令再包成 Provider-specific structured tool，是不是过度设计？CodePilot / Codex 怎么做？**

> 结论更新（2026-08-09g）：是过度封装。最终实现已改为通用 `execute_command` + 官方 `lark-*` Skills + Provider command scope；下方保留的早期推演只记录决策过程，不再是现行规范。

| 系统 | 本地「CLI」怎么进 Agent | 外部 SaaS / Connector 怎么进 Agent | 是否 per-command wrap domain binary |
| --- | --- | --- | --- |
| **CodePilot** | 一等 **`Bash`**（`spawn('bash',['-c', command])`）+ permission pattern（allow/ask/deny） | **MCP**（stdio/sse/http）挂成 tool set | **否**。CLI 页是 **工具库 / 安装管理**：`codepilot_cli_tools_{list,install,add,remove,update}`；另有 `buildCliToolsContext()` 把已装 bin **写进 system prompt**，期望模型用 Bash 调用 |
| **Codex** | 一等 **shell / shell_command**（本地工程操作） | **Apps / Connectors**：`AppDeclaration { name, connector_id }`；工具经 **MCP**（`list_tools_with_connector_ids`，meta 带 `connector_id`） | **否**。插件 `.app.json` 绑定 connector_id，不把第三方 CLI argv 模板化为 function tools |
| **openworker**（既有） | 封闭 catalog 含 shell 类能力 | **ConnectorDescriptor + 钉死 `tool_defs`** | 近：工具面 **钉死**，不是 free shell 冒充 connector |
| **uilab sidecar（现状）** | **无**通用 Bash 产品工具（有意） | Connector = **MCP 贡献** 和/或 **domain CLI 贡献** | **是（仅 domain CLI）**：`cli-loader` = 固定 binary + allowlisted `argv[]` 模板 + `{{param}}` → `createTool`（`cli_<id>_<cmd>`）；`execFile`，禁 shell 包装 |

#### 一手源（本机树）

| 路径 | 读出的事实 |
| --- | --- |
| `CodePilot/src/lib/tools/bash.ts` | Agent 本地执行 = 自由 bash 字符串 |
| `CodePilot/src/lib/cli-tools-catalog.ts` + `cli-tools-mcp.ts` / `builtin-tools/cli-tools.ts` | Catalog + 安装/注册/更新；**不是** `ffmpeg_convert` 式 per-op tools |
| `CodePilot/src/lib/cli-tools-context.ts` | 已装 CLI → `<available_cli_tools>` prompt 块 |
| `CodePilot/src/lib/agent-tools.ts` + `permission-checker.ts` | Tool assembly + Bash 危险命令/模式门禁 |
| `codex-rs/plugin/src/lib.rs` | `AppDeclaration` / `AppConnectorId` = packaging 上的 connector 声明 |
| `codex-rs/tools/src/mcp_tool.rs` | MCP tool → Responses function schema（properties 补齐） |
| `codex-rs/rmcp-client` + `chatgpt/src/connectors.rs` | connector_id 元数据；Apps 受 ChatGPT auth / features 门控 |
| `uilab …/runtime-shell/connector-aware-sandbox.ts` | 通用 Shell 下的 Connector Task/Auth gate、可信 executable 与资源上限 |
| `uilab …/plugin/builtins.ts` (`cli.feishu`) | 只声明官方 Skills 安装源、`lark-cli` command scope 与 CLI session auth |

#### 结论（对架构问题的直接回答）

1. **一等通用 Shell 是合适的 Runtime 抽象。** CodePilot/Codex 都不会把已安装 CLI 的每个子命令再复制成 Function Tool；本仓最终同样只向 Agent 暴露 `execute_command`。

2. **Connector 仍然有独立产品语义。** `cli.feishu` 负责官方 Skills、CLI session、Task 选用和 `lark-cli` command scope；通用 Shell 不等于绕过连接器状态。

3. **per-command wrapping 被否定。** 它会让 Host 与 Provider 业务命令双向耦合，并使官方 Skill 所指向的原生 CLI 契约失真。

4. **安全边界上移到通用执行层。** 所有命令需 Host 审批；普通命令受 Workspace OS 隔离；Provider 命令还需 Enabled + Connected + TaskSelected，固定 executable、闭合 env 并限制超时/输出。

5. **GitHub 与飞书不需要同一执行协议。** GitHub 的官方远程工具集合走 MCP 动态发现；飞书的本机官方 CLI 走 Skills + Shell。产品目录仍各只有一个 Connector 行。

#### 规格措辞建议（写入 capability-surface Spec 时可抄）

- **Domain CLI surface** = 官方 Skills + Provider `commandScopes` + 通用 `execute_command`。
- **Not** per-command Function Tool wrapping。
- **Not** Codex App MCP connector（除非该 connector 实际贡献 MCP）。
- UI Connector 行展示的是 **产品连接器**；底层可有 `primaryChannel: domain_cli | mcp | hybrid`，诚实 note 写清 auth model（`cli_session` vs host OAuth）。

---

## 4. 对后续 Spec 的具体建议（3–7）

1. **固定四词表（中英）并写进 capability-surface Spec**
   - **Plugin（插件包）**：侧车 `PluginManifest` 打包单位（可同时贡献多个 Connector/Skill）。
   - **Connector（连接器）**：用户可理解的外部服务面 = 一个或多个 `contributes.mcp|cli` + `auth` 资源的产品投影（可 1:1 映射 builtin plugin，或 1 插件多 connector）。
   - **Skill（技能）**：`SKILL.md` SOP；catalog 摘要 + 按需/显式加载。
   - **Expert（专家）**：可切换配置包 = system/instruction overlay + 默认/建议 skill ids + 建议 connector ids（及可选只读 tool 提示）；**不**创建第二 runtime、**不**自动 supervisor。

2. **对话内主入口 = Composer「+」capability picker（CodePilot badge + openworker Access 的折中）**
   - 展示：已启用 Connector（auth status chip）、可选 Skill、可选 Expert。
   - 动作：选择/取消选择（session 覆盖）、对 `auth=missing` 给出 loginHint（触发侧车/系统登录，不经浏览器存 secret）。
   - Settings 为完整管理面（后置也可），避免只靠 doctor CLI。

3. **采用 openworker 的三层 gate，但映射到我们对象**
   - account/auth connected（侧车 AuthStore）
   - Expert 默认建议（seed，非硬 allow-list）
   - Task/session override（Composer 选择）
   - `effective` 只把 **connected 且未 mute** 的 connector 工具挂进 Agent；Skill 用 catalog + 显式 selected / `load_skill`。

4. **Expert 包格式建议（实现前先定 schema，可后做 loader）**
   - 文件形态可对标 openworker persona frontmatter **子集**：`id, name, description, instruction, skills[], connectors[] (recommend tier), defaultPermissionHints?`。
   - **禁止**字段：`subAgents`, `delegate_task` 路由表, 任意 shell。
   - 工具仍只来自 Registry 已加载 contributes；Expert 不能声明未安装 connector 的幽灵工具为已连接。

5. **Fake Runtime 合同**
   - 返回静态 capability catalog（builtin 名单 + auth=none_required/missing 占位）与 selection 状态。
   - 禁止模拟成功的外部 MCP/CLI 调用；选择变更只影响 UI/投影诚实字段。

6. **Feishu 产品路径**
   - 继续走 **sidecar plugin-auth**（env_ref / cli_session / 后续 OAuth），产品文案称「飞书连接器」，打包可以是 `mcp.feishu.*` + `cli.feishu` hybrid plugin。
   - 不引入 CodePilot ChannelPlugin 作为办公连接器模型；若未来做 IM 入站，单独命名 **Channel**，勿并入 Connector 表。

7. **明确不做的产品化清单（写进 Spec Out of Scope）**
   - Kun 式 40+ 子代理自动召回 UI
   - openworker 式 Persona=整壳 Surface
   - 浏览器插件 SDK / 密钥
   - 通用终端
   - 技能/插件市场作为 P0（P1+）

8. **Domain CLI 暴露（对照 §3.4）**
   - 使用通用 `execute_command`；Plugin 只声明 command scope、Skills 与 auth。
   - 文档与 UI 诚实区分：GitHub MCP、飞书原生 CLI 与 Fake catalog。
   - 若未来叠加 MCP，不把 CLI 绿点改称 host OAuth。

---

## 5. Sources cited

### 本地参考仓

| 路径 | 用途 |
| --- | --- |
| `/Users/zhoujw/develop/github/openworker/coworker/agents/base.py` | Agent = top-level surface；traits family/messaging/connectors |
| `/Users/zhoujw/develop/github/openworker/coworker/personas/manifest.py` | PersonaManifest、recommends、to_agent |
| `/Users/zhoujw/develop/github/openworker/coworker/personas/builtin/ops.md` | 样例 persona |
| `/Users/zhoujw/develop/github/openworker/coworker/catalog.py` | 封闭 Capability 目录（files/git/shell…） |
| `/Users/zhoujw/develop/github/openworker/coworker/connections.py` | persona/session connection stores + `effective` |
| `/Users/zhoujw/develop/github/openworker/coworker/skills/base.py` | Skill + progressive disclosure + `load_skill` |
| `/Users/zhoujw/develop/github/openworker/coworker/connectors/descriptors.py` | ConnectorDescriptor（auth、mcp_url、managed…） |
| `/Users/zhoujw/develop/github/openworker/coworker/connectors/tool_defs.py` | 钉死 connector 工具面 |
| `/Users/zhoujw/develop/github/openworker/coworker/connectors/base.py` | Messaging adapter 合同（易与 integration 混淆） |
| `/Users/zhoujw/develop/github/openworker/coworker/mcp/config.py` / `oauth.py` | MCP 配置与本地 OAuth |
| `/Users/zhoujw/develop/github/openworker/surfaces/gui/src/components/connectors/*` | Connectors UI |
| `/Users/zhoujw/develop/github/openworker/surfaces/gui/src/components/AccessSection.tsx` | 会话内 Access |
| `/Users/zhoujw/develop/github/openworker/surfaces/gui/src/components/SubscriptionsChip.tsx` | Composer connections chip |
| `/Users/zhoujw/develop/github/openworker/surfaces/gui/src/api.ts` | connectors/MCP/personas API 形状 |
| `/Users/zhoujw/develop/github/openworker/README.md` | 产品定位：25+ connectors + MCP |
| `/Users/zhoujw/develop/github/Kun/docs/extensions/README.en.md` | Extension vs Skill vs MCP 分轨 |
| `/Users/zhoujw/develop/github/Kun/docs/project-mcp-skills.md` | Project MCP/Skills + trust digest |
| `/Users/zhoujw/develop/github/Kun/docs/kun-architecture.md` | Subagent profiles / delegate_task（不抄点） |
| `/Users/zhoujw/develop/github/Kun/kun/src/skills/skill-runtime.ts` | SkillManifest / 激活预算 |
| `/Users/zhoujw/develop/github/Kun/kun/src/adapters/tool/skill-tool-provider.ts` | `load_skill` |
| `/Users/zhoujw/develop/github/Kun/kun/src/delegation/builtin-profiles.ts` 等 | 内置 subagent profiles |
| `/Users/zhoujw/develop/github/Kun/kun/src/services/extension-agent-profile-registry.ts` | Extension AgentProfile |
| `/Users/zhoujw/develop/github/Kun/packages/extension-api/src/manifest.ts` | Extension 贡献点 |
| `/Users/zhoujw/develop/github/CodePilot/ARCHITECTURE.md` | 扩展页、Channel Plugin、Bridge |
| `/Users/zhoujw/develop/github/CodePilot/src/types/index.ts` | SkillKind、PluginInfo、MCPServerConfig、selectedSkills |
| `/Users/zhoujw/develop/github/CodePilot/src/lib/plugin-discovery.ts` | Claude plugin packaging 发现 |
| `/Users/zhoujw/develop/github/CodePilot/src/lib/skill-discovery.ts` | SKILL.md 扫描路径 |
| `/Users/zhoujw/develop/github/CodePilot/src/lib/channels/types.ts` | ChannelPlugin 合同 |
| `/Users/zhoujw/develop/github/CodePilot/src/hooks/useCommandBadge.ts` | 对话内 skill badge |
| `/Users/zhoujw/develop/github/CodePilot/src/app/plugins/page.tsx` | Skills/MCP/CLI 三分 IA |
| `/Users/zhoujw/develop/github/CodePilot/apps/site/content/docs/en/skills.mdx` / `mcp.mdx` | 用户文档模型 |
| `/Users/zhoujw/develop/github/CodePilot/src/lib/tools/bash.ts` | 本地执行 = free Bash（非 domain allowlist） |
| `/Users/zhoujw/develop/github/CodePilot/src/lib/cli-tools-catalog.ts` | 通用 CLI 库 catalog（ffmpeg/jq…） |
| `/Users/zhoujw/develop/github/CodePilot/src/lib/cli-tools-mcp.ts` / `builtin-tools/cli-tools.ts` | CLI 安装/注册/更新 tools（非 per-op wrap） |
| `/Users/zhoujw/develop/github/CodePilot/src/lib/cli-tools-context.ts` | 已装 CLI → system prompt 块 |
| `/Users/zhoujw/develop/github/CodePilot/src/lib/agent-tools.ts` / `permission-checker.ts` | Tool 装配 + Bash 权限模式 |
| `/Users/zhoujw/develop/github/codex/codex-rs/plugin/src/lib.rs` | `AppDeclaration` / connector_id packaging |
| `/Users/zhoujw/develop/github/codex/codex-rs/tools/src/mcp_tool.rs` | MCP → function tool schema |
| `/Users/zhoujw/develop/github/codex/codex-rs/rmcp-client/src/rmcp_client.rs` | `list_tools_with_connector_ids` |
| `/Users/zhoujw/develop/github/codex/codex-rs/chatgpt/src/connectors.rs` | Apps/connectors 门控 |

### 本仓

| 路径 | 用途 |
| --- | --- |
| `docs/plans/sidecar-plugin-system-spec.md` | 已 ship 产品规格（Plugin/auth/Fake） |
| `docs/plans/sidecar-plugin-architecture.md` | Codex 对齐：Plugin=packaging |
| `docs/plans/sidecar-plugin-product-followups-spec.md` | OAuth/Keychain/CTA 后置 |
| `tooling/workbench-runtime-voltagent/src/plugin/types.ts` | AuthStatus、SecretRef |
| `tooling/workbench-runtime-voltagent/src/plugin/manifest.ts` | contributes mcp/cli/skills/auth |
| `tooling/workbench-runtime-voltagent/src/plugin/registry.ts` | load 聚合与 status |
| `tooling/workbench-runtime-voltagent/src/plugin/builtins.ts` | mcp.docs / calendar / **cli.feishu** |
| `tooling/workbench-runtime-voltagent/src/plugin/cli-loader.ts` | domain CLI per-command wrap（argv 模板、execFile、禁 shell） |
| `tooling/workbench-runtime-voltagent/src/plugin/connector-descriptor.ts` | Connector 产品投影 + toolScope |
| `docs/research/work-surface-openworker-patterns.md` | 既有 openworker Surface 调研（Agent≠Work Surface） |
| `docs/research/feishu-mcp-vs-cli-auth-comparison-2026-08-09.md` | 飞书 MCP vs CLI；CLI-first 切片依据 |

### 公开（Web，2026-08 检索）

| 源 | 用途 |
| --- | --- |
| [Plugins in Codex (OpenAI Help Center)](https://help.openai.com/en/articles/20001256-plugins-in-codex/) | Plugin 包 skills/MCP/apps |
| [openai/plugins README](https://github.com/openai/plugins/blob/main/README.md) | `.codex-plugin/plugin.json` + skills/mcp/app 布局 |
| [Claude Code Create plugins](https://code.claude.com/docs/en/plugins) | Plugin 含 skills/agents/hooks/MCP |
| [Claude Code Skills](https://code.claude.com/docs/en/skills) | SKILL.md 工作流 |
| [Claude Code / Anthropic MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp) | MCP 独立配置面 |

> 注：Help Center / code.claude.com 正文本次环境未能全文抓取；结构与定义以 WebSearch 摘要 + openai/plugins README 原文 + 本仓 architecture 已引用的 Codex 布局为准。落地 Spec 前建议再人工打开 Help Center 与 Claude plugins 页复核一版措辞。

---

## 6. 诚实边界

- 结论基于 **本机三仓当前树** + 本仓 sidecar 源码/规格；不保证参考仓未提交分支已变。
- 未运行参考仓 UI；对话内行为以源码与文档交叉验证。
- 未实现任何 Workbench/sidecar 产品改动；本文件仅供 #34 规格取舍。
