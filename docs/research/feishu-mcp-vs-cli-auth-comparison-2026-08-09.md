# 研究：飞书连接器 MCP vs CLI 与授权对照

- **Date:** 2026-08-09
- **Trigger:** WorkBuddy 飞书连接器 UI（「通过命令行管理」+ `open.feishu.cn/page/cli`）与 Capability Surface Spec 对齐
- **Repos:** uilab-admin / CodePilot / codex（本地）
- **非目标:** 不实现产品代码

---

## 1. Executive answer

| 问题 | 结论 |
| --- | --- |
| WorkBuddy 飞书在走什么？ | **CLI 产品路径**：文案「通过命令行管理飞书/Lark」；授权完成页 `open.feishu.cn/page/cli?...&from=cli`（与 `lark-cli` ~1.0.85 一致）→ **CLI 自有登录 / 飞书 CLI 应用**，不是宿主 MCP OAuth 叙事。 |
| MCP 与 CLI 授权是否同一套？ | **不是。** CLI：`cli_session`，token 在 CLI/OS keychain，宿主只 probe `auth status`。MCP：需要 **注入** 到 MCP 进程/HTTP 的 user/app token（env bearer、宿主 oauth2→inject、或 MCP 自带 login）。 |
| 我们 **代码现状** | `mcp.docs`/`mcp.calendar` = **static_bearer/env**；`cli.feishu` = **cli_session 样板**（命令名 `feishu-cli`，hint 写明非宿主 OAuth）。侧车 **有** oauth2/Keychain 合同，但 **未** 接到产品级「飞书」连接器。 |
| 我们 **Spec 现状** | 修订 Spec：**MCP-first + 宿主 OAuth 验收门**；CLI 为子能力可选。与 WorkBuddy **产品叙事相反**。 |
| CodePilot 飞书？ | **IM Channel（Bridge）**：App ID/Secret + bot 身份，不是办公 Connector，也不是 lark-cli 连接器。 |
| Codex？ | **有** Plugin packaging + **Apps/Connectors** + MCP 子系统；**无** 飞书/Lark 专用集成。模式是 connector-id 投影 + 宿主侧 connector 目录/鉴权身份，**不是** WorkBuddy 式飞书 CLI 一键绑。 |
| 建议 | **验证切片若要对齐 WorkBuddy 最快演示：CLI-first（B）**；**若坚持「+ 宿主 OAuth + 工具注入」与 Codex 系 packaging：MCP-first 宿主 OAuth（A）**；**产品终态更合理：Hybrid（C）**，但 **Connected 必须分轨**（MCP auth vs CLI session），不能一个绿点掩盖两套登录。 |

---

## 2. WorkBuddy UI 证据（用户截图）

1. 连接器目录卡片「飞书」描述：
   **「通过命令行管理飞书/Lark 全产品能力：…」**
2. 详情弹窗：解绑 / 去试试；能力列表覆盖 IM、邮箱、日历、云文档、Base…
3. 浏览器授权成功：
   `https://open.feishu.cn/page/cli?lpv=1.0.85&ocv=1.0.85&from=cli`
   文案：**配置成功，前往 CLI 开始使用飞书 CLI 应用**

**推断（强）：** WorkBuddy 的「连接飞书」= 安装/登录 **飞书官方 CLI（lark-cli 系）**，Connected = CLI session 可用，Agent 通过 **命令行工具** 调飞书，而不是（主要）宿主托管的 MCP OAuth token 注入。

---

## 3. 授权模型对照表

| 模型 | Token 所有者 | 浏览器流所有者 | Connected 含义 | 撤销 | Renderer 角色 | 是否符合我们「浏览器无 secret」 |
| --- | --- | --- | --- | --- | --- | --- |
| **CLI 自有登录**（WorkBuddy / 我们 `cli_session`） | CLI / OS keychain（飞书 CLI 应用） | 飞书开放平台 **CLI 页**（`from=cli`） | `lark-cli auth status`（或等价）exit 0 | CLI logout / 解绑 | 只触发「去登录」+ 读 status | ✅ 若 UI 不碰 token |
| **宿主 OAuth → inject MCP**（我们 Spec 目标） | 侧车 SecretStore/Keychain | **宿主/侧车** PKCE（plugin-auth） | binding 可 resolve 材料 | 侧车 clear binding | 只发 startAuth | ✅ 设计目标 |
| **static_bearer / env PAT**（我们 mcp.docs 现状） | `.env` / 进程环境 | 无 | env 非空 | 删 env | 无 | ✅ 但 UX 差、非「点 + 授权」 |
| **MCP 自带 login**（`lark-mcp login` 等） | MCP 进程/其本地存储 | MCP 文档约定 | MCP 侧已登录 | MCP logout | 难统一进 doctor | ⚠️ 易双轨，状态难投影 |
| **App 机器人凭据**（CodePilot Channel） | 应用存 App Secret | 创建/绑定应用流 | bot 可连 | 删凭据 | 设置页配 secret（桌面端） | ⚠️ 与「办公用户态 Connector」不是同一产品 |

