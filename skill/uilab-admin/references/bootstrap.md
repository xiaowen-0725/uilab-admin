# Route: bootstrap

0→1：从 uilab-admin 派生新应用，并套用 scenario pack。

## 状态意识（重要）

先读 [bootstrap.md](../../../docs/ai/bootstrap.md) 与 [cli.md](../../../docs/ai/cli.md)。

| 能力 | 当前 |
|---|---|
| 场景识别与确认卡 | 按合同执行 |
| scenario catalog | shipped（文档/数据） |
| CLI `uilab-admin init` / `apply-scenario` | shipped |
| 完整 Electron/Tauri | planned；仅 L1+L2 边界 |

优先执行：

```bash
pnpm uilab-admin init <app> --scenario <id> --dir <parent>
# 或
pnpm uilab-admin apply-scenario <id> --dir <app>
```

执行后核对文件真实落盘与 `pnpm uilab-admin check`。

## 行动前必读

1. [docs/ai/bootstrap.md](../../../docs/ai/bootstrap.md)
2. [docs/ai/scenarios.catalog.json](../../../docs/ai/scenarios.catalog.json)
3. 对应 `docs/ai/scenarios/<id>.md`
4. [docs/ai/cli.md](../../../docs/ai/cli.md)

## 流程

### 1. 判断确实是 0→1

若用户已在派生项目里加页面 → 改走 `scaffold` / `shell`（extend）。

### 2. 推荐 scenario

只主推 1 个，可带 1 个备选：

- `ops-console`
- `saas-admin`
- `agent-desktop`

### 3. 输出确认卡（用户确认前不创建目录）

```md
## Bootstrap 确认卡

- app name:
- scenario:
- runtime: web | desktop-host-ready
- shell defaults:
- required modules:
- recommended modules:
- exclude demos:
- desktop note: (if any)
- create mode: init new dir (primary) / apply-scenario on clone
```

### 4. 执行

优先（CLI 可用时）：

```bash
uilab-admin init <app-name> --scenario <id>
```

兼容：

```bash
# 用户已手动 clone/fork
uilab-admin apply-scenario <id> --dir <app>
```

CLI 不可用时 manual fallback：

1. clone `uilab-admin` 到新目录
2. 改 package name / 标题
3. 按 scenario 写 `admin-preferences.ts`
4. 裁剪 sidebar / demo 页
5. 需要的 list/settings 用 extend scaffolds 补
6. 若 `desktopHostReady`：补 `desktop/README.md` 边界说明
7. 写 `APP_BRIEF.md`

### 5. 验收

- 新目录可 `pnpm install && pnpm dev`
- `pnpm typecheck` / `pnpm build`
- 有 APP_BRIEF 与 scenario 记录
- agent-desktop 类需有 desktop host-ready 说明（L2）

## 输出模板

```md
## Bootstrap

### Mode
bootstrap (0→1)

### Scenario
...

### Actions
- CLI: ...
- or manual fallback: ...

### Created / updated paths
- ...

### Next extend steps
- ...
```

## 禁止

- 把 L1/L2 说成已完成 Electron/Tauri 产品
- 未确认 scenario 就大量生成业务页
- 为桌面端分叉整套 layout/pattern
- 绑定 UI Lab Create/Package 主链路
