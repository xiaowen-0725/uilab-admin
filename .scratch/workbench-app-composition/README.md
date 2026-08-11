# WorkbenchApp Composition 优化 — 实现工单

**目标：** 把 `WorkbenchApp` 从「全能 Composition 文件」收敛为 **接线层**；boot / Runtime / Task 生命周期 / Surface 打开通道各自可测、可单独验收，并补 AGENTS 防腐规则。

**背景：** Document 内容源已抽出（规则 13–15）。本批不处理 Composer 样式、Electron、Document 新能力。

## 依赖

```text
01 Boot ──────────────────┐
                          ├──► 02 Runtime ──┐
01 Boot ──► 03 Task lifecycle ─────────────┼──► 05 Thin App + 规则
04 Surface assembly（可与 01 并行）────────┘
03 ──► 06 Delete dialog（可选）
```

## Frontier

扫描 `issues/`：`Status: ready-for-agent` 且 Blocked by 均已完成的票。

**全部 01–06 已完成。** Frontier 清空。

## 完成定义（每票）

- 本票验收勾选完成  
- 相关单测 / 既有 workbench 集成测绿  
- 不违反 `archetypes/agent-workbench/AGENTS.md` Composition / Module 边界  
