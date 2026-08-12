# Spec: Workbench 默认权限 + Capability 收口（Spec-β）

**Status:** drafted（2026-08-12b 口径收缩：权限为主；连接器不重做）  
**Map:** https://github.com/xiaowen-0725/uilab-admin/issues/88  
**Vocabulary:** root [`CONTEXT.md`](../../CONTEXT.md)  
**Parent contract:** [`workbench-capability-surface-spec.md`](./workbench-capability-surface-spec.md)  
**Sibling:** [`workbench-project-home-and-host-spec.md`](./workbench-project-home-and-host-spec.md)（Spec-α）  
**Code review:** 2026-08-12 — `modules/capabilities` + 侧车 `plugin/**` 已具备「+」/chips/管理面/飞书 CLI / GitHub MCP / effective；**默认权限产品面缺失**  
**ADR:** [0016](../adr/0016-capability-surface-module-and-snapshot-port.md) · [0017](../adr/0017-provider-owned-plugin-contract-and-dynamic-discovery.md)  
**Acceptance anchor:** Workbuddy（Composer 旁「默认权限」为 must；连接器路径以既有实现 + acceptance 收口）  
**Grilling / 修订:** 2026-08-12 原划 Q8 的 4+5+6；经代码审查后 **5+6 降为 closeout**，**4 为唯一主交付**；与 α 并行、互不阻塞

**2026-08-12c（实施前代码诊断 · UI 已有壳，缺接线）:**

- **Composer 权限 UI 入口已存在但为本地装饰（fixture）：** `ComposerAccessChip`（4 档：只读/需确认/作用域自动/完全访问，title 明示「（本地）」）与 `ComposerAutonomyDial`（4 档：仅建议/先询问/作用域自动/完全自动，二者联动）。两者仅是 `composer.tsx` 内 `useState`——不持久化、不分 Task、不进 submit payload、对 Runtime 零影响；且**默认值为最激进档「完全访问/完全自动」**，与实际行为（全部 fail-closed 审批）相反，存在诚实性缺陷。
- **门闸真源在侧车且全部静态 fail-closed：** `security-policy.ts`（decideToolNeedsApproval / decideCliCommandNeedsApproval）+ `create-agent.ts` 的 `officeFilesystemToolConfig()`（读免审；write/edit/delete/rmdir/mkdir 审批；`execute_command` 永远审批，系统提示词同样写死）。approval.requested → Approval Dock → resolve → resume 全链路已通。
- **per-Task 状态管道有成熟同构模式可照抄：** capability selection 的 `selection-store`（侧车 per-Task）→ HTTP routes → snapshot 下发 → Turn 提交捕获 immutable context（`CAPABILITY_CONNECTOR_IDS_CONTEXT_KEY`）→ `tool-gate` invoke 时判定。默认权限预设按同构管道实现（preset-store → snapshot → Renderer 读写 → Turn context → 门闸消费）。
- **因此 Must 的表述修正：** 不是「新增入口」，而是 **(a) 收敛两套重叠假控件为一个「默认权限」预设模型；(b) 把预设接到审批链路产生可观测差异；(c) 默认档改为诚实的「默认」而非「完全访问」**。UI 工作量小于原估，接线与测试为主体。

**2026-08-12d（框架勘察）：** 侧车 `needsApproval` 无 Turn 上下文（VoltAgent 传 `experimental_context: void 0`），12c 设想的「officeFilesystemToolConfig 参数化」不可行。

**2026-08-12e（融合 VoltAgent 权限调研 · v2）：** 曾按 `allow/ask/deny` 三档分工（deny 走侧车 `onToolStart` hook）。

**2026-08-12f（产品决策 · v3 定稿两档）：** 收敛为两档「帮我批准（`auto-approve`，默认）/ 完全访问（`full-access`）」，对齐 ChatGPT 语义；只读档与「请求批准」（每次都问）档取消并记入 deferred。实现回到**纯渲染端审批自动应答**（侧车零改动、fail-closed 基线不变）：`auto-approve` 自动批准文件写白名单、命令与未知工具弹 Dock；`full-access` 全部自动批准（命令仍在沙箱围栏内执行）。见附录 A 与 [`workbench-default-permissions-design.md`](./workbench-default-permissions-design.md)。

---

## Problem Statement

对照 Workbuddy，Composer 旁应有可理解的 **默认权限** 预设；今天只有 Runtime 单次审批（Approval Dock / `approval.*`），没有多档预设入口，也无法把「偏保守 / 默认 / 偏自动」映射到既有门闸。

Capability「+」、chips、管理面、飞书 CLI 黄金路径与 Plugin 体系 **已经落地**。若把 Spec-β 写成「再实现一套连接器」，会重复劳动并掩盖真正缺口。需要的是：**补默认权限**，并把既有连接器路径 **验收收口**，避免半成品模板叙事。