**关键点：**
「浏览器打开飞书页面」**看起来像 OAuth**，但 **from=cli** 的成功页把身份交给 **CLI 应用**，不是自动等于「宿主 Keychain 里有可 inject 的 user_access_token」。

---

## 4. 我们 uilab-admin：代码真相 vs Spec 愿望

### 4.1 代码（`tooling/workbench-runtime-voltagent`）

| Builtin | 通道 | Auth kind | 产品「飞书」？ |
| --- | --- | --- | --- |
| `mcp.docs` | MCP HTTP/stdio（env 配 URL/command） | `static_bearer`（`MCP_DOCS_BEARER_TOKEN`…） | 仅 env 别名 `FEISHU_DOCS_*`，**不是**产品连接器 |
| `mcp.calendar` | 同上 | `static_bearer` | 同上 |
| `cli.feishu` | 领域 CLI allowlist | `cli_session`（`feishu-cli auth status`） | **样板**；命令名 `feishu-cli`，hint：**非宿主 OAuth**；默认 **disabled** |

侧车 **已实现** `CredentialKind` 含 `oauth2`、`cli_session`、Keychain、PKCE 等（`types.ts`、plugin-auth follow-ups），但 **飞书 builtins 尚未接到 oauth2 产品路径**。

### 4.2 Spec（Capability Surface 修订稿）

- 产品 `connector.feishu`：**MCP-first** + 宿主 OAuth 验收门
- CLI：子能力可选；`cli_session ≠ 宿主 OAuth`
- 与 WorkBuddy **叙事冲突**；与 **现有 builtin 默认路径** 也冲突（env bearer / 未启用 CLI）

### 4.3 授权设计笔记（既有）

`docs/plans/sidecar-plugin-authorization.md` §5.2–5.3 已写清：

- Feishu CLI：`auth login` + 可选 app_client
- Hybrid（Codex GitHub 模式）：MCP/app 优先，CLI 补洞；**可能两套 auth 都要**

---

## 5. CodePilot 飞书

路径：`CodePilot/src/lib/channels/feishu/*`

- **ChannelPlugin / Bridge**：收发 IM、机器人
- 凭据：`App ID` + `App Secret`；bot **app_access_token**
- 注释明确：完整用户态搜索等需要 `user_access_token`，当前 bot 身份能力有限
- **不是** lark-cli 连接器，**不是** Agent 办公 MCP 工具面主路径

**对 Capability Surface：** 可参考「浏览器里点绑定」的 UX，但 **产品对象不同**（消息通道 ≠ 办公 Connector）。混名会重蹈 research 里「Channel ≠ Connector」的坑。

---

## 6. Codex（`/Users/zhoujw/develop/github/codex`）

- 有完整 **plugin**、**MCP**、**connectors** 子系统（`codex-rs/plugin`、`codex-mcp`、`connectors`）。
- Connector 与 **plugin app 声明**（`AppDeclaration` / `AppConnectorId`）投影；有 connector directory cache、runtime projection。
- **未发现** Feishu/Lark 专用 connector 实现（检索仅命中无关 Starlark 等）。
- 模式对齐我们 packaging 思想：**Plugin 打包；Connector/App 是外部服务面；MCP 可并存**。
- **不像** WorkBuddy 把飞书做成「一条 CLI 连接器覆盖全产品」。

**结论：** 跟 Codex **架构同族**（packaging + connector 投影 + MCP），**产品飞书路径不同**于 WorkBuddy CLI；Codex 本身不提供飞书答案。

---

## 7. MCP vs CLI 能力面

| | **MCP（lark-mcp 等）** | **CLI（lark-cli）** |
| --- | --- | --- |
| Agent 调用形态 | MCP tools 列表 | 结构化 argv → execFile（我们 allowlist） |
| 能力覆盖 | 取决于 MCP 暴露的 API 面（常偏文档/日历子集） | 官方 CLI 常宣传「全产品」子命令（与 WorkBuddy 文案一致） |
| 授权 | 需 token 进 MCP 进程/HTTP | CLI 自己管 session |
| 与侧车契合 | 已有 mcp-loader + inject 合同 | 已有 cli-loader + cli_session |
| 风险 | OAuth inject、MCP beta、工具面版本 | 二进制安装、PATH、CLI 升级、与宿主状态双轨 |
| 审批 | 我们 SecurityPolicy 可按 tool 名 | 可按子命令 needsApproval |

