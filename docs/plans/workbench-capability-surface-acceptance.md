# 验收剧本：对话内连接器 / 技能 / 专家 E2E

**Status:** acceptance-in-progress（当前基准为 GitHub/官方 MCP + 飞书/官方 Skills/原生 CLI；Office 统一使用通用 Workspace Shell）
**Spec:** [workbench-capability-surface-spec.md](./workbench-capability-surface-spec.md)
**修订：**

- 2026-08-09a：Codex 对抗评审表态（effective、黄金路径、无 @）
- **2026-08-09b：飞书 CLI-first（WorkBuddy 同构）；Connected = cli_session，非宿主 OAuth**
- **2026-08-09c：Plugin=能力包；Connector 一等；平台支持 MCP/CLI；Expert 文件 catalog（experts/\*.json）**
- **2026-08-09d：Provider-owned contract；动态发现 + 可逆 identity；Host 不拥有 Provider 业务命令**
- **2026-08-09e：两个产品级内置 Connector 定型为 GitHub→官方 MCP、飞书→官方 CLI；不要求单 Connector Hybrid**
- **2026-08-10a（已被 10b 取代）：曾采用 Sidecar 自持 App 凭据的 OAuth 方案**
- **2026-08-10b：GitHub 统一改为平台 UI Lab Connector 一键授权；删除用户/Sidecar App 凭据与 PAT fallback**
- **2026-08-09f（历史实现）：飞书曾以专用 Runtime tools 间接执行 CLI；现已移除**
- **2026-08-09g：飞书只贡献官方 `lark-*` Skills、`lark-cli` command scope 与 CLI session；Agent 统一调用 `execute_command`，且每次需 Host 审批**

---

## 0. 前置条件

### 0.1 voltagent 真路径

| #     | 检查                                                                               | Pass?                                       |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| 0.1.1 | `pnpm dev:workbench` 可打开 Workbench                                              | ☑ 2026-08-09 `localhost:5177`，真实侧车模式 |
| 0.1.2 | voltagent 侧车已启动                                                               | ☑ 2026-08-09 :3142                          |
| 0.1.3 | 模型 API 可用                                                                      | ☑ `deepseek-v4-flash` 真实 stream + UI approval resume 已通过 |
| 0.1.4 | doctor/list 可运行且日志无 secret                                                  | ☑ 启动 doctor 无 token                      |
| 0.1.5 | 本机 **`lark-cli`（pin 建议 1.0.85）** 可执行，或 `FEISHU_CLI_PATH` 指向等价二进制 | ☑ 1.0.67（非 pin 精确版，session 可用）     |
| 0.1.6 | `cli.feishu` 对齐 lark-cli；官方 `lark-*` Skills 完整挂载；无飞书 wrapper tools | ☑ 本机已安装 28 个 `lark-*` Skills；`execute_command`、command scope、Registry/安全单测通过 |
| 0.1.7 | `mcp.github` 指向 GitHub 官方远程 MCP；未完成平台授权时不假 Connected | ◐ fake Broker session/claim + fail-closed 已通过；真实平台 Broker 待部署 |

### 0.3 Provider-owned Plugin 架构迁移门

> 这些门替代“继续在 Host 内追加 Provider 业务工具即完成插件扩展”的旧判断。

