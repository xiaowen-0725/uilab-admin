# 实施设计：Workbench 默认权限（Spec-β Must，#88）— v3 定稿（两档）

**Status:** ready-for-implementation（v3，2026-08-12 产品决策收敛为两档后定稿）  
**Map:** https://github.com/xiaowen-0725/uilab-admin/issues/88  
**Spec:** [`workbench-capability-permissions-milestone-spec.md`](./workbench-capability-permissions-milestone-spec.md)（附录 A 映射表）  
**决策链:**
- 2026-08-12c 代码诊断：Composer 权限 UI 是假的（本地装饰、默认「完全访问」与实际相反）；侧车静态 fail-closed
- 2026-08-12d 框架勘察：VoltAgent `needsApproval` 拿不到 Turn 上下文（`experimental_context: void 0`），侧车按 Task 动态跳过审批不可行
- 2026-08-12e（v2）：曾定三档（只读/默认/偏自动），deny 走侧车 hook
- **2026-08-12f（v3 产品决策）：收敛为两档「帮我批准 / 完全访问」（对齐 ChatGPT 语义）；只读档与「请求批准」（每次都问）档取消，记入 deferred。三档版的侧车 deny hook / 提示词注入 / Turn context 传递随之全部删除——本设计回到纯渲染端实现，侧车零改动。**

---

## 1. 架构：预设 = 渲染端审批自动应答策略（侧车零改动）

侧车保持一切 fail-closed 照旧（每次文件写 / `execute_command` 都发 `approval.requested`）；**预设只决定渲染端如何应答审批请求**。自动应答 = 自动化用户本人的同意动作；审批事件照常产生并投影到 Timeline（附自动应答原因），完全复用既有审批总线（`approval.requested` → resolve → resume），不新造事件宇宙。

```ts
type PermissionPreset = 'auto-approve' | 'full-access'
```

| 预设 ID | 中文名 | 文件写（write/edit/delete/rmdir/mkdir） | `execute_command` | 未知/其他审批 |
|---|---|---|---|---|
| `auto-approve`（**默认档**） | 帮我批准 | **自动批准**（白名单精确匹配，reason 进 Timeline） | 弹 Dock 确认 | 弹 Dock（fail-closed） |
| `full-access` | 完全访问 | 自动批准 | **自动批准** | **自动批准** |

**关键性质：**

- **侧车边界不变**：所有 `needsApproval: true` 保留；沙箱围栏（工作区根、环境变量隔离、连接器门闸、资源钳制）不受预设影响——`full-access` 的命令仍在沙箱内执行。
- **命名**：中文名「帮我批准」对齐 ChatGPT 三档中的同名档；「完全访问」= 不再逐次询问。不叫「智能批准」——没有风险判定引擎，规则是静态映射，避免过度承诺。
- **决策为纯函数**：`decideApprovalResponse(preset, toolName) → 'approve' | 'dock'`，映射表为唯一真源；将来上远程 Runtime 时该策略函数迁移到服务端权威（信任边界见 §5）。
- **已知取舍**：自动批准仍走一次 suspend/resume 往返（多写/多命令任务有延迟）；侧车原生免挂起 allow 受阻于框架限制，deferred。

## 2. Slices

### Slice A — 预设状态（task Module）

`modules/task/application/permission-preset.ts`：per-Task store（Map + localStorage），默认 `auto-approve`，暴露读写 + React hook。放 task Module（拥有 Composer / Approval Dock）；不进 capabilities，不建全局 dumping ground。作用域每 Task；新 Task / 切 Project 回落 `auto-approve`。

### Slice B — Composer UI 收敛

- `ComposerAccessChip` 改为「默认权限」两档下拉（既有 DropdownMenu 模式，Base UI `render={...}`）：
  - **帮我批准**（默认）：「文件修改自动批准；执行命令等高风险操作仍会询问」
  - **完全访问**：「不再逐次询问；操作仍在工作区沙箱内执行」
- chip 显示当前档；`full-access` 有视觉区分（tone）。
- 解除 `ComposerAutonomyDial` 假联动，删 `ACCESS_LEVELS`/`AUTONOMY_LABELS` 假状态（motion 库组件不删，只解除 composer 假接线）。
- testid：`composer-permission-preset` / `composer-permission-preset-<id>`。

### Slice C — 审批自动应答（主缝）

在 `pendingApproval` 出现处（task controller，持有 `onApprove`/`onReject` 的层）挂策略：

1. approval.requested 到达 → `decideApprovalResponse(preset, toolName)`；
2. `approve` → 立即 `onApprove(id)`，reason 按档位：「已按「帮我批准」预设自动批准」/「已按「完全访问」预设自动批准」；
3. `dock` → 照旧渲染 Approval Dock；
4. 自动应答不闪现 Dock（先判策略再渲染）；reason 沿 `approval.resolved` payload 投影，Timeline 审批行可见「自动批准 + 原因」（若现投影不显示 reason，补最小展示）。

映射规则：`auto-approve` 仅白名单 {write_file, edit_file, delete_file, rmdir, mkdir} → approve，其余 dock；`full-access` 一律 approve。adapter 的 resolve 已支持 `approval: { id, approved, reason }`，无需改协议。

### Slice D — 测试

用 ScriptedRuntimePort / 既有测试模式（spec 故事 12）：

1. **可观测差异（核心）**：同一 `write_file` 审批 × 2 预设 → 两档都自动批准且 Timeline 有对应 reason；同一 `execute_command` 审批 → `auto-approve` 弹 Dock、`full-access` 自动批准。
2. **fail-closed**：未知工具审批在 `auto-approve` 下弹 Dock。
3. **作用域**：Task A 设 `full-access` → Task B 仍 `auto-approve`；新建 Task 回落默认；localStorage 恢复。
4. **UI**：chip 两档切换 + 中文文案 + 默认档「帮我批准」断言。

## 3. 完成定义

- [ ] Slice A–D 落地；映射表、策略纯函数、spec 附录 A 三方一致
- [ ] `pnpm --filter @uilab/agent-workbench typecheck` / 相关 vitest / `pnpm check:workbench` / `pnpm check:foundation`
- [ ] **侧车（tooling/workbench-runtime-voltagent）零改动**；若实现中发现必须改侧车，停下来回到设计评审

## 4. 产品语义注记

- 两档都会自动批准文件写：**「每次都问我」的最保守行为不再可选**（2026-08-12f 产品决策，对齐 Workbuddy 型体验：用户预设自主度而非逐次确认）。
- 「只读」与「请求批准」档、以及 risk-based 风险引擎，均记入 deferred，映射表纯函数结构天然可扩展。

## 5. Out of Scope / Explicitly Deferred

- **「只读」档与「请求批准」（always-ask）档**：v2 曾设计（含侧车 `onToolStart` deny hook 方案，见 git 历史），产品决策移除；将来加回时 deny 建议走侧车 hook（VoltAgent 官方一等模式，hook 可读 OperationContext）
- **侧车原生 allow（免 suspend/resume）**：受阻于 `needsApproval` 无 Turn 上下文；等框架支持或上游贡献
- **risk-based 风险策略 / PolicyEngine / PermissionGrant（限域限时授权）/ argumentsHash 绑定与有效期**：调研《VoltAgent 调研》§5.2.3/5.2.6 的完整形态，远程 Runtime 阶段再做
- **远程多租户下的服务端权限权威**：本地单用户下渲染端预设 = 用户本人意图，可信；远程时客户端自报不可信（调研 §5.2.1），预设权威须移到服务端
- Spec-β 的 Should / Optional 不在本设计
