# Spec: Sidecar Plugin System (MCP / Domain CLI / Skills / Auth)

**Status:** ready-for-agent  
**Source:** conversation alignment + design notes; published as GitHub issue



## Problem Statement

Workbench 本机侧车已经能跑 Office Profile（Workspace FS、Skills、可选 MCP），但 MCP 连接器被写死为 docs/calendar 双分支，扩展 GitHub、飞书 CLI 或自研 CLI 都要改核心代码。授权也只有「往 .env 塞密钥」，无法区分「安装插件」与「用户登录 GitHub/飞书」，更无法支撑后续插件机制与安全的凭据生命周期。

从用户视角：我希望像 Codex 那样用「插件包」挂上能力（MCP、领域 CLI、Skills），并能清楚知道要不要登录、登录存在哪、撤销怎么做；同时浏览器仍然不碰密钥，Timeline 仍只走 RuntimePort。

## Solution

在本机 VoltAgent 侧车引入 **Sidecar Plugin 体系**（注册表 + 贡献面 + 安全策略 + 凭据引用），替代写死的 MCP 连接器枚举：

1. **插件**是可版本化的能力包，可贡献：MCP、领域 CLI（如 feishu-cli，不是通用终端）、Skills、可选进程内 Tools、以及 Policy/Auth **声明**。
2. **宿主内核**负责发现、启用、加载、失败隔离、审批默认 fail-closed、把工具挂到 Agent；**不**在浏览器装 MCP/CLI。
3. **授权**与「启用插件」分离：配置只存 SecretRef；开发期可用 gitignore 的 env；产品路径预留 OS Keychain；领域 CLI 优先走 CLI 自有登录（cli_session）。
4. **兼容**：现有 `MCP_DOCS_URL` / `MCP_CALENDAR_*` 等 env 作为 builtin 插件的别名继续可用。
5. 对 UI：仍经 RuntimePort 看工具行与审批；未授权时侧车/结构化状态可表达 `auth=missing`（Timeline CTA 可后置）。

对齐 Codex：插件是 **打包与发现层**，不是重写 MCP Client；hybrid 允许 MCP + 领域 CLI 并存。

## User Stories