**Hybrid（设计笔记已有）：** MCP 做主读路径；CLI 补 MCP 没有的命令；**两套 Connected 要分开显示或聚合规则写死**。

---

## 8. 对我们 Spec 的选项与建议

### Option A — MCP-first + 宿主 OAuth（当前修订 Spec）

- **优点：** 对齐 Codex packaging、侧车 oauth2/Keychain、inject 一致、Renderer 干净。
- **缺点：** 与 WorkBuddy 演示路径不同；实现重；builtins 要从 static_bearer 迁到 oauth2；飞书开放平台应用配置成本高。
- **适合：** 你坚持「点 + 就地宿主授权」且要证明 **宿主持证 inject**。

### Option B — CLI-first（WorkBuddy 同构）

- **优点：** 与截图一致；授权页现成；Connected = `lark-cli auth status`；实现可复用 `cli.feishu` 合同，把 command 换成官方 `lark-cli`。
- **缺点：** 「宿主 OAuth」叙事要改写；Connected **不是** Keychain 里的宿主 oauth2 binding；能力面依赖 CLI 安装；与「MCP 工具 Timeline」形态不同（变成 CLI 工具行）。
- **适合：** **最快验证「连接器绿点 + Agent 真调飞书」** 的切片。

### Option C — Hybrid

- MCP 子能力 + CLI 子能力；产品仍叫「飞书」。
- **Connected 规则必须显式**，例如：
  - `connected` = MCP 宿主 auth connected **或**（若仅启用 CLI 子能力）CLI session connected；
  - UI 显示「文档(MCP)已连 / CLI 已登录」分项，避免一个绿点撒谎。
- **适合：** 产品终态；验证切片若选 C，范围容易膨胀。

### 推荐

| 阶段 | 推荐 | 说明 |
| --- | --- | --- |
| **验证切片（演示闭环）** | **B CLI-first**，或 **A 但缩小到 env bearer 诚实开发路径 + 后置 OAuth** | 若必须视觉对齐 WorkBuddy：**B**。若必须坚持宿主 OAuth 验收门：**A**，并接受与 WorkBuddy 不同。 |
| **产品终态** | **C Hybrid** | 与 sidecar-plugin-authorization §5.3、Codex GitHub hybrid 一致。 |

**不要做的事：** 把 CLI `from=cli` 成功页 **宣传成** 宿主 OAuth 已完成并已 inject 到 MCP——那是 **假 Connected**。

---

## 9. 风险

| 若抄 WorkBuddy CLI-only | 若死磕宿主 OAuth MCP |
| --- | --- |
| Spec/验收门需回写（与 2026-08-09 grilling「坚持 OAuth」冲突） | 与市场/竞品飞书连接器 UX 不一致，用户可能期望「命令行」 |
| 依赖用户装 `lark-cli` | 依赖飞书应用审核/redirect/权限 |
| Timeline 是 CLI 工具不是 MCP | MCP 工具面可能窄于 CLI 宣传的「全产品」 |
| 解绑=CLI logout，侧车 Keychain 可能空 | 解绑=clear binding，CLI 可能仍登录 → 双轨残留 |

---

## 10. Sources

| 路径 | 用途 |
| --- | --- |
| 用户 WorkBuddy 截图 | CLI 文案 + `open.feishu.cn/page/cli` |
| `tooling/workbench-runtime-voltagent/src/plugin/builtins.ts` | mcp.docs static_bearer；cli.feishu cli_session |
| `tooling/workbench-runtime-voltagent/src/plugin/types.ts` | CredentialKind / AuthBinding |
| `docs/plans/sidecar-plugin-authorization.md` §5.2–5.3 | CLI vs hybrid auth |
| `docs/plans/workbench-capability-surface-spec.md` | MCP-first + 宿主 OAuth |
| `docs/research/capability-surface-sample-sources-2026-08-09.md` | lark-mcp / lark-cli pin 建议 |
| `CodePilot/src/lib/channels/feishu/*` | Channel bot，非办公 connector |
| `codex/codex-rs/connectors/*`、`plugin`、`codex-mcp` | Connector/MCP packaging；无飞书 |

---

## 11. 给作者的拍板题（是/否）

1. 验证切片 **Connected 绿点** 是否允许 = **仅 CLI session**（WorkBuddy 同构）？
2. 若否，是否接受 **与 WorkBuddy 不同** 的宿主 OAuth MCP 路径作为唯一绿点？
3. Hybrid 时，UI 是否必须 **分项**显示 MCP/CLI 登录态？
4. 是否把 builtin `cli.feishu` 的 command **正式改为** `lark-cli` 并 pin 1.0.85？
