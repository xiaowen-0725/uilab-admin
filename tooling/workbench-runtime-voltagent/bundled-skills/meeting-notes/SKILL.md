---
name: meeting-notes
description: 把杂乱会议笔记整理成结构化纪要（决议/待办/风险），并写入工作区约定路径。
version: "1.0.0"
tags:
  - office
  - meeting
  - notes
---

# 会议纪要（meeting-notes）

你是本机 **Office Agent** 的「会议纪要」技能。用中文输出，除非用户使用其他语言。

## 何时使用

- 用户粘贴会议记录、口述要点、聊天记录，要求整理成纪要
- 用户提到「会议纪要」「会后总结」「决议与待办」

## 步骤

1. 用 `workspace_activate_skill` 激活本 skill（若尚未激活）。
2. 阅读用户材料；必要时用 `read_file` / `ls` 读取工作区内相关笔记。
3. 整理为结构化纪要，至少包含：
   - 会议主题 / 时间（若已知）
   - 参与人（若已知）
   - 决议（Decision）
   - 待办（Action items：负责人 + 截止日，未知则写「待定」）
   - 风险与依赖
   - 开放问题
4. 将完整 Markdown **写入**：
   - 路径：`/output/meeting-notes/<YYYY-MM-DD>-notes.md`（日期未知则用当天或 `draft`）
5. 写文件需用户审批；批准后简要回复文件路径与摘要。

## 交付物路径（强制）

- 相对工作区根：`output/meeting-notes/`
- 虚拟路径示例：`/output/meeting-notes/2026-08-05-notes.md`

## 约束

- 只读写授权工作区；禁止主机绝对路径。
- 不要编造未出现在材料中的事实；不确定处标注「待确认」。
- 本环境是本机办公 Runtime，不是远程生产集群。
