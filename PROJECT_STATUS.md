# uilab-admin 项目状态快照

> 更新时间：2026-08-01  
> 分支：`main`  
> 最新提交：`d459d3c`  
> 远程：https://github.com/xiaowen-0725/uilab-admin.git  
> 用途：后续优化/追溯用状态真源；细节合同仍以 `AGENTS.md` / `docs/ai/*` 为准。

## 1. 一句话定位

**AI-first 通用中后台模板**：Vite + React 19 + TS + Tailwind 4 + 官方 shadcn **Base UI** + TanStack。  
中文优先，与 UI Lab 弱连接；通过 scenario + CLI + skill 支持 0→1 开应用、1→100 扩展。

## 2. 当前阶段判断

| 维度 | 状态 | 说明 |
|---|---|---|
| 可运行模板壳 | **Done** | dashboard / tasks / settings / auth / errors / workspace |
| Base UI 迁移 | **Done** | `base-nova`，无 `@radix-ui/*` 依赖 |
| 中文主路径 | **Done** | 主要页面中文 |
| AI 合同 / skill | **Done** | `AGENTS.md` + `docs/ai/*` + `$uilab-admin` |
| CLI-1 extend | **Done** | `check` / `add` / `set-shell` |
| CLI-2 bootstrap | **Done** | `init` / `apply-scenario` |
| scenario packs | **Done（薄）** | ops / saas / agent-desktop |
| agent-desktop 工作区 | **MVP Done** | Workspace 首页 + threads 列表 + L2 desktop 边界 |
| Electron/Tauri host | **Not started** | 仅 L1+L2 host-ready |
| 模板“产品打磨/去 demo 化” | **Next** | 下一阶段优化重点 |
| npm 全局发布 CLI | **Not started** | 当前 repo-local |

**结论：**  
基础设施与 AI 装配闭环已可用；下一阶段应转向**模板体验优化、demo 收敛、scenario 质量、agent-desktop 深化**，而不是继续大改架构。

## 3. 已锁定决策（勿回退）

1. 独立仓库，不进 UI Lab monorepo  
2. 学 shadcn-admin 的壳/页面模式，不整包搬 Radix  
3. 官方 shadcn Base UI（`render`，禁止 `asChild` / Radix 回潮）  
4. 中文 UI + 英文标识  
5. 布局差异走 preferences / scenario，不 fork layout  
6. Skill 负责判断编排，CLI 负责确定性落盘  
7. 创建方式：`uilab-admin init` 为主，兼容 `apply-scenario`  
8. 桌面端：L1 + L2，预留 Electron/Tauri，不假装已产品化  
9. CLI 命令名：`uilab-admin`

## 4. 仓库结构（当前）

```text
uilab-admin/
  AGENTS.md / AGENT_BRIEF.md / README.md / PROJECT_STATUS.md
  cli/uilab-admin.mjs              # CLI 实现
  scripts/check-ai.mjs             # AI 合同门禁
  docs/ai/                         # bootstrap/cli/patterns/scenarios
  skill/uilab-admin/               # $uilab-admin router skill
  scaffolds/                       # data-table-list / settings-section
  desktop/README.md                # L2 host 边界
  src/
    components/{ui,layout,data-table}
    config/admin-preferences.ts
    context/*                      # 已消费 adminPreferenceDefaults
    features/{dashboard,tasks,settings,auth,errors,workspace}
    routes/{_authenticated,(auth),(errors)}
```

## 5. 能力地图

### 5.1 运行时页面（模板本体）

| 路径 | 模块 | 备注 |
|---|---|---|
| `/` | dashboard（默认）/ workspace（agent-desktop init 后） | agent 场景会改首页 |
| `/tasks` | data-table 完整参考 | faceted filter |
| `/settings/*` | 设置分段 | profile/account/appearance/notifications/display |
| `/sign-in` 等 | auth | 无 Clerk 强绑定 |
| `/workspace` | Agent 主画布 | 新增 |
| errors | 401/403/404/500/503 | 保留 |

### 5.2 Skill（`$uilab-admin`）

本地已桥接：Claude / Codex / Agents / Grok。

| 模式 | 路线 | 作用 |
|---|---|---|
| bootstrap | `bootstrap` | 0→1 场景确认与初始化编排 |
| extend | `discover` | 只读地图 |
| extend | `scaffold` | 按 pattern 加页 |
| extend | `shell` | 改默认布局/导航 |
| extend | `review` | 只读门禁 |

### 5.3 CLI（`pnpm uilab-admin`）

| 命令 | 状态 | 作用 |
|---|---|---|
| `check` | shipped | AI 合同门禁 |
| `add data-table-list` | shipped | 列表页 scaffold + routeTree regen |
| `add settings-section` | shipped | 设置分段 scaffold + routeTree regen |
| `set-shell` | shipped | 写 `admin-preferences.ts` |
| `init` | shipped | 从模板创建应用并 apply scenario |
| `apply-scenario` | shipped | 对已有拷贝套场景 |
| `add auth-page` | planned | 暂手工仿 auth feature |

