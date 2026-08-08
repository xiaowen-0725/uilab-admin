# 研究：能力面验证切片 — 内置样例来源锁定

- **Date:** 2026-08-09  
- **Ticket:** [#37 研究：锁定内置飞书连接器 / 开源 Skill / Expert 样例来源](https://github.com/xiaowen-0725/uilab-admin/issues/37)  
- **Map:** [#34 Wayfinder: Workbench 能力面](https://github.com/xiaowen-0725/uilab-admin/issues/34)  
- **Branch:** `research/capability-surface-sample-sources`  
- **Scope:** 只锁定可引用的 git/vendor/doc 来源与 pin 建议；**不实现**产品能力。  
- **Honesty:** Fake Runtime 可演示目录/选用，不外呼；真工具仅本机 VoltAgent 侧车。

---

## 1. 结论摘要

验证切片应锁定 **3 类样例**，优先 **可观测闭环** 而非市场完整目录：

| 类别 | 主推荐（先 ship） | 集成模式 | 为什么 |
| --- | --- | --- | --- |
| **飞书连接器** | 产品面 `connector.feishu` = **官方 MCP 主路径** + 可选 **官方 `lark-cli` 领域 CLI 辅路径**；仓内 `cli.feishu` 仅作 allowlist/auth 合同样板 | Plugin 贡献 MCP/CLI；宿主 OAuth/Keychain 复用侧车 plugin-auth | 官方 MIT、版本可 pin、与现有 `mcp.docs`/`cli.feishu` 装配同构 |
| **开源 Skill（≥1）** | `addyosmani/agent-skills` → `planning-and-task-breakdown`（MIT） | 复制/vendor 到 skills 根，`workspace_*_skill*` 可观测 | 纯 `SKILL.md`、无第三方图 API、许可证清晰 |
| **Expert（≥2）** | ① `expert.xhs-cover`（小红书封面） ② `expert.office-meeting`（会议纪要） | 仓内薄 profile（persona + default skills + suggested connectors）；可 wrap 外部 skill | 不引入多 Agent 运行时；验收只看选用与交付物 |

**Primary recommendation for the validation slice（先交付这一套）：**

1. **Connector:** 飞书 — 侧车装配 **`@larksuiteoapi/lark-mcp@0.5.1`** 进 `mcp.docs`（或专用 `mcp.feishu`）stdio；产品 OAuth 路径走宿主 **oauth2/PKCE + Keychain**（已 ship 合同），**不要**把 OpenClaw channel 插件当 Runtime 内核依赖。  
2. **Skill:** vendor **`planning-and-task-breakdown`**（见 pin）到 office skills 根，对话里要求「拆任务/出 plan」→ 可见 `workspace_list_skills` / `workspace_activate_skill` + 写入 `output/` 或 `tasks/`。  
3. **Experts:** 先内置两个薄 profile：`小红书封面专家` + `会议纪要专家`；前者 **引用** 外部 skill 源（默认 **guizang 工作流作参考**，但 **AGPL 不整仓 vendoring**；验证切片用 **自写薄 SKILL 或 MIT 封面 skill**）；后者默认绑定仓内 `meeting-notes`。

---

## 2. 现有底座（勿重造）

路径根：`tooling/workbench-runtime-voltagent/`。

### 2.1 Builtin 插件（`src/plugin/builtins.ts`）

| id | 显示名 | 默认 | 贡献 | 鉴权形态 |
| --- | --- | --- | --- | --- |
| `mcp.docs` | 文档/知识库 MCP | on（无 env 则 off） | HTTP/stdio MCP；`FEISHU_DOCS_*` 别名 | `static_bearer`（env token） |
| `mcp.calendar` | 日历 MCP | on（无 env 则 off） | 同上 + Google 子 env 别名 | `static_bearer` |
| `skills.office` | 办公 Skills | on | seed `meeting-notes` / `weekly-report` / `research-brief` → 工作区 `skills/` | 无 |
| `cli.feishu` | 飞书领域 CLI | **off** | allowlist `docs_get`(只读) / `docs_write`(审批)；命令名 `feishu-cli` | **`cli_session`**：`feishu-cli auth status`；hint 明确 **非宿主 OAuth** |

### 2.2 已 bundled Skills

| id | 路径 | 可见交付 |
| --- | --- | --- |
| `meeting-notes` | `bundled-skills/meeting-notes/SKILL.md` | `/output/meeting-notes/<date>-notes.md`（写需审批） |
| `weekly-report` | `bundled-skills/weekly-report/SKILL.md` | `/output/weekly-report/...` |
| `research-brief` | `bundled-skills/research-brief/SKILL.md` | `/output/research-brief/...` |

Seed 策略：`missing-only`（不覆盖用户改过的 `SKILL.md`）。Fake/capture **不**加载这些 skills。

### 2.3 宿主鉴权合同（可复用）

侧车已具备：`AuthBinding` / doctor / inject-revoke / Keychain / **OAuth PKCE**（`plugin:auth login --oauth-*`）。产品「+ → 飞书未授权 → 浏览器授权 → connected → 工具可注入」应 **复用** 该合同，而不是让浏览器持密钥。

**关键诚实点：** 今日 `cli.feishu` 的 auth 是 **CLI 自有登录**；产品级「飞书 OAuth」应对齐 **MCP user token / app credentials 进 SecretStore**，不是假装 `cli_session` 已是宿主 OAuth。

---

## 3. 飞书连接器：候选与组合

### 3.1 产品语义（建议）

按 map 词汇：

- **Plugin** = 打包/发现层（Registry 已有）  
- **Connector** = 插件贡献的外部服务接入面（MCP 和/或领域 CLI）  
- UI 显示名可用中文「飞书」；稳定 id 用英文，例如 `connector.feishu`（产品目录）映射到一个或多个 plugin id。

验证切片 **不要** 声称「完整飞书 OpenAPI 矩阵」；演示路径建议收窄为：

- **只读：** 读一篇云文档 / 列日历（需真实 app 权限）  
- **写：** 默认 `needsApproval`  
- **未登录：** doctor/UI 显示 `auth=missing`，工具不静默成功

### 3.2 候选源对照

| 候选 | URL / 包 | 许可证 | 版本 pin 建议 | 鉴权模型 | 与仓内路径 |
| --- | --- | --- | --- | --- | --- |
| **官方 OpenAPI MCP（主推）** | [larksuite/lark-openapi-mcp](https://github.com/larksuite/lark-openapi-mcp) · npm `@larksuiteoapi/lark-mcp` | **MIT** | npm **`0.5.1`**（release `v0.5.1`，2025-08-06）；git HEAD `21920354ec6e`（2025-08-14，文档提交） | App ID/Secret；用户态：`lark-mcp login` + `--oauth --token-mode user_access_token`；redirect 默认 `http://localhost:3000/callback` | 直接填 `MCP_DOCS_COMMAND=npx` + `MCP_DOCS_ARGS=-y,@larksuiteoapi/lark-mcp@0.5.1,mcp,-a,...,-s,...`；childEnv 已有 `FEISHU_APP_ID/SECRET`；**宿主 OAuth** 可把 access token 注入 `MCP_DOCS_BEARER_TOKEN` 或扩展 oauth2 binding |
| **官方领域 CLI（辅推 / 替换虚构 feishu-cli）** | npm [`@larksuite/cli`](https://www.npmjs.com/package/@larksuite/cli)（bin `lark-cli`）；源 [larksuite/cli](https://github.com/larksuite/cli) | **MIT** | npm **`1.0.85`**（调研日 2026-08-07 发布） | `lark-cli config init` + `lark-cli auth login --recommend`；OS keychain | 比仓内字符串 `feishu-cli` **更真实**；建议后续把 `cli.feishu` 的 `command`/`packageHint`/`statusCommand` 对齐为 `lark-cli`（**实现票**，本票仅锁定源） |
| **社区 feishu-cli 名** | npm `feishu-cli@0.2.0`（非官方） | 需再核 | 不 pin 为产品默认 | 多账户凭据 | 与 builtin 名字碰巧同名，**勿当作官方** |
| **feishu-docs-cli** | npm `feishu-docs-cli@1.4.0` | MIT（npm 标注） | 可选只读 docs 窄 CLI | shell 读写 docs | 可作为极窄 CLI 备选，覆盖面小于官方 CLI |
| **OpenClaw 飞书 channel 插件** | 本地镜像：`CodePilot/资料/feishu-openclaw-plugin` · npm `@larksuiteoapi/feishu-openclaw-plugin@2026.3.x` · MIT（Lark Technologies） | **MIT** | 仅作 **Skill/工具范围参考**，勿 pin 为 Workbench Runtime 依赖 | OpenClaw channel + 自有 OAuth/onboard；Node ≥22 | 自带大量 `skills/feishu-*`（fetch/create/update doc、calendar、bitable、IM…）→ 适合抄 **SOP 文案**，不适合整包当侧车 Plugin |
| **仓内 `cli.feishu` 样板** | `tooling/workbench-runtime-voltagent/src/plugin/builtins.ts` | 本仓 | 随 monorepo | `cli_session` | **合同样板**（allowlist、readOnly、needsApproval、doctor）；二进制当前是占位名 |

### 3.3 推荐组合（产品「飞书连接器」）

```text
UI: 连接器「飞书」 (connector.feishu)
  ├─ Plugin A: mcp.docs 或未来 mcp.feishu
  │    contributes.mcp → @larksuiteoapi/lark-mcp@0.5.1 (stdio)
  │    contributes.auth → oauth2 | static_bearer | app_client
  │    产品路径：+ → 未授权 → 宿主 OAuth PKCE → Keychain → inject
  └─ Plugin B (opt-in): cli.feishu（演进为 lark-cli）
       contributes.cli allowlist → 只读 docs_get 等
       contributes.auth → cli_session（lark-cli auth status）
       诚实文案：CLI 登录 ≠ 宿主 OAuth；两者可并存
```

**验收时可见行为（飞书）：**

1. `plugin:list` / 产品目录出现「飞书」；`plugin:doctor` 未配置时 `auth=missing` / MCP `off`。  
2. 配置 app 或完成 OAuth 后 `auth=connected`；对话调用只读工具出现 Timeline tool 行。  
3. 写操作出现审批 dock；拒绝则不外写。  
4. Fake 路径仅展示「未连接/示例」，不调用飞书。

**风险 / 诚实：**

- 官方 MCP 标注 **Beta**；API 可能变 → **锁 npm 精确版本**，升级另开票。  
- 真实租户权限、应用发布、redirect URL 是演示前置，CI 不得依赖真账号。  
- `cli.feishu` 今日 **不是** 可装即用的官方二进制；文档必须写清「样板 / 需 `FEISHU_CLI_PATH` 或换成 `lark-cli`」。  
- 不把 OpenClaw gateway 塞进 Workbench 架构。

---

## 4. 开源 Skill：可验证候选

### 4.1 加载合同（侧车）

- 工作区 skills 根：默认 `skills/<id>/SKILL.md`（virtual `/skills`）  
- `skills.office` seed 或手动放入 `WORKSPACE_ROOT/skills/`  
- 对话可观测：`workspace_list_skills` → `workspace_activate_skill` / `workspace_read_skill` → 按 SOP 读写文件（写默认审批）

### 4.2 候选评估

| id | 显示名 | 来源 | 许可证 | pin 建议 | 接入方式 | 可见验收行为 | 风险 / 诚实 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`planning-and-task-breakdown`（主推 OSS）** | 任务拆解 | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `skills/planning-and-task-breakdown/SKILL.md` | **MIT** | commit **`f49337711b7a`**（2026-08-08）或跟踪 main 时再锁；LICENSE 同年 MIT | **vendor 单目录**到 `bundled-skills/` 或演示工作区 `skills/`；可加 plugin skillIds | 用户：「把这段需求拆成可执行任务」→ 激活 skill → 产出 `tasks/plan.md` / `tasks/todo.md`（路径可按 office 约定改成 `output/planning/`） | 工程向文案英文为主；需薄包装中文 trigger；**不依赖外网 API** → 最易在 CI/离线证明「skill 被用了」 |
| `meeting-notes`（仓内对照） | 会议纪要 | `tooling/workbench-runtime-voltagent/bundled-skills/meeting-notes` | 本仓 | monorepo revision | 已 builtin | 整理笔记 → 审批 → `output/meeting-notes/*.md` | 非「外部开源 Skill」；作 Expert 默认 skill 很好 |
| `guizang-social-card-skill` | 小红书图文/封面组 | [op7418/guizang-social-card-skill](https://github.com/op7418/guizang-social-card-skill) | **AGPL-3.0** | commit **`cf4b810fac1c`**（2026-07-01） | **勿整仓 vendor 进 MIT/商业分发**；可文档引用 + 用户自装；或仅借鉴版式 SOP 自写薄 skill | Agent 生成 3:4 HTML/PNG 组图（需 Playwright/本地渲染） | **许可证传染风险**；能力强但验证切片成本高；CodePilot 作者同源，本地无完整 clone 时用 git pin |
| `xiaohongshu-cover-generator` | 小红书封面（生图） | [freestylefly/xiaohongshu-skills](https://github.com/freestylefly/xiaohongshu-skills) | package.json 写 **MIT**；GitHub `license` 字段 **null** | commit **`ff379c3f76de`** | 复制 `SKILL.md`+`scripts/`；需 `CANGHE_API_KEY` | 主题 → `xiaohongshu-cover-{ts}.png` | 依赖第三方 `api.canghe.ai`；**仓库级许可证元数据不清** → 产品内置前需补 SPDX 确认 |
| `xhs-cover` | 小红书封面（多风格） | [Vivixiao980/xhs-cover-skill](https://github.com/Vivixiao980/xhs-cover-skill) | **未声明** | `25a7279ff369` | 需 OpenAI/Codex 图能力或 Gemini CLI | 18 风格封面 / 局部编辑 | **无许可证 = 不可默认 vendor** |
| `xiaohongshu-ops` | 小红书运营全流程 | [Xiangyu-CAS/xiaohongshu-ops-skill](https://github.com/Xiangyu-CAS/xiaohongshu-ops-skill) | **未声明** | `5b0b80b72613` | 过大（发布/复盘/托管） | 运营流水线 | 超验证切片；许可证不明；含自动化发帖风险 |
| OpenClaw `feishu-fetch-doc` 等 | 飞书文档 SOP | CodePilot 本地 `资料/feishu-openclaw-plugin/package/skills/*` · 上游包 MIT | MIT（插件包） | npm `2026.3.8` 附近 | 可摘单文件改写为 office skill（去 OpenClaw 工具名硬编码） | 「读这篇飞书文档」→ 调 MCP 工具 | 工具名绑定 OpenClaw MCP；需改写才能进 VoltAgent |
| skills.sh / vercel-labs/skills | 生态安装器 | [skills.sh](https://www.skills.sh/docs) · [vercel-labs/skills](https://github.com/vercel-labs/skills) MIT | 安装器 pin 另议 | **发现渠道**，不是验证必需依赖 | `npx skills add …` | 不替代侧车 skills 根 |

**≥1 可验证开源 Skill 的锁定结论：**  
主推 **`planning-and-task-breakdown`（MIT, addyosmani/agent-skills@f49337711b7a）**。  
若产品演示更想要「办公中文交付物」，用仓内 `meeting-notes` 作 **第二可见 skill**（不算外部 OSS，但闭环更贴 office profile）。

---

## 5. Expert 配置包（≥2）

Expert = **可切换配置包**（persona + 默认 Skills + 建议连接器/工具范围），**不是** Supervisor 多 Agent 运行时（map 已定）。

参考形态：

- openworker persona frontmatter（MIT，[andrewyng/openworker](https://github.com/andrewyng/openworker) @`4766e59`）：`id/name/tools/connectors/recommends[]` + body 系统提示 — 见本地 `coworker/personas/builtin/ops.md`。  
- Kun：`design-system` bundled skill + PolyForm 非商业主仓 — **不要** vendor Kun 源码；只借「seed skill + triggers」思路。  
- CodePilot：skills lock / marketplace 思路可参考，主仓 BSL — **不**拷贝运行时。

### 5.1 推荐 Expert 包

#### A. `expert.xhs-cover` — 小红书封面专家（硬性类别）

| 字段 | 建议 |
| --- | --- |
| **id** | `expert.xhs-cover` |
| **显示名** | 小红书封面 |
| **persona 要点** | 中文优先；先澄清主题/受众/风格/是否有素材图；输出 **3:4** 封面文案结构（主标题/副标题/视觉指示）；诚实说明「无图模时只出可渲染 brief 或 HTML 稿」；禁止假装已发布到小红书 |
| **默认 skills** | 验证切片：**自研薄 skill** `xhs-cover-brief`（仓内编写，MIT）**或** 用户自装 `guizang-social-card-skill` / MIT 生图 skill；**不要**默认 AGPL 整仓进发行物 |
| **建议连接器** | 无强制；可选「本地文件/工作区」；**不**绑飞书。未来若要发帖再另议（本轮不做） |
| **来源策略** | Profile 仓内；外部 skill **git URL + pin 仅文档引用**。guizang：`https://github.com/op7418/guizang-social-card-skill` @`cf4b810fac1c`（AGPL — 用户可选安装）。freestylefly MIT 声明 @`ff379c3f76de`（需 SPDX 复核 + `CANGHE_API_KEY`） |
| **可见验收** | 选用 Expert 后发「做一张小红书封面：周末露营清单」→ 对话出现 skill 激活/按 SOP 输出；工作区出现 brief 或图片文件；Fake 模式只展示 Expert 卡片与示例文案 |
| **风险** | 外部生图密钥；AGPL；平台 ToS；无 Browser 发帖能力勿宣传「一键发布」 |

#### B. `expert.office-meeting` — 会议纪要专家（第二 Expert）

| 字段 | 建议 |
| --- | --- |
| **id** | `expert.office-meeting` |
| **显示名** | 会议纪要 |
| **persona 要点** | 结构化：决议 / 待办（负责人+日期）/ 风险 / 开放问题；不编造未出现事实；中文输出 |
| **默认 skills** | `meeting-notes`（必选）；可选 `research-brief` |
| **建议连接器** | **飞书**（`connector.feishu` / `mcp.docs`）— 用于「从飞书文档拉会议材料」；无连接时明确仅用用户粘贴/工作区文件 |
| **来源策略** | 仓内 profile + 已 bundled skill；飞书 SOP 可 **借鉴** OpenClaw `feishu-fetch-doc` 文案（MIT）改写工具名 |
| **可见验收** | 选用后粘贴杂乱笔记 → `meeting-notes` 激活 → 审批写入 `output/meeting-notes/`；若飞书已连接，可演示只读拉文档再整理 |
| **风险** | 写飞书需审批；未授权时不得假成功 |

#### C. （可选第三，非必须）`expert.office-weekly`

周报专家：默认 `weekly-report`；建议连接器飞书日历只读。验证切片 **可省略**。

### 5.2 Expert 包文件形态（实现票用，本票不落地）

建议（对齐 openworker 的「persona ⊇ skill」思路，但 id 用 Expert）：

```text
experts/
  xhs-cover/
    EXPERT.md          # frontmatter: id, name, defaultSkills[], suggestedConnectors[]
  office-meeting/
    EXPERT.md
```

Frontmatter 字段最小集：`id`, `name`, `defaultSkills`, `suggestedConnectors`, `description`；body = persona 系统提示。  
**Task/对话级选用**；自动建议是否需确认 → 留给 map 子票。

---

## 6. 推荐清单总表（验收用）

| id | 显示名 | 来源 URL/路径 | 许可证 | 集成模式 | 可见验收行为 | 风险 / 诚实 notes |
| --- | --- | --- | --- | --- | --- | --- |
| `connector.feishu` | 飞书 | 产品映射：`mcp.docs`/`mcp.feishu` + 可选 `cli.feishu`；MCP 实现 [lark-openapi-mcp](https://github.com/larksuite/lark-openapi-mcp) / `@larksuiteoapi/lark-mcp@**0.5.1**`；CLI 官方 [`@larksuite/cli@**1.0.85**`](https://www.npmjs.com/package/@larksuite/cli)（`lark-cli`）；仓内样板 `tooling/workbench-runtime-voltagent/src/plugin/builtins.ts` | MCP/CLI **MIT**；样板本仓 | **MCP 主 + CLI 辅**；宿主 OAuth/Keychain 复用侧车；CLI 可 `cli_session` | 目录可见；未授权 missing；授权后只读 tool 行；写需审批 | Beta MCP；真租户前置；`feishu-cli` 名是样板不是官方 bin |
| `skill.planning-and-task-breakdown` | 任务拆解 | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `skills/planning-and-task-breakdown/` @**`f49337711b7a`** | **MIT** | vendor/seed 到 skills 根 | list/activate skill；产出 plan/todo 文件 | 英文 SOP；改 output 路径以贴 office |
| `skill.meeting-notes` | 会议纪要 | `tooling/workbench-runtime-voltagent/bundled-skills/meeting-notes` | 本仓 | 已 `skills.office` | 审批后 `output/meeting-notes/` | 非外部 OSS；作 Expert 默认很好 |
| `skill.xhs-cover-ref-guizang` | 小红书图文（外部参考） | [op7418/guizang-social-card-skill](https://github.com/op7418/guizang-social-card-skill) @**`cf4b810fac1c`** | **AGPL-3.0** | 文档链接 / 用户自装；**不**默认 vendor | 用户自装后可出 3:4 组图 | AGPL；渲染依赖重 |
| `skill.xhs-cover-ref-freestylefly` | 小红书封面生图（外部参考） | [freestylefly/xiaohongshu-skills](https://github.com/freestylefly/xiaohongshu-skills) @**`ff379c3f76de`** | 声明 MIT / GH 元数据空 | 可选；需 `CANGHE_API_KEY` | 输出 png | 第三方 API；SPDX 待确认 |
| `expert.xhs-cover` | 小红书封面 | **仓内薄 profile**（待实现票编写）；外部 skill 见上 | profile 本仓 | Expert 配置包 | 选用后封面类对话走默认 skill | 不宣称平台发布 |
| `expert.office-meeting` | 会议纪要 | **仓内薄 profile** + `meeting-notes`；建议 `connector.feishu` | profile 本仓 | Expert 配置包 | 选用后纪要闭环；可选飞书只读 | 无连接时诚实降级 |

---

## 7. 验证切片「先 ship」顺序（Primary）

**P0 — 最小可演示诚实闭环（建议同一实现波次）：**

1. **连接器飞书（产品路径规格 + 侧车装配）：**  
   - 用 `@larksuiteoapi/lark-mcp@0.5.1` 挂到现有 MCP builtin（docs）或专用 feishu MCP plugin。  
   - UI/文案：启用 ≠ 登录；OAuth 复用侧车 `#31` 合同。  
   - 同步文档：将 `cli.feishu` 标为 allowlist 样板，官方 CLI 指向 `lark-cli@1.0.85`。  
2. **开源 Skill：** vendor `planning-and-task-breakdown`（MIT pin 上表）。  
3. **两个 Expert 薄包：** `expert.xhs-cover` + `expert.office-meeting`（仅配置 + 中文 persona；xhs 默认 skill 用 **仓内 MIT 薄 SOP**，外部 AGPL/生图 skill 作可选高级来源写在文档）。

**P1 — 增强（非阻断 map）：**

- `cli.feishu` 对齐 `lark-cli` 真实子命令 allowlist。  
- 从 OpenClaw MIT skills 改写 `feishu-fetch-doc` 为 VoltAgent 工具名。  
- 用户可选安装 guizang（AGPL 自担）。

**明确不做（本切片）：**

- 插件应用商店电商化、远程多租户 Runtime。  
- 小红书自动发布 / 运营托管。  
- 整仓 vendor Kun（PolyForm NC）或 CodePilot（BSL）源码。  
- 把 OpenClaw Feishu channel 当 Workbench 内核。

---

## 8. 本地参考仓库存（调研证据）

| 仓 | 路径 | 许可证 | 对本票有用点 | 勿照搬 |
| --- | --- | --- | --- | --- |
| openworker | `/Users/zhoujw/develop/github/openworker` · [andrewyng/openworker](https://github.com/andrewyng/openworker) @`4766e59` | MIT | Persona frontmatter + `recommends` connectors | Browser connector-only；无飞书 |
| Kun | `/Users/zhoujw/develop/github/Kun` · [KunAgent/Kun](https://github.com/KunAgent/Kun) @`1a6c8f67` | PolyForm Noncommercial | bundled `design-system` skill seed；sidebar 含小红书 **浏览** 扩展 | 非商业许可；不是封面生成 skill |
| CodePilot | `/Users/zhoujw/develop/github/CodePilot` · [op7418/CodePilot](https://github.com/op7418/CodePilot) @`ee38205` | BSL 1.1 | `资料/feishu-openclaw-plugin`（MIT 飞书技能/OAuth 参考）；feishu CLI 调研笔记 | 不 vendor 主仓；OpenClaw 专用 |

---

## 9. 版本 pin 速查

| 构件 | Pin |
| --- | --- |
| `@larksuiteoapi/lark-mcp` | **0.5.1**（npm；git tag `v0.5.1`） |
| `@larksuite/cli` / `lark-cli` | **1.0.85**（npm，调研日） |
| `addyosmani/agent-skills` | commit **`f49337711b7a`**（2026-08-08） |
| `op7418/guizang-social-card-skill` | commit **`cf4b810fac1c`**（参考 only，AGPL） |
| `freestylefly/xiaohongshu-skills` | commit **`ff379c3f76de`**（参考；SPDX 复核） |
| 仓内 builtins / bundled-skills | monorepo 当前 `main` 树；以本文件提交 rev 为准 |

升级策略：验证切片 **锁死 npm 精确版本与 git commit**；升版需重跑 doctor + 一条只读/一条 skill 对话验收。

---

## 10. 对 map #34 的直接输入

- 样例类别来源已可写入 Spec「内置样例清单」。  
- 飞书最终形态建议 Spec 采用：**hybrid，MCP-first，CLI 为 gaps；宿主 OAuth 挂 MCP/user token，不伪装 cli_session**。  
- Expert 许可证策略：默认 skill **MIT 或本仓**；AGPL 仅用户可选。  
- 验收剧本可挂：Composer「+」→ 飞书 OAuth；选 Expert「会议纪要」；激活 OSS「任务拆解」skill。

---

## 11. Sources

- 仓内：`tooling/workbench-runtime-voltagent/src/plugin/builtins.ts`、`bundled-skills/*`、`README.md`、`OPERATOR.md`、`src/plugin/oauth.ts`、`src/plugin/types.ts`  
- [larksuite/lark-openapi-mcp](https://github.com/larksuite/lark-openapi-mcp) · npm `@larksuiteoapi/lark-mcp`  
- npm `@larksuite/cli` · [larksuite/cli](https://github.com/larksuite/cli)  
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)  
- [op7418/guizang-social-card-skill](https://github.com/op7418/guizang-social-card-skill)  
- [freestylefly/xiaohongshu-skills](https://github.com/freestylefly/xiaohongshu-skills)  
- [Vivixiao980/xhs-cover-skill](https://github.com/Vivixiao980/xhs-cover-skill)  
- [Xiangyu-CAS/xiaohongshu-ops-skill](https://github.com/Xiangyu-CAS/xiaohongshu-ops-skill)  
- [skills.sh docs](https://www.skills.sh/docs) · [vercel-labs/skills](https://github.com/vercel-labs/skills)  
- 本地：openworker personas、CodePilot `资料/feishu-openclaw-plugin`、Kun social-media-sidebar / skill-bundled  
