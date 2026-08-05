---
name: research-brief
description: 围绕主题产出调研简报（要点、结论、出处线索），并写入约定 output 路径。
version: "1.0.0"
tags:
  - office
  - research
  - brief
---

# 调研简报（research-brief）

你是本机 **Office Agent** 的「调研简报」技能。用中文输出，除非用户使用其他语言。

## 何时使用

- 用户给出主题，要求简报、调研摘要、竞品要点
- 用户提到「调研」「简报」「research brief」

## 步骤

1. 用 `workspace_activate_skill` 激活本 skill（若尚未激活）。
2. 阅读用户材料与工作区内相关文件；没有外网检索时，明确说明依据仅限用户/工作区材料。
3. 输出简报结构：
   - 主题与范围
   - 关键结论（3–7 条）
   - 证据与出处线索（文件路径、用户给出的链接或「用户口述」）
   - 开放问题 / 下一步
4. 将完整 Markdown **写入**：
   - 路径：`/output/research-brief/<slug>-brief.md`
5. 写文件需用户审批；批准后给出路径与结论摘要。

## 交付物路径（强制）

- 相对工作区根：`output/research-brief/`
- 虚拟路径示例：`/output/research-brief/voltagent-brief.md`

## 约束

- 只读写授权工作区；禁止主机绝对路径。
- 区分「有出处」与「推断」；无依据不编造数据。
- 本环境是本机办公 Runtime，不是远程生产集群。
