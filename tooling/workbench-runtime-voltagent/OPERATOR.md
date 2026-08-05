# Operator Guide — Workbench VoltAgent Office Runtime

本机 **Office Profile** 侧车操作说明。  
**诚实边界：** 这是本地开发用 Agent Runtime（Workspace FS + Skills + 可选 MCP），**不是**多租户远程生产集群。Fake Runtime 与 capture 回放仍是一等公民。

Workspace API 在 VoltAgent 中为 **Experimental**，升级时可能变化。

---

## 1. 从零演示（读写 + 审批 + Skill 交付物）

### 1.1 依赖

- Node 20+
- monorepo `pnpm install`
- DeepSeek（或兼容）API Key

### 1.2 配置侧车

```bash
cd tooling/workbench-runtime-voltagent
cp .env.example .env
```

最小 office `.env` 示例：

```bash
DEEPSEEK_API_KEY=sk-...
OPENAI_BASE_URL=https://api.deepseek.com
VOLTAGENT_MODEL=deepseek-v4-flash
VOLTAGENT_MODEL_API=chat
AGENT_PROFILE=office
# 推荐显式工作区，避免落到默认 ~/VoltAgent-Office/workspace
WORKSPACE_ROOT=/absolute/path/to/your/office-folder
# VOLTAGENT_MAX_STEPS=80
# VOLTAGENT_MEMORY=libsql
```

可选 MCP（无凭据可跳过，侧车仍可跑本地 FS）：

```bash
# MCP_DOCS_URL=https://your-docs-mcp.example/sse
# MCP_DOCS_BEARER_TOKEN=...
# MCP_CALENDAR_URL=https://your-calendar-mcp.example
# 或 stdio：
# MCP_DOCS_COMMAND=npx
# MCP_DOCS_ARGS=-y,@your/feishu-docs-mcp
```

### 1.3 启动

```bash
# terminal 1 — sidecar :3141
pnpm --filter @uilab/workbench-runtime-voltagent dev

# terminal 2 — Workbench UI
export VITE_RUNTIME_ADAPTER=voltagent
pnpm dev:workbench
# → http://localhost:5174/
```

日志应出现类似：

```text
profile=office workspaceRoot=… maxSteps=80 summarization=true memory=libsql
mcp=docs=off,calendar=off
note=local VoltAgent Office Runtime …; not remote production cluster
```

### 1.4 UI 演示路径

1. 打开 Workbench → **新对话**（empty 路径，走 Runtime 而非 capture seed）。
2. 确认 Timeline / Context 披露为 **本机 VoltAgent Office Runtime · 非远程生产集群**（不是 Fake）。
3. **读：**「列出工作区根目录」→ 应出现 `ls` 工具行。
4. **Skill：**「用会议纪要 skill 整理：……」→ 可能 `workspace_*_skill*` 后写入 `/output/meeting-notes/…`（写文件需审批）。
5. **写审批：** 时间线出现审批 →「允许一次」→ 文件落在 `WORKSPACE_ROOT`。
6. **取消（可选）：** 运行中点停止 → Composer 可再次发送。
7. **侧车不可达：** 停掉 :3141 再发送 → 应看到可读错误，而非假成功。

### 1.5 Fake / capture 回归

不设 `VITE_RUNTIME_ADAPTER`（默认 fake）或打开默认 seed 任务：

- capture / local-sim 仍可回放；
- 文案仍为 Deterministic Fake Runtime。

---

## 2. Profile 与安全默认

| 项 | 行为 |
| --- | --- |
| `AGENT_PROFILE=minimal` | DIY `read_file` / `write_file` / `run_command` |
| `AGENT_PROFILE=office` | Agent + Workspace FS + Skills；可选 MCP |
| 未设 `WORKSPACE_ROOT`（office） | `~/VoltAgent-Office/workspace`（首次 README） |
| 写/删 FS | `needsApproval: true` |
| 越界路径 | 拒绝（「路径越界」） |
| MCP 写类工具 | 名称启发式 `needsApproval` |
| Sandbox | 默认关 |

---

## 3. MCP 降级矩阵

| 状态 | 日志 | 用户体验 |
| --- | --- | --- |
| 未配置 | `docs=off` | 仅本地 FS/Skills |
| 连接成功 | `docs=ok(N)` | MCP 工具出现在 agent tools / Timeline |
| 连接失败 | `docs=fail` + warn | 不崩溃；提示连接失败原因；本地仍可用 |

CI **不**依赖真实飞书/日历账号；单测用 mock host。

---

## 4. 常用 env 速查

见 `.env.example` 与 README「Profiles / O2–O5 / MCP」表。

| 键 | 含义 |
| --- | --- |
| `AGENT_PROFILE` | `office` \| `minimal` |
| `WORKSPACE_ROOT` | 授权根 |
| `VOLTAGENT_MAX_STEPS` | office 默认 80 |
| `VOLTAGENT_SUMMARIZATION` | office 默认 on |
| `VOLTAGENT_MEMORY` | `libsql`（默认）\| `in-memory` \| `off` |
| `MCP_DOCS_URL` / `MCP_CALENDAR_URL` | HTTP MCP |
| `MCP_*_COMMAND` / `MCP_*_ARGS` | stdio MCP |

---

## 5. 测试

```bash
pnpm --filter @uilab/workbench-runtime-voltagent test
pnpm --filter @uilab/workbench-runtime-voltagent typecheck
# Workbench（Fake 路径）
pnpm --filter @uilab/agent-workbench test
pnpm check:workbench
```

无 API Key 时侧车 **无法** 做真模型 E2E；单元/装配测不依赖 Key。

---

## 6. 相关

- Spec: `docs/plans/voltagent-office-profile-spec.md`
- Issues: #9 parent · #10–#16 milestones
- Domain: `RuntimePort` · `AgentRuntimeEventEnvelope`