| ID | Gate | 状态 / 证据 |
| --- | --- | --- |
| 0.3.1 | Connector metadata 由 Plugin contribution 动态投影；Connector core 无飞书业务工具名 | ☑ `projectConnectorDescriptors` + Registry/local plugin tests |
| 0.3.2 | GitHub MCP `tools/list` 新增一个工具后，不改 Host core 即进入 Registry | ☑ `search_repositories` mock 动态进入 `github__search_repositories` + 双 server 同名工具联测 |
| 0.3.3 | `publicName ↔ (pluginId, channelId, originalName)` 可逆；冲突/normalize 不丢原始身份 | ☑ `ToolIdentityRegistry` + MCP/CLI identity tests |
| 0.3.4 | `allow/ask/deny` 在发现后生效，不复制 Provider schema；write 默认 fail-closed | ☑ MCP exact read allowlist + 默认审批；CLI write 审批 |
| 0.3.5 | 飞书官方 Skills 若宣称可用，必须完整挂载 Skill 包并保留 `lark-cli` 契约 | ☑ `SKILL.md`、references/scripts/assets 同步；符号链接失败关闭；原生 CLI shell smoke |
| 0.3.6 | 上游新增工具/Skill 时，无需修改 Workbench Host core 即可被发现或运行 | ☑ MCP 以 tools/list 动态发现；CLI 以 `lark-*` 安装目录动态发现并由通用 Shell 执行 |

### 0.2 Fake

| #     | 检查                         | Pass? |
| ----- | ---------------------------- | ----- |
| 0.2.1 | Fake/capture 可打开，无侧车  | ☑ 2026-08-09 独立 Fake 浏览器冒烟             |
| 0.2.2 | 诚实标识；不宣称生产 Runtime | ☑ 连接 CTA 返回需本地 Runtime；无假绿点       |

---

## G. 强制黄金路径（缺一则总评 Fail）

**场景：** 飞书 **CLI 登录** + Task 选用飞书 + 会议纪要专家 → 可观测原生 `lark-cli` command scope；取消选用后能力面改变。

| #   | 步骤                                           | 期望                                                                                     | Pass?                                                                                           |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| G.1 | 飞书 Connected=false（未登录或 CLI 缺失）      | UI/doctor missing；可提示安装 lark-cli                                                   | ☑ 探针见 connected=true 路径；未连态由单测覆盖                                                  |
| G.2 | 「+」→ 飞书 → 去登录                           | 打开/委托 **飞书 CLI 授权**；Workbench **不**持 token                                    | ☑ HTTP startAuth kind=cli_session、无 token（UI 人工仍建议走一遍）                              |
| G.3 | CLI 登录成功                                   | statusCommand 成功；snapshot refresh；**cli_session Connected**；不声称宿主 OAuth inject | ☑ refresh + honesty note                                                                        |
| G.4 | 本 Task **选用**飞书 + `expert.office-meeting` | 芯片可见；Connected 时 `effectiveCommandScopes=['lark-cli']`                              | ☑ Snapshot/切换测试；UI Switch 旧截图仍适用                                                     |
| G.5 | 提交需要使用飞书能力的 Turn                    | Timeline/SSE 出现 `execute_command` 的精确 `lark-cli` argv，并进入 Host 审批              | ☑ 真实模型探针命中精确 argv；UI「允许一次」后 `exit_code=0`，返回 `ok=true` / `identity=user` / `revision=126` |
| G.6 | **取消**本 Task 飞书选用后重复同类请求         | `lark-cli` command scope 缺席或失败可解释                                                 | ☑ deselect → `effectiveCommandScopes=[]`                                                         |
| G.7 | 再次选用且仍 Connected                         | 命令能力面恢复可观测                                                                     | ☑ effective resolver / connector-aware sandbox tests                                            |

---

## 1. Composer「+」目录

