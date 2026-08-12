# 飞书 CLI 一键连接验收证据（#43）

**Date:** 2026-08-12  
**Issue:** https://github.com/xiaowen-0725/uilab-admin/issues/43  
**Design:** [`docs/plans/feishu-cli-connect-closeout-design.md`](../plans/feishu-cli-connect-closeout-design.md)  
**Acceptance:** [`docs/plans/workbench-capability-surface-acceptance.md`](../plans/workbench-capability-surface-acceptance.md)（2.1 / 2.3 / G.\*）

---

## 状态

| 切片 | 状态 | 说明 |
| --- | --- | --- |
| Slice A 轮询预算 | ☑ 自动化 | `wait-for-connector-auth` 单测：阶段转移重置 + 总预算放弃 |
| Slice B1 取消登录 | ☑ 自动化 | Composer「取消登录」+ notice「已取消登录」；不把关窗当取消 |
| Slice B2 解绑可区分 | ☑ 自动化 | chip 保留 + `not_connected`；Timeline 保留「需先完成 CLI 登录」类 hint |
| Slice C 真人授权闭环 | ☑ **真人授权已完成并取证** | revoke → startAuth → 真人 accounts.feishu.cn 授权 → Connected；选用/取消选用/真读文档/安全抽查已记录 |

---

## 环境前置

1. 工作区：`uilab-admin` monorepo  
2. 侧车：`PLUGINS_ENABLED=cli.feishu` + `AGENT_PROFILE=office` → `http://127.0.0.1:3141`  
3. Workbench：`http://localhost:5174/`  
4. 会话隔离目录：`~/.uilab/runtime/cli-sessions/cli.feishu`（≠ 本机 `~/.lark-cli`）

**代码门禁（收口期）：** typecheck / 相关 vitest / `check:workbench` / `check:foundation` → PASS（见文末）。

---

## 六步剧本

### 1. 起点：干净态

| 项 | 记录 |
| --- | --- |
| 构造方式 | ☑ `POST /capability/auth/revoke` → 侧车 `lark-cli auth logout` |
| snapshot `connected` | ☑ false |
| `connectionState` | ☑ missing |
| 证据 | 撤销后会话 `user.available=false` |

### 2. 一键连接签发授权（无手抄凭据）

| 项 | 记录 |
| --- | --- |
| 手抄 device code / token | ☑ 否 |
| verificationUrl | ☑ `accounts.feishu.cn`（phase=`login_started`, step=`authorize`） |
| 响应无密钥 | ☑ `01-startauth-safe.json` leakCheck=true |

### 3. 真人授权 → Connected

| 项 | 记录 |
| --- | --- |
| 授权页域名 | ☑ `accounts.feishu.cn` |
| 真人操作 | ☑ 用户确认「授权已完成」 |
| refresh 后 transition | ☑ `phase=connected`「「飞书」CLI session 已连接。」 |
| 会话探测 | ☑ Workbench 会话目录 `user.available=true`（userName=周家文） |
| UI | ☑ 连接器管理「已连接 · CLI Session」；截图 `03-connected-ui.png` |
| 证据文件 | `03-connected-probe.json`、`03-connected-ui.png` |

### 4. Task 选用 + 真读文档

| 项 | 记录 |
| --- | --- |
| 选用飞书 + `expert.office-meeting` | ☑ API selection |
| `effectiveCommandScopes` | ☑ `['lark-cli']`（`04-selected-scopes.json`） |
| 真读文档（Workbench 会话 CLI） | ☑ `lark-cli docs +fetch` → `ok=true` / `identity=user` / 标题命中《把 Claude Code…》 |
| 文档 URL | `https://larkcommunity.feishu.cn/docx/OaRIdFIRFoLM3xxTmKwcetHqn5e` |
| 模型 Turn / Host 审批 | ☑ golden-path：`PASS G.5` — 模型请求精确 `execute_command(lark-cli …)` 并正确停在 Host 审批（`04-golden-path.log`） |
| 证据 | `04-docs-fetch-safe.json`、`04-golden-path.log`、`04-selected-scopes.json` |

### 5. Task 开关不影响账号 Connected

| 项 | 记录 |
| --- | --- |
| 取消选用后 scopes | ☑ `[]`；账号仍 `connected=true` |
| 重新选用 | ☑ scopes 恢复 `['lark-cli']` |
| 证据 | `05-deselect-reselect.json`；golden-path `PASS G.6` |

### 6. 安全抽查

| 表面 | 结果 |
| --- | --- |
| startAuth / snapshot / refresh HTTP | ☑ 无 device_code / access_token / refresh_token / app_secret（`01-startauth-safe.json`、`06-security-scan.json`） |
| docs fetch 输出 | ☑ 无 token 形态泄漏 |
| UI 截图 | ☑ `03-connected-ui.png`（状态文案，无凭据） |
| 会话隔离 | ☑ Workbench 用 `cli-sessions/cli.feishu`；本机 `~/.lark-cli` 独立 |

---

## 边界项（acceptance 2.1 / 2.3）

### 2.1 取消登录

| 步骤 | 期望 | 证据 |
| --- | --- | --- |
| 授权等待中点「取消登录」 | notice「已取消登录」；保持未连接 | ☑ 单测 `composer-capability-selection` + 管理面取消入口 |
| 关闭授权窗口但不点取消 | Renderer **继续**轮询 | ☑ 代码：关窗不 abort；仅显式取消 |

### 2.3 解绑 / logout 后

| 步骤 | 期望 | 证据 |
| --- | --- | --- |
| 解绑 | 显示未连接；CLI 会话登出 | ☑ revoke → `user.available=false`；再连接需重新授权 |
| 失败可区分未登录 | `not_connected` / 「需先完成 CLI 登录」类文案 | ☑ effective + Timeline 投影单测 |

---

## 门禁记录

| 命令 | 结果 | 时间 |
| --- | --- | --- |
| workbench typecheck | PASS | 2026-08-12 |
| 相关 vitest（收口期 71+；管理面后续 8） | PASS | 2026-08-12 |
| `pnpm check:workbench` | PASS | 2026-08-12 |
| `pnpm check:foundation` | PASS | 2026-08-12 |
| sidecar `connector-cli-auth` / `effective-capabilities` | PASS | 2026-08-12 |
| capability golden-path（本机 Connected 后） | **11/12 PASS**；唯一 FAIL=`G.1c` honesty note 文案字面匹配（与 Connected/读文档无关） | 2026-08-12 |

---

## 产物清单

```text
docs/evidence/feishu-cli-connect-acceptance-2026-08-12.md
docs/evidence/feishu-cli-connect-acceptance-2026-08-12/
  01-startauth-safe.json
  03-connected-probe.json
  03-connected-ui.png
  04-selected-scopes.json
  04-docs-fetch-safe.json
  04-golden-path.log
  05-deselect-reselect.json
  06-security-scan.json
```

## 诚实边界

- Connected / 文档读取均为真人授权后的真实探测与 CLI/模型路径结果，**未伪造**。  
- golden-path `G.5` 验证到「精确 argv + Host 审批暂停」；会话级 `docs +fetch` 另行证明可读真实文档内容。  
- `G.1c` 失败仅为 honesty note 固定字串断言，不阻塞 #43 一键连接主结论。
