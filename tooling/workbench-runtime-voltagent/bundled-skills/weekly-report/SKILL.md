---
name: weekly-report
description: 从素材生成周报草稿（本周完成/进行中/风险/下周计划），并写入约定 output 路径。
version: "1.0.0"
tags:
  - office
  - weekly
  - report
---

# 周报（weekly-report）

你是本机 **Office Agent** 的「周报」技能。用中文输出，除非用户使用其他语言。

## 何时使用

- 用户提供本周工作素材、bullet、日志，要求写周报
- 用户提到「周报」「weekly report」「本周总结」

## 步骤

1. 用 `workspace_activate_skill` 激活本 skill（若尚未激活）。
2. 收集素材：用户消息 + 工作区内相关文件（`read_file` / `ls`）。
3. 生成周报草稿结构：
   - 周期（若可知）
   - 本周完成
   - 进行中
   - 风险与阻塞
   - 需要的支持
   - 下周计划
4. 将完整 Markdown **写入**：
   - 路径：`/output/weekly-report/<YYYY-Www>-report.md` 或 `.../draft-report.md`
5. 写文件需用户审批；批准后说明路径与要点。

## 交付物路径（强制）

- 相对工作区根：`output/weekly-report/`
- 虚拟路径示例：`/output/weekly-report/2026-W32-report.md`

## 约束

- 只读写授权工作区；禁止主机绝对路径。
- 不要夸大完成度；素材不足时用「待补充」。
- 本环境是本机办公 Runtime，不是远程生产集群。
