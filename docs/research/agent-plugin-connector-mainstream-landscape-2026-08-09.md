# 研究：主流 Agent 的 Plugin / Connector 定义与授权路径

> **调研日**：2026-08-09
> **动机**：Capability Surface 实现中反复出现「Plugin vs Connector vs MCP vs CLI」命名与职责混淆。用户观察：多数 Agent 产品里「插件 / 连接器」命名不同，**用户感知效果相近**——目录里新增/选用后会引导去 **授权**；底层是 MCP 还是 domain CLI，**产品一等叙事通常不关心**。
> **本文件立场**：对齐主流产品分层；确认 **Plugin = 能力包（packaging）**、**Connector/App = 外部服务连接面（connect + auth）**、**MCP / domain CLI / native tool = 实现通道**。
> **非目标**：不改产品代码；不推翻已拍板的 CLI-first 飞书验证切片；不把通用终端当 Connector。

---

## Executive summary

1. **行业已收敛到几乎同一张分层图**，只是词表不同：
   **能力包（Plugin / Extension）** → 内含 **外部连接（App / Connector / MCP server）** + **工作流知识（Skill / Rules）** + 可选 **角色/子代理** → 用户在 UI 上 **Install / Enable ≠ Connect / Authorize**。
2. **用户主路径几乎一致**：浏览目录 → 安装/启用包 → **Connect** 跳到 OAuth / provider 登录 / 填 token → 绿点/Connected → Agent 才能用工具。
   底层传输（MCP HTTP/stdio、厂商 App API、domain CLI session）是 **实现细节**，不应成为 Composer「+」的一等分栏名。
3. **MCP 是当前跨宿主标准工具总线**（Cursor / Claude Code / Codex / Copilot / Windsurf / Dify 等均支持）；**domain CLI** 是少数本机优先产品的并列通道（本仓飞书切片、部分桌面 Agent）。**正确产品模型是双通道都支持，统一挂在 Connector 下。**
4. **本仓应对齐**：
   - **Plugin** = 侧车 `PluginManifest` 能力包（可同时贡献 mcp + cli + skills + auth）
   - **Connector** = 用户可见的「飞书 / 日历 / …」连接面（auth status + capabilities + toolScope）
   - **Skill / Expert** = SOP / 配置包（非 supervisor）
   - **MCP | domain CLI** = `primaryChannel` / contributes 实现，**不是**互斥产品品类
5. **勿抄**：把 Plugin 当成 MCP 同义词；把 Channel/IM Bridge 当成办公 Connector；把「装了插件」当成「已授权」。

---

## 1. 统一分层（跨产品对照）

```text
┌─────────────────────────────────────────────────────────┐
│  Marketplace / Directory（发现与安装，可后置）              │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│  PLUGIN / EXTENSION = 能力包（packaging）                 │
│  可同时携带：MCP / Apps / Skills / Rules / Hooks / Agents │
└───────┬─────────────────┬─────────────────┬─────────────┘
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌────────────────────┐
│ CONNECTOR /  │  │ SKILL / SOP  │  │ EXPERT / PROFILE   │
│ APP（外连）   │  │              │  │ （配置包，非多代理） │
│ + Auth 状态  │  │              │  │                    │
└──────┬───────┘  └──────────────┘  └────────────────────┘
       ▼
┌──────────────────────────────────────────────────────────┐
│  实现通道（用户通常不可见为一级分类）                        │
│  • MCP server（stdio / SSE / HTTP + OAuth）               │
│  • Hosted App API / connector_id（ChatGPT Apps）          │
│  • Domain CLI session（lark-cli 等 allowlisted）          │
│  • Native tool plugin OAuth（Dify tool plugin）           │
└──────────────────────────────────────────────────────────┘
```

**用户只需要记住三件事：**

| 用户问题 | 产品答案 |
| --- | --- |
| 有没有这个能力？ | 目录里有没有 **Plugin/Connector 条目** |
| 我能不能用？ | **Connected / 已授权** 吗？ |
| 这次对话用不用？ | Task/session **选用** 了吗？（enable + select） |

底层 MCP 还是 CLI：**工程师关心，Composer 主路径不关心。**

---

## 2. 主流产品词表与做法

### 2.1 OpenAI ChatGPT + Codex

| 词 | 含义 | 用户路径 |
| --- | --- | --- |
| **App**（2025-12 前常称 **Connector**） | 与外部服务/数据/MCP 的 **连接实例** | Settings → Apps → **Connect** → OAuth / 权限 |
| **Plugin** | **能力包**：skills + 一个或多个 apps + templates | Plugin Directory 安装；**安装 ≠ 授权** |
| **MCP app** | 经 MCP 暴露工具的自定义 App | Developer mode；需 refresh token 等 OAuth 实践 |
| **`.app.json` / `.mcp.json`**（Codex 插件布局） | 插件内绑定 connector_id / MCP server | 打包层，不是用户词 |