1. As a Workbench 用户, I want 启用办公插件后在新对话里用真实工具干活, so that 体验不是只能 Fake/capture。
2. As a Workbench 用户, I want 未配置任何 MCP/CLI 时本地 FS 与 Skills 仍可用, so that 降级诚实且可离线。
3. As a Workbench 用户, I want MCP 连不上时看到失败状态而不是假成功, so that 我知道要修配置。
4. As a Workbench 用户, I want 危险写操作仍要我审批, so that 插件不能静默外发或改云端。
5. As a Workbench 用户, I want 只读工具可配置为免审批（精确工具名）, so that 查文档不必点太多次。
6. As a Workbench 用户, I want 安装飞书相关插件后被告知需要登录或配置, so that 不是工具静默失败。
7. As a Workbench 用户, I want 用 feishu-cli 这类领域 CLI 而不是开放终端, so that 能力边界清晰且更安全。
8. As a Workbench 用户, I want CLI 子命令受允许列表约束, so that Agent 不能拼任意 shell。
9. As a Workbench 用户, I want Skills 教我何时用 MCP 何时用 CLI, so that hybrid 流程可遵循。
10. As a Workbench 用户, I want 默认不把插件 Skills 覆盖我已有工作区文件, so that 自定义不会被冲掉。
11. As a Workbench 用户, I want 密钥永远不出现在聊天和 Timeline 明文里, so that 凭据不泄漏进模型上下文。
12. As a Workbench 用户, I want 浏览器不持有飞书/GitHub 生产密钥, so that 打包产物更安全。
13. As a Workbench 用户, I want 撤销某插件授权后工具不再以我的身份调用, so that 离职或换号可控。
14. As a Workbench 用户, I want 同时启用 GitHub 与飞书插件且互不抢密钥, so that 多连接器可并存。
15. As a Workbench 用户, I want Fake/capture 路径不受插件系统破坏, so that 无 Key 演示仍可用。
16. As a Workbench 用户, I want 中文优先的错误与 doctor 提示, so that 与产品语言一致。
17. As a Workbench 用户, I want 取消 Run 与插件工具调用一致可中断（在宿主支持范围内）, so that 长调用可停。
18. As a Workbench 用户, I want 工具调用仍显示在 Timeline 工具行, so that 可审计 Agent 做了什么。
19. As a Workbench 用户, I want 写类 CLI 默认需要审批, so that 与写文件策略一致。
20. As a Workbench 用户, I want 未授权与「工具执行失败」状态可区分, so that 我知道是登录问题还是业务错误。
21. As an operator, I want 用 env 或配置启用/禁用插件, so that 部署可重复。
22. As an operator, I want doctor 报告缺哪些 env、CLI 是否在 PATH、MCP 是否配置, so that 排障快。
23. As an operator, I want 现有 MCP_DOCS_URL 等变量仍有效, so that 升级不打断已有 .env。
24. As an operator, I want 凭据默认存在用户级运行时目录而非仓库, so that 不会提交密钥。
25. As an operator, I want 开发期继续用 gitignore 的 .env, so that 本地迭代简单。
26. As an operator, I want 产品期可把 secret 放进 OS Keychain（接口预留）, so that 比明文文件更安全。
27. As an operator, I want stdio MCP 子进程只拿到声明的 env, so that 模型 API Key 不串给插件进程。
28. As an operator, I want 模型供应商密钥被硬拒绝进入 child env, so that 即使误配也不转发。
29. As an operator, I want 一个插件失败不影响其它已加载插件, so that 部分降级可用。
30. As an operator, I want 侧车日志打印插件与 auth 状态摘要（无 secret 值）, so that 可观测。
31. As a developer, I want 新增连接器只需加插件清单/ builtin 条目, so that 不必改 Registry 内核循环。
32. As a developer, I want PluginManifest 字段稳定版本化, so that 演进可兼容。
33. As a developer, I want 测试 seam 在 Registry/Policy 对外行为, so that 不绑 VoltAgent 内部类名。
34. As a developer, I want mock MCP host 与假 CLI 二进制做 CI, so that 无飞书账号也能绿。
35. As a developer, I want RuntimePort 事件词表不因插件扩展而膨胀, so that Timeline 投影稳定。
36. As a developer, I want 领域 CLI 用结构化参数 schema 生成 argv, so that 禁止字符串拼 shell。
37. As a developer, I want Skills 以目录根贡献, so that 符合 SKILL.md 生态习惯。
38. As a developer, I want 进程内 Tools 仅允许宿主白名单模块（MVP）, so that 外部 JSON 插件不能任意加载 JS。
39. As a developer, I want Auth 状态机含 missing/connected/expired, so that UI 以后可接。
40. As a developer, I want SecretRef 与 secret 值分离存储, so that 配置可分享、密钥不可分享。
41. As a security-conscious user, I want 工作区 Agent 可读路径不放 token 文件, so that read_file 偷不到登录态。
42. As a security-conscious user, I want HITL 审批与 OAuth/登录正交, so that 身份与动作双重门。
43. As a security-conscious user, I want 默认 fail-closed 的 MCP/CLI 审批, so that 未声明只读则全要批。
44. As a security-conscious user, I want 撤销绑定后刷新状态, so that 旧 token 不再被注入。
45. As a product owner, I want 不宣称多租户生产集群 Runtime, so that 模板诚实。
46. As a product owner, I want 插件机制对齐 Codex 打包思路, so that 后续市场/目录发现可接。
47. As a product owner, I want MVP 不做完整浏览器 OAuth, so that 范围可控但仍可本地 PAT/CLI 登录。
48. As a product owner, I want 远程 MCP OAuth 作为后置阶段, so that 架构预留不阻塞注册表。
49. As a QA engineer, I want doctor 与 load 结果可断言, so that 回归稳定。
50. As a QA engineer, I want Fake Runtime 集成测不依赖插件, so that CI 默认路径简单。
51. As a template maintainer, I want office 相关 MCP env 迁为 builtin 插件别名, so that 行为连续。
52. As a template maintainer, I want 文档说明 auth 模式与存储位置, so that 运维可复现。
53. As a Workbench 用户, I want 同一 Task 多轮仍可用插件工具, so that conversation 与 taskId 对齐。
54. As a Workbench 用户, I want 插件工具失败有中文可读原因, so that 可自助恢复。
55. As an operator, I want PLUGIN_PATHS 后续可发现本地 plugin.json, so that 外部包可不改核（阶段交付）。
56. As a developer, I want 宿主 list/doctor 命令属于核而非插件 contributes, so that 插件不能乱挂全局 CLI。
57. As a Workbench 用户, I want GitHub 类 hybrid（连接器+gh）在设计上可表达, so that 不强迫单一通道。
58. As a security-conscious user, I want 不把 refresh token 打进日志, so that 排障也不泄密。
59. As a product owner, I want UI 插件与侧车插件分轨, so that 前端扩展不污染 Runtime。
60. As a developer, I want 本 Spec 的测试 seam 尽量少且高, so that 实现可演进。

