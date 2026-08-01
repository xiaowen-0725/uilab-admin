# Bootstrap & Extend Contract

本文件定义 uilab-admin 的 **0→1** 与 **1→100** 分工。  
实现尚未全部落地时，以本文件为产品合同；Agent 不得把 planned 能力说成 already shipped。

## 已锁定决策

1. **创建方式**：以 `uilab-admin init <app>` 创建新目录为主；也兼容已 clone/fork 后的 `apply-scenario`
2. **桌面端成熟度**：当前 **L1 + L2**
   - L1：按 scenario 推荐模块 / 布局 / 目录（默认仍是 Vite web 可运行）
   - L2：预留 desktop host 边界与接入说明，**不**在第一期接入完整 Electron/Tauri 运行时
   - 必须保留后续接 Electron / Tauri 的扩展点，不得把 web-only 假设写死进 kernel
3. **CLI 命令名**：`uilab-admin`
4. **分工**：
   - Skill：判断场景、推荐构成、编排步骤、review
   - CLI：确定性创建/落文件/写配置/检查

## 两种主模式

| 模式 | 阶段 | 入口 | 目标 |
|---|---|---|---|
| `bootstrap` | 0→1 | 新应用 | 从本模板派生可运行应用，并套上 scenario pack |
| `extend` | 1→100 | 已有派生应用 | 按 pattern 加页面、改 shell、做合规检查 |

可选后置：`adopt`（非本模板老项目靠拢）—— **第一期不做**。

## Bootstrap（0→1）

### 何时进入

用户说类似：

- 我要做一个新的运营后台 / SaaS admin / Agent 桌面端
- 基于 uilab-admin 开新项目
- 初始化一个模板应用

### 标准流程

1. **识别场景**（Skill）
   - 读取 `docs/ai/scenarios.catalog.json`
   - 推荐 1 个 scenario（可给 1 个备选）
2. **输出确认卡**（Skill，用户确认前不写仓库）
   - app name
   - scenario id
   - runtime target（`web` 默认；`desktop-host-ready` 表示 L2 预留）
   - shell defaults
   - required / recommended modules
   - 将删除或降级的 demo
   - 后续 desktop host 说明（若相关）
3. **确定性生成**（CLI）
   - `uilab-admin init <app-name> --scenario <id>`
   - 或对已有拷贝：`uilab-admin apply-scenario <id>`
4. **回报**（Skill）
   - 如何 `pnpm install && pnpm dev`
   - 已装模块与可删示例
   - 下一步 `extend` 建议

### Bootstrap 产物（目标）

```text
<app>/
  package.json                 # name 已替换
  src/                         # 模板内核
  src/config/admin-preferences.ts
  src/components/layout/data/sidebar-data.ts
  docs/ai/                     # 可保留模板合同；应用可再有 APP_BRIEF.md
  APP_BRIEF.md                 # 该应用自己的一句话 + scenario + 模块清单
  desktop/README.md            # L2：host 接入说明（非完整实现）
```

### Bootstrap 必须做

- 从本模板派生，而不是空 Vite 项目再手拼
- 写入 scenario 的 shell defaults
- 安装 required modules（或保留其参考实现并注册导航）
- 裁剪明显无关 demo（按 scenario.excludeDemos）
- 生成/更新 `APP_BRIEF.md`
- 通过 `pnpm typecheck` / `pnpm build` / `pnpm check:ai`（若在模板仓库规范内）

### Bootstrap 第一期明确不做

- 完整 Electron/Tauri 打包与窗口管理实现
- 任意老项目智能迁移（`adopt`）
- UI Lab Design Package / Create 主链路绑定
- 多客户白标 marketplace

## Extend（1→100）

### 何时进入

- 项目已基于 uilab-admin
- 用户要加列表/设置/认证、改导航/默认布局、做 review

### 对应 skill 路线

| 用户意图 | Skill route | CLI（目标） |
|---|---|---|
| 加列表/设置/认证页 | `scaffold` | `uilab-admin add ...` |
| 改默认布局/导航 | `shell` | `uilab-admin set-shell` / `set-nav` |
| 只读检查 | `review` | `uilab-admin check` |
| 只了解地图 | `discover` | 无 |

### Extend 硬规则

仍遵守 `AGENTS.md`：

- feature + route + nav 三件套
- 列表走 data-table pattern
- Base UI，不回潮 Radix
- 布局差异走 preferences，不 fork layout

## Scenario Pack

场景不是“再 fork 一套模板”，而是：

```text
同一 Kernel
+ shell defaults
+ module pack
+ nav IA 建议
+ demo 裁剪建议
+ desktop host readiness 标记
```

真源：

- 目录：`docs/ai/scenarios.catalog.json`
- 说明：`docs/ai/scenarios/*.md`

第一期内置：

1. `ops-console` — 运营/内部中后台
2. `saas-admin` — 通用 SaaS 管理端
3. `agent-desktop` — Agent 工作台（L1 可运行 web；L2 desktop-host-ready）

## Desktop Host 边界（L1 + L2）

### 现在

- 默认可运行面：Vite web admin shell
- `agent-desktop` 等 scenario 只要求：
  - 模块与信息架构按工作台组织
  - 存在 `desktop/` 预留说明与扩展点
  - 不在 renderer 里写死 `window` 专属 API 作为唯一路径

### 后续接 Electron / Tauri 时

保留这些边界，避免推倒重来：

| 层 | 职责 | 约束 |
|---|---|---|
| `src/` renderer/app | UI、路由、feature、preferences | 不直接依赖具体桌面框架 API |
| `desktop/host-*` | 窗口、菜单、深链、自动更新、文件协议 | 可替换 Electron/Tauri |
| bridge | 预加载/IPC 契约 | 以接口文档为准，feature 只依赖 bridge 类型 |

第一期在 `desktop/README.md` 写清接入步骤即可；**不要假装已实现 host**。

## 当前实现状态（避免夸大）

| 能力 | 状态 |
|---|---|
| 模板内 discover / scaffold / shell / review | shipped（skill） |
| pattern scaffolds + check:ai | shipped |
| scenario catalog / bootstrap 合同 | **spec shipped / runtime partial** |
| CLI `uilab-admin check/add/set-shell` | **shipped (CLI-1)** |
| CLI `uilab-admin init/apply-scenario` | **planned (CLI-2)** |
| Electron/Tauri host | **planned** |

Agent 话术：

- 可以说“按 bootstrap 合同推荐场景与构成”
- 在 CLI 未落地前，0→1 应明确：先手动 clone 模板，再按 scenario 手工/半自动 apply
- 不可说“已一键生成桌面端安装包”

## 与 UI Lab 关系

- uilab-admin 独立
- bootstrap/extend 不依赖 UI Lab runtime
- 未来若接视觉，只作为可选增强，不进本文件主路径
