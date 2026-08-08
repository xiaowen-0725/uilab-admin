# 05 — 瘦身 WorkbenchApp + Composition 防腐规则

**What to build:** `WorkbenchApp` 一眼可读为产品装配接线（Boot + Runtime + Task 生命周期 + Surface + Shell）；业务实现落在 01–04 抽出的单元。在 Workbench AGENTS 中写明 Composition 职责边界，防止再堆回巨型文件。

**Blocked by:** 01、02、03、04

**Status:** done

- [x] `WorkbenchApp` 以 wiring 为主；允许保留 boot 全屏、删除确认等薄 UI chrome
- [x] AGENTS 增补 Composition 规则：禁止在 App 内联 boot / Runtime 装配 / Task 级联删除等业务实现，只装配公开单元
- [x] 包级：`typecheck`、workbench 集成测、`check:workbench` 通过
- [x] 可选：注明目标体量（例如 Composition 主文件显著短于当前 ~866 行，以「可读接线」为准，不硬卡魔法数）
