# Spec: Sidecar Plugin product follow-ups (OAuth / Keychain / Auth inject / vault)
**Issue:** https://github.com/xiaowen-0725/uilab-admin/issues/26  
**Status:** planning (ready-for-agent)  
**Parent MVP:** #17 (closed)


## Problem Statement

Sidecar Plugin MVP（#17–#25）已交付：PluginRegistry、MCP/Skills/领域 CLI、env_ref 授权状态、PLUGIN_PATHS 声明式发现、list/doctor。本地侧车可跑 Office 装配，且经对抗修复后 child env 闭集、local 强制审批等硬边界已落地。

但产品级「用户登录 / 凭据生命周期 / 安全存储 / 市场」仍未做。当前体验仍是：

- 凭据主要靠 gitignore 的 `.env` 与 CLI 自有登录（`cli_session` 探测）；
- **启用插件 ≠ 真实注入身份**：Auth 状态可 `connected`，MCP HTTP 仍直接读 env，Binding clear 不能真正撤权；
- Keychain 仅为 stub；OAuth 2.1 浏览器流与 refresh 未实现；
- 无用户级持久绑定目录、无撤销 UX、无 Timeline「去登录」CTA、无插件市场。

用户视角：我希望像 Codex / 成熟 Agent 宿主那样，**安全地登录 GitHub/飞书、看清已授权什么、能撤销，且密钥永不进浏览器与 RuntimePort**——这些能力需要在 MVP 之上单独规划，避免与已 ship 的 Registry 边界混谈。

## Solution

单独规划 **Sidecar Plugin 产品后置能力包**（本 Spec），在不破坏 MVP 合同的前提下分阶段交付：

1. **Auth 注入与撤销一致**：status 与真实 MCP/CLI 子进程身份一致；clear/revoke 使调用失效。
2. **OS Keychain 生产后端**：SecretRef `keychain` 真读写；配置仍只存引用。
3. **远程 MCP OAuth 2.1 + PKCE**：宿主浏览器流 + refresh；token 进 Keychain，不进工作区。
4. **用户级持久绑定与 doctor/CTA**：`~/.uilab/runtime`（或等价）非密配置；可选 Timeline/Context 登录提示（后置 UI 可薄）。
5. **可选扩展**：多主体 vault 注入、builtin 白名单进程内 tools、插件市场（更后）。

**诚实边界不变：** 本机侧车 ≠ 远程多租户生产 Runtime；Fake/capture 路径不加载侧车插件。

## User Stories