## Solution

**β = 默认权限产品缝（must）+ Capability/飞书 acceptance closeout（should）+ 可选 GitHub Broker 证据。**

1. **Must：** Composer chrome「默认权限」中文预设（12f 定稿两档：帮我批准 / 完全访问）；切换后对后续 Turn 审批打扰有可观测影响；经既有 approval / 工具门闸生效，不新造事件宇宙；不重开 Capability Module。  
2. **Should（closeout，不重做）：** 用既有「+」/选用/飞书路径把父 Spec acceptance 剩余项勾闭合；回归测试证明选用仍有效。  
3. **Optional：** GitHub 真实 Broker/App 证据（加分，不挡 β 主门）。  
4. 与 Spec-α「项目」选择器可并列布局；不实现 Projects Home；不做企微/钉钉矩阵。

**诚实边界：** 预设 ≠ 企业策略引擎；飞书 CLI ≠ OAuth inject；Plugin 可扩展企微（CLI 或 MCP）但不在本切片交付。

## User Stories

### Must — 默认权限

1. As a 桌面用户, I want 在 Composer 附近看到「默认权限」入口, so that 我像用 Workbuddy 一样先定 Agent 动手尺度。  
2. As a 桌面用户, I want 在少量清晰预设间切换默认权限, so that 我不必理解底层策略 DSL。  
3. As a 桌面用户, I want 当前默认权限预设始终可见, so that 发送前知道会不会频繁审批打断。  
4. As a 桌面用户, I want 默认权限影响后续 Turn 的审批打扰程度, so that 预设不是纯装饰。  
5. As a 桌面用户, I want 高风险写盘/外呼仍可按预设要求确认, so that 「偏自动」也不会变成无边界静默越权。  
6. As a 桌面用户, I want 权限文案为中文, so that 非开发用户也看得懂。  
7. As a 桌面用户, I want 权限预设与单次 Timeline 审批并存, so that 「默认」之外仍能处理例外请求。  
8. As a 桌面用户, I want 切换 Task/Project 后预设行为有定义, so that 不会悄悄沿用上个 Task 的激进预设。  
9. As a 模板维护者, I want 默认权限经既有 Runtime/审批缝生效, so that 不平行造第二套审批总线。  
10. As a 模板维护者, I want 预设作用域明确（推荐每 Task）, so that 刷新后行为可预期。  
11. As a 派生应用开发者, I want 预设集合可经 Profile 微调文案/默认项, so that 品牌应用能改默认打扰度。  
12. As an Agent 实施者, I want ScriptedRuntime/假门闸能测预设映射, so that 不依赖真侧车才能验权限产品面。

### Should — Capability / 连接器 closeout（既有实现）

13. As a 评审者, I want 「+」选用 Connector/Skill/Expert 的回归门保持绿灯, so that 不因权限工作回归连接器。  
14. As a 评审者, I want 飞书黄金路径 acceptance 剩余项闭合, so that 父 Spec「In progress」可收口到可声明完成。  
15. As a 桌面用户, I want Fake/无侧车不显示假 Connected, so that 模板保持诚实。  
16. As a 模板维护者, I want 本切片不重开 Capability Module / 不重写 Plugin Registry, so that 实施聚焦权限缝。

### Optional

17. As a 评审者, I want GitHub 真 Broker 证据可另附, so that 不把外部部署绑死 β 主门。

## Implementation Decisions

1. **主交付唯一：** 默认权限命令/视图面（Composer 可绑定）。连接器产品代码以 **既有为准**，本切片禁止「再实现一套 +/chips/管理面」。  
2. **Closeout 范围：** 仅补父 Spec / acceptance 仍 ☐ 的缺口（如取消登录 UX、解绑后失败可区分等——以 acceptance 清单为准），不做功能大改。  
3. **合同关系：** Capability / Connector / Plugin / effective 仍以父 Spec + ADR-0016/0017 为准。  
4. **预设语义：** 12f 定稿两档（`auto-approve` 帮我批准 / `full-access` 完全访问，见附录 A）；经渲染端审批自动应答映射到既有 `approval.requested` → resolve 链路，侧车 fail-closed 门闸零改动；映射表在附录写清。不交付完整 PolicyEngine。  
5. **作用域：** 推荐每 Task；切换 Project 时继承或重置必须单测。  
6. **布局：** 与 α 的「项目」入口可并列；文案 Avoid「工作空间」指文件夹。  
7. **真连接器：** 飞书路径 **验收收口**，不重做 CLI package；GitHub Broker 可选。  
8. **明确不做：** 企微/钉钉/新 Provider 矩阵；重开 Module；插件市场；Hybrid 默认化。  
9. **并行：** 不 blocked by Spec-α。  
10. **门禁：** Renderer 无 secret；`check:workbench` 边界不变。

## Testing Decisions

