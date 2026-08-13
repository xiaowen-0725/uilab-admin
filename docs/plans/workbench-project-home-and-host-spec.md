# Spec: Workbench Projects Home、Project 本地根与 Desktop Host（Spec-α）

**Status:** implemented-alpha  
**Map:** https://github.com/xiaowen-0725/uilab-admin/issues/87  
**Vocabulary:** root [`CONTEXT.md`](../../CONTEXT.md)  
**ADR:** [0005](../adr/0005-make-workbench-desktop-first-and-host-agnostic.md) · [0012](../adr/0012-keep-agent-runtime-outside-renderer.md) · [0014](../adr/0014-use-project-task-turn-run-lifecycle.md) · [0015](../adr/0015-workbench-project-catalog-and-unified-idb.md)  
**Acceptance anchor:** Workbuddy（打开本地文件夹 → 选项目 → 在该根内读写干活）  
**Companion:** Spec-β = Capability / 默认权限 / 真连接器里程碑（修订既有 Capability Surface Spec；本文件 Non-goals）  
**Grilling:** 2026-08-12 对齐（Project 单根、Projects Home、未选自动建 Project、UI 文案「项目」）

---

## Problem Statement

用户把 Agent Workbench 当 Workbuddy / Codex 一类桌面 Agent 用时，期望能「选择或打开一个本地文件夹，然后在这个范围内让 Agent 读写文件、继续多个对话」。今天模板虽有 Project / Task 目录、VoltAgent 侧车与 Document 工作区提示，但：

- Project **没有**作为产品一等概念的本地根目录；
- 没有应用级 **Projects Home**（对应 Workbuddy 的 `~/WorkBuddy` 父目录心智）；
- 没有经 Desktop Host 的「打开本地文件夹」系统对话框闭环；
- 未选择 Project 时，也不会按 Workbuddy 习惯为新 Task **自动创建**带根的 Project；
- 冷启动仍可能留下长期无根的「默认项目」，与桌面及格线不一致。

结果是：Workbench 看起来像工作台，却验不过「选文件夹 → 干活」这条 Workbuddy 主路径，也无法诚实宣称自己是可派生的桌面 Agent 真模板。

## Solution

交付 **Spec-α**：以 Workbuddy 为验收主锚，让用户用「项目」完成本地根的选择、新建与自动创建，并在 Desktop Host（最小 Electron）上证明 Agent 能读写当前 Project 根内文件。

1. 领域上固定：**Projects Home**（应用级父目录）≠ **Project**（可选工作集合，单根）≠ **Workspace**（Shell 主区域）。
2. 产品上提供：选择/搜索项目、「打开本地文件夹」、「新建」（落在 Projects Home 下）、未选项目时新 Task 自动建 Project。
3. 架构上：扩展 Project 目录以持久化单根路径；新增 **HostPort**（选目录、Projects Home、建子目录、侧车生命周期）；**Project 本地根命令面**作为对外主缝；选中根注入既有 Runtime `WORKSPACE_ROOT` 语义。
4. 有 Host 的产品路径取消长期无根默认 Project；无 Host 仅作测试/Web 降级。
5. 读写验收：Host/Adapter 集成测试 + 一条 VoltAgent 侧车 E2E 冒烟。

**诚实边界：** 最小 Electron ≠ 完整安装体验/自动更新；本机侧车 ≠ 多租户生产 Runtime；本切片不含默认权限产品化与真连接器黄金路径（Spec-β）。

## User Stories

