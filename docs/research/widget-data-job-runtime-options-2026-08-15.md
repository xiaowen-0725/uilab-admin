# Research：Widget Data Job 沙箱作业运行时的可选执行方案

> **Ticket:** GitHub issue [#127](https://github.com/xiaowen-0725/uilab-admin/issues/127)（`wayfinder:research`）· 地图 [#111](https://github.com/xiaowen-0725/uilab-admin/issues/111) · 前序 [#114](https://github.com/xiaowen-0725/uilab-admin/issues/114) → `docs/research/widget-data-job-sidecar-paths-2026-08-15.md`
> **Date:** 2026-08-15
> **Scope:** 首版直接建 **Widget Data Job 沙箱作业运行时**（不做过渡取数原语）的前提下，盘点：侧车宿主现状、候选执行形态的事实对比、产物协议的既有条件、「写入时审批 / 运行时静默」授权模型的落地条件。**不做决策**。
> **方法边界:** 本轮**只读源码、`node_modules` 内 dist 真实源码、一手官方文档**。**未启动任何进程**（无侧车 / dev server / 浏览器 / Electron / Deno / Python / REPL），**未执行 git 写操作**，**未做任何真机往返实测**。唯一的瞬时查询是 `node --version`（宿主 **v24.6.0**）。所有需要实测的量（启动耗时、内存峰值、解压后体积）一律标 **未验证**，见 §7。
> **版本锚点:** `@voltagent/core` 2.9.2、`hono` 4.12.33、`ai` ^6.0.0、pnpm 10.33.3、宿主 Node v24.6.0；Deno 官方文档与 `v2.9.5` release assets；Node.js 官方文档（v26.7.0 文档树，含各 flag 的 Added in 版本）。
> **证据标签:** 【源码】= 本次读到的代码行 · 【文档】= 官方文档明文 · 【推断】= 由前两者推出 · 【未验证】= 需运行时/实测。

---

## 1. 结论先行

1. **「声明式网络白名单」这一维上，Deno 是唯一真正占优的候选，而且优势是数量级的，不是边际的。**
   Deno 的 `--allow-net` **原生接受主机名 / IP，可带端口，并支持 `*.example.com` 子域通配**，还能用 `--deny-net` 在授予后再挖洞【文档】。这与「作业声明它要访问哪几个域名」是**一对一**的表达。
   对照组全部做不到：
   - **Node Permission Model 的 `--allow-net` 是布尔开关，没有 host 参数**，且 **Added in v25.0.0 / Stability 1.1 (Active development)**【文档】——**宿主现在跑的是 Node v24.6.0，连这个 flag 都还不存在**（瞬时查询）。
   - **macOS `sandbox-exec` 路径上，网络只有 `(allow network*)` 一个布尔**：VoltAgent 生成的 seatbelt profile 里网络就是一行全开或整段不写（`@voltagent/core` dist `index.mjs:21012-21014`）【源码】。文件维度它反而**能**表达细粒度（见第 3 点），唯独网络不能。
   - 随包分发解释器（Kimi 路线）本身**不提供任何网络粒度**，域名限制要么靠额外的 OS 沙箱，要么靠在解释器里换掉 HTTP 客户端——都是自建机制。

2. **侧车宿主没有任何沙箱 / 权限类依赖，隔离能力 100% 来自 `@voltagent/core` 内置的 `LocalSandbox`。**
   `tooling/workbench-runtime-voltagent/package.json:19-35` 的运行时依赖只有 `@ai-sdk/*` / `@larksuite/cli` / `@voltagent/{core,libsql,logger,server-hono}` / `ai` / `hono` / `zod`；devDeps 只有 `@types/node` / `tsx` / `typescript`。**没有 `vm2`、`isolated-vm`、`nsjail`、`firecracker` 之类的件**【源码】。README 声明 `Node 20+`（`README.md:9`），**`package.json` 没有 `engines` 字段**，全仓 `package.json` 也没有【源码】。

3. **`WORKSPACE_SANDBOX_*` 与 `sandbox-exec` 是「真启用」的，但它的实际语义比 README 想让你以为的宽得多。**
   - **真启用**：`resolveIsolationProvider` 在未配置时走 `LocalSandbox.detectIsolation()`（`office-workspace-sandbox.ts:107-119`），而 `detectLocalSandboxIsolation` 在 darwin 上只要 `PATH` 里能找到 `sandbox-exec` 就返回 `'sandbox-exec'`（core dist `index.mjs:20971-20979`）【源码】。macOS 自带该二进制 →**默认启用**。README `:103` 那行「sandbox | **未启用**」是 stale（#114 已记）。
   - **但语义是**：本仓传 `readOnlyPaths` 为空 + `allowSystemBinaries:false`（`office-workspace-sandbox.ts:39-46`），而 profile 生成器在 `readOnlyPaths.size === 0` 时直接写 **`(allow file-read* (subpath "/"))`**（core dist `index.mjs:20994-21006`）。于是实际 profile ≈ `(deny default)` + **允许读整个磁盘** + 仅 `rootDir` 与 `/dev` 可写 + **`(allow process*)`** + 网络默认 `(allow network*)`（`WORKSPACE_SANDBOX_ALLOW_NETWORK !== '0'`，`office-workspace-sandbox.ts:41`）。
   - **覆盖面**：它**只**包住 office profile 的 `execute_command`。**minimal profile（默认 profile，`profile.ts:33-41`）完全没有任何 OS 隔离**——那条路上根本没有 `LocalSandbox`。
   - **飞书这类受信 builtin connector 的命令通道显式走 `isolation: { provider: 'none' }`**（`office-workspace-sandbox.ts:95`），即**不进沙箱**，靠「固定可执行路径 + 闭合 env + 每次审批」兜底。

4. **仓库里不存在 `allowedRoots` 这个概念**（全仓 `rg allowedRoots` 在非 `node_modules` 下零命中，`@voltagent/core` 的 `.d.ts` 里也没有）【源码】。写入范围是**四套互不共享的实现**拼出来的，且**默认根在 dev 脚本下就是本仓库根**：
   `profile.ts:64-65` —— minimal profile 未设 `WORKSPACE_ROOT` 时根 = `path.resolve(cwd, '../../')`；`pnpm dev:workbench-runtime` 的 cwd 是 `tooling/workbench-runtime-voltagent/`，**上溯两级正好是 monorepo 根**。这条同时意味着 `GET /workspace/file` 在 dev 默认配置下**把整个仓库开成了一条免审批只读 HTTP 通道**。桌面 Host 路径不同：Electron spawn 时显式注入 `WORKSPACE_ROOT=<项目根>`（`desktop/electron/main.ts:154-168`）。

5. **产物通道（`GET /workspace/file`）作为「大产物出口」是现成的，但有两条必须写进合同的既有约束**：
   ① **无流式**——`readWorkspaceFile` 是 `stat` 后 `readFile` 整个读进 Buffer（`workspace-file-api.ts:99-114`），返回时还做了一次 **`Uint8Array.from(result.bytes)`**（`configure-sidecar-app.ts:93`），这是**逐元素复制**而非 `buffer.buffer` 零拷贝视图，25 MiB 附近至少两份常驻 + 一次逐字节循环【源码】【实际内存曲线未验证】。
   ② **渲染层的有效上限不是 25 MiB，是 1.5 MiB**——JSON/文本走 `DOCUMENT_TEXT_MAX_BYTES = 1.5 MiB`（`path-utils.ts:13`），adapter 把它作为 `maxBytes` query 传下去（`http-workspace-document-content.ts:103-104`），而侧车侧 query 只能**收紧**默认 25 MiB（`workspace-file-api.ts:71` + `configure-sidecar-app.ts:70`）。Job 产物若复用 Document 适配器，25 MiB 是拿不到的。

6. **授权时机的最小改动面：不要去改 approval 链路，而要在它旁边新增一条 consent 记录。**
   现有 approval 的身份是 VoltAgent 的 `approvalId`，**纯内存 `Map`，随渲染层进程消失**（`voltagent-runtime-adapter.ts:769-796`），payload 只有 `{ requestId, toolName, toolCallId, args }`（`fullstream-to-envelope.ts:528-538`），回执只有 `{ decision, requestId, reason }`（`commands.ts:106-115`）——**没有任何 scope / 有效期 / 主体标识字段**，也没有持久化。
   而「写入时审批、运行时静默」的运行期**根本不产生 tool call**，因此没有 `approval.requested` 可发、也没有 Timeline 可承载审批卡。**最小面是三件**：(a) consent 标识 = `jobId + 作业代码内容哈希 + 规范化域名集合哈希`（**必须含代码哈希**，否则改代码不重新征得同意）；(b) 权威记录存渲染层 IDB，侧车持一份工作副本 —— 这**照抄** `selection-store.ts:1-5` 已确立的「Workbench 是持久真源、侧车只有 working copy」先例；(c) 侧车 job runner 在 spawn 前重算哈希比对，不匹配就 fail-closed 拒绝**并且不弹卡**（无 Task 上下文可弹）。详见 §6。

7. **fail-closed 的开口位置有一个明确的「不要动」清单。**
   `decideToolNeedsApproval`（`security-policy.ts:77-81`，空 allowlist 即全员需审批）是**按工具名**的 MCP 通道策略，与「按代码+域名」的 consent 是不同的授权轴，**不应复用也不应放宽**；ADR-0017:49「所有 `execute_command` 都始终需 Host 审批」针对的是**任意 argv shell** 这一风险类别，一个不接受任意 argv、只接受「已被批准的作业标识」的执行入口不必然违反它——但**必须在新 ADR 里显式写清这条边界**，否则就是偷偷开后门（#114 §6.3 已提出同一条警告）。

---

## 2. Q1 — 侧车宿主现状

### 2.1 运行环境与依赖面【源码】

| 项 | 事实 | 位置 |
|---|---|---|
| 进程启动方式 | `tsx --env-file=.env src/server.ts`（dev 为 `tsx watch`），**不预编译** | `package.json:8-9` |
| Node 版本要求 | README 写 `Node 20+`；**`package.json` 无 `engines`**（全仓无） | `README.md:9`；`package.json:1-36` |
| 宿主实际 Node | **v24.6.0**（瞬时 `node --version`） | — |
| TS 目标 | `target: ES2022` / `module: ESNext` / `moduleResolution: Bundler` / `noEmit` | `tsconfig.json` |
| 沙箱 / 权限依赖 | **无**。运行时依赖只有 `@ai-sdk/deepseek`、`@ai-sdk/openai`、`@larksuite/cli`、`@voltagent/{core,libsql,logger,server-hono}`、`ai`、`hono`、`zod` | `package.json:19-30` |
| `worker_threads` / `vm` 使用 | 侧车源码**零使用**（`src/` 下无 import） | — |
| Python / 其它解释器 | 侧车源码里唯一的 `python` 字样是 `.py` 的 MIME 猜测分支（`workspace-file-api.ts:170`）。**宿主是否装有 python3 / uv 本轮未探测**（需执行进程，禁止） | — |

**对 Node 版本的一条硬含义**：Node Permission Model 自 **v23.5.0 / v22.13.0 起不再实验性**【文档】，但 **`--allow-net` 是 v25.0.0 才加入且仍是 Stability 1.1**【文档】。宿主 v24.6.0 处在「有 `--permission`，但网络维度**完全不在**权限模型覆盖内」的区间。要走 Node 权限模型 + 网络限制，**先要抬 Node 大版本**，且抬完拿到的也只是布尔开关。

### 2.2 `WORKSPACE_SANDBOX_*` 到底做了什么

**两个 env，都只在 office profile 的 Workspace Sandbox 装配时被读：**

| env | 读法 | 位置 |
|---|---|---|
| `WORKSPACE_SANDBOX_ISOLATION` | 取值 `none` / `sandbox-exec` / `bwrap` 时直接采用；**其它值或未设 → `LocalSandbox.detectIsolation()`** | `office-workspace-sandbox.ts:107-119` |
| `WORKSPACE_SANDBOX_ALLOW_NETWORK` | **`!== '0'` 即为 true** —— 也就是**默认允许网络**，只有显式写 `0` 才关 | `office-workspace-sandbox.ts:41` |

**探测逻辑（core dist `index.mjs:20971-20979`）【源码】：**

```js
var detectLocalSandboxIsolation = async () => {
  if (process.platform === "darwin") {
    return await resolveExecutable("sandbox-exec") ? "sandbox-exec" : "none";
  }
  if (process.platform === "linux") {
    return await resolveExecutable("bwrap") ? "bwrap" : "none";
  }
  return "none";              // ← Windows 恒为 none
};
```

**生成的 seatbelt profile（core dist `index.mjs:20981-21016`）【源码】**，代入本仓的参数（`readOnlyPaths` 未传 → 空集；`readWritePaths` 未传 → 空集 + `rootDir` + `/dev`；`allowSystemBinaries:false`；`allowNetwork:true`）后等价于：

```lisp
(version 1)
(deny default)
(allow process*)
(allow file-read* (subpath "/"))            ; ← readOnlyPaths 为空触发「读全盘」
(allow file-write* (subpath "<workspaceRoot>") (subpath "/dev"))
(allow network*)                            ; ← WORKSPACE_SANDBOX_ALLOW_NETWORK !== '0'
```

命令包裹方式：`sandbox-exec -p <profile> <command> <args...>`（`index.mjs:21037-21048`）【源码】。

**几条容易读错的地方：**

- `allowSystemBinaries: false` 在本仓**实际是个 no-op**：它唯一的作用是「往 `readOnlyPaths` 里塞系统二进制目录」（`index.mjs:20985-20989`），而 `readOnlyPaths` 一旦非空就会从「读全盘」切换到「白名单读」。本仓注释（`office-workspace-sandbox.ts:42-45`）说得没错——正是为了避免那个过窄白名单导致 `/usr/bin` 工具 SIGABRT——但代价是**读权限完全没有收敛**（`~/.ssh`、其它项目、侧车自己的 `.env` 都可读）【推断，profile 语义直读】。
- **`(allow process*)`**：沙箱内可以自由 spawn 子进程，且 seatbelt 策略对子进程是继承的【推断，未实测】。
- **`readWritePaths` / `readOnlyPaths` / `profile` / `seatbeltProfilePath` 这些字段 `LocalSandbox` 是支持的**（`index.mjs:21017-21031` 的 `loadSeatbeltProfile` 优先用 `isolation.profile`，其次 `seatbeltProfilePath`，最后才生成）——**本仓只是没用**。这意味着「作业代码目录只读 + 只有产物目录可写」在 macOS 上**是可表达的**，只要自己给一份 profile 或传 `readWritePaths`/`readOnlyPaths`。

### 2.3 文件写入路径范围（没有 `allowedRoots`，只有四套各自为政的实现）

| 通道 | 范围实现 | 强度 | 位置 |
|---|---|---|---|
| minimal `read_file` / `write_file` | `resolveExistingPathWithinRoot` / `resolveCreatablePathWithinRoot` → lexical + **realpath containment + 拒写符号链接** | 强（防 symlink 逃逸） | `tools.ts:31,51`；`workspace-root.ts:32-51,75-99,105-150` |
| office Workspace FS | `NodeFilesystemBackend({ rootDir, virtualMode: true, contained: true })` | 由 VoltAgent 保证 | `create-agent.ts:211-217` |
| office `execute_command` | seatbelt `file-write*` = `rootDir` + `/dev`（见 §2.2） | 依赖 OS | core dist `index.mjs:20990-21011` |
| `GET /workspace/file`（只读） | 同 minimal 的 realpath containment；越界 403 / 不存在 404 / 过大 413 | 强 | `workspace-file-api.ts:81-96`；`configure-sidecar-app.ts:66-94` |

**根的来源（`profile.ts:51-66`）【源码】：**

```text
WORKSPACE_ROOT 显式设置        → path.resolve(该值)             （桌面 Host 走这条：main.ts:164）
office 且未设                  → ~/VoltAgent-Office/workspace
minimal 且未设（默认 profile） → path.resolve(cwd, '../../')  → dev 脚本下 = 本仓库根
```

Skills 的虚拟根**不构成额外的越界面**：`skills-loader.ts:132,291,457` 全部经 `ensureDirWithinRoot` / `resolvePathWithinRoot(root, workspaceDir)` 落在根内【源码】。

---

## 3. Q2 — 候选执行形态的事实对比（不做决策）

### 3.1 汇总表

| 维度 | ① Node `worker_threads` + `vm` | ② Node 子进程 + `--permission` | ③ Node/任意子进程 + macOS `sandbox-exec` | ④ **Deno 子进程** | ⑤ 随包分发 CPython + uv（Kimi 路线） |
|---|---|---|---|---|---|
| **网络白名单可否声明式表达** | **否**（同进程，无任何网络门） | **否**——`--allow-net` **无 host 参数**，且 v25.0.0 才有、Stability 1.1；**宿主 v24.6.0 无此 flag** | **否**——只有 `(allow network*)` 布尔 | **是**：`--allow-net=a.com,b.com:443,1.1.1.1:443,*.example.com`，另有 `--deny-net` 叠加收窄 | **否**（解释器本身无权限层，需外挂 OS 沙箱或自建 HTTP 层） |
| **文件系统隔离粒度** | 无（与侧车同进程，`fs` 全开） | 路径级：`--allow-fs-read` / `--allow-fs-write` 支持绝对/相对路径与 `*` 通配 | 路径级：`readWritePaths` / `readOnlyPaths` / 自定义 profile（本仓未用，见 §2.2） | 路径级：`--allow-read=./data` / `--allow-write=…`；symlink 按**链接位置**判权，写 `/proc`,`/dev`,`/sys` 另需 `--allow-all` | 无（同 ③，取决于外挂沙箱） |
| **超时与强杀** | `worker.terminate()`；`resourceLimits` **只约束 JS 引擎**，不含外部数据 | 进程级，可 SIGTERM→SIGKILL | 同 ②，但 `sandbox-exec` 是**外层进程**，直接 `proc.kill` 只打到 wrapper | 进程级，同 ②；Deno 自身**不提供** wall-clock 上限 | 进程级 |
| **本仓既有超时实现** | — | 现成模式：`LocalSandbox.execute` = SIGTERM，1 s 后 SIGKILL（core dist `index.mjs:21259-21268`）；**未 `detached`、未杀进程组** ⇒ 孙进程可能存活【推断】 | 同左，且 wrapper 令问题更明显 | 同左 | 同左 |
| **启动开销量级** | 最低（同进程 worker） | 一次 Node 冷启 | 一次 Node 冷启 + `sandbox-exec` 包裹 | 一次 Deno 冷启；官方仅提示「**经 npm 安装的 deno 启动更慢，推荐官方安装脚本**」 | 一次 CPython 冷启（Kimi 用 uv + wheelhouse 规避装包） |
| **实测数字** | **未验证** | **未验证** | **未验证** | **未验证** | **未验证** |
| **分发体积** | 0（已在进程内） | 0（复用现有 Node） | 0（macOS 自带 `sandbox-exec`） | Deno v2.9.5 官方 zip：macOS arm64 **36.7 MiB**、Windows x64 **40.7 MiB**、Linux x64 **39.7 MiB**（解压后体积**未验证**） | 解释器 + 标准库 + wheelhouse，**量级明显最大，未验证** |
| **跨平台代价（macOS / Windows）** | 一致（无隔离，所以也无差异） | 一致（权限模型跨平台）；但网络维度都要 v25+ | **macOS 有、Windows 恒 `none`**（`detectLocalSandboxIsolation` 非 darwin/linux 直接返回 `none`） | **一致**：官方提供 win x64/arm64、mac x64/arm64、linux x64/arm64 单文件二进制；Windows 需 ≥ Win10 1709 | 需按平台各备一套解释器与 wheels，**最重** |
| **是否必须随包分发** | 否 | 否 | 否 | **不必须**（可要求用户 `brew`/`winget`/`npm i -g deno`），但要「零配置开箱」就得随包带二进制 | **是**（Kimi 就是这么做的） |

### 3.2 逐条要点与出处

**① Node `worker_threads` + `vm`**

- `node:vm` 官方文档**第一句**就是：**「`node:vm` 模块不是安全机制。不要用它运行不受信任的代码。」**（<https://nodejs.org/api/vm.html>）【文档】
- Permission Model 的约束清单里写明 **「The model does not inherit to a worker thread.」**（<https://nodejs.org/api/permissions.html> · Permission Model constraints）【文档】——即便主线程开了 `--permission`，worker 线程也不在其覆盖内【推断，基于该行明文】。
- `resourceLimits` 官方描述：**「These limits only affect the JS engine, and no external data, including no `ArrayBuffer`s.」**（<https://nodejs.org/api/worker_threads.html>）【文档】。
- 结论性事实：这条路**零新依赖、启动最快**，但**网络与文件系统均无门**，`worker.terminate()` 只解决「停下来」，不解决「不该做的事已经做了」。

**② Node 子进程 + `--permission`**

- Permission Model 自 **v23.5.0 / v22.13.0 起 Stability 2 - Stable**；文档同时给出定性边界：**「This feature does not protect against malicious code… Malicious code can bypass the permission model」**，定位是 **"seat belt"**【文档】。
- 文件系统：`--allow-fs-read` / `--allow-fs-write` 接受 `*`、相对路径、绝对路径与通配；**已知问题：符号链接会被跟随到授权路径之外**（文档 "Limitations and Known Issues" 明文）【文档】。
- 网络：`--allow-net` **Added in v25.0.0，Stability 1.1**，文档示例只有「有/无」，**未提供 host 语法**【文档】。
- 另有 `process.permission.drop(scope[, reference])` 支持**运行时不可逆收窄**（`--permission` 下可用）【文档】。

**③ Node/任意子进程 + macOS `sandbox-exec`**

- 本仓已有完整现成实现（§2.2），**改造成本最低的一条**：`LocalSandbox` 已支持 `readWritePaths` / `readOnlyPaths` / 完整自定义 `profile` / `seatbeltProfilePath`（core dist `index.mjs:21017-21031`）【源码】。
- 文件粒度**够用**：可以表达「作业代码目录只读、产物目录可写」，这正是 §6 里防「作业改写自己代码绕过 consent」所需要的。
- 网络粒度**为零**：profile 里只有 `(allow network*)`【源码】。要做域名白名单只能外接（本机代理 / 拦截 DNS），属自建机制。
- **Windows 无对应实现**（`detectLocalSandboxIsolation` 返回 `none`）【源码】；Linux 走 `bwrap`，其网络维度也只有 `--unshare-net` 布尔（`index.mjs:21076-21079`）【源码】。

**④ Deno 子进程**（本轮重点核实项）

- **粒度确认（<https://docs.deno.com/runtime/reference/permissions/> · Network access）【文档】原文要点**：
  - 「Network access is granted using the `--allow-net` flag. This flag can be specified with a list of hosts… **A host can be a hostname or IP address, optionally with a port.**」
  - 「**Hostnames do not allow subdomains, unless explicitly listed.** To allow any subdomain for a hostname, `*` can be used as wildcard for any subdomain.」
  - 示例覆盖 `--allow-net=github.com,jsr.io`、`--allow-net="*.example.com"`、`--allow-net=example.com:80`、`--allow-net=1.1.1.1:443`、`--allow-net=[2606:4700:4700::1111]`。
  - 默认连 **DNS 解析**都要 net 权限：「By default, executing code can not make network requests, open network listeners or perform DNS resolution.」
  - `--deny-net` **覆盖** `--allow-net`，可「先给大类再挖洞」。
- **运行时收窄确认**：`Deno.permissions.revoke({ name: "read" })` 可在启动后把已授权降回 prompt 态；官方明确推荐「启动后丢弃不再需要的权限」（<https://docs.deno.com/runtime/fundamentals/security/> · Adjusting permissions at runtime）【文档】。
- **必须知道的三条反例**（同页 "Permissions that bypass the sandbox"）【文档】：
  1. **`--allow-run` 等同于 `--allow-all`**——子进程不继承受限权限；`--allow-run=deno` 尤其危险（可自启 `--allow-all`）。
  2. **`--allow-ffi` 同理**（原生代码绕过 JS 层权限检查）。
  3. **初始静态模块图的加载不过权限系统**：静态 `import` 与字面量 `import()` 的模块**无需 `--allow-read`/`--allow-net` 即可加载**；只有非字面量动态 `import()` 才在运行时按 `--allow-read`/`--allow-import` 检查。⇒ 作业代码的**依赖来源**必须在生成侧就锁死（官方建议配 `--frozen` lockfile + `--cached-only`）。
- **无 TTY 不会弹提示**：「Prompts are not shown if stdout/stderr are not a TTY, or when the `--no-prompt` flag is passed」【文档】——侧车 spawn 时 stdio 是 pipe，天然不会挂在交互提示上；仍建议显式 `--no-prompt`【推断】。
- **分发**：单文件可执行、无外部依赖，官方提供 6 个平台 asset（<https://docs.deno.com/runtime/getting_started/installation/>）【文档】；v2.9.5 release 的 zip 体积见上表（读自 GitHub Releases API 的 asset `size` 字段）。官方明确提示 **npm 安装会拖慢启动**，推荐官方安装脚本【文档】。
- **未在文档中找到答案、需实施期确认的点**：`*.example.com` 是否同时覆盖 `example.com` 本身；`--allow-net=host` 对 **HTTP 重定向到未授权域**的行为；启动耗时量级。全部计入 §7。

**⑤ 随包分发解释器（Kimi 路线）**

- 参照事实（托管 CPython 3.12 + uv + wheelhouse、runner import 模块调 `run(ctx)`、60 s 超时、产物写输出文件）来自 #111 / #114 记录的本机逆向，**本轮未复核**，按「可信外部参照」引用。
- 就本 ticket 的四个维度而言，它在**网络白名单**上是最弱的一档（无原生表达），在**分发体积 / 跨平台代价**上是最重的一档；它的真正优势在别处（数据处理生态、pandas 类库、与 Kimi 已验证的作业心智一致），那属于 #119 的合同取舍，不属于本文事实面。

### 3.3 与本仓既有超时/强杀实现的接缝【源码】

无论选哪条子进程路线，**现成可抄的超时实现只有 `LocalSandbox.execute`**（core dist `index.mjs:21235-21315`）：

```js
if (timeoutMs > 0) {
  timeoutId = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
    setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 1e3);
  }, timeoutMs);
}
```

三条要注意：`spawn` **未加 `detached`**，`proc.kill` 只作用于直接子进程（若外层是 `sandbox-exec`，孙进程未必收到信号）；`maxOutputBytes` 默认 1 MiB（本仓 `office-workspace-sandbox.ts:50`）；本仓现有各层超时是 30 s / 120 s，**没有任何 Job 级超时概念**（#114 §2.4 已列，本轮复核仍然成立）。

---

## 4. Q3 — 产物协议的既有条件

### 4.1 `GET /workspace/file` 的实际实现约束【源码】

| 项 | 事实 | 位置 |
|---|---|---|
| 挂载 | `mountWorkspaceRoutes` 在 Hono matcher 构建前挂 `/workspace/info` 与 `/workspace/file` | `configure-sidecar-app.ts:49-95` |
| 上限怎么实施 | `maxBytes = options?.maxBytes ?? 25 * 1024 * 1024`；**判定在 `stat` 上**（`st.size > maxBytes` → `too-large` → HTTP 413），不是边读边计 | `workspace-file-api.ts:71,107-113`；`httpStatusForWorkspaceRead:139-156` |
| query 覆盖 | `?maxBytes=` 经 `parsePositiveMaxBytes`，非有限数或 ≤0 → `undefined`（回落 25 MiB）。**注意：query 值大于 25 MiB 会被采纳，它不是「只能收紧」的硬顶** | `configure-sidecar-app.ts:42-47,70` |
| 读法 | `await readFile(abs)` 一次性整读进 Buffer，**无流式、无 Range、无分块** | `workspace-file-api.ts:114` |
| 回包 | `c.body(Uint8Array.from(result.bytes))` —— `Uint8Array.from` 对 Buffer 是**逐元素复制**（非零拷贝视图） | `configure-sidecar-app.ts:93` |
| 越界防护 | 先 lexical `resolvePathWithinRoot`，再 `resolveExistingPathWithinRoot`（realpath containment，拒符号链接逃逸）；越界 403、不存在/目录 404 | `workspace-file-api.ts:81-96`；`workspace-root.ts:75-150` |
| 响应头 | `Content-Type`（扩展名猜测）、`X-Workspace-Relative-Path`、`X-Byte-Length`、`Cache-Control: no-store` | `configure-sidecar-app.ts:89-92` |
| 已知竞态 | `stat` 与 `readFile` 之间文件可被换掉（TOCTOU），上限判定基于旧 size【推断】 | 同上 |
| 网络到达 | Vite 代理 `/voltagent-runtime` → 侧车 | `archetypes/agent-workbench/vite.config.ts:65-70` |

### 4.2 渲染层侧的有效上限【源码】

`http-workspace-document-content.ts:103-104` 按格式族算出 `maxBytes` 后**主动写进 query**：

| 族 | 上限 | 位置 |
|---|---|---|
| text / code / markdown（**JSON 归此族**） | `1.5 MiB` | `path-utils.ts:13` |
| image | `15 MiB` | `path-utils.ts:15` |
| pdf / office | `25 MiB` | `path-utils.ts:17` |

⇒ **Job 的 JSON 产物若复用 Document 适配器，天花板是 1.5 MiB。** 要吃满 25 MiB 必须由 Board 侧新写一个 adapter（可行——它只是一次带 `maxBytes` 的 fetch）。

### 4.3 作业写产物文件的合法路径范围

见 §2.3。归纳成 Job 视角的三句话：

1. **一切产物必须落在 `WORKSPACE_ROOT` 之内**，四条通道无一例外，且 realpath containment 已经堵住 symlink 逃逸（`workspace-root.ts:105-150`）。
2. **根本身是可变的**：dev/minimal 默认是 monorepo 根，桌面 Host 是用户选的项目根（`main.ts:164`）。Job 的产物路径合同**不能假设根的语义**，只能假设「根内相对路径」。
3. **约定的输出目录已经存在但只是文档约定**：`output/meeting-notes/` 等写在首启 README 与 agent instructions 里（`workspace-root.ts:273-277`、`create-agent.ts:244`），**没有任何代码强制**。Job 产物目录（例如 `output/widget-data/<jobId>/…`）同理，只能靠合同约束，不能指望现有代码兜底。

---

## 5. Q4 — 授权时机（写入时审批 / 运行时静默）的落地条件

### 5.1 现有 approval 链路的完整形状【源码】

```text
侧车：VoltAgent tool 的 needsApproval（create-agent.ts:113-131 / tools.ts:49 / mcp-loader.ts:414-426）
  ↓ SSE chunk  type='tool-approval-request'（{ approvalId, toolCall:{ toolCallId, toolName, input } }）
渲染层 Adapter：rememberApprovalFromChunk → state.pendingApprovals: Map<approvalId, {...}>  ← 纯内存
  ↓ fullstream-to-envelope.ts:528-538
envelope 'approval.requested'  payload = { requestId, toolName, toolCallId, args }
  ↓ projection → Timeline
TaskSurface：usePermissionPreset(taskId) + decideApprovalResponse(preset, toolName) → 'approve' | 'dock'
  ↓ respondToApproval { decision, requestId, reason }（commands.ts:106-115）
Adapter.handleApproval → 中止当前 SSE → 发 'approval.resolved' → resumeWithToolPart(state:'approval-responded')
```

关键位置：`voltagent-runtime-adapter.ts:603-669`（handleApproval）、`:769-796`（rememberApprovalFromChunk）、`task-surface.tsx:132-167`（preset 自动应答）、`permission-preset.ts:16-26,72-88`。

### 5.2 为什么不能把它改造成「一次性同意」

| 障碍 | 事实 | 位置 |
|---|---|---|
| **同意没有主体可挂** | `approval.requested` payload 只有 `{ requestId, toolName, toolCallId, args }`——`requestId` 是 VoltAgent 每次调用新生成的 `approvalId`，**不表示任何跨调用的稳定主体** | `fullstream-to-envelope.ts:528-538` |
| **回执没有 scope 字段** | `RespondToApprovalCommand.payload = { decision, requestId, reason? }`，**没有 scope / 有效期 / 主体 / 域名集合** | `commands.ts:106-115` |
| **状态不持久** | `pendingApprovals` 是 Adapter 实例上的 `Map`，刷新即失；#113 调研已确认「挂起 Run 刷新后记为 `run.interrupted`，永远无法恢复」 | `voltagent-runtime-adapter.ts:769-796`；`docs/research/board-write-channel-client-side-tool-2026-08-15.md` §0 第 3 行 |
| **Preset 的键是 Task，不是作业** | `getPermissionPreset(taskId)`，localStorage key `uilab.agent-workbench.permission-preset.v1`，值域只有 `auto-approve` / `full-access`，白名单是**写文件工具名的精确匹配** | `permission-preset.ts:16-26,53,98-117` |
| **运行期没有 tool call** | 「写入时审批、运行时静默」的刷新根本不经模型，**不会产生 `approval.requested`**，也就没有 Timeline 卡片位置、没有 Run 可恢复 | 由 §5.1 链路直接推出【推断】 |
| **没有 Task 就没有承载面** | envelope 的 `projectId` / `taskId` / `turnId` 全部必填；Board 是全局实体 | `task/protocol/events.ts:9-24` |

**结论：approval 链路应当保持原样服务「模型发起的一次调用」，consent 是与它平行的第二条授权轴。**

### 5.3 最小改动面（事实 + 由事实推出的必要条件，不是方案决策）

**(a) 同意的标识用什么 —— 必须是内容哈希，不能只是作业 id。**
理由是仓库里的一条具体事实：作业运行时在 seatbelt 下**对整个 `rootDir` 可写**（§2.2）。若作业代码也存在工作区内，**一个已获批的作业可以改写自己的（或另一个作业的）代码，下一次刷新就在旧同意下跑新代码**。因此：

- 同意主体 ≥ `(jobId, sha256(作业代码), sha256(规范化后的域名集合))`；
- **执行期传给运行时的 `--allow-net` 参数必须取自已批准记录里的域名集合，而不是取自作业当下的声明**，否则改声明即可扩权【推断】；
- 代码或域名任一变化 → 哈希变化 → **视为未授权，必须重新征得同意**（这正是 ticket 已锁定的「审批发生在写入/变更那一刻」）。

**(b) 现有数据结构缺的字段（逐个点名）**

| 结构 | 现状 | 缺什么 |
|---|---|---|
| `RespondToApprovalCommand.payload` | `{ decision, requestId, reason? }` | 若沿用它承载 consent：缺 `subject`（jobId+哈希）、`grants`（域名集合）、`grantedAt`。**但更可能的形态是新增独立 command，而非污染它** |
| `approval.requested` payload | `{ requestId, toolName, toolCallId, args }` | 同上；且它是 Timeline 事实，consent 不必然是 Timeline 事实 |
| `PermissionPreset` | 键 = `taskId`，值域二选一，白名单 = 写文件工具名 | 键的轴不对（Board/Job 是全局），值域无法表达「按作业」 |
| 侧车 consent 存储 | **不存在** | 需要一个 store；**先例已有**：`selection-store.ts:1-5` 明确「Workbench 是持久真源，侧车只持 working copy 以便门禁在无密钥情况下运行」，`POST /capability/selection` / `POST /capability/active-task` 就是渲染层→侧车推送状态的已有路由形态（`capability/http-routes.ts`） |
| 渲染层持久化 | 统一 IDB 现为 `WORKBENCH_IDB_VERSION = 2`（`app/persistence/workbench-idb-schema.ts:10`；#114 记录的 `= 1` 已过期），`events` 主键仍是 `['taskId','taskSequence']`（`:68`）、`snapshots` 主键 `taskId`（`:74`） | Board/Job/consent 需新 store + 再一次 schema bump（#111 已锁定），`check:workbench` 的必需 module 列表需同步 |

**(c) fail-closed 逻辑在哪里开口、以及必须保持不变的部分**

- **不要动 `decideToolNeedsApproval`（`security-policy.ts:77-81`）**：它的语义是「MCP/工具名 allowlist，空表即全员需审批」。consent 的轴是「代码+域名」，两者混用会让 `MCP_READ_ONLY_TOOL_NAMES` 这个**运维 env** 意外获得放行产品级作业的能力。
- **不要给 `execute_command` 开例外**：ADR-0017:49 的不变量是「任意命令执行的最终用户边界是审批」。Job 运行时若复用 `execute_command`，就是直接违反。
- **开口应当是一个新的、不接受任意 argv 的执行入口**：入参只有「作业标识 + 用于校验的哈希」，argv 由侧车按固定模板构造（可执行文件固定、权限 flag 由已批准的域名集合生成）。这与 `connector-aware-sandbox` 已有的「固定可执行路径、丢弃模型 env、clamp 超时/输出」的收敛手法同构（#114 §5.1 已记）。
- **fail-closed 的默认必须是「拒绝并静默失败」，不是「弹卡」**：运行期没有 Task 上下文（`tool-gate.ts` 的 `missing_task_context` 已经证明了连接器工具在无 Task 时只能拒绝），Board 刷新失败应表现为 widget 的 degraded 状态 + 「作业已变更，需要重新授权」的宿主 chrome 提示【推断】。
- **另一条必须显式处理的写入面**：若作业代码放在工作区内，则 `write_file` / `edit_file` 的既有审批（`create-agent.ts:118-119`，且在 `auto-approve` preset 下**会被自动批准**——`permission-preset.ts:16-22` 把 `write_file`/`edit_file` 列入自动批准名单）**不足以充当「作业代码变更审批」**。写作业代码这一动作需要一个不被 preset 自动放行的专属审批，否则「写入时审批」在默认 preset 下等于没有审批。**这可能是本节最容易被忽略、后果最严重的一条。**

---

## 6. 对下游 ticket 的直接影响

1. **给 #119（工具族 / 作业合同）**：产物大小的真实分界线是 **1.5 MiB（复用 Document adapter）/ 25 MiB（自建 Board adapter）**，不是笼统的「25 MiB」；`?maxBytes=` 能被调大而不是只能收紧，合同需自己夹紧。
2. **给 #119 / #120**：若选 Deno，**作业依赖来源必须在生成期锁死**——静态 import 图不过权限系统（§3.2 ④），`--allow-net` 管不住它。
3. **给授权模型 ADR**：`auto-approve` preset 默认自动批准 `write_file`/`edit_file`（`permission-preset.ts:16-22`），因此「写作业代码时审批」不能复用普通文件写审批（§5.3 c 最后一条）。
4. **给实施期**：`sandbox-exec` 路线要收敛读权限，就得自己传 `readOnlyPaths` 或整份 profile，并同时接受「系统二进制读白名单过窄会 SIGABRT」这个本仓注释已记录的坑（`office-workspace-sandbox.ts:42-45`）。
5. **给运维文档**：`README.md:103`「sandbox 未启用」仍是 stale（#114 已提，本轮复核确认）；此外 `OPERATOR.md:223` 只写了 `WORKSPACE_SANDBOX_ISOLATION`，**`WORKSPACE_SANDBOX_ALLOW_NETWORK` 默认放行网络这一行为未在 OPERATOR 文档中说明**。本轮不改文件。

---

## 7. 未验证 / 诚实边界清单

| # | 项 | 为什么未验证 |
|---|---|---|
| 1 | 五条候选路线各自的**启动耗时**（冷启 ms 量级） | 需要真实运行进程，本轮禁止。留待实施期用同一台机、同一负载做对照。 |
| 2 | `GET /workspace/file` 在 **25 MiB 附近的真实内存峰值**（`readFile` Buffer + `Uint8Array.from` 复制 + Hono 回包） | 需跑侧车 + 浏览器。代码路径已确认为「整读 + 逐元素复制」，但常驻峰值倍数未测。 |
| 3 | Deno **解压后二进制体积**与随包分发后的安装包净增量 | 只读到 release zip 的压缩体积（36.7 / 39.7 / 40.7 MiB）；解压后与签名/公证后的增量需实测。 |
| 4 | Deno `--allow-net="*.example.com"` **是否同时覆盖 `example.com` 裸域** | 官方文档只写「wildcard for any subdomain」，未明确裸域。 |
| 5 | Deno `--allow-net=host` 对 **HTTP 重定向到未授权域**、以及**通过 IP 直连已授权域名**的判定 | 文档未覆盖，需 spike。 |
| 6 | 本仓 seatbelt profile 下 `(allow network*)` 是否**真的**放行出网（#114 已列同一条，本轮仍未验证） | 需跑侧车。 |
| 7 | `(allow process*)` 下**子/孙进程是否继承 seatbelt 策略**，以及 `proc.kill` 打到 `sandbox-exec` wrapper 时孙进程的存活情况 | 需实测；本文按「wrapper 是直接子进程」的代码事实做了【推断】。 |
| 8 | **宿主是否有可用的 python3 / uv**（#114 遗留项，本轮同样未探测） | 需执行探测命令，禁止。 |
| 9 | Node `--permission` 在 **v25+** 上与 `tsx` / ESM loader 的兼容性（`--env-file` 明确不受权限模型约束，loader 行为未验证） | 需跑进程；且宿主当前是 v24.6.0。 |
| 10 | `worker.terminate()` 对**同步死循环 / Atomics.wait** 的实际中断表现 | 需实测。 |
| 11 | Kimi 参照实现的细节（托管 CPython 3.12 + uv + wheelhouse、`run(ctx)`、60 s 超时、输出文件环境变量） | 来自 #111/#114 记录的本机逆向，**本轮未复核**，按可信外部参照引用。 |
| 12 | 侧车 consent working copy 与渲染层 IDB 权威记录的**一致性窗口**（侧车重启后未推送即拒绝，还是缓存？） | 属实施期设计，本文只给出 `selection-store` 先例，未验证其在 consent 语义下是否够用。 |

---

## 附：本文引用的一手来源

**官方文档**

- Deno Security and permissions — <https://docs.deno.com/runtime/fundamentals/security/>
- Deno Permissions reference（`--allow-net` 主机/端口/通配语法、`--deny-net`、symlink 判权、prompt 抑制） — <https://docs.deno.com/runtime/reference/permissions/>
- Deno Installation（单文件二进制、平台 asset 表、npm 安装拖慢启动、Windows ≥ 10 1709） — <https://docs.deno.com/runtime/getting_started/installation/>
- Deno v2.9.5 release assets（zip 体积读自 GitHub Releases API 的 `size` 字段） — <https://github.com/denoland/deno/releases>
- Node.js Permissions（Permission Model 稳定性、约束清单、`process.permission.drop`、symlink 已知问题） — <https://nodejs.org/api/permissions.html>
- Node.js CLI（`--allow-net` Added in v25.0.0 / Stability 1.1、`--permission-audit`） — <https://nodejs.org/api/cli.html>
- Node.js `vm`（「不是安全机制」） — <https://nodejs.org/api/vm.html>
- Node.js `worker_threads`（`resourceLimits` 只约束 JS 引擎、`terminate()`） — <https://nodejs.org/api/worker_threads.html>

**仓库源码**（相对仓库根）

- `tooling/workbench-runtime-voltagent/{package.json,tsconfig.json,README.md,OPERATOR.md}`
- `tooling/workbench-runtime-voltagent/src/{profile.ts,tools.ts,create-agent.ts,workspace-root.ts,workspace-file-api.ts,configure-sidecar-app.ts}`
- `tooling/workbench-runtime-voltagent/src/runtime-shell/office-workspace-sandbox.ts`
- `tooling/workbench-runtime-voltagent/src/plugin/{security-policy.ts,mcp-loader.ts,skills-loader.ts}`
- `tooling/workbench-runtime-voltagent/src/capability/{selection-store.ts,http-routes.ts}`
- `tooling/workbench-runtime-voltagent/node_modules/@voltagent/core/dist/index.mjs`（`LocalSandbox` / seatbelt profile 生成 / bwrap 参数 / execute 超时）
- `archetypes/agent-workbench/src/modules/task/protocol/{events.ts,commands.ts}`
- `archetypes/agent-workbench/src/modules/task/application/permission-preset.ts`
- `archetypes/agent-workbench/src/modules/task/ui/task-surface/task-surface.tsx`
- `archetypes/agent-workbench/src/modules/task-runtime/voltagent/{voltagent-runtime-adapter.ts,fullstream-to-envelope.ts}`
- `archetypes/agent-workbench/src/modules/work-surface/{adapters/http-workspace-document-content.ts,surfaces/document/path-utils.ts}`
- `archetypes/agent-workbench/desktop/electron/main.ts`、`archetypes/agent-workbench/vite.config.ts`
- `docs/adr/0017-provider-owned-plugin-contract-and-dynamic-discovery.md`
- `docs/research/{widget-data-job-sidecar-paths,board-write-channel-client-side-tool}-2026-08-15.md`
