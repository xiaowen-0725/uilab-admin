# Agent Workbench Template Implementation Roadmap

## Objective

在保留当前 Admin 模板可用性与交互质量的前提下，把仓库演进为中立的 Template Platform，并交付可生成、可扩展、可测试的生产级 Agent Workbench Archetype。首版以 Web Renderer 运行，Agent Runtime 位于 Renderer 外部，Desktop Host 只保留 Adapter Seam。

路线图实现已经接受的 ADR-0001 至 ADR-0014。它取代当前把 `agent-desktop` 视为 Admin scenario 的长期方向，但迁移期间必须提供兼容路径，不能静默破坏现有 CLI 用户。

## Delivery constraints

- Admin Console 与 Agent Workbench 是平级 Archetype，不共享 UniversalShell。
- Derived Application 使用 copy-and-own，不自动同步模板源码。
- Foundation 只接收被 Admin 与 Agent Workbench 证明语义一致的能力。
- Work Surface Host 首版采用 Single-pane + Tabs，支持显隐、调宽与最大化。
- 首版交付 Document、Browser、Review Surface 与 Resource Explorer。
- Terminal、完整 Editor、任意 Multi-pane、拖拽重排和完整 Electron/Tauri Host 不属于首版。
- Agent Runtime、Git、文件系统、Browser Host 和持久化通过 Module 所有的 Port 与 Adapter 接入。
- 每个变更阶段都必须保持可运行、可回退和可独立验收。

## Current baseline

当前仓库已经具备：

- Template Platform monorepo：`archetypes/admin`（可运行 Admin）、`archetypes/agent-workbench`（Phase 3 可运行静态 Shell）、`tooling/template-cli`、`tooling/quality-gates`、根兼容 wrapper 与 `skill/uilab-admin` 前门。
- **Phase 2A minimal Foundation seam**：`packages/foundation`（`@uilab/foundation`）公开 Interface 仅 `ui/button`、`ui/input`、`styles/tokens.css`；Admin 经 `@/components/ui/*` 兼容 re-export 消费；Workbench 直接消费公开子路径；`check:foundation` 边界门禁；`init` copy-and-own 到派生应用 `packages/foundation` + mini-workspace。
- **Phase 3 Workbench Shell skeleton（shipped）**：Composition Root、Navigator、Task Surface、Composer、Adaptive Context Panel、placeholder Work Surface Host、task-scoped layout session、静态 fixture、`check:workbench`。
- **Phase 3A inset layout polish（shipped）**：Admin inset / Codex 空间关系 — sidebar 背景、272px Navigator、8px inset Workspace、合并顶栏、TaskSurface content-only、浮动 Composer、pointer/keyboard 分源动效；独立 Playwright/动效证据已落盘。**非** Phase 4。
- **Phase 3B Codex pane chrome + motion（shipped）**：Task/Work peer 44px toolbars；右锚定 reserved-space Work drawer vs keyboard instant；Codex 语义图标；Context pointer entry；Playwright/动效证据已落盘；**无** Runtime / Surface。
- Vite + React 19 + TypeScript + Tailwind CSS 4 + shadcn Base UI + TanStack 基础栈（Admin 源在 `archetypes/admin`；Workbench 使用小型 code-defined Router）。
- Admin Shell、主题、动画、数据表格、认证、设置与错误页参考实现。
- Admin-owned AI 合同：`archetypes/admin/docs/ai/*` 与 `archetypes/admin/scaffolds/*`。
- `uilab-admin` CLI 的 `check`、`add`、`set-shell`、`init`、`apply-scenario`（规范实现在 `tooling/template-cli`；**仍仅生成 Admin**）。
- `agent-desktop` scenario 与 `/workspace` mock 页面（Admin 兼容基线）。
- `pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm check:foundation`、`pnpm check:workbench`、`pnpm check:ai` 门禁；Admin Browser Mode 18 files / 108 tests；Foundation 与 Workbench 另有 focused Browser 测试。

**说明：** Phase 2A + Workbench 第二消费者已落地，**仍不**宣称完整 Phase 2 验收完成（缺更广 primitives/providers 与共享 theme Provider）。Phase 3 **不**包含 Runtime、Surface Registry、具体 Surface 或 CLI Workbench 生成。

当前 `/workspace` 是 Admin Shell 内的三卡片示例，不是 Agent Workbench 的 Kernel。长期 Workbench 以 `archetypes/agent-workbench` 为准。`agent-desktop` 仍作为迁移期兼容 scenario 保留。