1. As a Workbench 用户, I want 登录 GitHub/飞书后工具真正带上我的身份, so that doctor 显示 connected 时调用不会 401。
2. As a Workbench 用户, I want 撤销授权后立即失效, so that 删 binding / 登出不是摆设。
3. As a Workbench 用户, I want 密钥进 OS Keychain 而不是长期明文 .env, so that 笔记本丢失时更安全。
4. As a Workbench 用户, I want 远程 MCP 走 OAuth 登录而不是手贴 PAT, so that 体验像现代 SaaS 连接器。
5. As a Workbench 用户, I want OAuth token 自动 refresh, so that 不会莫名其妙断连。
6. As a Workbench 用户, I want 看清每个插件的登录状态与 loginHint, so that 我知道下一步该做什么。
7. As a Workbench 用户, I want Timeline 或 Context 提示「未登录」, so that 不必只靠终端 doctor。
8. As a Workbench 用户, I want 凭据不出现在对话与 RuntimePort 事件里, so that 模型与 UI 拿不到 secret。
9. As a Workbench 用户, I want 多个 MCP/CLI 插件各自独立授权, so that 飞书与 GitHub 不互相泄漏。
10. As a Workbench 用户, I want 同一身份跨 Task 复用, so that 不必每个对话重新登录。
11. As a Workbench 用户, I want 可选「仅本工作区」绑定, so that 客户项目与个人账号隔离（若产品需要）。
12. As an operator, I want 持久化非密绑定配置, so that 重启侧车后状态仍在。
13. As an operator, I want doctor 报告 Keychain/OAuth 缺失与过期, so that 排障不猜。
14. As an operator, I want list/doctor 永不打印 token 值, so that 日志可进 CI。
15. As an operator, I want 明确 storage 路径与权限, so that 备份与卸载可控。
16. As an operator, I want 迁移路径：从 .env 迁到 Keychain, so that 不打断现有演示。
17. As a security-conscious user, I want child env 继续闭集, so that OAuth/Keychain 实现不回退到 process.env 合并。
18. As a security-conscious user, I want PLUGIN_PATHS 本地插件仍强制审批, so that 市场落地前信任边界清晰。
19. As a security-conscious user, I want OAuth state/PKCE 防 CSRF, so that 本地回调不能被劫持。
20. As a security-conscious user, I want refresh token 与 access token 分权限存储, so that 泄露面最小。
21. As a developer, I want SecretRef 形状不变, so that MVP 清单与测试可渐进扩展。
22. As a developer, I want AuthStore 可注入 fake 后端, so that CI 无真实 Keychain/IdP。
23. As a developer, I want MCP loader 经统一「resolve credentials for resource」入口, so that 注入点只有一处。
24. As a developer, I want cli_session 与 oauth2/env_ref 共用 status 枚举, so that doctor 一致。
25. As a developer, I want auth=expired 真实产生, so that 不是死类型。
26. As a developer, I want 不改 RuntimePort 词表即可接 CTA, so that 投影内核稳定（可用既有文本/capability 诚实字段）。
27. As a product owner, I want 分阶段交付（Keychain → OAuth → vault）, so that 不阻塞当前本地演示。
28. As a product owner, I want 插件市场后置, so that 先做安全登录再做分发。
29. As a product owner, I want 明确 Fake 路径永不碰 OAuth, so that 模板离线可测。
30. As a Workbench 用户, I want 登录失败有中文可读原因, so that 不面对原始 OAuth 错误。
31. As a Workbench 用户, I want 可切换多账号（后置）, so that 工作与个人分离。
32. As an operator, I want `plugin auth login|logout|status` 类运维命令（或扩展 doctor）, so that 不必手改 JSON。
33. As a developer, I want 对抗测试覆盖「connected 必须伴随可注入材料」, so that status 与现实不漂移。
34. As a security-conscious user, I want 工作区 Agent 可读写路径下永不落 token 文件, so that 工具读文件偷不到密钥。
35. As a product owner, I want 与现有 authorization 设计文档对齐, so that 不平行发明第二套凭据模型。

## Implementation Decisions

### Seams（测试与装配）

1. **Primary seam: AuthStore / SecretResolver 公共行为**  
   - 解析 SecretRef → 材料（测试用 memory；产品用 Keychain）。  
   - `resolveAuthStatus` / revoke / list bindings。  
   - **「connected ⇒ 可对子进程/HTTP 注入」** 成为可测不变量。
2. **Secondary seam: PluginRegistry.load 注入点**  
   - MCP HTTP：Authorization / headers 来自 AuthStore，而非仅 env 直读。  
   - CLI/stdio：child env 仍经 SecurityPolicy 闭集；材料只进入 allowlisted keys。  
3. **Unchanged primary UI seam: RuntimePort**  
   - 不扩展密钥字段；可选后置：capability/status 摘要字符串（无 secret）。  
4. **Operator surface** 扩展 list/doctor（及可选 `auth login|logout`），复用同一 AuthStore，不平行实现。

### 分阶段（建议 ticket 切分）

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| **A. Auth inject + revoke 一致** | Binding/env/Keychain 材料统一 resolve；MCP loader 注入；clear 后调用失败；`auth=expired` 有产生路径 | MVP Registry |
| **B. OS Keychain 生产后端** | macOS Keychain（及预留 Linux/Windows）；stub 状态改为 unsupported vs missing 可区分 | A 的 SecretRef |
| **C. 持久绑定配置** | 用户级目录存非密 AuthBinding；不进 git、不进 workspace | A |
| **D. MCP OAuth 2.1 + PKCE** | 浏览器/系统回调、state、refresh；token → Keychain | B+C |
| **E. 薄 UI CTA** | Context/Timeline 展示 auth=missing + loginHint（可选） | A，可不堵 D |
| **F. 多主体 vault（可选）** | 1Password/Infisical 类注入；多租户明确非本机侧车目标时可砍 | B+C |

### 合同与约束