1. As a 桌面用户, I want 从入口选择一个已有项目, so that 我能回到上次的本地工作范围继续对话。
2. As a 桌面用户, I want 搜索项目列表, so that 项目多了仍能快速找到目标。
3. As a 桌面用户, I want 看到当前选中项目的名称, so that 我知道 Agent 读写范围落在哪里。
4. As a 桌面用户, I want 使用「打开本地文件夹」, so that 我可以把任意本机目录变成一个项目根。
5. As a 桌面用户, I want 系统目录对话框由 Desktop Host 弹出, so that 体验与 Workbuddy / 系统应用一致。
6. As a 桌面用户, I want 打开文件夹后自动出现在可选项目列表, so that 我不必再手工「注册」路径。
7. As a 桌面用户, I want 新打开的文件夹默认成为当前选中项目, so that 打开即可开干。
8. As a 桌面用户, I want 「新建」在 Projects Home 下创建一个子目录项目, so that 我不必先到 Finder 里建文件夹。
9. As a 桌面用户, I want 新建项目的默认名称可读（例如基于目录名）, so that Navigator / 选择器里能辨认。
10. As a 桌面用户, I want Projects Home 有合理默认路径（Profile 默认 `~/AgentWorkbench`）, so that 首次使用无需理解高级配置。
11. As a 桌面用户, I want 能配置 Projects Home, so that 我可以把自动创建的项目放到自己习惯的父目录。
12. As a 桌面用户, I want 在未选择任何项目时开始新对话, so that 仍能立刻进入工作流。
13. As a 桌面用户, I want 未选项目时系统在 Projects Home 自动创建一个带根的项目并挂上新 Task, so that 行为对齐 Workbuddy。
14. As a 桌面用户, I want 自动创建的项目出现在选择列表中, so that 我之后还能再选回来。
15. As a 桌面用户, I want 已选项目后再开「新对话」时复用同一项目根, so that 多个 Task 共享同一文件夹，而不是每次新建平级目录。
16. As a 桌面用户, I want 已选项目下的多个 Task 都读写同一根目录, so that 「项目」仍是工作集合而不是一次性沙箱。
17. As a 桌面用户, I want 用户可见文案使用「项目」而不是「工作空间」, so that 不与 Shell 的 Workspace 概念混淆。
18. As a 桌面用户, I want 在项目根内让 Agent 读取已有文件, so that 我能基于本地材料提问。
19. As a 桌面用户, I want 在项目根内让 Agent 写入/创建文件（经既有审批语义）, so that 工作结果落在我选的文件夹里。
20. As a 桌面用户, I want Agent 无法把文件写到项目根之外, so that 本地权限边界可信。
21. As a 桌面用户, I want 切换选中项目时 Runtime 工作根跟着切换, so that 不会写到上一个项目的目录。
22. As a 桌面用户, I want 冷启动不要长期停在一个无根的「默认项目」, so that 桌面路径的状态机更诚实。
23. As a Web / 无 Host 测试用户, I want 仍有明确降级路径, so that CI 与浏览器开发不依赖 Electron，但也不假装已通过桌面及格线。
24. As a 模板维护者, I want Project 目录 Port 能持久化单根路径, so that 刷新后项目根仍在。
25. As a 模板维护者, I want Renderer 不直接调用 Electron/Node API, so that 保持 host-agnostic（ADR-0005/0012）。
26. As a 模板维护者, I want HostPort 成为唯一新增宿主边界, so that 选目录 / Projects Home / 建子目录 / 侧车生命周期可替换实现。
27. As a 模板维护者, I want 最小 Electron Adapter 实现 HostPort, so that Spec-α 的系统对话框与 Projects Home 可验收。
28. As a 模板维护者, I want 选中项目根注入侧车既有 WORKSPACE_ROOT 语义, so that 不新造第二套文件工具协议。
29. As a 模板维护者, I want Composition 装配 Catalog、Host、Runtime 与会话指针, so that Shell 只绑定命令与视图。
30. As a 模板维护者, I want 「新对话」继续走统一生命周期命令, so that 不出现第二套新建 Task 入口。
31. As a 派生应用开发者, I want Template 合同与薄 Product Profile 分离, so that 默认 Projects Home 名可换品牌而不改 Archetype 硬规则。
32. As a 派生应用开发者, I want 中性默认 `~/AgentWorkbench`, so that 模板不在合同里写死竞品目录名。
33. As an Agent 实施者, I want 单主缝（Project 本地根命令面）可测, so that 可用 Host/Catalog/Runtime 替身验收行为。
34. As an Agent 实施者, I want 一条侧车 E2E 冒烟覆盖读写, so that Workbuddy 及格线有落盘证据。
35. As a 评审者, I want Spec-β（权限 / Capability / 真连接器）明确不在本切片, so that 范围不被撑爆。
36. As a 评审者, I want Review / Git / URL 会话权威明确后置, so that 不与本切片抢主路径。
37. As a 桌面用户, I want 打开的外部目录（不在 Projects Home 下）也能成为项目, so that 「打开本地文件夹」不限于 Home 内。
38. As a 桌面用户, I want 对同一路径重复打开时行为可预期（复用已有 Project 或可检测冲突）, so that 列表不会无意义膨胀。
39. As a 桌面用户, I want 自动创建的项目目录名可区分（时间戳或等价唯一策略）, so that Projects Home 下不互相覆盖。
40. As a 桌面用户, I want 在无根可用时写盘与 Document 写路径 fail-closed 且有中文说明, so that 不会静默写到未知位置。