## Target repository shape

```text
uilab-templates/
├── archetypes/
│   ├── admin/
│   └── agent-workbench/
├── packages/
│   └── foundation/
├── tooling/
│   ├── template-cli/
│   └── quality-gates/
└── docs/
```

Agent Workbench 内部结构以 [Agent Workbench Module Layout](../architecture/agent-workbench-module-layout.md) 为准。

## Phase 0 — Freeze the baseline

### Purpose

在目录迁移前建立可重复的 Admin 行为基线，避免结构改动掩盖功能回归。

### Deliverables

- 将 ADR、词汇表、调研和本路线图形成独立提交。
- 记录 Admin 当前路由、导航、主题设置、搜索、用户菜单与数据表格行为。
- 为 CLI 的 `init`、`apply-scenario`、`add`、`set-shell` 建立输入/输出清单。
- 用 Playwright 保存桌面宽屏关键页面截图与最小交互证据。
- 明确现有 `agent-desktop` scenario 的兼容策略：迁移后作为 deprecated alias，映射到 Agent Workbench Archetype，至少保留一个迁移周期。

### Acceptance

```bash
pnpm typecheck
pnpm build
pnpm check:ai
pnpm test
```

Playwright 验证：导航可达、搜索可打开、设置抽屉可操作、用户菜单可打开、Tasks 表格可筛选、`/workspace` 可访问。

### Exit condition

存在一份可对照的 baseline evidence；后续迁移失败时能明确判断是结构问题还是原有问题。

## Phase 1 — Establish the Template Platform monorepo

### Purpose

完成物理目录重构，同时保持 Admin 行为和现有 CLI 主路径可用。

### Deliverables

- 建立根 `pnpm-workspace.yaml`、共享 TypeScript/ESLint/Prettier 配置和根编排脚本。
- 将当前应用等价迁移到 `archetypes/admin`。
- 将 CLI 移入 `tooling/template-cli`，质量门禁移入 `tooling/quality-gates`。
- 根命令继续提供 Admin 开发、构建和全仓门禁入口。
- 修正路径别名、Vite、TanStack Router 生成、Vitest、Playwright 和静态资源路径。
- 更新 `AGENTS.md`、`PROJECT_STATUS.md`、README、skill 与 Bootstrap/CLI 合同，使其表达多 Archetype 平台。
- 保留 `uilab-admin` 命令兼容入口；中立 CLI 名称另行决策，不在迁移中顺手重命名。

### Acceptance

- `archetypes/admin` 的路由、导航、视觉和关键交互与 Phase 0 baseline 一致。
- `uilab-admin init` 仍可生成 Admin Derived Application。
- CLI 在工作区路径和打包后路径下都能解析模板、scaffold 与 routeTree。
- 根级和 Admin 包级 `typecheck`、`build`、`test`、`check:ai` 全部通过。

### Rollback seam

目录移动和合同改写拆成独立提交；若 CLI 路径迁移失败，可以保留兼容 wrapper，而不是回滚 Admin 应用迁移。

## Phase 2 — Create the minimal Foundation

### Purpose

建立跨 Archetype 的真实复用基线，不把 Admin 专属结构包装成共享能力。

### Phase 2A status（当前已交付）

见 work order [`phase-2a-minimal-foundation-work-order.md`](./phase-2a-minimal-foundation-work-order.md) 与证据 [`../evidence/phase-2a-minimal-foundation.md`](../evidence/phase-2a-minimal-foundation.md)。

已落地：`packages/foundation` 的 Button/Input/tokens、Admin 兼容消费、Tailwind `@source`、边界门禁、init materialization。
**未完成（完整 Phase 2）**：Workbench 第二消费者、主题 Provider 共享、更多 primitives。

### Deliverables

- 创建 `packages/foundation`，提供设计 Token、主题 Provider、Base UI primitives、纯样式工具和必要的无业务 hooks。
- Admin 与 Agent Workbench 都通过同一公开 Interface 消费 Foundation。
- Admin Shell、data-table、认证、设置和具体布局继续留在 Admin Archetype。
- 为 Foundation 建立公开导出清单、视觉样例和基础可访问性测试。
- 增加依赖门禁：Foundation 不得反向依赖任何 Archetype。

### Acceptance