| #   | 步骤           | 期望                                                                        | Pass?                                                  |
| --- | -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1.1 | 打开「+」      | Capability Surface 面板                                                     | ☑ 紧凑根菜单 + 横向子菜单，见本轮截图                  |
| 1.2 | 分组           | **连接器 / 技能 / 专家** 三组（**无** MCP/CLI 主分栏）                      | ☑ 浏览器 + 5/5 菜单测试                                |
| 1.3 | 内置项         | 两个产品级 Connector：GitHub、飞书；会议纪要专家为独立 Expert               | ☑ `connector.github` + `connector.feishu` + `expert.office-meeting` |
| 1.4 | 飞书文案       | 体现**官方 Skills + 原生 CLI**；不把 CLI 写成宿主 OAuth                    | ☑ 子菜单 honesty note + 测试                           |
| 1.5 | 无密钥         | 面板/芯片/日志无 token                                                      | ☑ status-safe snapshot；浏览器 console 0 error/warning |
| 1.6 | 通道归属诚实   | GitHub=`mcp`、飞书=`domain_cli`；不把飞书渲染为 Hybrid                      | ☑ 两个独立 Provider 行；飞书 `channelAuth` 无 MCP 行   |
| 1.7 | Expert catalog | 侧车 `experts/*.json`（或 fallback）提供会议纪要专家；诚实非 Plugin 打包    | ☑ 侧车启动载入 office-meeting / xhs-cover              |
| 1.8 | 官方品牌标识   | GitHub 使用 Primer mark；飞书使用本机官方应用图标；未知连接器才 fallback   | ☑ Browser tests：GitHub SVG + 飞书 IMG                  |

---

## 2. 登录与解绑

| #   | 步骤           | 期望                                                 | Pass? |
| --- | -------------- | ---------------------------------------------------- | ----- |
| 2.1 | 取消登录流     | 未连接；中文已取消                                   | ☐     |
| 2.2 | CLI 未安装     | 明确 missing binary 提示；不绿点                     | ☑ startAuth missing-binary 单测 + 中文 notice |
| 2.3 | 解绑/logout 后 | 保留 Task 选用芯片；显示未连接；调用失败可区分未登录 | ☐     |
| 2.4 | 安全抽查       | Renderer 无 CLI token；不把 CLI 成功写成宿主 OAuth   | ☑ snapshot 白名单 + sidecar 安全套件           |
| 2.5 | GitHub 连接    | 点击连接打开 UI Lab Connector；Broker callback 后 Sidecar claim/自动刷新 | ☑ startAuth/reconcile/polling + Fake/Sidecar tests |

---

## 3. Effective 语义（侧车真相）

| #   | 步骤                                  | 期望                            | Pass?                                  |
| --- | ------------------------------------- | ------------------------------- | -------------------------------------- |
| 3.1 | 全局启用飞书 plugin，**未** Task 选用 | 下一 Turn **无** `lark-cli` 命令能力 | ☑ `effectiveCommandScopes=[]` |
| 3.2 | Task 选用但未 Connected               | 芯片可保留；命令能力不进入          | ☑ sidecar snapshot/effective 单测 |
| 3.3 | 已选 + CLI Connected                  | `lark-cli` 进入下一 Turn            | ☑ `effectiveCommandScopes=['lark-cli']` + sandbox gate |
| 3.4 | GitHub 已启用 + managed OAuth Connected + TaskSelected | `github__*` 动态工具进入下一 Turn | ☑ Broker claim 后热加载/identity；真实远程账号待 Broker |

---

## 4. Expert / Skill（补充）

| #   | 步骤                     | 期望                            | Pass?                                                      |
| --- | ------------------------ | ------------------------------- | ---------------------------------------------------------- |
| 4.1 | 小红书封面专家（辅助）   | 芯片；instruction 影响下一 Turn | ☐                                                          |
| 4.2 | `research-brief` skill（辅助） | 芯片                       | ☑ Playwright 真实侧车 UI 选用并在刷新后保留                |
| 4.3 | Run 中切换专家           | 当前 Run 不变                   | ☐                                                          |
| 4.4 | 缺连接仍选依赖飞书的专家 | 允许；提示缺连接                | ☑ 飞书 Switch off 时会议纪要专家与默认 Skill 保留；不假外呼 |
| 4.5 | 刷新页面                 | 同 Task 选用仍在                | ☑ Playwright reload 后飞书、会议纪要专家、`meeting-notes`、`research-brief` 均保留 |

---

## 5. Fake 诚实

