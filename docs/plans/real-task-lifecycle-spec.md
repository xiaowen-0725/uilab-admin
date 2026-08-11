# Real Task Lifecycle — 实现规格

> **状态：** 可交给实现会话（wayfinder map 决策已齐）  
> **范围：** `archetypes/agent-workbench` 真实会话管理（Project/Task 目录、IDB 持久化、默认 Runtime 路径）  
> **本规格不包含：** 产品实现代码本身（由独立实现会话完成）  
> **决策溯源：** `.scratch/real-task-lifecycle/map.md` 与 `issues/01`–`09`  
> **ADR：** [0015-workbench-project-catalog-and-unified-idb.md](../adr/0015-workbench-project-catalog-and-unified-idb.md)  
> **EventStore 研究：** [real-task-lifecycle-eventstore-idb-readiness.md](../research/real-task-lifecycle-eventstore-idb-readiness.md)

---

## 1. 目标与非目标

### 1.1 目标

打通**真实 Task 生命周期**（产品上的会话管理，≠ `workbench-session` 布局壳）：

1. 多 Project 可切换（建 / 切换 / 重命名；**不**删 Project）
2. Project 下新建 / 选择 / 删除 Task
3. Navigator **只**投影真实目录（无 mock utility 行）
4. 运行中 Task 显示 loading（`runStatus ∈ {queued, running, cancelling}`）
5. 默认无 fixture / capture seed
6. Project/Task **目录 + 事件** 统一 IndexedDB 持久化；刷新可恢复
7. 默认产品路径永远是 **Runtime**（Fake 或 VoltAgent 侧车）；capture 仅 test/dev 显式入口

### 1.2 非目标（与 map Out of scope 对齐）

- 本机文件系统 / 选文件夹作 Project（Codex workspace path）
- 云多租户 / 远程会话同步
- Surface Registry、Document/Browser/Review 真实现
- Electron/Tauri Desktop Host（未来可用 SQLite Adapter 实现**同一** Port 语义，本规格浏览器路径用 IndexedDB）
- 拉取请求 / 站点 / 已安排 / 插件等 utility **能力本身**（本规格只要求产品 Navigator **移除** mock 行）
- 删除 Project 及级联
- 在 wayfinder 会话内「只写规格不实现」之外的范围蔓延

### 1.3 可延后（fog，不阻塞 MVP）

- Task 级置顶 / 排序 / 筛选持久化（**Project** 级 `sortOrder`/`pinned` 已在目录模型）
- 多浏览器标签页对同一 IDB 的同步与冲突
- IndexedDB quota 失败时的**最终**中文降级文案（错误面必须有；文案可迭代）
- VoltAgent `projectId` 与实体字段的精细绑定
- 导出/导入会话、跨设备
- 子 Agent 提升为独立 Task 的导航规则
- Memory + fixture → IDB 的一次性迁移脚本细节（见 §11 建议策略）

---

## 2. 领域与模块边界

详见 [01-project-module-boundary](../../.scratch/real-task-lifecycle/issues/01-project-module-boundary.md)。

| 模块 | 拥有 | 不拥有 |
|---|---|---|
| **`modules/project`** | Project 实体；**Task 目录**（create/list/rename/delete 行）；`ProjectCatalogPort` | Runtime、EventStore、layout |
| **`modules/task`** | RuntimePort、EventStorePort、projection、TaskSurface、Turn/Run | 目录 CRUD / `listTasks`；`model` 内 **Project 实体**（仅 `ProjectId`） |
| **`modules/workbench-session`** | `selectedProjectId`；`selectedTaskId \| null`；`taskLayouts`；navigator/work-surface chrome；`lastTaskByProject` | projects/tasks **数组**；业务 create/rename/delete |
| **Composition** | 开 IDB；hydrate 顺序；用例：新对话 / 删 Task / 切 Project | — |
| **`shell/*`** | 绑定公开 commands/views | 直写 IDB/Runtime；业务级联 |

**Hydrate 顺序：** open IDB → Project 目录 → session 指针 →（有 selected Task 才）Runtime attach / EventStore rehydrate。

**选中真源：** 仅 session；Project 提供目录与校验。

---

## 3. 实体与 ID

详见 [02-persisted-entity-model](../../.scratch/real-task-lifecycle/issues/02-persisted-entity-model.md)。

### 3.1 Project

| 字段 | 说明 |
|---|---|
| `id` | `ProjectId`；默认固定 **`project-default`** |
| `name` | 初始 **「默认项目」**；可 rename |
| `sortOrder` | number；列表排序 |
| `pinned` | boolean；默认 false |
| `createdAt` / `updatedAt` | ISO-8601 |

