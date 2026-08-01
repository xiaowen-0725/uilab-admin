---
status: accepted
---

# Use semantic Workbench regions

Workbench Shell 采用 Navigator 与 Workspace 两个顶层语义区域，而不是暴露通用的 left、center、right slots；Workspace 包含必需的 Task Surface 与可选的 Work Surface Host，Composer 属于 Task Surface，Resource Explorer 属于相关 Work Surface。环境、变更、来源与子智能体统一由 Task Context Panel 呈现：空间充足时使用 Reserved-space mode 让任务内容避让，空间受限时切换为 Overlay mode。Shell 不提供固定 Inspector 区域，以免占用 Browser、Artifact、Review、Terminal 等工作面的扩展位置。