## Implementation Decisions

1. **管辖分层**：本 Spec 写入 Agent Workbench Template 合同；Projects Home 默认路径、展示名等放在薄 Product Profile，允许派生应用覆盖。
2. **验收主锚**：Workbuddy；Codex 几何可保留但不作本切片必过项；OpenWork 仅借鉴 Host/引擎外置模式，不对等功能清单。
3. **词汇**：严格使用 CONTEXT——Projects Home、Project、Task、Workspace（Shell）、Desktop Host、HostPort、Agent Runtime；用户文案「项目」；Avoid 用「工作空间」指文件夹。
4. **主缝**：Project 本地根命令面（应用层）对外提供选择/打开/新建/未选自动创建/当前根查询；Shell 只消费命令与视图。
5. **HostPort（唯一新增边界缝）**：至少覆盖——弹出选目录、解析/确保 Projects Home、在 Home 下创建子目录、查询 Host 是否可用、侧车生命周期（启动/健康/停止中与本切片相关的最小集）。Renderer 禁止直连 Electron。
6. **Desktop Host 实现**：Spec-α 交付最小 Electron Adapter；Tauri 不在本切片。无 Host 时命令面返回可区分的降级错误/模式，供测试与 Web 开发。
7. **Project 模型**：每个 Project 至多一个本地根路径；根可来自打开文件夹、Home 下新建、或未选时自动创建。
8. **Catalog**：扩展 Project 目录持久化以保存根路径与更新时间等必要字段；Memory 与 IndexedDB Adapter 同语义；runStatus 仍不进目录。
9. **未选 Project + 新对话**：在 Projects Home 自动创建新 Project（唯一目录名策略）并创建 Task，选中该 Project；自动创建项进入可选列表。
10. **已选 Project + 新对话**：只创建 Task，共用该 Project 根；不在 Home 下新建平级根。
11. **冷启动（有 Host）**：不保留长期无根「默认项目」作为产品路径；初始可为「未选 Project」，由首次新对话触发自动创建，或引导打开/新建。
12. **冷启动（无 Host）**：允许测试降级（含无根或 Memory 夹具），但不得标为桌面验收通过。
13. **Runtime 接线**：当前选中 Project 根映射到既有侧车工作区根语义（环境/配置注入）；切换 Project 必须更新有效根后再接受写盘 Turn。
14. **Document / 工作区提示**：继续经既有 Workspace Document 源消费「当前根」；本切片不新开 Document 协议。
15. **路径安全**：越界写入拒绝；与侧车既有根内解析/拒绝逃逸策略对齐。
16. **重复打开同一路径**：优先复用已有 Project（同一规范化根），避免重复条目；规范化规则由命令面定义并单测。
17. **Composition**：唯一装配 Host Adapter、Catalog、命令面、Runtime 根注入与会话指针；不把级联逻辑堆进 Shell。
18. **Module 边界**：Project Module 拥有目录与根字段；HostPort 可由 Project 应用层或 Composition 持有注入；Task Module 不拥有 Projects Home。
19. **门禁**：保持 Renderer 无 Node/Electron import；`check:workbench` 边界继续有效。
20. **Spec-β 关系**：默认权限、Composer「+」深度、真连接器黄金路径不在 α 实施范围；另开/修订 Capability 里程碑，可与 α 并行但不阻塞 α 的 1+2+3+7 验收。

