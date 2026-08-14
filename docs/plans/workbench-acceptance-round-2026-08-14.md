# 验收清单：Agent Workbench 2026-08-14 轮

**Status:** in-progress  
**Vocabulary:** 根 [`CONTEXT.md`](../../CONTEXT.md)  
**应用合同:** [`archetypes/agent-workbench/AGENTS.md`](../../archetypes/agent-workbench/AGENTS.md)  
**Grilling:** 2026-08-14（grill-with-docs）

本轮是 **验收可开**，不是补齐消费级全功能。体验尺子是 **WorkBuddy + Claude Cowork**；本机 `openwork` 仓库只作批判参考，不抄 Workspace-first / 双会话分屏 / Composer 上方 Todo / once-session 授权。

## 已冻结

| 项 | 决定 |
|---|---|
| 目标 | 验收可开；缺口另立项，不挡本轮 |
| 宿主 | 双轨，**优先桌面**（`pnpm dev:workbench-desktop` / Spec-α Electron）。安装器 / 更新 / 签名不验 |
| 工作空间 | **Project**（用户文案「项目」）。不是 Shell 的 Workspace |
| 对话 | **Task / Turn / Run**。不引入 Chat 实体 |
| todo | **只读 Plan**。不引入用户可勾选 Todo |
| 产物 | **打开文件 / URL MVP**。不验 Artifact 目录、Review、Terminal、可编辑 Editor |
| 审批 | 两档 Permission Preset + Dock。不引入 once / session / deny |
| Plan 位置 | Context「计划」+ Timeline「计划已更新」。不在 Composer 上再造 Todo 条 |
| Capability | 验打开 / 状态 / 选用。OAuth 产品化不验 |
| UI 圈 | Composer、Dock、Plan、Timeline 打开文件、桌面开文件夹、Navigator、Context / Work Surface 空态 |
| Context 空态 | **藏起**未实现的环境 / 变更 / 子智能体；只留计划 |
| Composer 项目操作 | **只在 Composer** 选择 / 新建 / 打开项目（WorkBuddy：默认 Composer，项目用默认，不必先选）。接到 Host 命令；无 Host 时禁用 + 诚实文案。Navigator **不**放项目下拉 |
| 已知 bug | 无预置清单；Must 路径上现收现修 |
| 文档 | 本清单 + 诚实化 README / `PROJECT_STATUS.md`。不改 glossary |

明确不学：OpenWork 的 Workspace-first、Session≈Task、双会话分屏、Chat-first 自动建盘、侧栏编辑产物、Terminal / Voice / Automations、远程共享盘。

## 前置

| # | 检查 | Pass? |
|---|---|---|
| P1 | `pnpm dev:workbench-desktop` 打开 Electron（dev-mode） | ☑ 2026-08-14 先 `dev:desktop`，后为 OpenCLI 以 `--remote-debugging-port=9240` 重开（复用 :5174 Vite） |
| P2 | 选中带根 Project 后侧车可达（Host spawn 或 `pnpm dev:workbench-runtime`） | ☑ Host `startRuntime`：D2 新建后 `GET /workspace/info` → `~/AgentWorkbench/未命名项目-20260814-130714` |
| P3 | 模型密钥可用，能打通至少一条真 Turn | ☑ OpenCLI `send`：pong / 写文件 / 命令 / Plan 均走通 |
| P4 | Web 对照：`pnpm dev:workbench` 可开，无 Host | ☑ `http://localhost:5174/` |

## 桌面 Must

| # | 步骤 | 期望 | Pass? |
|---|---|---|---|
| D1 | 打开本地文件夹 | 系统对话框 → 成为当前 Project，出现在列表 | ⊘ CDP / OpenCLI 点不了系统文件夹对话框；需人手 |
| D2 | Projects Home 下新建 | 新建子目录项目并选中 | ☑ 先建 `未命名项目-20260814-130714`（当时展示名未去重，B5）；修后复测展示 `未命名项目-20260814-131827` |
| D3 | 未选 Project 时进 Composer | 冷启动直接 Composer；在 Projects Home 自动建根并挂上「新对话」 | ☑ 清掉 session 指针后自动建 `项目-20260814-131816` 并挂上 Task。2026-08-14 改版后不再先停在「未选择项目」空壳 |
| D4 | 已选 Project 后再新 Task | 共用同一根，不另建平级目录 | ☑ 新对话后 sidecar `workspaceRoot` 未变 |
| D5 | 新建 / 发送 / 流式 / 停止 / 刷新恢复 / 硬删 Task | 目录与 Timeline 一致；硬删不可恢复 | ☑ pong 流式；长诗「已取消」；`location.reload` 恢复 34 条；硬删「新对话」后列表回到 1 |
| D6 | 写文件白名单 | `auto-approve` 下写文件自动批 | ☑ `hello-opencli.md` = `opencli-ok`；Timeline「已按「帮我批准」预设自动批准」 |
| D7 | 命令 / 未知工具 | 弹出 Approval Dock；允许 / 拒绝可完成 | ☑ `echo opencli-dock` 允许一次（退出码 0）；`echo opencli-reject` 拒绝未执行 |
| D8 | 完全访问 | 一律自动批 | ☑ 切到「完全访问」后 `echo opencli-full` 自动批 |
| D9 | Plan | Context 出现步骤与进度；随 `update_plan` 更新；Timeline 有「计划已更新」 | ☑ 三步 + `1/3`；Timeline「计划已更新」；`大纲.md` 已落盘 |
| D10 | 文件引用 | Timeline 点本地文件 → Document Surface | ☑ 展开「写入」后点「已编辑 hello-opencli.md」→ Document `ready` / `opencli-ok`。工作区 hint 过期见 B4 |
| D11 | URL | 点 http(s) → Browser Surface | ☑ 修 B6 后点 `[示例](https://example.com/)` → Browser Surface 地址栏 `https://example.com/` |
| D12 | 侧车不可达 | `run.failed` / 错误事实，不伪装本地流 | ◐ 杀掉 Host 侧车后发送被拦截：「运行时尚未就绪…」；无 Fake 流。未看到 `run.failed` 卡片（Turn 未进 Runtime） |
| D13 | Capability | 能打开管理面，能看连接器 / 技能 / 专家状态，能按 Task 选用 | ☑ Navigator「专家·技能·连接器」：连接器 3 / 专家 2 / 技能 31；Composer「+」可见连接器并有启用 |
| D14 | Composer 项目入口 | 只在 Composer；Host 命令或诚实禁用。侧栏无项目下拉 | ☑ 桌面：Composer 新建与打开可用。2026-08-14 改版后 Navigator 项目下拉已移除 |