- Button、Input、Popover、Dialog、Tabs、Tooltip、Scroll Area 等首批 primitive 在两个 Archetype 中以相同语义工作。
- 主题、方向和 reduced-motion 设置在两个 Archetype 中一致。
- 删除 Foundation 后，通用复杂度会重新出现在两个 Archetype；否则该抽取应撤销。
- Admin baseline 不回归；两个 Archetype 分别通过 typecheck/build。


## Phase 3 — Build the Workbench Shell skeleton

### Status

**Shipped and independently verified** as `@uilab/agent-workbench` (static Shell only). Evidence: [`phase-3-workbench-shell-skeleton.md`](../evidence/phase-3-workbench-shell-skeleton.md).

### Purpose

先验证生产级空间模型与响应式行为，不接真实 Agent Runtime。

### Deliverables

- 创建 `archetypes/agent-workbench` 的 Composition Root、Provider、Router 与配置入口。
- 实现 Navigator、Task Surface 和 Composer。
- 实现 Adaptive Task Context Panel：宽 Task Reserved-space，窄 Task Overlay（container query）。
- 实现空的 Work Surface Host：Single-pane + Tabs、显隐、调宽、最大化。
- 新 Task 默认 Task-only；打开工作内容时展开 Work Surface，并按 Task 恢复状态。
- 实现键盘焦点顺序、面板开关快捷键和 reduced-motion 降级。
- 使用静态 fixture，不在 UI 中伪装真实 Agent 执行。
- 根编排：`dev:workbench` / `check:workbench`；Foundation 第二消费者校验（不扩 exports）。

### Acceptance

- 1440px：Task Context Panel 占位且不覆盖 Task 内容。
- 1024px：Task Surface 与 Work Surface 可并排，最小宽度受控。
- 窄窗口：Task Context Panel 切换 Overlay，Work Surface 可最大化或串行展示。
- 新 Task 为 Task-only；Task A 与 Task B 的工作面状态互不污染。
- Navigator、Composer、Context Panel 与 Work Surface 可完全通过键盘操作。
- Playwright 对 Task-only、Context-open、Work-open、Work-maximized 四个状态截图回归。

## Phase 3A — Workbench inset layout polish

### Status

**Shipped.** Work order: [`phase-3a-workbench-inset-layout-polish-work-order.md`](./phase-3a-workbench-inset-layout-polish-work-order.md). Evidence: [`phase-3a-workbench-inset-layout-polish.md`](../evidence/phase-3a-workbench-inset-layout-polish.md).

### Purpose

Align Workbench Shell with Admin `inset` spatial model and Codex-style hierarchy **without** starting Phase 4 Runtime work.

### Deliverables

- Sidebar background plane + inset Workspace (8px / 12px radius / border+shadow; narrow full-bleed).
- 272px reserved Navigator; always mounted while collapsed for interruptible motion; overlay closed is non-interactive.
- Single task-aware Workspace top bar; TaskSurface content-only.
- Centered execution stream + floating Composer (still no Runtime).
- Content-height Context card; reserved/overlay container queries preserved.
- Pointer Navigator toggle 180ms drawer curve; keyboard `Ctrl/Cmd+B` instant; Shell-owned motion source.

### Non-goals

No Runtime, Surfaces, theme provider, CLI Workbench generation, Admin Shell changes, or Foundation export expansion.

## Phase 3B — Codex pane chrome + pointer motion

### Status

**Shipped and independently verified.** Work order: [`phase-3b-codex-pane-chrome-motion-work-order.md`](./phase-3b-codex-pane-chrome-motion-work-order.md). Evidence: [`phase-3b-codex-pane-chrome-motion.md`](../evidence/phase-3b-codex-pane-chrome-motion.md).

### Purpose

Replicate Codex Desktop Task/Work peer pane chrome and pointer continuity motion on the Phase 3/3A placeholder Host **without** implementing Runtime or concrete Surfaces.

### Deliverables

- Task pane owns 44px toolbar (compat `workspace-top-bar`); Work Host owns peer 44px tab toolbar.
- Icon-only Context/Work/maximize/close controls; no Task subtitle in toolbar.
- Pointer Work open/close/maximize/restore via an interruptible right-anchored reserved-space drawer (200/160/180ms); keyboard instant; Work content never snapshot-scales.
- Context pointer open 140ms opacity + translateY(-4px); close immediate; keyboard instant.
- Shell-owned `data-pane-motion` / `data-context-motion`; integration tests for geometry and motion source.

### Non-goals