## Implementation Decisions

### Architecture & seams

1. **Primary test seam: PluginRegistry（对外行为）**  
   输入：env + host config + plugin sources。  
   可观察输出：enabled 插件列表、每插件 status（disabled/loaded/failed）、auth status（none_required/missing/connected/expired/error）、聚合 tool 名称列表、skill roots、disconnect 副作用（可 mock）。  
   这是最高装配 seam；理想上集成测主要打这里。

2. **Secondary seams（保持薄）：**  
   - **SecurityPolicy**：纯函数——给定 tool 名/命令声明 → 是否 needsApproval；给定 childEnv 请求 → 过滤后的 env（无 secret 值日志）。  
   - **AuthStore / SecretResolver**：SecretRef → 解析结果（测试用 memory 后端）；不测 OS Keychain 实现细节。  
   - **CliInvocation**：allowlist 下 argv 构造与拒绝非法调用（mock exec）。  
   - **McpContributionLoader**：可注入 mock MCP host（与现有 loadOfficeMcpTools 测试同构）。

3. **Non-seam / 禁止下沉：** RuntimePort 协议词表、Timeline DOM、VoltAgent 内部类名。现有 RuntimePort 保持唯一 UI↔Runtime 边界；插件只增加侧车 Agent 工具面。

4. **Renderer** 不引入插件 SDK、不读密钥；可选后续仅展示侧车返回的 auth 状态摘要。

### Plugin contribution model（对齐 Codex 打包层）

5. 插件是 **打包与注册** 层，不是 MCP 协议重实现；MCP Client 继续用 VoltAgent 能力。
6. MVP contributes：**mcp**、**cli（领域 CLI）**、**skills**、可选 **tools**、**policy/auth 声明**。
7. **领域 CLI** ≠ 终端：固定可执行文件 + 子命令 allowlist + 结构化参数生成 argv（execFile），禁止 shell 字符串拼接。
8. **宿主运维 CLI**（list/doctor/enable）属于核，不作为插件 contributes 主类型（MVP）。
9. Skills 以目录根贡献；默认不覆盖用户已有 workspace skills（rootPaths 优先；seed 仅 missing-only 可选）。
10. 外部 JSON 插件 MVP **不**加载任意 JS；进程内 tools 仅 builtin 白名单模块。

### Manifest & registry

11. Manifest schemaVersion = 1；含 id、name、version、kind（builtin|local）、enabledByDefault、contributes。
12. PluginRegistry：discover（builtin + 可选路径）、enable 解析、隔离加载、聚合 tools/skills、统一 disconnect。
13. 单插件失败 → 该插件 failed，其它继续（降级）。
14. 今天的 docs/calendar MCP env 映射迁为 **两个 builtin 插件**（或一个 hybrid 包内两条 mcp），保留 env 别名兼容。
15. 后续阶段：PLUGIN_PATHS 发现 plugin.json；市场/动态模块另阶段。

### Authorization（已锁定建议）

16. **启用插件** 与 **用户授权** 分离；状态独立可观测。
17. **MVP 凭据：** SecretRef 抽象 + **gitignore .env / process env** 解析（env_ref）；**Keychain 接口预留**、实现可 stub。
18. **远程 OAuth 2.1：** 架构预留 credential kind=oauth2；**实现后置**。MVP 用 PAT/static_bearer（经 env_ref）与 **cli_session**（CLI 自有登录）。
19. **存储位置：** 用户级默认 `~/.uilab/runtime/`（或等价）存非密配置与绑定；密钥不进仓库、不进 Agent 可读写工作区根。
20. Credential kinds：env_ref、static_bearer、oauth2（后置）、cli_session、app_client。
21. 配置只存引用（env 名、keychain 账户 id）；secret 值仅 secret store / env。
22. 注入仅发生在侧车子进程（stdio MCP / CLI）；浏览器与 RuntimePort 载荷不含 secret。
23. 模型供应商密钥 **硬拒绝** 进入 child env（即使误列入 childEnvKeys）。
24. Auth 与 HITL 审批正交：未登录 → auth_missing；已登录写操作仍可 needsApproval。
25. doctor/list 输出中文可读提示（如 loginHint、缺 env 名），永不打印 secret 值。
26. 未授权时结构化状态 `auth=missing`；Timeline CTA 可后置，不阻塞 Registry。

### Security defaults

