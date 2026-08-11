# Codex 对抗评审 — 作者逐条表态（2026-08-09）

**Review:** [capability-surface-codex-adversarial-review-2026-08-09.md](./capability-surface-codex-adversarial-review-2026-08-09.md)
**Applied to:** Spec / ADR-0016 / Acceptance（同日修订）

| Codex 点 | 作者表态 | 落盘 |
| --- | --- | --- |
| #1 Feishu OAuth 脱节 | **坚持宿主 OAuth 为本切片验收门** | Spec Goals + 授权路径 + 验收 G.* |
| #2 无 effective 算法 | **同意 blocker，立刻写入** | Spec Normative algorithm |
| #3 Connector 投影缺失 | **同意 ConnectorDescriptor** | Spec Normative ConnectorDescriptor |
| #4 Expert 影子包装 | **改口：临时 static catalog + 迁移目标** | Spec + ADR |
| #5 Snapshot 生命周期 | **query + invalidation + authCompleted refresh** | Spec Snapshot lifecycle |
| #6 样例证不了主承诺 | **强制黄金路径** | Spec 附录 B + Acceptance §G |
| 飞书命名过大 | **保留大一统「飞书」+ 子能力** | Descriptor capabilities[] |
| effective 归属 | **侧车唯一真相** | Spec + ADR |
| 移除 @ | **本切片移除** | Spec Non-goals |
| 选用持久化 | **按 Task 本地持久至删除** | Spec |
| Snapshot 白名单 | **同意** | Spec |
| Fake 加强 | **禁止假远程上下文** | Spec + Acceptance |
| 撤销后芯片 | **保留选用，显示断开** | Spec algorithm |
| OAuth 回流 | **authCompleted → invalidate + refresh** | Spec |

**Verdict after battle:** 架构 bet 保留；**不** as-is 开工；按修订 Spec 的实现顺序推进。

---

## 补充：飞书通道拍板（同日稍后）

| 项 | 决策 |
| --- | --- |
| WorkBuddy 对照 | CLI-first（`open.feishu.cn/page/cli`） |
| 验证切片 | **Option B CLI-first** |
| Connected | `cli_session` / `lark-cli auth status` |
| 宿主 OAuth + MCP inject | **后置 Hybrid**，非本切片验收门 |
| 研究 | [feishu-mcp-vs-cli-auth-comparison-2026-08-09](../research/feishu-mcp-vs-cli-auth-comparison-2026-08-09.md) |
| Spec/ADR/Acceptance | 2026-08-09b 已改写 |

**覆盖说明：** 早先 grilling「坚持宿主 OAuth 验收门」对**飞书本切片**被 **B** 取代；effective / Descriptor / Snapshot / 黄金路径等其余 Codex 修订仍有效。