5. **SecretRef 后端**：保留 `env` / `memory` / `keychain`；禁止在 manifest/plugin.json 写 secret 值。  
6. **CredentialKind**：`env_ref`、`static_bearer`、`cli_session`、`app_client`、`oauth2`（实现 D 阶段）。  
7. **SecurityPolicy**：继续 fail-closed；child env **禁止** `{...process.env, ...}` 回潮；local PLUGIN_PATHS 继续强制 needsApproval。  
8. **status 与注入**：`connected` 仅当 resolve 得到非空材料（或 cli_session 探测成功且可执行）；禁止「假 connected」。  
9. **存储位置**：默认用户级 `~/.uilab/runtime/`（或文档锁定等价路径）；密钥永不进 Agent workspace 根。  
10. **OAuth**：宿主为 client；resource 为 MCP server；AS 发现与 scopes 来自插件 auth 声明；refresh 在侧车，不在 Renderer。  
11. **cli_session**：仍优先委托领域 CLI 自有登录；doctor/statusCommand 保持 allowlist 安全校验。  
12. **模块归属**：侧车 `plugin` 核（AuthStore、Registry 注入）；不进 `archetypes/agent-workbench` 浏览器包。  
13. **文档**：更新 OPERATOR/README；对抗回归用例写入 evidence。  
14. **与 #17 关系**：#17 MVP 保持 closed；本 Spec 为 **product follow-up**，不重开 MVP 范围。

## Testing Decisions

### What makes a good test

- 只测 **可观察行为**：auth 状态枚举、注入后的 mock transport headers/env keys（无值断言可用 sentinel）、revoke 后失败、doctor 无 secret 子串、OAuth fake AS 的 code 交换。  
- **不**测 Keychain 厂商私有 API 细节、真实飞书/GitHub 账号、DOM 样式。  
- CI 使用 memory SecretStore + fake OAuth AS + mock MCP host。

### Modules under test

1. **AuthStore / SecretResolver**（主 seam）：env/memory/keychain(fake)、revoke、expired。  
2. **Registry + MCP loader 注入**：connected 时 header 出现；missing 时不伪造；clear 后消失。  
3. **SecurityPolicy**：OAuth/Keychain 路径下 child env 仍闭集。  
4. **Operator doctor/list**：OAuth/Keychain 状态中文可读、无 secret。  
5. **回归**：既有 plugin 120+ 单测；Fake Runtime honesty 不回归。

### Prior art

- `tooling/workbench-runtime-voltagent` node:test：`secret-store`、`auth-status`、`cli-loader`、`operator`、`registry`。  
- 对抗 evidence：`docs/evidence/sidecar-plugin-adversarial-review-2026-08-06.md`。

## Out of Scope

- 重做 #17 MVP Registry/MCP/Skills/CLI 基础（已 ship）。  
- 远程多租户生产 Agent Runtime / 多租户托管 vault 产品化（可仅预留接口）。  
- 浏览器内执行 MCP/CLI/OAuth token 处理。  
- 任意远程下载并 `eval` 插件 JS / 通用 shell 工具。  
- 完整插件市场、计费、签名公证（可另 Spec）。  
- 修改 RuntimePort 事件类型全集或 Fake densify 语义。  
- Admin `uilab-admin` 与侧车插件脚手架合并。  
- 桌面 RPA、邮件群发等 Office 非目标能力。

## Further Notes

### 背景与真源

- MVP Spec：#17（closed）+ `docs/plans/sidecar-plugin-system-spec.md`  
- 授权设计：`docs/plans/sidecar-plugin-authorization.md`（P0–P4 阶段表）  
- 架构：`docs/plans/sidecar-plugin-architecture.md`  
- MVP 收口：`docs/evidence/sidecar-plugin-system-closeout-2026-08-06.md`  
- 对抗：`docs/evidence/sidecar-plugin-adversarial-review-2026-08-06.md`（P0 env 已修；注入/Keychain/OAuth 仍后置）

### Suggested follow-up tickets（实现时可 /to-tickets）

1. Auth inject + revoke 与 MCP/CLI 加载一致（含 connected 不变量测试）  
2. OS Keychain 生产后端 + 迁移自 env  
3. 持久 AuthBinding 存储（用户级目录）  
4. MCP OAuth 2.1 PKCE + refresh  
5. Operator `auth login|logout|status` + 可选 UI CTA  

### Seams recap

**Primary:** AuthStore / SecretResolver 公共行为（status + material + revoke）。  
**Secondary:** PluginRegistry 加载时的凭据注入。  
**Unchanged UI:** RuntimePort（无 secret；可选诚实状态摘要）。