| #   | 步骤      | 期望                                     | Pass? |
| --- | --------- | ---------------------------------------- | ----- |
| 5.1 | 打开「+」 | 目录可见                                 | ☑ Fake 浏览器截图                                         |
| 5.2 | 飞书      | 需本地 Runtime / 不可假 CLI 登录成功外呼 | ☑ 点连接后中文诚实状态；无 Switch 假绿点                  |
| 5.3 | 选用专家  | 不暗示已拉远程飞书数据                   | ☑ 会议纪要专家 + meeting-notes 本地芯片；Fake honesty 保留 |
| 5.4 | GitHub    | 可见官方 MCP 目录项；不假 OAuth 已完成/远程调用 | ☑ Fake 专用提示；无 PAT 主流程、无 lark-cli 串线          |

---

## 6. 回归

| #   | 检查                               | Pass?   |
| --- | ---------------------------------- | ------- |
| 6.1 | Fake/capture Timeline 回归         | ☑ Workbench 313/313                         |
| 6.2 | RuntimePort 无 secret              | ☑ status-safe snapshot + sidecar 安全套件   |
| 6.3 | 无「飞书必须叠加 MCP/Hybrid」验收要求 | ☑ GitHub/MCP + 飞书/CLI 合同复核              |
| 6.4 | 无 `@专家` 验收项                  | ☑ N/A                                       |

---

## 7. 结果记录

| 字段                 | 值                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 日期                 | 2026-08-09                                                                                                                    |
| 分支                 | research/capability-surface-reference-models（工作区）                                                                        |
| 证据                 | [GitHub/MCP + 飞书/CLI 双 Provider](../evidence/capability-surface-github-mcp-feishu-cli-2026-08-09.md)；[既有飞书黄金路径](../evidence/capability-surface-hybrid-expert-golden-2026-08-09.md) |
| 侧车探针             | 隔离 :3143 + 临时 Workspace → **12/12 PASS**；`effectiveCommandScopes=['lark-cli']`；G.5 真实 stream 命中精确原生 argv 并正确停在 Host 审批 |
| lark-cli             | 1.0.67；CLI session connected；本机官方 `lark-*` Skills 完整同步到 Workspace                                                  |
| G.5 真模型工具行     | ☑ `deepseek-v4-flash` 读取官方 `lark-doc` / `lark-shared` / `lark-doc-fetch` 后调用 `execute_command(command='lark-cli', args=['docs','+fetch',...])`；UI 批准后成功读取真实文档 |
| Channel / Expert     | GitHub=mcp、飞书=domain_cli；experts/\*.json + instruction 已挂 snapshot                                                     |
| UI / Switch          | [飞书结构与 WorkBuddy 开关证据](../evidence/capability-surface-feishu-structure-and-workbuddy-switch-2026-08-09.md)；G.5 审批前后截图：`output/playwright/feishu-g5-approval-request.png`、`output/playwright/feishu-g5-success.png` |
| 自动化回归           | Workbench **314/314**；VoltAgent 侧车 **255/255**；root `pnpm check`；Workbench build 全部通过                         |
| doctor 说明          | 飞书 findings 均为 OK；整体 exit 1 仅因同次 doctor 的可选 `mcp.docs/calendar` 未配置                                           |
| 执行人               |                                                                                                                               |
| 分支 / commit        |                                                                                                                               |
| lark-cli 版本 / 路径 |                                                                                                                               |
| 黄金路径 G.\*        |                                                                                                                               |
| 失败项与证据         | OAuth 登录取消后的完整 UI、解绑、小红书专家与 Run 中切换专家仍待执行；GitHub 真实 OAuth 待平台 Broker/App 部署                  |
| 总评 Pass/Fail       | **In progress**（G.5 原生 Skill → Shell → UI approval → 真实 docs 已通过；剩余 auth 边界与辅助 Expert 剧本未收口）             |

**总评 Fail（任一）：**

- Renderer 出现 token
- Fake 假 CLI 外呼成功
- CLI 未登录却绿点
- 把 CLI 登录宣传为宿主 OAuth inject
- 黄金路径 G.5/G.6 失败
- 宣称多租户生产 Runtime