No Document/Browser/Review Surfaces, Runtime, conversation/Composer redesign, Session model changes, Admin/Foundation changes.

## Phase 4 — Implement the Task lifecycle with a Fake Runtime

### Status

**Fake path template-complete (2026-08-04).** Phase 4A Codex observation **Approve 12/12**. Phase 4B Kernel + Fake **shipped**. Phase 4C dual-path vertical slice **shipped**. Phase 4D reasoning/tool/approval **shipped**. Phase 4E MemoryEventStore + queue/steer/reconcile **shipped** (memory only). Phase 4F long-content fold + smart scroll **shipped**. Evidence: `docs/evidence/phase-4-fake-complete.md`. **Not** production Runtime / Surfaces / IndexedDB.

Work orders:

- 4A: `docs/superpowers/plans/2026-08-03-phase-4a-codex-observation.md` (sealed; evidence in worktree + Application Support raw)
- 4B: `docs/plans/phase-4b-runtime-kernel-fake-work-order.md` + evidence `docs/evidence/phase-4b-runtime-kernel-fake.md` (shipped scaffold)
- 4C: `docs/plans/phase-4c-task-pane-vertical-slice-work-order.md` + evidence `docs/evidence/phase-4c-task-pane-vertical-slice.md` (shipped dual-path vertical slice)
- 4D–4F: per umbrella design §18 (`docs/superpowers/specs/2026-08-02-codex-task-pane-runtime-design.md`)

### Purpose

用可确定测试的 Fake Adapter 跑通 `Project → Task → Turn → Run → RuntimeEvent`，再接远端系统。

### Deliverables

- 定义 Runtime Command、Agent Runtime Event、Snapshot 与 Task Projection schema。
- 实现 Task reducer/projection、事件去重、顺序检查和未知事件降级。
- 实现 `SendMessage`、`CancelRun`、`RetryRun`、`ApproveTool` 的 Command 流程。
- Fake Runtime 支持文本流、工具调用、批准等待、Artifact 产生、失败、取消和恢复。
- Workbench Session 协调当前 Task、Projection、活动 Surface 与布局状态。
- UI 只消费 Projection，不直接拼接 stream chunk 或修改 Run 内部状态。

### Acceptance

- 相同 Snapshot + Event 序列总是产生相同 Task Projection。
- 重复事件不会重复渲染；缺号或乱序事件进入明确恢复路径。
- 页面刷新后先恢复 Snapshot，再无重复地续接后续事件。
- Cancel、Retry、Approve 的状态机拥有单元测试和集成测试。
- 10,000 个事件的投影不出现明显 O(n²) 退化。
- Playwright 跑通发送任务、流式回复、工具批准、取消和重试。

## Phase 5 — Establish the Work Surface Registry

### Purpose

把 Work Surface Host 深化为稳定 Module，使新增 Surface 不需要修改 Host。

### Deliverables

- 定义小型 `SurfaceDefinition` Interface：类型、标题、资源匹配、生命周期和渲染入口。
- Composition Root 注册 Surface；Host 不 import 具体 Surface Implementation。
- 实现 open、activate、close、restore、maximize 和 unknown-surface fallback。
- Surface 状态按 Task 保存，关闭 Task 时释放临时资源。
- 支持 Artifact/Tool Event 请求打开 Surface，但最终动作经过 Workbench Session 协调。

### Acceptance

- 使用测试 Surface 即可覆盖 Registry 与 Host 全部行为。
- 新增一个示例 Surface 只需要实现 Interface 并在 Composition Root 注册。
- Host 测试不依赖 Document、Browser 或 Review 的内部 Implementation。
- 无法解析或版本不兼容的 Surface 状态不会阻止 Task Surface 恢复。

## Phase 6 — Deliver the initial Work Surfaces

### Phase 6A — Document Surface

#### Deliverables

- Renderer Registry 根据资源类型选择 text、code、Markdown、DOCX、PDF 或 spreadsheet-preview。
- HTML 源码在 Document Surface 查看；渲染结果交给 Browser Surface。
- 提供 loading、empty、unsupported、too-large 和 render-failed 状态。
- 大文件按格式采用分页、虚拟化或延迟渲染；Renderer 独立分包。
- XLSX 首版只读；不得泄漏单元格编辑、公式和 Sheet 写入 Interface。

#### Acceptance

