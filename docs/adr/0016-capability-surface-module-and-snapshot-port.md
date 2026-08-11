# Capability Surface：独立 module、Snapshot 生命周期、侧车 effective、Expert 临时 catalog、飞书 CLI-first

Agent Workbench 的对话能力面（连接器 / 技能 / 专家）需要独立于 Task 执行流装配与展示，且不能把密钥或 MCP 客户端放进 Renderer。我们决定：

1. 新增 Deep Module **`modules/capabilities`**：目录读模型、Task 级选用、Composer「+」、开始登录/授权意图；**不**拥有 Secret/MCP/PluginRegistry，也**不**拥有 effective 真相。
2. **CapabilitySnapshotPort**：versioned status-safe 读模型 + invalidation/refresh（含 CLI 登录完成、selection 变更）。
3. **Effective capability set** 唯一所有者为 **侧车**：`pluginGloballyEnabled ∧ connected ∧ taskSelected`。
4. **ConnectorDescriptor** 为 Plugin→产品连接器薄投影。
5. Expert Profile MVP：**临时 static catalog**（旁路装载），诚实非 Plugin packaging 真相；迁移目标 `contributes.experts`。
6. **飞书验证切片（2026-08-09 作者拍板 B）：CLI-first**
   - 对齐 WorkBuddy：Connected = **`cli_session`**（`lark-cli auth status` / `open.feishu.cn/page/cli` 登录流）
   - 工具面 = 领域 CLI allowlist，**不是**本切片强制的宿主 OAuth → MCP inject
   - 宿主 oauth2/Keychain/MCP 后置 Hybrid；**禁止**把 CLI 绿点宣传为宿主 OAuth 已完成

**Considered options**

- 能力面塞进 `task` / session：耦死。
- RuntimePort 事件洪流：词表膨胀。
- Expert 仅浏览器 prompt：无法裁剪工具面。
- 飞书 **MCP-first + 宿主 OAuth**（曾为 Spec 验收门）：更贴 Codex packaging / inject 一致，但与 WorkBuddy 演示路径及最快可验证 CLI 闭环冲突；作者选择 **CLI-first 验证切片**。
- 飞书 Hybrid 双绿点：终态更合理，切片易膨胀；后置。

**Consequences**

- Composition Root 装配 capabilities + Fake/voltagent snapshot/selection/startAuth（CLI 登录委托）。
- 侧车须对齐 `lark-cli` builtin、cli_session 探测、CLI 工具 effective。
- 实现顺序：Descriptor/effective → lark-cli 对齐 → CLI 登录回流 → 黄金路径 →「+」UI → Expert。
- 证据：`docs/research/feishu-mcp-vs-cli-auth-comparison-2026-08-09.md`；Codex 评审 evidence 中「必须宿主 OAuth」条对本切片 ** superseded by B **。

**Status:** accepted（2026-08-09b 修订：飞书 CLI-first）
**Map:** [Wayfinder: Workbench 能力面](https://github.com/xiaowen-0725/uilab-admin/issues/34)