要点：

- 产品叙事是 **App/Connector 连接外部世界**；Plugin 是 **把工作流 + 连接声明打成一包**。
- 官方强调：装插件 **不会** 自动获得底层 App 之外的权限；App 自带 auth / read-write 控制。
- 与我们：`Plugin = packaging`，`Connector ≈ App`，MCP 是 App 的一种实现。

来源：[Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt)、[Plugins in Codex](https://help.openai.com/en/articles/20001256-plugins-in-codex/)、[openai/plugins](https://github.com/openai/plugins)、[Admin controls for plugins and apps](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps)。

### 2.2 Cursor

| 词 | 含义 |
| --- | --- |
| **MCP server** | Agent 连外部工具/数据的标准通道（stdio / SSE / HTTP） |
| **Plugin** | Marketplace **能力包**：MCP + Skills + Subagents + Rules + Hooks |
| **Connect / OAuth** | 远程 MCP 常见路径：添加 → 打开 provider 授权页 → 宿主存凭据 |

要点：

- 2026-02 Marketplace 明确：**Plugin 是 bundle**，MCP 只是其中一种 primitive。
- 用户装 Linear/Figma/Stripe **插件** 时，感知是「连上某某产品」，不是「装了一个 stdio 进程」。
- MCP 也可单独配置（`.cursor/mcp.json`），与 Plugin 并存——**协议层可独立，产品入口常是包**。

来源：[Extend Cursor with plugins](https://cursor.com/blog/marketplace)、[Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol)。

### 2.3 Claude Code / Anthropic

| 词 | 含义 |
| --- | --- |
| **Plugin** | `.claude-plugin/plugin.json` 包：commands / agents / skills / hooks / `.mcp.json` |
| **MCP** | 独立可 `claude mcp add`；也可打进插件 |
| **Skills** | `SKILL.md` 工作流；常随插件分发 |
| **MCP connector**（API） | Messages API 侧连接远程 MCP 的通道名 |

要点：

- 与 Codex/Cursor 同构：**Plugin 打包，MCP 是工具总线，Skill 是 SOP**。
- 「agents」在插件里是打包组件，**不等于** 我们产品化的 multi-agent supervisor。

来源：[Claude Code plugins README](https://github.com/anthropics/claude-code/blob/main/plugins/README.md)、[claude-plugins-official](https://github.com/anthropics/claude-plugins-official)、[MCP overview](https://docs.anthropic.com/en/docs/mcp)。

### 2.4 GitHub Copilot

| 词 | 含义 |
| --- | --- |
| **Plugin** | 可安装包：custom agents + skills + hooks + MCP configs |
| **MCP** | Cloud agent / CLI / agent mode 的外部工具；**新集成优先做 MCP** |
| **Copilot Extensions（GitHub App）** | **已 sunset**（2025-09 宣布弃用）→ 迁 MCP |
| **Custom agent** | 指令 + tool 权限 + 可选 MCP；可当子代理 |

要点：

- 行业信号：**专用 Extension 协议让位给 MCP**；Plugin 仍是 **打包分发** 单位。
- Cloud agent 对 remote OAuth MCP 仍有限制——说明 **auth 模型必须按通道诚实**，不能假装所有 Connect 都一样。

来源：[About Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins)、[MCP and cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/mcp-and-cloud-agent)、[Sunset Copilot Extensions](https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/)。

### 2.5 Windsurf Cascade

- 以 **MCP** 为 Cascade 外接工具主通道（stdio / HTTP / SSE）。
- 产品词偏 **plugins/MCP integration**，用户路径仍是「配置/启用服务器 → 需要时鉴权」。

来源：[Cascade MCP Integration](https://docs.windsurf.com/ja/plugins/cascade/mcp)。

### 2.6 Dify / Coze（Agent 平台向）

| 平台 | 打包 | 外连 / 工具 | 授权 |
| --- | --- | --- | --- |
| **Dify** | **Plugin** 多种类型（tool / model / datasource…） | **Tool** 在 plugin 内；另有 **MCP connector** 消费外部 MCP | Tool plugin 可实现 OAuth hooks（client 配置 vs 用户授权分离）；MCP 走 MCP OAuth / headers |
| **Coze** | Bot **Plugin** 配置 | 内置/自定义/商业插件 | 插件级授权与发布 |

要点：

- 平台型产品更早把 **Plugin = 可安装扩展包**、**OAuth 在「连接账号」步骤** 做成标准。
- Dify 明确：**装 MCP connector ≠ 写 native tool plugin**——实现通道不同，**用户都是「接上工具」**。

来源：[Dify plugin types](https://docs.dify.ai/en/develop-plugin/getting-started/choose-plugin-type)、[Dify tool OAuth](https://docs.dify.ai/en/develop-plugin/dev-guides-and-walkthroughs/tool-oauth)、[Coze plugin configuration](https://github.com/coze-dev/coze-studio/wiki/4.-Plugin-Configuration)。

### 2.7 本机参考仓（前序研究，摘要）

| 项目 | 打包 | 外连 | 备注 |
| --- | --- | --- | --- |
| openworker | 弱 plugin 包 | **Connector** 一等 + OAuth/token | 最接近产品 Connector |
| Kun | **Extension** 重打包 | MCP + accounts | Subagent profile ≠ Expert 产品 |
| CodePilot | Claude Plugin +「扩展」页 | MCP；ChannelPlugin=IM | CLI 库是 Bash 生态，**不是** Connector |
| 本仓 sidecar | **PluginManifest** | mcp + **domain cli** + auth | 已 ship packaging；Connector 产品投影补齐中 |

详见 [`capability-surface-reference-models-2026-08-09.md`](./capability-surface-reference-models-2026-08-09.md)。

---

## 3. 共性模式：Connect 路径（用户感知）

几乎所有成熟产品都拆成 **至少两段**：

```text
[1] Discover / Install / Enable package
        ↓  （包在机器上可用，工具可能仍灰）
[2] Connect / Authorize account
        ↓  （OAuth 页 / CLI login / token 表单）
[3] Select for this chat / task（可选第三段）
        ↓
[4] Agent invokes tools（仍可能二次审批 write）
```

| 步骤 | ChatGPT Apps | Cursor Plugin/MCP | Dify tool | 本仓应对 |
| --- | --- | --- | --- | --- |
| Install/Enable | Plugin / App 目录 | Marketplace / mcp.json | 安装 plugin | `PLUGINS_ENABLED` / Registry |
| Connect | OAuth Connect | OAuth / env token | OAuth hooks / MCP auth | `startAuth` / `cli_session` / 后置 host OAuth |
| Session select | 对话里用哪些 app | 工具自动或规则 | 工作流绑 tool | Composer「+」Task selection |
| Invoke gate | app 权限 + 确认 | 权限模式 | 运行时 credentials | `capabilityEffective` + approval |

**关键洞察（用户原话的产品化）：**
「新增的时候帮你跳到授权」= 步骤 **[1]→[2] 的 CTA**，不是「安装完成即绿」。
绿点 = **Connected**，不是 **Installed**。

---

## 4. MCP vs domain CLI：实现通道，不是产品分叉

| 维度 | MCP | Domain CLI（本仓） |
| --- | --- | --- |
| 行业默认度 | **高**（跨 IDE/Agent 标准） | **低**，本机/厂商 CLI 生态 |
| Schema 来源 | `tools/list` | Manifest allowlist / argv 模板 |
| Auth 常见形态 | OAuth / headers / stdio env | `cli auth login` session / env |
| 用户是否应选「我要 MCP 还是 CLI」 | **否**（高级设置可露） | **否** |
| 产品上挂哪 | **Connector** 的 channel | 同一 **Connector** 的 channel |

**规格原则：**

1. **Connector 一等**；`primaryChannel: 'mcp' | 'domain_cli' | 'hybrid'` 是诚实字段。
2. **Plugin 可同时 contributes.mcp + contributes.cli + auth**（hybrid 能力包）。
3. 飞书验证切片 **CLI-first** 是 **验证路径选择**，不是「我们只做 CLI、不做 MCP」。
4. Hybrid 终态：同一 `connector.feishu` 可 MCP + CLI 并存；**绿点按 auth model 分写**，禁止「host OAuth 成功」冒充 `cli_session`。

这与用户判断一致：**重点不关心底层是 MCP 还是 CLI；产品要两者都支持；Plugin 是整体能力包。**

---

## 5. 对本仓的规格锁定建议

### 5.1 词表（中英固定）

| 中文 | 英文 | 定义 | 用户是否一等 |
| --- | --- | --- | --- |
| 插件包 | **Plugin** | 侧车可发现/启用的 **能力包**（manifest） | 设置/doctor/高级；MVP 可弱化 |
| 连接器 | **Connector** | 外部服务产品面：名称、能力、**auth 状态**、toolScope | **是（Composer +）** |
| 技能 | **Skill** | `SKILL.md` SOP | **是** |
| 专家 | **Expert** | 配置包（instruction + 建议 skills/connectors） | **是** |
| 实现通道 | channel | mcp / domain_cli / hybrid | 诚实 note / 高级，非主分栏 |

### 5.2 生命周期（与主流对齐）

```text
Plugin enabled  →  Connector listed
Auth connected  →  Connector.connected = true
Task selected   →  tools may become effective
Invoke          →  channel-specific runner（MCP call / execFile CLI）
```

`effective = pluginEnabled ∧ connected ∧ taskSelected ∧ (¬muted) ∧ toolInScope`
（已有 effective 算法与此同构。）

### 5.3 UX（「新增就去授权」）

Composer「+」/ Capability panel：

1. 展示 Connector 卡片（飞书…）
2. 未连接 → 主按钮 **连接 / 登录** → `startAuth`
   - CLI-first：启动 `lark-cli auth login` 设备流 / 提示验证 URL（**非**宿主 OAuth 注入话术）
   - MCP/OAuth 后置：跳转 provider / 侧车 OAuth
3. 已连接未选用 → **用于此任务**
4. 已选用 → chip + 可 mute

**不要**让用户先选「MCP 飞书」vs「CLI 飞书」两个连接器（除非 advanced 拆分）。

### 5.4 与 CodePilot CLI 库划界（再次强调）

- 主流 **Connector** ≠ CodePilot **CLI 工具库**（ffmpeg + Bash）。
- Domain CLI 仅当 **某 Connector 的实现通道** 时进入模型；不是通用 shell 产品。

### 5.5 明确不做（与主流差异的诚实点）

| 主流常见 | 本仓 |
| --- | --- |
| 大而全 Marketplace P0 | P1+；先本地 registry |
| Plugin 内 subagents 产品化 | Expert 仅配置包 |
| 浏览器持有 OAuth token | **禁止**；侧车持有 |
| 通用终端当「连接器」 | **禁止** |

---

## 6. 一句话产品定义（可进 Spec）

> **Plugin** 是可安装的 **能力包**；**Connector** 是用户可连接的 **外部服务面**（连接/授权/选用）；**Skill/Expert** 是知识与配置；**MCP 与 domain CLI 都是 Connector 的实现通道，产品默认双支持，用户主路径只看到「连接器 + 授权」**。

---

## 7. Sources

### 公开产品文档 / 公告

- [Apps in ChatGPT (connectors → apps)](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt)
- [Plugins in ChatGPT and Codex](https://help.openai.com/en/articles/20001256-plugins-in-codex/)
- [Admin controls for plugins and apps](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps)
- [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461)
- [openai/plugins](https://github.com/openai/plugins)
- [Extend Cursor with plugins](https://cursor.com/blog/marketplace)
- [Cursor MCP](https://docs.cursor.com/context/model-context-protocol)
- [Claude Code plugins](https://github.com/anthropics/claude-code/blob/main/plugins/README.md)
- [Anthropic MCP](https://docs.anthropic.com/en/docs/mcp)
- [GitHub Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins)
- [Copilot MCP / cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/mcp-and-cloud-agent)
- [Sunset Copilot Extensions](https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/)
- [Windsurf Cascade MCP](https://docs.windsurf.com/ja/plugins/cascade/mcp)
- [Dify plugin types](https://docs.dify.ai/en/develop-plugin/getting-started/choose-plugin-type)
- [Dify tool OAuth](https://docs.dify.ai/en/develop-plugin/dev-guides-and-walkthroughs/tool-oauth)
- [Coze plugin configuration](https://github.com/coze-dev/coze-studio/wiki/4.-Plugin-Configuration)

### 本仓相关

- [`capability-surface-reference-models-2026-08-09.md`](./capability-surface-reference-models-2026-08-09.md)（openworker/Kun/CodePilot + §3.4 工具暴露）
- [`feishu-mcp-vs-cli-auth-comparison-2026-08-09.md`](./feishu-mcp-vs-cli-auth-comparison-2026-08-09.md)
- [`workbench-capability-surface-spec.md`](../plans/workbench-capability-surface-spec.md)
- `tooling/workbench-runtime-voltagent/src/plugin/manifest.ts`（contributes mcp|cli|skills|auth）

---

## 8. 诚实边界

- Help Center / 部分 docs 域名在本环境无法全文抓取；结论综合 WebSearch 摘要、Cursor marketplace 正文、本机 Codex/CodePilot 树、及既有参考仓研究。
- 各产品 UI 文案随版本变化快；**分层结构**比具体按钮文案更稳。
- 未宣称「所有 Agent 都支持 domain CLI」——CLI 是本仓/本机差异化通道；**行业默认外连仍是 MCP/App OAuth**。