## Web Must（降级）

| # | 步骤 | 期望 | Pass? |
|---|---|---|---|
| W1 | Task / 审批 / Plan / 打开文件 | 与桌面同语义，侧车可用时能走通 | 未跑（空态已见 Plan / 帮我批准） |
| W2 | 打开文件夹 / 新建项目 | **禁用**，文案说明需要桌面宿主 | ☑ Composer 项目菜单 `aria-disabled`；文案「浏览器环境无法选择本地文件夹…」。侧栏不再有项目下拉 |
| W3 | 冷启动 | 默认 Project 夹具 + 直接 Composer；不当成桌面同款 | ☑ 「默认项目」+ Composer empty hub + 1 条「新对话」 |
| W4 | 无侧车 | 错误事实，不装回 Fake Runtime | 未跑 |

## 本轮不验

- Artifact 实体目录、`artifact.*` 投影、Review / Terminal / 可编辑 Editor / Spreadsheet
- steer、Runtime `retryTurn`、用户改 Plan、删 Project
- 附件字节、Context 环境 / 变更 / 子智能体
- 远程生产 Runtime、跨标签页 IDB、导入导出
- 安装器 / 自动更新 / 签名、Tauri、Workbench `init` 生成
- Capability OAuth 产品化、once / session 授权记忆

## UI 打磨圈（Must 路径上才改）

- Composer、Approval Dock、Plan 块
- Timeline 文件 / URL 打开
- 桌面开文件夹、Composer 项目 chip、Navigator 任务列表
- Context 空态（只留计划）、Work Surface 空态 / 标签

## 记录

验收中发现的 bug / UI 债记在本文件末尾，Must 路径当场修；缺口只立项。

### 2026-08-14 已发现

| ID | 路径 | 现象 | 处置 |
|---|---|---|---|
| B1 | D14 / 诚实 | Composer 空态项目 chip 的「新建 / 打开文件夹」仍走本地模拟文案，与 Navigator Host 命令不是一条路 | **已修**：产品路径接同一套 Host 命令；无 Host 时禁用 + 与 Navigator 同文案 |
| B2 | 文档诚实 | `document.title` 仍是「Agent Workbench — Phase 3 Shell」 | **已修**：标题改为 Agent Workbench |
| B3 | Navigator | 「看板」「自动化」仍是未接入入口 | 本轮不验；中圈可收口文案 |
| B4 | D10 诚实 | Document「工作区」hint 仍是首次 sidecar fetch 的 e2e 路径，Host 换根后不刷新 | **已修**：Composition 把当前 Project `localRoot` 作为 preferredHint；sidecar fetch 不再覆盖。复测 hint=`~/AgentWorkbench/未命名项目-20260814-130714` |
| B5 | D2 展示 | `createProject` 目录会去重，展示名仍用 preferred，列表出现两个「未命名项目」 | **已修**：目录名用实际 basename。复测新建显示 `未命名项目-20260814-131827` |
| B6 | D11 | Timeline `https` Markdown 链接走 `target=_blank`，不进 Browser Surface | **已修**：有 `onOpenFileRef` 时拦截点击并打开 Browser Surface（`timeline-url-link`） |
| — | Q16 | Context 产品路径只渲染「计划」，未实现块未露出 | 已满足，无需改 |
| B7 | 交互 | 侧栏项目下拉把「选项目」做成进 Composer 的门闸；无 Task 时主区是「还没有任务」 | **已修**：去掉 Navigator 项目下拉；冷启动 / 删光 Task 后自动打开「新对话」Composer；项目只在 Composer chip 切换，默认用当前/自动项目 |

### OpenCLI 桌面测验（2026-08-14）

Electron 需带 CDP：`--remote-debugging-port=9240 --remote-allow-origins=*`。站点 `workbench` 在 `~/.opencli/apps.yaml` + `~/.opencli/clis/workbench/`。

```bash
opencli workbench status
opencli workbench probe
opencli workbench click <data-testid>
opencli workbench send "…"
opencli workbench eval '<js>'
```

D1 仍需人手点系统文件夹对话框。