### 3.2 Task 目录行

| 字段 | 说明 |
|---|---|
| `id` | `TaskId`；全局唯一 |
| `projectId` | 必须引用存在的 Project |
| `title` | 初始新对话：**「新对话」** |
| `titleSource` | `local` \| `runtime` \| `user` |
| `lastAcceptedSuggestionVersion` | number；初始 0 |
| `createdAt` / `updatedAt` | ISO-8601 |

**禁止落盘：** `runStatus`、`subtitle`、软删字段。

### 3.3 ID 空间

- 客户端生成 `taskId` → 写目录 → Runtime `createTask({ proposedTaskId: taskId })`
- `catalog.taskId ≡ proposedTaskId ≡ envelope.taskId`

---

## 4. IndexedDB schema 与所有权

详见 [03-indexeddb-schema](../../.scratch/real-task-lifecycle/issues/03-indexeddb-schema.md)。

| 项 | 值 |
|---|---|
| DB name | `uilab-agent-workbench` |
| version | 单调整数；统一 `onupgradeneeded` |
| Stores | `projects` · `tasks` · `events` · `snapshots` · `commands` · `session` · `metadata` |
| 不做 | 独立 `cursors` store（进度在 `snapshots`） |
| Open | Composition / shared shell **一柄** |
| Ports | `ProjectCatalogPort` + `EventStorePort` |

**事务：**

- 目录日常写 ⟂ 事件 checkpoint（事件：`events` append + `snapshots` put **同 TX**）
- **删 Task：** `tasks` + 该 task `events` + `snapshots` + session 指针/layout **同 TX**；`commands` 不按 task 扫删

**events 主键：** `['taskId','taskSequence']`；unique index `eventId`；同键异 eventId → conflict。

---

## 5. EventStore 合同补丁

详见 research [real-task-lifecycle-eventstore-idb-readiness.md](../research/real-task-lifecycle-eventstore-idb-readiness.md) 与 [04](../../.scratch/real-task-lifecycle/issues/04-eventstore-idb-readiness.md)。

实现前必须落地（摘要）：

| ID | 要求 |
|---|---|
| D1 | 错误面 `EventStoreError` 真实返回/抛出 |
| D2 | append + snapshot 事务化 checkpoint；失败不推进耐久进度 |
| D3 | 无独立 cursors store |
| D4 | PK 冲突语义 |
| D5 | snapshot 每 `taskId` 一行 |
| D7 | `deleteTaskData(taskId)`（或壳级联） |
| D8 | rehydrate：snapshot+tail；非终态 → `run.interrupted` |
| D11 | 无 EventStore `listTasks` |
| D12 | open/ready 由 Composition |
| D14 | 降级诚实文案（可迭代） |

Memory 可继续作测试替身；产品默认 Adapter → IDB。

---

## 6. 删除状态机

详见 [05-task-delete-semantics](../../.scratch/real-task-lifecycle/issues/05-task-delete-semantics.md)。

```text
confirm → cancel-if-active (best effort, timeout 2–5s)
       → runtime detach
       → TX { catalog + events + snapshot + layout + retarget selected }
       → fail ⇒ 全盘回滚
```

- **仅硬删**，无归档  
- 选中落点：同 Project `updatedAt` 最大，否则 `null`  
- UI 确认文案强调不可恢复  

---

## 7. 冷启动与空状态

详见 [07-cold-start-and-empty-states](../../.scratch/real-task-lifecycle/issues/07-cold-start-and-empty-states.md)。

```text
空库 → bootstrap project-default /「默认项目」
    → selectedProjectId = project-default
    → selectedTaskId = null
    → 空壳「还没有对话」+「新对话」

新对话 → 目录 title「新对话」→ select → Runtime empty hub

切 Project → lastTaskByProject 恢复，否则最近/null
```

打破旧不变量：session **不再**要求至少一个 Task。

---

## 8. Capture / dual-path 隔离

详见 [08-capture-path-isolation](../../.scratch/real-task-lifecycle/issues/08-capture-path-isolation.md)。

| 通道 | Boot | Composer | 时间线 |
|---|---|---|---|
| 产品默认 | IDB + §7 | Runtime only | projection Timeline |
| 测试 harness | capture-fixture seed | local-sim 可 | capture 可 |
| Dev 显式 | `?demo=1` / 菜单 | 可选 | 可选 |

- 产品 **不用** `phase3SessionSeed` / 默认 `TASK_SEEDS`  
- Launch cards：`promptStub` → Runtime，**不** force capture  
- Capture JSON **保留**仓库  
- 产品 Navigator **移除** mock utilities  

