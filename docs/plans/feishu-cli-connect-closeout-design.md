# 实施设计：飞书 CLI 一键连接收口（#43）

**Status:** ready-for-implementation  
**Map:** https://github.com/xiaowen-0725/uilab-admin/issues/43  
**Parent:** [`workbench-capability-permissions-milestone-spec.md`](./workbench-capability-permissions-milestone-spec.md)（Spec-β 的 Should closeout）· [`workbench-capability-surface-spec.md`](./workbench-capability-surface-spec.md)（父合同）  
**Acceptance:** [`workbench-capability-surface-acceptance.md`](./workbench-capability-surface-acceptance.md)（G.\* 已 ☑；2.1 / 2.3 仍 ☐）  
**Review:** 2026-08-12 代码复核 — 架构已齐（device flow / Connected 语义 / Renderer 无凭据），缺口为验收证据包 + 边界 UX + 轮询预算错配

---

## 判断（为什么是这三件事）

飞书 CLI 连接的架构主链路已实现且正确：

- 侧车持有完整 device flow（bootstrap `config init` → `auth login --no-wait --json` → `--device-code {{deviceCode}}` 补全）；device_code / token 不出侧车
- Connected 语义 = `lark-cli auth status --json --verify` 且 `identities.user.available === true`（bot ready 不冒充用户已连）
- Renderer 只开 verificationUrl + 轮询 snapshot；黄金路径 G.1–G.7 已有证据

因此 **不重做任何飞书 CLI 能力**。本设计只收口三件事：

## Slice A — 轮询预算错配修正（代码，新发现的真缺陷）

**问题：** `waitForConnectorAuth` 默认 `maxAttempts=80 × intervalMs=1500ms ≈ 2 分钟`；Composer `handleStartAuth` 调用时未覆盖默认值。但飞书 CLI 流程的 bootstrap 与 authorization 超时均为 **10 分钟**（首次连接还要先走 CLI 应用配置页）。首次用户容易超 2 分钟 → 侧车流程仍在正常等待，Renderer 已放弃并提示「尚未检测到授权完成」，违背 #43「一键、无需手工操作」。

**修法（推荐组合）：**

1. 收到 `authorization_required` 转移（含 URL 更新，如 configure → authorize 换阶段）时**重置尝试计数**——用户仍在推进流程就不该倒计时；
2. 整体上限对齐 CLI 流程量级（约 10–12 分钟总预算），避免真死等；
3. 放弃时保留现有兜底文案（「刷新连接状态」重试）不变。

**测试：** 扩 `wait-for-connector-auth` 单测——多次 `authorization_required` 转移下不提前放弃；无转移且未连接时按总预算放弃。

## Slice B — 边界 UX 收口（acceptance 2.1 / 2.3）

### B1 取消登录（2.1）

现状没有任何取消入口：用户只能关授权窗口，Renderer 仍在轮询。注意**不能**把「授权窗被关」当取消信号（用户可能在窗内完成授权后自行关窗）。

- Composer 在授权等待期间提供显式「取消登录」操作（可放在 notice 区或连接器子菜单）
- 取消 = 停止本次 `waitForConnectorAuth` 轮询 + 中文提示「已取消」+ 状态保持未连接
- 侧车侧：活动 CLI auth 会话由既有 `reconcile` / 会话超时自然清理；如需要，可暴露显式 abort，但**不强制**本切片实现侧车新 API——以 Renderer 停止等待为最小合格线

### B2 解绑后可区分（2.3）

验收语义：解绑 / `lark-cli auth logout` 后——Task 选用芯片保留；连接器显示未连接；后续调用失败必须**可区分「未登录」**（而非笼统 runtime error）。

- 侧车已有未登录中文提示（credential-resolver 的 cli_session 提示）；确认该 message 能沿 Runtime 事件投影完整到 Timeline（不得被吞成通用错误）
- Renderer/Timeline 断言：未连接时的工具失败行文案包含可识别的「需先完成 CLI 登录」类信息
- 若现状已满足，仅补自动化断言并勾选 2.3；不为达标而重构

## Slice C — #43 人工验收证据包（主交付）

固定可重复剧本，产出落 `docs/evidence/feishu-cli-connect-acceptance-<date>.md`：

1. 起点：干净态或 `not_configured`（记录如何构造，例如临时 `LARKSUITE_CLI_CONFIG_DIR`）
2. 「+」→ 飞书 → 连接：自动衔接应用初始化与账号授权；**用户全程不手抄 device code / token**
3. 浏览器完成真实用户授权 → snapshot 刷新 → Connected 绿点（`identities.user.available=true`）
4. Task 选用飞书 → 提交 Turn → Skill + `execute_command(lark-cli docs …)` → Host 审批 → 真读一份获准文档
5. 关闭 Task 开关 → 下一 Turn 无 `lark-cli` scope 且**账号仍 Connected**；重新开启 → 恢复
6. 全程抽查：Renderer / HTTP / 日志 / 截图无 device code、token、应用密钥

**注意：** 步骤 3 需真人浏览器授权；实施 Agent 应在该步骤明确暂停并请用户接管，不得伪造 Connected。

## 完成定义

- [ ] Slice A 修正 + 单测
- [ ] B1 取消登录（UI + 测试 + 中文文案）
- [ ] B2 解绑区分（断言补齐；必要处最小修）
- [ ] Slice C 证据文档 + #43 勾选 + acceptance 2.1/2.3 更新
- [ ] `pnpm --filter @uilab/agent-workbench typecheck/test`、`pnpm check:workbench`、`pnpm check:foundation`；侧车改动则加 sidecar 测试
- [ ] 不泄漏凭据；不新增跨 Module 内部引用

## Out of Scope

- 飞书 MCP / Hybrid / 宿主 OAuth inject
- 企微、钉钉等新 Provider
- 默认权限预设（Spec-β Must，另行实施）
- 重构 PluginRegistry / RuntimePort / Capability Module 结构
