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
2. 确认 Timeline / Context 披露为 **本机 VoltAgent Runtime · 非远程生产集群**（不是 Fake；Office/minimal 由侧车 `AGENT_PROFILE` 决定）。
3. **读：**「列出工作区根目录」→ 应出现 `ls` 工具行。
4. **Skill：**「用会议纪要 skill 整理：……」→ 可能 `workspace_*_skill*` 后写入 `/output/meeting-notes/…`（写文件需审批）。
5. **写审批：** 时间线出现审批 →「允许一次」→ 文件落在 `WORKSPACE_ROOT`。
6. **取消（可选）：** 运行中点停止 → Composer 可再次发送。
7. **侧车不可达：** 停掉 :3141 再发送 → 应看到可读错误，而非假成功。

### 1.5 插件 list / doctor（运维，非 Agent）

宿主侧运维面，**不**作为 Agent 工具：

```bash
# 列出 builtin + PLUGIN_PATHS 发现的插件（id/version/enabled/status/贡献）
pnpm --filter @uilab/workbench-runtime-voltagent plugin:list

# 医生检查：缺 env、MCP off、CLI missing、auth=missing 等（中文可读，无 secret）
pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor

# 机器可读（可脚本断言）
pnpm --filter @uilab/workbench-runtime-voltagent plugin:list -- --json
pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor -- --json
```

退出码：`doctor` 有 warn/error 时为 `1`；实现失败为 `2`。

### 1.6 Fake / capture 回归

不设 `VITE_RUNTIME_ADAPTER`（默认 fake）或打开默认 seed 任务：

- capture / local-sim 仍可回放；
- 文案仍为 Deterministic Fake Runtime；
- **侧车插件体系不影响 Fake 路径**（插件只在 VoltAgent 侧车装配）。

回归命令见 §5。

---

## 2. Profile 与安全默认

| 项 | 行为 |
| --- | --- |
| `AGENT_PROFILE=minimal` | DIY `read_file` / `write_file` / `run_command`（不加载 PluginRegistry） |
| `AGENT_PROFILE=office` | Workspace FS + **PluginRegistry**（Skills/MCP/CLI/auth） |
| 未设 `WORKSPACE_ROOT`（office） | `~/VoltAgent-Office/workspace`（首次 README） |
| 写/删 FS | `needsApproval: true` |
| 越界路径 | 拒绝（「路径越界」） |
| MCP / 领域 CLI 工具 | **默认** `needsApproval`；MCP 仅 `MCP_READ_ONLY_TOOL_NAMES` 精确放行；CLI 可 `readOnly` |
| Sandbox | 默认关 |
| 密钥 | 只在侧车 `.env` / 进程 env / 未来 Keychain；**不进** plugin.json、不进浏览器、不进 RuntimePort 载荷 |

---

## 3. Plugin 体系（装配真源）

office 装配路径（**唯一**）：

```text
createWorkbenchAgent(office)
  → createPluginRegistryFromEnv()   # builtins + PLUGIN_PATHS
  → registry.load({ workspaceRoot })
  → skillRoots + tools(MCP/CLI) + authStatuses
```

| Builtin | 默认 | 贡献 |
| --- | --- | --- |
| `skills.office` | on | `/skills` 三 skill + output 目录（missing-only seed） |
| `mcp.docs` | on（无 env 则 MCP off） | 文档/知识库 MCP |
| `mcp.calendar` | on（无 env 则 MCP off） | 日历 MCP |
| `cli.feishu` | **off** | 领域 CLI allowlist；`PLUGINS_ENABLED=cli.feishu` |

**启用 ≠ 登录：** `plugin:doctor` 可显示 `enable=yes` 且 `auth=missing`。  
`cli_session` 用 CLI 自有登录（如 `feishu-cli auth login`）；`env_ref`/`static_bearer` 用 env 名引用，不存 secret 值。

本地包：`PLUGIN_PATHS` 下声明式 `plugin.json`（禁止 `contributes.tools` 任意 JS）。

### MCP / CLI 降级

| 状态 | 日志 / doctor | 用户体验 |
| --- | --- | --- |
| 未配置 MCP | `docs=off` / `mcp_disabled` | 仅本地 FS/Skills |
| MCP 连接成功 | `docs=ok(N)` | tools 进 Agent / Timeline |
| MCP 失败 | `docs=fail` | 不崩溃；本地仍可用 |
| CLI 二进制缺失 | `cli=missing` | 该 CLI tools 不出现；其它插件继续 |

CI **不**依赖真实飞书账号；单测 mock host / fake CLI。

---

## 4. 常用 env 速查

见 `.env.example`。

| 键 | 含义 |
| --- | --- |
| `AGENT_PROFILE` | `office` \| `minimal` |
| `WORKSPACE_ROOT` | 授权根 |
| `VOLTAGENT_MAX_STEPS` | office 默认 80 |
| `VOLTAGENT_SUMMARIZATION` | office 默认 on |
| `VOLTAGENT_MEMORY` | `libsql`（默认）\| `in-memory` \| `off` |
| `MCP_DOCS_URL` / `MCP_CALENDAR_URL` | HTTP MCP（builtin 别名，含 `FEISHU_*_MCP_URL`） |
| `MCP_*_COMMAND` / `MCP_*_ARGS` | stdio MCP |
| `MCP_*_BEARER_TOKEN` | auth 用 env_ref（doctor 只显示缺不显示值） |
| `PLUGINS_ENABLED` / `PLUGINS_DISABLED` | 启用集覆盖 |
| `PLUGIN_PATHS` | 本地 `plugin.json` 搜索路径 |
| `FEISHU_CLI_PATH` | 领域 CLI 可执行文件 |

---

## 5. 测试与门禁

```bash
# 侧车插件 + 装配
pnpm --filter @uilab/workbench-runtime-voltagent test
pnpm --filter @uilab/workbench-runtime-voltagent typecheck
pnpm --filter @uilab/workbench-runtime-voltagent plugin:list
pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor -- --json

# Workbench Fake / honesty（默认不连侧车）
pnpm --filter @uilab/agent-workbench exec vitest run --browser.headless \
  src/modules/task/runtime/runtime-honesty.test.ts \
  src/modules/task/runtime/fake-runtime.test.ts \
  src/modules/task/runtime/voltagent/voltagent-runtime-adapter.test.ts
pnpm check:workbench
```

无 API Key 时侧车 **无法** 做真模型 E2E；单元/装配测不依赖 Key。

---

## 6. 相关

- Spec: `docs/plans/sidecar-plugin-system-spec.md` · architecture/authorization 旁注
- Office Profile: `docs/plans/voltagent-office-profile-spec.md`
- Evidence: `docs/evidence/sidecar-plugin-system-closeout-2026-08-06.md`
- Domain: `RuntimePort` · `AgentRuntimeEventEnvelope`
- Issues: Spec #17 · tickets #18–#25