**AGENTS 应改写为：** 默认 Runtime 路径 + Fake/侧车 ≠ 生产；capture 仅 test/dev。

---

## 9. Navigator loading

详见 [06-navigator-run-status-projection](../../.scratch/real-task-lifecycle/issues/06-navigator-run-status-projection.md)。

```text
Runtime (active tasks) → RunStatusIndex[taskId]
                       → full ReadModel (selected only)
Navigator busy = status ∈ {queued, running, cancelling}
```

- Index **内存**，不落盘  
- **非选中**活跃 Task 也必须更新  
- 刷新后默认不转圈  
- UI：spinner + `aria-busy` +「进行中」可访问名  

---

## 10. Composition 用例一览

| 用例 | 步骤 |
|---|---|
| Bootstrap | open DB → 无 Project 则写默认 → hydrate → session |
| 新对话 | create catalog row → select → Runtime hub |
| 切 Project | 校验 → session + lastTask 恢复 |
| 切 Task | 校验 → select → attach/rehydrate |
| 删 Task | §6 |
| 提交消息 | Runtime submitTurn（产品路径） |

---

## 11. 实现迁移建议（非阻塞决策）

1. 落地 `modules/project` + ports + IDB shell  
2. 缩 `workbench-session`（null selectedTask）  
3. Composition 换 boot；卸 phase3 默认 seed  
4. EventStore IDB + controller D2/D8  
5. 删除 / loading index / 空状态 UI  
6. 改测试为 harness；更新 AGENTS  

从 Memory+fixture 切换：空库 bootstrap 即可；无义务迁移旧 Memory 进程内状态。

---

## 12. 验收清单

| # | 能力 | 可观察标准 | 建议测法 |
|---|---|---|---|
| A1 | 多 Project | 可建/切换/重命名；默认 id `project-default`、名「默认项目」 | integration + 手工 |
| A2 | 新对话 | 目录出现「新对话」；主区 Runtime hub（非 capture） | integration |
| A3 | 选中/切换 Task | 布局按 task 恢复；指针进 session | unit/integration |
| A4 | 删除 Task | 硬删；目录与事件不可再打开；选中落点正确 | integration |
| A5 | 运行中删除 | 尽力 cancel 后本地仍可删 | integration（Fake） |
| A6 | Navigator 目录 | 仅真 Task；无 mock utility | integration |
| A7 | Loading | 活跃（含非选中）spinner；`aria-busy` | integration/a11y |
| A8 | 冷启动空库 | 零 Task 空壳；无 fixture seed | integration |
| A9 | 刷新恢复 | 目录与事件仍在；Timeline 可恢复 | integration |
| A10 | 默认路径 | 默认 boot 无 phase3 capture task-a | integration 断言 |
| A11 | Capture 隔离 | harness 仍可播 capture | 既有 fidelity 测试改入口后绿 |
| A12 | 边界 | task model 无 Project 实体；Shell 无直写 IDB | `check:workbench` + review |

---

## 13. 实现会话门禁

```bash
pnpm --filter @uilab/agent-workbench typecheck
pnpm --filter @uilab/agent-workbench test
pnpm --filter @uilab/agent-workbench build
pnpm check:workbench
# 若动 Foundation：
pnpm check:foundation
```

实现完成后建议：更新 `archetypes/agent-workbench/AGENTS.md` 诚实边界（§8）；必要时更新 architecture module-layout 中 EventStore「IDB planned」表述。

---

## 14. 附录 — 决策索引

| Ticket | 标题 |
|---|---|
| [01](../../.scratch/real-task-lifecycle/issues/01-project-module-boundary.md) | Project Module 边界 |
| [02](../../.scratch/real-task-lifecycle/issues/02-persisted-entity-model.md) | 实体字段 |
| [03](../../.scratch/real-task-lifecycle/issues/03-indexeddb-schema.md) | IDB schema |
| [04](../../.scratch/real-task-lifecycle/issues/04-eventstore-idb-readiness.md) | EventStore 差距 |
| [05](../../.scratch/real-task-lifecycle/issues/05-task-delete-semantics.md) | 删除语义 |
| [06](../../.scratch/real-task-lifecycle/issues/06-navigator-run-status-projection.md) | Navigator loading |
| [07](../../.scratch/real-task-lifecycle/issues/07-cold-start-and-empty-states.md) | 冷启动空状态 |
| [08](../../.scratch/real-task-lifecycle/issues/08-capture-path-isolation.md) | Capture 隔离 |
| [09](../../.scratch/real-task-lifecycle/issues/09-acceptance-and-spec-shape.md) | 本规格形态 |

Map：`.scratch/real-task-lifecycle/map.md`
