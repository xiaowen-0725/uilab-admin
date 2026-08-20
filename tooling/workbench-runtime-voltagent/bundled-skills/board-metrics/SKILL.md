---
name: board-metrics
description: 按插件指标目录为看板绑定业务数据。先对照 requiredPermissions 与资源 permissions 再选指标，不要编端点。
version: "1.0.0"
tags:
  - board
  - metrics
  - query
---

# 看板指标（board-metrics）

本 skill 由插件贡献，懒读，不占常驻 token。只在用户要业务数据看板、且 `board_status` 返回了 `queries` 时读取。

端点、路径、凭据不在本 skill 里，也不许写进工具参数或小组件。

## 先对照权限再选指标

1. 调用 `board_status`，同时看 `queries` 与 `identity.resources`
2. 每个指标都带 `requiredPermissions`；权限不足的指标**仍会出现在目录里**，必须能判别并避开
3. 只有当某资源的 `permissions` 覆盖该指标的 `requiredPermissions` 时，才允许把它填进资源引用参数
4. `identity.kind === 'unrestricted'` 表示当前没有资源约束（模板默认无身份）
5. `identity.valid === false` 时不要绑定查询，先向用户说明需要重新登录

## 参数填法

- 只填目录 `parameters` 里声明过的键，禁止 schema 外参数
- `type: 'resource'` 的参数填资源 `id`（单个字符串或字符串数组），`id` 必须来自 `identity.resources`
- 标量参数按类型填；缺必填项会被 `validation_failed` 拒绝
- 不要编指标名；`unknown_query` 时回到目录重选

## 组合建议

- 一块小组件只绑一个指标。多指标并列就生成多块小组件，分别 commit
- 只读权限够用时选摘要类指标；财务类指标通常还要 `finance`，用户只有 `read` 时不要选
- 同一资源可以出现在多块卡上；不要把用户无权的场/仓塞进参数

## 完整示例

用户：「做一块业务数据看板，看我有权看的站点摘要。」

1. `board_status` → 目录里有 `site_summary`（`requiredPermissions: ['read']`）和 `site_finance`（还要 `finance`）
2. `identity.resources` 里 `site-1` 只有 `read` → 选 `site_summary`，避开 `site_finance`
3. 按 board-widget 配方生成小组件（数据只从 `widget.data` 画）
4. `board_commit`：

```
queryName: site_summary
queryParams: { "siteIds": ["site-1"] }
```

不要带 `jobId` / `codeHash`。提交成功后宿主自动首跑上数。
