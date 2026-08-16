# ADR 0023：Widget Data Job 运行时用 Deno 子进程，授权一次、运行静默

- **Status:** Accepted
- **Date:** 2026-08-16
- **Scope:** Agent Workbench 取数作业的执行形态、隔离与网络声明、执行入口、授权时机
- **Map:** [#111](https://github.com/xiaowen-0725/uilab-admin/issues/111) · **Tickets:** [#126](https://github.com/xiaowen-0725/uilab-admin/issues/126) / [#127](https://github.com/xiaowen-0725/uilab-admin/issues/127) / [#128](https://github.com/xiaowen-0725/uilab-admin/issues/128)
- **Spec:** [workbench-board-spec §7 / §8](../plans/workbench-board-spec.md)

## Context

widget 不能直连外网（ADR-0021 用 `connect-src 'none'` 机制强制），所以外部数据的唯一来源是**取数作业**——一段 agent 写的代码，要执行并访问网络。这需要回答两个此前没有答案的问题。

**第一，网络粒度。** 「审批一次、运行静默」成立的技术前提是**运行时只能访问创建时声明的域名**。调研（#127）查明本仓现有隔离基建在网络维度**不可表达**：`sandbox-exec` 只有 `(allow network*)` 一个布尔，且本仓传空 `readOnlyPaths` → 实际策略约等于「读整个磁盘 + 仅工作区可写 + 允许自由 spawn + 网络默认全开」，还只包住 office profile 的 `execute_command`。Node Permission Model 的 host 级 `--allow-net` **要 v25.0.0，而宿主是 v24.6.0——这个 flag 根本不存在**。

**第二，运行归属。** 整条 Runtime 链路是 task-scoped，而从 Board 页刷新时**没有 Task**。

## Decision

### 1. 执行形态：Deno 子进程，命令行即合同

```
deno run --no-remote --cached-only \
  --allow-net=<approved.allowedHosts 逐项展开> \
  --allow-read=<runDir> --allow-write=<runDir> \
  --no-prompt <runnerPath> <jobId> <runId>
```

在「声明式网络白名单」这一维上 Deno 是**唯一**可用候选，差距是数量级的：`--allow-net` 接受主机名/IP、可带端口、支持子域通配、可用 `--deny-net` 叠加收窄，默认连 DNS 解析都要权限。

- **`--no-remote` 是必需项，不是加固**：Deno 的**初始静态 import 图不过权限系统**，那是这套权限模型唯一的洞。代价是**作业代码必须零依赖单文件**，这条要写进生成规范。
- **绝不给** `--allow-run`、`--allow-ffi`（二者等同 `--allow-all`）、`--allow-env`、`--allow-sys`。
- `--allow-net` 取自 **`approved.allowedHosts`**，不取 `pendingChange`。
- **不叠加 `sandbox-exec`**：对 Deno 权限模型一项都不增强，只增加一层难以推理的语义。
- **首版依赖宿主已装 Deno**；侧车启动探测，缺失则作业能力整体不可用并明确报错（不静默降级、不偷偷改用别的执行器）。

### 2. 代码放工作区之外，结构性封死自我改写

代码在 `~/.uilab/runtime/board-jobs/<jobId>/job.ts`（0600），运行目录 `.../runs/<runId>/` 是**唯一**被授予读写的路径。于是作业**物理上碰不到自己的代码**——#127 担心的「已获批作业改写自己的代码换取永久任意执行」被目录布局封死，`approved.codeHash` 的执行前校验退化为**第二道闸**而非唯一防线。既有先例：AuthBinding 同样落在 `~/.uilab/runtime/`，且硬性拒绝放在 `WORKSPACE_ROOT` 内。

### 3. 执行入口：侧车一条不注册为 tool 的 HTTP 端点，不需要 Task

`POST /board/jobs/:jobId/run` → 立即返回 `runId`；`GET /board/runs/:runId` 轮询；`POST /board/runs/:runId/cancel`。

**必须不注册为 tool。** 反例证据：VoltAgent 自带的 `POST /tools/:name/execute` 不走 agent loop 却**仍会撞 `missing_task_context`**，因为它调的是被 wrap 过的 `tool.execute`——**决定因素是「走不走 tool 注册」，不是「走不走 agent loop」。** 端点**不接受任意 argv**（入参只有 `jobId`），这同时满足 #127 对「fail-closed 开口位置」的要求。

**异步 + 轮询而非同步等待**：状态机里有 `cancelled`，同步等待没有取消的着力点；且超时硬顶 120 s，一个挂 120 秒的 fetch 经 dev server 代理的行为不确定。

### 4. 授权在写代码的那个 Turn 内发生一次，执行期静默

创建 / 修改作业代码天然发生在某个 Task 的 Turn 内，复用既有 `approval.requested` 链路。运行期端点只校验「存在 `approved` 且待跑代码哈希匹配」，**不请求审批**。

**落法**：`board_job_finish` 配 `needsApproval: true`，且**不得**加进渲染层 `AUTO_APPROVE_WRITE_TOOLS`。代码里没有 approval kind 注册表——**粒度就是工具名**，白名单外一律 `dock`。**不动** `decideToolNeedsApproval`（那是按工具名的 MCP 轴，放宽会让运维 env 意外获得放行产品级作业的能力），**不动** `execute_command`（违反 ADR-0017）。

**审批卡必须写明「批准后此作业可被重复运行，不再逐次确认」**——不写这句，这套模型对用户就是不诚实的。

### 5. 产物端点直接回传，硬顶 512 KiB

首版不走 `GET /workspace/file`（其有效上限被渲染层 Document adapter 压到 1.5 MiB，要吃满得自建 adapter；而执行端点本来就是我们自己的）。产物 schema 校验放**渲染层**写库前——侧车不该持有 widget 的数据契约。

### 6. 首版只访问公开端点，不调 Connector 工具

核实发现两个内置 connector 都拿不出可复用的裸 token（飞书是 `cli_session`，`credential-resolver` 对它返回空 material；GitHub 走远程 MCP），且 auth 基建明文规定 `never expose through HTTP/Renderer`。不调 Connector 也正是「刷新不需要 Task」得以自洽的前提。

## Considered options

- **Node `--allow-net`**：flag 在宿主 Node 版本上不存在，且即便存在也是布尔、无 host 参数。
- **`sandbox-exec` 包住任意解释器**：网络维度只有一个布尔，无法表达域名白名单；本仓当前 profile 实质上什么也没限。
- **随包分发解释器**：不提供网络粒度，且体积与跨平台成本未测。
- **每次执行都审批**（照搬 `execute_command`）：与产品语义冲突——刷新是用户的日常动作，逐次弹卡不可用；而且**刷新不产生 tool call，本来就没有卡片位置**。
- **只存代码哈希不存代码**（#127 原始表述）：会出现「用户改了代码但未获批，此时该跑哪份」的歧义，甚至跑出一份我们手上没有的代码。改为快照代码本身（ADR-0022 §2）。
- **把执行做成一个 tool**：会撞 `missing_task_context`，且要为「刷新」凭空发明一个 Task 归属。

## Consequences

- **装了 Workbench 但没装 Deno 的用户看不到作业能力**（已知弱化）。刷新按钮**保持可点**并给出明确原因，不得做成灰的且什么也不说（违反 Workbench `AGENTS.md` 硬规则 12）。随包分发推后到桌面打包阶段。
- 作业代码必须**零依赖单文件**、入口是导出的 `run(ctx)`、直接用全局 `fetch`（不提供 `ctx.fetch` 包装——包一层只会给人「绕过包装就能出网」的错觉）。
- **`full-access` 预设下用户永远看不到作业授权卡**（该档位对一切返回 approve）。判定为可接受（与 `execute_command` 同等待遇，是用户显式选择），代价是取数作业弹窗必须显示「已授权运行」并提供撤销入口。
- Board 级全刷**并发上限 2**：每次执行是一个子进程，而内存 / CPU 上限首版不设。
- 侧车重启后遗留的 `running` run 记录由渲染层读取时判定为 `error`。
- 待实测：Deno 启动耗时；`--allow-net` 子域通配是否覆盖裸域、对 HTTP 重定向与 IP 直连的判定；512 KiB 是否够真实 widget；内存上限缺失的实际风险；Windows 下的权限与路径行为。