- 支持的格式拥有 fixture 与 Renderer 合同测试。
- 未知格式显示安全 fallback，可下载或打开外部工具。
- 恶意 Markdown/HTML 不执行未授权脚本。
- 重型 DOCX/PDF/XLSX 依赖不进入初始 Task-only bundle。

### Phase 6B — Browser Surface

#### Deliverables

- 定义 Browser Host Port，先提供 Web Adapter。
- 支持地址、加载、刷新、前进后退、打开外部浏览器和错误状态。
- 明确 iframe sandbox、跨域、下载、弹窗和权限策略。
- 保留 Desktop Host Adapter Seam，不在 Renderer 直接调用 Electron/Tauri。

#### Acceptance

- 本地预览、公开 URL、加载失败和跨域受限场景都有明确结果。
- Browser 资源在 Surface 关闭或 Task 切换时正确释放。
- Playwright 验证打开、刷新、导航、错误和外部打开意图。

### Phase 6C — Review Surface and Resource Explorer

#### Deliverables

- Review Surface 通过 Git Port 读取变更集合、文件 Diff 和审查状态。
- Resource Explorer 由 Project Module 提供，只作为 Document/Review 的辅助面板。
- 支持文件选择、变更状态、Diff 展开与从 Runtime Event 定位相关文件。
- 提交、推送等外部副作用不作为首版默认能力；若加入必须单独设计确认与权限流程。

#### Acceptance

- 大 Diff 使用按文件加载或虚拟化，不阻塞 Task Surface。
- Resource Explorer 与 Navigator 的选择模型互不混淆。
- Review 与 Document 可通过同一资源引用互相切换。
- Git Adapter 合同测试覆盖无仓库、干净仓库、未提交变更和读取失败。

## Phase 7 — Connect a production Agent Runtime Adapter

### Purpose

在 UI、Projection 和状态机已经通过 Fake Runtime 验证后，再接真实运行服务。

### Deliverables

- Command transport Adapter，以及 SSE、WebSocket 或宿主流的 Event Adapter。
- 身份认证、Task/Run 关联、幂等键、断线重连、事件游标和 Snapshot 获取。
- Runtime capability negotiation：是否支持取消、重试、批准、Artifact、子 Run 等。
- 错误分层：用户输入错误、权限错误、网络错误、Runtime 错误和协议不兼容。
- 凭据与工具授权不落入 Renderer 持久化状态。
- 生产 Adapter 与 Fake Adapter 通过同一 Port 合同测试。

### Acceptance

- 真实 Runtime 跑通发送、流式事件、工具批准、Artifact、取消、失败与恢复。
- 网络中断后从最后游标恢复，不重复生成 Turn、Run 或 Artifact。
- Runtime 缺少可选 capability 时 UI 正确降级。
- Renderer 不包含 Agent 执行引擎、长期凭据或宿主专属调用。

## Phase 8 — Productize Archetype generation

### Purpose

把已验证的 Workbench 从仓库内应用变成可派生模板。

### Deliverables

- Template CLI 支持显式选择 `admin` 或 `agent-workbench` Archetype。
- 现有 `--scenario agent-desktop` 作为 deprecated compatibility alias，输出迁移提示。
- Agent Workbench 提供 APP_BRIEF、配置入口、Surface/Adapter 注册示例和可删 Fake Runtime。
- 新增 Surface 与 Adapter scaffold，并更新 skill 的 bootstrap/discover/scaffold/review 路由。
- `check:ai` 增加 Archetype 结构、Module 公开 Interface、禁止跨内部路径引用和 Surface 注册检查。
- Derived Application 生成后不依赖 Template Platform runtime，符合 copy-and-own。

### Acceptance

- 从干净目录分别生成 Admin 与 Agent Workbench Derived Application。
- 两个生成应用独立安装、typecheck、build、check:ai，并可启动关键路由。
- Agent Workbench 生成物不包含 Admin Dashboard、data-table 或 Admin Shell 噪音。
- Admin 生成物不包含 Agent Runtime、Task Surface 或 Work Surface 依赖。
- 兼容 alias 的输出、退出码和弃用文案拥有 CLI 测试。

## Phase 9 — Production hardening and release candidate

### Deliverables

- 完整错误边界、空状态、重试、离线/重连提示和任务恢复体验。
- 键盘导航、屏幕阅读器标签、焦点恢复、颜色对比和 reduced-motion 审核。
- Task-only 首屏、Surface lazy chunk、长事件流、大文件和大 Diff 性能预算。
- Telemetry Port 记录 Run 延迟、断线恢复、Surface 错误和用户可感知失败，不上传敏感内容。
- Security review 覆盖 Markdown/HTML、Browser sandbox、文件访问、外部链接、工具批准和凭据边界。
- 更新 README、PROJECT_STATUS、CHANGELOG、AI docs、skill 与生成应用文档。