### 5.4 Scenarios

| id | shell 倾向 | bootstrap seed | 桌面 |
|---|---|---|---|
| `ops-console` | sidebar + compact | `tickets` 列表 | web |
| `saas-admin` | inset + default | `settings/billing` | web |
| `agent-desktop` | sidebar + full | `threads` + Workspace 首页 | L1+L2 host-ready |

## 6. 验收证据（最近一次）

### CLI-2 多场景

目录：`/Users/zhoujw/develop/tmp/uilab-admin-cli2-verify-20260801-121430`  
证据：`EVIDENCE.md`

- init ops/saas/agent：PASS  
- apply-scenario：PASS  
- extend（members + set-shell）：PASS  
- 冲突/未知 scenario 退出码：PASS  
- typecheck/build（init apps）：PASS  

### UI smoke（真实 dev）

目录：`/Users/zhoujw/develop/tmp/uilab-admin-ui-verify-20260801-122005`  
证据：`UI_EVIDENCE.md` + `screenshots/`

| 场景 | 端口 | 结果 |
|---|---|---|
| ops-console | 5181 | PASS |
| saas-admin | 5182 | PASS |
| agent-desktop | 5183 | PASS |

关键经验：
- 多个派生 app **不要共享同一个 node_modules symlink**，否则 Vite optimize 缓存会互相污染导致空白页
- `add/init` 后必须 regen `src/routeTree.gen.ts`（CLI 已处理）

## 7. 已知缺口 / 技术债

### P1（下一阶段优化优先）

1. **模板去 demo 化**
   - 侧栏仍有较重认证变体、错误页、多团队切换 demo
   - dashboard 仍偏 SaaS 指标 demo，中英混杂残留风险
2. **scenario 质量**
   - agent-desktop 仍保留 tasks 等噪音入口
   - ops/saas 的导航分组与文案还可更场景化
3. **README/页面清单**
   - 文档中“当前页面”需与 workspace/scenario 行为持续同步
4. **CLI 体验**
   - 仅 repo-local；未 npm 发布
   - `auth-page` add 未做
   - init 后自动 `pnpm install` / 端口提示可增强

### P2

1. agent-desktop 主画布仍是 mock，未接真实 Agent runtime  
2. desktop host（Electron/Tauri）未实现  
3. OpenAPI → list scaffold 未做  
4. UI Lab 视觉弱接入未做  
5. 更强 `check:ai`（页面三件套静态扫描、禁止 Select 主筛选等）

### P3

1. 测试覆盖（当前有部分 vitest，但 AI/CLI 路径测试不足）  
2. 版本号仍 `0.0.1`，CHANGELOG 仍偏上游 shadcn-admin 历史  

## 8. 建议的后续优化 backlog

### Wave A — 模板打磨（建议下一步）

1. 收敛默认侧栏 IA（保留可删示例，但默认更干净）  
2. 统一中文文案死角（dashboard cards、禁用 tab 等）  
3. scenario apply 时更积极地裁剪无关 demo  
4. README / PROJECT_STATUS / AGENT_BRIEF 保持同步  

### Wave B — Agent Desktop 深化

1. Workspace 接 mock stream / tool call 轨迹  
2. threads 与 workspace 选中态联动  
3. settings 增加“模型/快捷键”分段示例  

### Wave C — 装配系统增强

1. `uilab-admin add auth-page`  
2. CLI 发布策略（或至少 `pnpm link` 文档）  
3. `check` 增强结构审计  
4. shell profile 一等公民（不止文档建议）

## 9. 常用命令

```bash
# 模板本体
pnpm install
pnpm dev
pnpm typecheck
pnpm build
pnpm check:ai

# CLI
pnpm uilab-admin --help
pnpm uilab-admin init my-ops --scenario ops-console --dir ../
pnpm uilab-admin init my-agent --scenario agent-desktop --dir ../
pnpm uilab-admin apply-scenario saas-admin --dir .
pnpm uilab-admin add data-table-list --domain orders --title 订单列表
pnpm uilab-admin set-shell --theme system --sidebar inset --layout default
pnpm uilab-admin check
```

## 10. 关键提交时间线（本轮建设）

| Commit | 内容 |
|---|---|
| `93491f2` | AI contracts / skill / scaffolds |
| `a52e72b` | skill bridge + check:ai |
| `67f658f` | bootstrap/extend/scenario/CLI 合同 |
| `cf7245e` | CLI-1 check/add/set-shell |
| `d267261` | CLI-2 init/apply-scenario |
| `d459d3c` | agent-desktop Workspace 主画布与 bootstrap wiring |

## 11. 状态更新约定

后续每次完成一个可交付阶段，至少更新：

1. 本文件 `PROJECT_STATUS.md`（阶段判断 / 缺口 / backlog）  
2. `CHANGELOG.md` 的 Unreleased（若有用户可见变化）  
3. 必要的 `README.md` / `AGENT_BRIEF.md` 一句同步  

不要把 planned 写成 shipped。