## Testing Decisions

1. **只测外部行为**：给定 Host/Catalog/Runtime 替身，断言项目列表、当前根、目录是否创建、重复打开是否复用、未选/已选新对话差异、越界写失败；不断言 React 内部 state 或 Electron 私有实现细节。
2. **主缝测试**：Project 本地根命令面——Memory Catalog + 假 HostPort（可记录调用与虚拟文件系统）覆盖打开/新建/自动创建/共用根。
3. **Catalog 测试**：带根字段的 put/get/list；Memory 与 IDB（或既有 catalog 测法）语义一致。
4. **Host Adapter 测试**：在可行范围内测 Electron 适配的合同符合性（或契约测试）；CI 默认不依赖真实弹窗时可跳过/标记桌面作业。
5. **Runtime 集成**：选中根注入后，工具读/写落在根内；根外拒绝——优先复用侧车既有 workspace 根测试传统。
6. **E2E 冒烟（必过一条）**：有 Host 或等价编排下，打开/创建项目 → 提交 Turn → 根内出现可观察文件变更（或可读已知文件）；无侧车时失败必须诚实，不伪装本地流。
7. **降级测试**：无 Host 时命令返回降级信号；浏览器路径不崩溃。
8. **Prior art**：Project catalog Memory 测试、task-lifecycle 新对话决策测试、Workspace Document Source 测试、侧车 `WORKSPACE_ROOT` / 路径越界测试、Workbench 浏览器集成与视觉矩阵风格。

### 验收清单（Spec-α 必过）

- [ ] 选择项目入口 + 列表/搜索  
- [ ] 「打开本地文件夹」→ 系统目录对话框（Electron Host）→ 绑定/创建 Project 并选中  
- [ ] 「新建」→ Projects Home 下子目录 Project  
- [ ] 未选时新 Task → 自动 Project+Task；已选时新 Task → 共用根  
- [ ] Agent 读/写当前 Project 根内文件（集成 + 一条侧车 E2E 冒烟）  
- [ ] 用户文案「项目」；领域词 Projects Home / Project / Workspace 不混用  

## Out of Scope

- 默认权限选择器的产品化与权限策略引擎（Spec-β）  
- Composer「+」Capability 深度验收与真连接器黄金路径（Spec-β）  
- Review Surface、Resource Explorer、Git Port、Terminal  
- URL 会话权威 / 深链  
- Tauri Host、完整安装器、自动更新、签名公证  
- 云端 Workspace / 远程 OpenCode 式 remote workspace  
- 多根 Project、跨 Project 单 Task  
- 删除 Project 及级联（若未另有合同）  
- 重写 RuntimePort 事件宇宙或替换 VoltAgent  
- 把 Shell 的 Workspace 重命名为文件夹语义  
- Phase 8 `init` 生成 Workbench 派生应用  

## Further Notes

- **Spec-β：** [`workbench-capability-permissions-milestone-spec.md`](./workbench-capability-permissions-milestone-spec.md)（**Must=默认权限**；连接器为既有实现的 acceptance closeout；与 α 并行）  
- **可能后续 ADR**：HostPort 形状与 Electron 最小壳；仅当实现中出现难逆、惊讶、真权衡时再写。  
- **与 OpenWork 差异**：我们保留自有 Project/Task/Turn/Run 与 RuntimePort；不引入 OpenWork 的 Workspace=文件夹词汇，不整仓抄 Den/EE。  
- **实施顺序建议**：Catalog 根字段 → HostPort 合同 + 假 Host → 命令面行为 → Electron Adapter → Runtime 根注入 → E2E 冒烟 → UI 选择器文案。  
