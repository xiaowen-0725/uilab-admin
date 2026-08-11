# Issue tracker

本仓库使用 GitHub Issues 管理 Agent 可执行工单。

- 平台：GitHub Issues
- 仓库：`xiaowen-0725/uilab-admin`
- 新建工单默认标签：`ready-for-agent`
- 需要人工决策时：移除 `ready-for-agent`，添加 `ready-for-human`
- 信息不足时：添加 `needs-info`
- 尚未完成分诊时：添加 `needs-triage`
- 不再处理时：添加 `wontfix`

工单必须包含清晰的目标、可验证的验收条件和阻塞关系。依赖工单优先使用 GitHub 原生 blocking relationship；不支持时，在正文的 `Blocked by` 小节中保留显式引用。
