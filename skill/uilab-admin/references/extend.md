# Route family: extend

1→100：在**已基于 uilab-admin 的应用**里继续装配。

Extend 不是单路线，而是一组已有 route 的总称：

| 意图 | 实际 route |
|---|---|
| 了解现状 | `discover` |
| 加页面 | `scaffold` |
| 改布局/导航 | `shell` |
| 合规检查 | `review` |

## 何时用 extend

- 仓库已有本模板结构（`src/features`、`src/routes`、`components/data-table` 等）
- 用户要增量加列表/设置/认证，或改 shell

## 何时不该用

- 还没有项目 / 要新建应用 → `bootstrap`
- 想从完全无关老项目改造 → 第一期拒绝或仅给迁移建议（无 `adopt`）

## 执行原则

1. 先 `discover`（若对仓库不熟）
2. 一次只改一类意图（加页 / 改壳 / 审查）
3. 优先 CLI-1：
   - `pnpm uilab-admin add ...`
   - `pnpm uilab-admin set-shell ...`
   - `pnpm uilab-admin check`
4. 仅当需要高度定制时才手改 scaffolds；仍跑 `pnpm check:ai`

## 完成

mutating 后至少：

```bash
pnpm typecheck
pnpm build
pnpm check:ai
```
