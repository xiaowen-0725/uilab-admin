# Triage labels

| 标签 | 含义 | Agent 行为 |
|---|---|---|
| `needs-triage` | 尚未完成分类或范围确认 | 先分诊，不直接实施 |
| `needs-info` | 缺少完成任务所需的信息 | 等待补充信息 |
| `ready-for-agent` | 范围和验收条件明确，可由 Agent 实施 | 可以开始工作 |
| `ready-for-human` | 需要产品、设计、安全或运维人员决策 | 暂停实施并请求人工处理 |
| `wontfix` | 已决定不处理 | 不实施 |

同一工单不应同时标记 `ready-for-agent` 与 `needs-info` 或 `ready-for-human`。阻塞中的工单可以保留 `ready-for-agent`，但必须遵守其原生或正文依赖关系。