1. **Must 测：** 切换预设 → 同类工具调用审批打扰可观测差异；Task 作用域持久化；与 Approval Dock 并存。  
2. **Should 测：** 既有 composer-capability 与飞书 acceptance/smoke 回归；本 issue 勾选 closeout 项。  
3. **禁止：** 为 β 新写整套连接器 E2E 替代父 Spec；Fake 假 Connected。  
4. **Prior art：** approval ScriptedRuntime、security-policy 测试、capability-add-menu / chips 测试、飞书 shell smoke、父 Spec acceptance。

### 验收清单

**Must（β 主门）**

- [ ] Composer 旁「默认权限」中文预设（12f 两档：帮我批准 / 完全访问）  
- [ ] 预设对后续 Turn 审批打扰有可观测影响（非纯 UI）  
- [ ] 作用域（推荐每 Task）与切换 Project 规则有测试  
- [ ] 映射表写入 Spec 附录或 Profile，并有自动化覆盖  

**Should（closeout）**

- [ ] 「+」选用 Connector/Skill/Expert 回归通过  
- [ ] 飞书：登录 → Connected → 选用 → Turn 可观测工具；取消选用可解释（父 Spec acceptance 对应项闭合）  
- [ ] Fake/无侧车不假装外呼成功  

**Optional**

- [ ] GitHub 真实 Broker/App 证据附入 evidence（不挡 Must）

## Out of Scope

- 重做 Capability「+」/chips/管理面/Plugin Registry  
- 企微、钉钉或其他新 Provider 产品化  
- Projects Home / Electron Host（Spec-α）  
- 完整 PolicyEngine / 企业策略 / SCIM  
- 插件市场、@ 语法、Expert Supervisor  
- 飞书宿主 OAuth / MCP inject  
- Review / Git / Terminal / URL 会话权威  

## Further Notes

- **代码审查结论：** 连接器主路径大体 done；Workbuddy 并列差在默认权限 + 收口，不差在再写「+」。  
- **后续企微：** 新 Plugin package（CLI 抄飞书或 MCP 抄 GitHub）；不默认 Hybrid；CLI auth / Broker / brand icon 仍有 Host 成本——另票，不进 β。  
- **实施顺序：** 预设模型 + 门闸挂钩 + Scripted 测试 → Composer UI → acceptance closeout →（可选）GitHub Broker 证据 → 与 α 底栏并列抛光。  
- **可能 ADR：** 仅当「预设 ↔ 审批门闸」成为难逆跨模块合同时再写。  

### Appendix A — 预设映射表（2026-08-12f v3 定稿两档；真源为实施设计 §1）

两档收敛现有 4 档假 UI（AccessChip + AutonomyDial 合并为一个预设模型）。**挂钩架构（v3）：** 预设 = 渲染端审批自动应答策略——侧车保持 fail-closed 照旧发 `approval.requested`，预设只决定渲染端如何应答（自动批准 / 弹 Dock），完全复用既有审批总线，侧车零改动。详见 [`workbench-default-permissions-design.md`](./workbench-default-permissions-design.md)。

| 预设 ID | 中文名 | 预期审批打扰 | 文件读 | 文件写（write/edit/delete/rmdir/mkdir） | `execute_command` | 未知/其他审批 |
|---|---|---|---|---|---|---|
| `auto-approve`（**默认档**） | 帮我批准 | 低 | 免审 | **自动批准**（白名单精确匹配；审批轨迹 + reason 进 Timeline） | 弹 Dock | 弹 Dock（fail-closed） |
| `full-access` | 完全访问 | 无 | 免审 | 自动批准 | **自动批准** | **自动批准** |

- 侧车 fail-closed 基线不变：写与 `execute_command` 的 `needsApproval: true` 一律保留；沙箱围栏（工作区根 / env 隔离 / 连接器门闸）不受预设影响——`full-access` 的命令仍在沙箱内执行。
- 命名对齐 ChatGPT：「帮我批准」为同名档语义收窄版（静态白名单，无风险引擎，故不叫「智能批准」）；「完全访问」= 不再逐次询问。
- 作用域每 Task（task Module per-Task store + localStorage）；新 Task / 切 Project 回落 `auto-approve`。
- 打扰可观测测试锚点：同一 `execute_command` 审批在 `auto-approve` 弹 Dock、在 `full-access` 自动批准；`write_file` 两档均自动批准且 Timeline 有 reason；未知工具在 `auto-approve` 下弹 Dock。
- **产品语义注记：** 两档都自动批准文件写，「每次都问我」（always-ask）与「只读」不再可选——2026-08-12f 产品决策；连同 risk-based / PermissionGrant / 侧车原生 allow / 远程服务端权限权威一并 deferred。
- 本地单用户下渲染端预设 = 用户本人意图，可信；远程多租户需服务端权威——deferred，见设计 §5。