### Acceptance

- 全仓 typecheck、build、test、check:ai 和 knip 通过。
- Playwright 覆盖新建/恢复 Task、流式 Run、批准、取消、Artifact 打开、Browser、Review 和多 Task 状态隔离。
- 在目标桌面宽度和最小支持窗口下通过视觉回归。
- 由新用户仅根据 README 和 skill 成功生成并运行两个 Archetype。

## Milestones

| Milestone | Included phases | Demonstrable outcome |
|---|---|---|
| M0 Platform split | 0–2 | Admin 无回归，仓库具备平级 Archetype 与最小 Foundation |
| M1 Workbench shell | 3 | 可交互的 Task-first Shell 与自适应 Context Panel |
| M2 Fake vertical slice | 4–5 | Fake Runtime 驱动完整 Task/Run 流，Surface Host 可扩展 |
| M3 Initial surfaces | 6 | Document、Browser、Review 与 Resource Explorer 可用 |
| M4 Runtime integration | 7 | 真实 Agent Runtime 可恢复地驱动 Workbench |
| M5 Template RC | 8–9 | 两个 Archetype 可独立生成、验证和交付 |

## Cross-phase quality gates

所有修改阶段至少执行：

```bash
pnpm typecheck
pnpm build
pnpm check:ai
```

按风险增加：

```bash
pnpm test
pnpm lint
pnpm knip
```

涉及路由、Shell、Task 状态或 Surface 时，必须使用 Playwright CLI 验证关键流程并保留截图或 trace 证据。不得仅凭实现者 stdout 宣称完成。

## Main risks and controls

| Risk | Control |
|---|---|
| Monorepo 搬迁导致路径和 CLI 解析回归 | Phase 0 baseline；目录移动与合同改写分提交；保留兼容 wrapper |
| Foundation 变成第二个共享杂物层 | 只接收两个 Archetype 同语义使用的 Module；增加依赖方向门禁 |
| 旧 `agent-desktop` scenario 用户被破坏 | deprecated alias + CLI 测试 + 明确迁移周期 |
| Runtime 协议漂移污染 UI | Command/Event schema、capability negotiation、Projection 和 Adapter 合同测试 |
| Task 状态跨任务泄漏 | 所有 Workbench Session 与布局状态以 `taskId` 为作用域 |
| 文档 Renderer 拉高首屏体积或执行不安全内容 | Surface lazy loading、格式限制、sandbox/sanitize、失败隔离 |
| Browser Surface 在 Web 环境能力受限 | Browser Host Port、显式 capability、Desktop Adapter 后置 |
| Review 大 Diff 阻塞任务交互 | 分文件加载、虚拟化、独立错误边界和 lazy chunk |
| 过早实现 Multi-pane、Terminal 或完整 Editor | ADR 门禁；首版 Interface 不暴露这些承诺 |

## Execution protocol

每个 Phase 在开始实现前拆成自包含 Work Order，写明背景、路径、改动、禁止项和验收命令。Codex 负责设计冻结、Work Order、代码审查、测试和最终判断；已定方案的机械迁移与实现默认交给 Grok Build。每个 Work Order 最多重派两轮，仍未通过时由 Codex 接手修正。

Phase 0 与 Phase 1 不并行：先获得 baseline，再移动目录。Phase 3 可以与 Phase 2 的非重叠 Foundation 工作并行，但 Agent Workbench 不得绕过 Foundation 自建第二套 UI primitive。Phase 4 先于真实 Runtime，Phase 5 先于具体 Surface，Phase 8 只在垂直切片稳定后开始。

## First executable Work Order

第一个 Work Order 只执行 Phase 0，不移动目录：

1. 提交当前 ADR、词汇表、调研、架构蓝图和路线图。
2. 跑完整 Admin 门禁并记录版本信息。
3. 用 Playwright CLI 记录 Admin 关键页面和交互 baseline。
4. 对 CLI 五条 shipped 主路径做临时目录 smoke，并保存输入、退出码和生成物证据。
5. 输出 Phase 1 的精确移动清单与兼容 wrapper 清单。

Phase 0 验收完成前，不开始 Monorepo 迁移。