27. MCP tools 默认全部 needsApproval；仅 exact 只读名可免批（全局 env 与插件声明合并；默认内置白名单为空）。
28. CLI 命令默认 needsApproval；readOnly 声明可放宽。
29. 真实 Tool 实例必须能设置 needsApproval（赋值或 createTool 重包）。
30. 工作区路径安全沿用现有 fail-closed 路径辅助；CLI cwd 默认 workspace。

### Assembly & Runtime

31. create-agent / 装配变薄：profile 工作区 + memory/summarization + Registry 聚合。
32. 工具事件仍经现有 fullStream→Envelope→Timeline 路径。
33. Fake Runtime 与 capture 路径默认不加载侧车插件（或 no-op）。
34. conversationId 继续对齐 taskId（既有行为）。

### Phasing inside this Spec’s delivery expectation

35. **必须交付（相对本 Spec 可拆 ticket）：** Registry + Policy + builtin 迁移 MCP + SecretRef/env_ref + doctor 级状态 + 兼容 env。  
36. **同 Spec 设计但可第二批 ticket：** 领域 CLI executor、plugin.json 目录发现、运维 list/doctor 命令。  
37. **明确后置：** OAuth 浏览器流、Keychain 真实现、多租户 vault、UI 插件、市场。

## Testing Decisions

### What makes a good test

- 只断言 **对外可观察行为**：Registry 加载结果、auth 状态枚举、tool 名列表、needsApproval 布尔、argv 构造、env 过滤结果、失败隔离。
- **不**断言 DOM、CSS、真实飞书/GitHub 账号内容、VoltAgent 内部私有字段。
- Secret 测试用 memory AuthStore；永不要求真实 keychain。
- Mock MCP host / fake CLI binary；CI 无外网账号。

### Modules / layers under test

1. **PluginRegistry**（主 seam）：启用集、隔离失败、聚合 tools/skills roots。  
2. **SecurityPolicy**：审批与 child env 过滤。  
3. **AuthStore/SecretResolver（env_ref）**：引用解析、缺失、清除绑定。  
4. **McpContributionLoader**：disabled/connected/failed（空 tools）。  
5. **CliInvocation**（若本迭代包含）：allowlist 接受/拒绝。  
6. **装配冒烟**：office profile 在无插件 env 下仍可构建 Agent；有 mock 插件时 tools 出现。  
7. **回归：** 既有 workspace 路径安全、minimal DIY symlink、Fake 路径不破。

### Prior art

- 侧车 node:test：office-mcp、workspace-root、office-skills、office-runtime-defaults、tools。
- Workbench vitest：voltagent-runtime-adapter、runtime-honesty。
- 保持与上述风格一致的 table-driven 状态断言。

## Out of Scope

- 浏览器 UI 插件市场与面板扩展。
- 修改 RuntimePort 事件类型全集或投影内核语义。
- 远程多租户生产 Runtime / 托管密钥 vault 产品化。
- MCP OAuth 2.1 完整宿主浏览器流与自动 refresh（设计保留，实现后置）。
- OS Keychain 的完整生产硬化（接口预留即可）。
- 任意远程下载并执行插件 JS。
- 通用 shell/terminal 工具。
- 替换 Fake Runtime / capture densify。
- Admin `uilab-admin init` 脚手架与侧车插件混为一体。
- 桌面 RPA、邮件群发等 Office 非目标能力。

## Further Notes

### Locked product decisions (from alignment)

- MVP 凭据：SecretRef + env；Keychain stub。  
- MVP 授权 UX：PAT/env + 领域 CLI 自有登录；OAuth 后置。  
- 凭据默认用户级全局，不进 git、不进 Agent 工作区明文。  
- 插件贡献：MCP + 领域 CLI + Skills + 可选 Tools + Policy/Auth 声明。  
- 参考 Codex：打包层、hybrid、skills 目录、host 管权限与 client。

### Design docs already in repo (informative)

- sidecar-plugin-architecture.md  
- sidecar-plugin-authorization.md  

实现以 **本 issue Spec** 为准；上述 docs 为背景，冲突时以本 Spec 的 Implementation Decisions 为准。

### Seams recap for implementers

**Primary:** PluginRegistry public behavior.  
**Secondary:** SecurityPolicy, AuthStore(env_ref), loaders with injected ports.  
**Unchanged primary product seam for UI:** RuntimePort.

### Suggested follow-up tickets (optional split)

1. Registry + Policy + MCP builtin migration + env_ref  
2. Domain CLI executor  
3. plugin.json discovery + doctor CLI  
4. OAuth/Keychain production backends  

