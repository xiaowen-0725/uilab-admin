# 调研：WorkBuddy 自动生成 HTML 报告与 Cursor Canvas 的差异

- **Ticket:** [调研：WorkBuddy 自动生成 HTML 报告与 Cursor Canvas 的差异](https://github.com/xiaowen-0725/uilab-admin/issues/174)
- **地图:** [Wayfinder 地图：Workbench 对话旁现场产物（Cursor Canvas 职责）首版规格](https://github.com/xiaowen-0725/uilab-admin/issues/167)
- **Date:** 2026-08-27
- **Scope:** 还原 WorkBuddy「对话结束后写出 HTML、右侧打开预览」这条链路，并和 Cursor Canvas 对照。只陈述机制、差异、适用场景，以及和本仓已有面的远近。不选型、不写规格、不实施产品功能。
- **方法边界:** 只读公开 UI / 帮助 / 已有转储 / 本机活预览 HTTP。未拆 `app.asar`。未点 WorkBuddy 帮助菜单做二次走读。需要实现级才能确认的标【未验证】。
- **证据标签:** 【一手】= 截图、本机活 HTTP、官方帮助、本机 skill/SDK、本仓库源码 · 【shipped】= 本仓代码已装配 · 【推断】= 由一手推出、来源未写死 · 【未验证】= 需要拆包或再跑一轮生成才能确认

并行票只引用、不复述：[#168 Resolution](https://github.com/xiaowen-0725/uilab-admin/issues/168#issuecomment-5434563878)（Canvas 生命周期）、[#169 Resolution](https://github.com/xiaowen-0725/uilab-admin/issues/169#issuecomment-5434578496)（本仓对话旁通道）、[#153 Resolution](https://github.com/xiaowen-0725/uilab-admin/issues/153#issuecomment-5395395992)（协议面，不是 HTML 生成）。

---

## 0. 结论先行

1. **WorkBuddy 这条是「写工作区 `.html` + 本机静态站 + 内置浏览器自动打开」。** 深度研究收尾后，助手正文写「报告已生成并打开预览：`….html`」，Timeline 出文件卡，右侧是带地址栏的浏览器，URL 形如 `http://127.0.0.1:52200/static-html/<id>/<filename>.html`。【一手】用户截图；本机 5.3.14 活端口 `52200` 对同一 URL 返回完整 HTML。
2. **预览器不是把 Markdown 现场烘成页。** 该 URL 的响应体已是独立 `.html`（约 43 KiB，内联 CSS，无 `<script>`）。`/` 与 `/static-html/` 目录列举是 404，只有精确文件路径 200。官方把「产物 / 文档预览」和「网页预览 / 内置浏览器」写成结果区里的两类。【一手】活 HTTP + [结果查看](https://www.workbuddy.cn/docs/workbuddy/Results)
3. **HTML 从哪来：官方没写死。** 看得见的是：Agent 把文件写入工作区；changelog 有 `present_files`「统一文件产物展示入口并联动右侧预览」；灵感页写「生成网页文件时自动打开内置浏览器」。模型直出整页、模板填空、还是先写 md 再烘成 html，公开资料对不上。【未验证】生成管线；【推断】这份报告的皮肤（`Deep Research · 行业研究` kicker、封面、目录、摘要框、阶段卡）像产品化报告皮，不是聊天气泡被预览器临时转出来的。
4. **和 Cursor Canvas 不是同一类东西。** Canvas 是托管目录里的 `.canvas.tsx`，IDE 用 `cursor/canvas` SDK 编译，聊天只插指针；打开官方写成点 card / Open Canvas；用户可切 source；运行时禁止 canvas 自己 `fetch()`。WorkBuddy 这条是普通 HTML 文件 + HTTP 源 + 内置浏览器；数据写进文件；分享走产物/微信，不是 Canvas Publish。【一手】[#168](https://github.com/xiaowen-0725/uilab-admin/issues/168) + [Canvases](https://cursor.com/docs/agent/tools/canvas.md) + 本机 canvas skill
5. **对本仓已有面：最近的是「产物卡 + 自动打开 + Browser（localhost URL）」；Document 更远；Cursor 式现场件更远。** 本仓 Document 把 `.html` 当源码；Browser 已认 `127.0.0.1`；产物卡会 featured HTML，但打开仍走 Document。【shipped】[#169](https://github.com/xiaowen-0725/uilab-admin/issues/169) + `format-router.ts` / `deliverable-presentation.ts`
6. **适用场景分开。** WorkBuddy HTML：静态研究报告、可分享成品、页面原型。Cursor Canvas：对着同一份数据继续筛、改、追问的交互件。同一份「研究报告」题目，两边都能交，但交出来的东西不是一种工件。

---

## 1. 来源

| 层级 | 来源 | 角色 |
|---|---|---|
| 用户画面 | 本机 WorkBuddy 截图：深度研究完成 + 文件名链接 + 文件卡 + `127.0.0.1:52200/static-html/…` | 本票要解释的那条链路 |
| 本机活服务 | `/Applications/WorkBuddy.app` 5.3.14；进程 `daemon-app-server-entry.js` 听 `127.0.0.1:52200`；GET 截图 URL → 200 `text/html` | 确认 `static-html` 是本机 HTTP 静态托管，不是 `file://` |
| 官方帮助 | [结果查看](https://www.workbuddy.cn/docs/workbuddy/Results)、[右侧边栏](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Right-Sidebar)、[灵感](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Ispiration)、[实践三](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Practice-Cases/Practice-Three)、[更新日志](https://www.workbuddy.cn/docs/workbuddy/Changelog) | 结果区四类、自动开浏览器、`present_files`、HTML 产物预览/分享 |
| 仓库走读 | `docs/architecture/agent-event-stream-and-projection.md` §8.3；`docs/research/20260823151835.gif`；`output/workbuddy-desktop-research/` | 另一条「写 md → 右侧预览」；设计提取不是产物链路 |
| Cursor | 本机 `~/.cursor/skills-cursor/canvas/SKILL.md` + `sdk/*.d.ts`；[Canvases](https://cursor.com/docs/agent/tools/canvas.md)；[#168](https://github.com/xiaowen-0725/uilab-admin/issues/168) | Canvas 职责与生命周期 |
| 本仓面 | `archetypes/agent-workbench` Document / Browser / 产物卡；[#169](https://github.com/xiaowen-0725/uilab-admin/issues/169) | 只陈述远近 |

**故意不读：** asar 内实现、未公开的 Deep Research Skill 原文。兄弟产品 **CodeBuddy Code CLI** 的 `Artifact` 工具（「本地 HTML 或 Markdown 发布为公网链；Markdown 由服务端渲染」）只当相邻对照，不当成 WorkBuddy 桌面深度研究的生成方式。【一手】[CLI tools-reference](https://www.workbuddy.ai/docs/cli/tools-reference)

---

## 2. WorkBuddy 怎么做的

### 2.1 画面上的闭环

用户截图（本机 WorkBuddy，任务「分析 AI Coding 商业模式演变」）：

| 位置 | 看见什么 |
|---|---|
| 左列状态 | WorkBuddy「已完成 3m42s」 |
| 助手正文 | 「深度研究完成，报告已生成并打开预览：`ai-coding-business-model-report.html`」；文件名是蓝链 |
| 正文后 | Markdown「核心发现摘要」（四阶段） |
| Timeline 底 | 文件卡 `ai-coding-business-model-report.html`（网页图标） |
| 右列 chrome | 浏览器：后退 / 前进 / 刷新 / 外开；地址栏 URL |
| 右列 URL | `http://127.0.0.1:52200/static-html/1d542a485f24e72d/ai-coding-business-model-report.html` |
| 右列内容 | 独立研究报告页：kicker「DEEP RESEARCH」、封面、元数据、核心结论框、七节目录 |

【一手】截图。助手文案把「生成」和「打开预览」写成已经发生的动作，不是「请点击打开」。

### 2.2 HTML 从哪来

**已确认（载体，不是生成器）：**

- 交付物是名为 `.html` 的文件，不是 `.md` 被预览器改后缀。【一手】聊天文件名 = URL 末段 = 文件卡
- 本机对该 URL `GET`：`200`，`Content-Type: text/html; charset=utf-8`，约 43 KiB。文档以 `<!DOCTYPE html>` 开头，`<style>` 内联（封面 / 目录 / 摘要框 / 阶段卡 / 时间线），正文是完整报告，页脚写「本报告由深度研究流程生成于 2026 年 8 月 27 日」。无 `<script>`、无外链 CSS、无 `fetch`。【一手】2026-08-27 本机 `127.0.0.1:52200`
- 因此：**预览请求时没有把 Markdown 现场编译成 HTML。** 托管的就是已经写好的整页。

**未确认（生成器）：**

公开帮助只说「输出完整结果文件」「生成网页文件」，不说模型直出、模板填空还是 md 再烘。【一手】[实践三](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Practice-Cases/Practice-Three)、[灵感](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Ispiration)

【推断】这份页的 class / 中文 CSS 注释（`封面区`、`摘要框`、`阶段卡片`）和固定 kicker「Deep Research · 行业研究」像产品化报告皮，不是模型随手写的无皮肤 HTML。皮是 Skill / 专家模板，还是写盘前的宿主烘炉，没拆包不能坐实。【未验证】

【推断】聊天里的「核心发现摘要」和右侧整页是两份东西：前者是助手气泡 Markdown，后者是独立文件。不是「气泡即预览」。

同产品另一条路径（不是本票截图）：`20260823151835.gif` 用户要「输出一份对比的文件, markdown格式」→ 过程行「写入 Codex-vs-Claude对…」→ 助手「已完成搜索并生成对比文档：`Codex-vs-Claude对比.md`」→ 右侧打开 md 预览。【一手】§8.3 走读 + `chat-probe-thread.json`。说明 WorkBuddy **按文件类型分流预览**，不是所有产物都走 `static-html`。

### 2.3 谁写盘、谁在什么时机打开右侧

| 步骤 | 谁 | 证据 |
|---|---|---|
| 写文件 | Agent / Runtime 往当前工作区写产物 | 官方「变更 / 工作空间文件 / 产物」；过程行「正在写入文件」「写入 …」；右键「打开文件夹」定位到真实路径。【一手】[结果查看](https://www.workbuddy.cn/docs/workbuddy/Results)、[右侧边栏](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Right-Sidebar)、GIF / CDP |
| 登记产物并联动预览 | 宿主工具 `present_files`（changelog 名） | 「新增 present_files 工具，统一文件产物展示入口并联动右侧预览」。【一手】[Changelog](https://www.workbuddy.cn/docs/workbuddy/Changelog) |
| 打开右侧 | 宿主结果区，不是用户必须再点一次 | 灵感：「生成网页文件时自动打开内置浏览器预览效果」。截图文案：「报告已生成并打开预览」。【一手】 |
| 用户再开 | 点文件卡 / 产物列表 / 刷新 / 外开浏览器 | 官方网页预览提供地址、刷新；changelog：预览区支持全屏与在外部浏览器打开；HTML 产物支持点击预览。【一手】 |

精确工具调用顺序（先 `Write` 再 `present_files`，还是写工具自己开预览）【未验证】。桌面帮助没有 `present_files` 参数表。

### 2.4 `static-html` 是什么；和普通文件预览是不是一条通道

**本机活服务（2026-08-27，未拆包）：**

| 观察 | 值 |
|---|---|
| 进程 | WorkBuddy Electron，`app.asar/main/daemon-app-server-entry.js --stdio` |
| 地址 | `127.0.0.1:52200`（与截图同一端口） |
| `GET /`、`GET /static-html/`、`/health`、`/preview`、`/artifacts` | 404 |
| `GET /static-html/1d542a485f24e72d/ai-coding-business-model-report.html` | 200 `text/html` |
| 响应头 | `X-Content-Type-Options: nosniff`；CSP：`default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:`；`script-src` 另放行 `https:`（changelog 修过 ECharts / Chart.js / D3 外链）；`connect-src` 含 `http://127.0.0.1:*` |

【一手】对已在听的本机端口做 HTTP GET。路径里的 hex 段像会话 / 工作区 / 产物作用域，公开资料没解释。【未验证】id 语义、端口是否每次启动重绑、文件是否同时以原路径躺在工作区磁盘。

**和普通文件预览的关系：同一块右侧结果区，不是同一套渲染器。**

官方中文结果区四类：工作空间文件、浏览器、变更、产物。网页预览写的是「网页、页面原型或本地启动的 Web 应用」，chrome 是「当前页面地址 + 刷新 + 实时查看」。产物区另写文档 / 表格 / PPT / 分析报告。【一手】[结果查看](https://www.workbuddy.cn/docs/workbuddy/Results)

| | 文档 / 产物预览（GIF 的 `.md`） | 网页预览（截图的 `.html`） |
|---|---|---|
| 官方类 | 产物 / 工作空间文件 | 浏览器 / Preview |
| chrome | 文件内容区（走读未见地址栏） | 后退前进刷新 + URL + 外开 |
| 源 | 工作区文件字节 | 本机 HTTP `static-html` 源 |
| 脚本 / CDN | 文档渲染，不当网页跑 | CSP 允许 `https:` 脚本；changelog 按网页修图表库 |
| 分享 | 产物分享 / 上传云端 | 另有「HTML 产物分享至微信」、外开浏览器 |

changelog 还出现过「HTML 产物源码展示异常」——说明 HTML 曾经被当成源码看，后来才稳定走到渲染预览。【一手】这和本仓 Document 把 `html` 映射为 `code` 是同一类分岔，只是 WorkBuddy 后来给 HTML 开了浏览器通道。

`output/workbuddy-desktop-research/` 是壳层 token / DOM，**没有** `static-html` 字符串，不能当产物链路证据。

---

## 3. 和 Cursor Canvas 的差异

Canvas 职责与生命周期以 [#168](https://github.com/xiaowen-0725/uilab-admin/issues/168) 为准，这里只对照 WorkBuddy 这条 HTML 报告。

| 维度 | WorkBuddy HTML 报告 | Cursor Canvas |
|---|---|---|
| 载体 | 工作区 / 产物 `.html` 文件 | 托管 `canvases/<name>.canvas.tsx`；只准 `import` `cursor/canvas`。【一手】skill |
| 打开 | 生成网页文件后宿主自动开内置浏览器；也可点文件卡。【一手】灵感 + 截图 | 官方 Opening：点响应末尾 card、Command Palette「Open Canvas」、Agents Window 新 tab。导语「opens」与 Opening 不一致；是否自动弹窗【未验证】。【一手】[#168](https://github.com/xiaowen-0725/uilab-admin/issues/168) |
| 渲染面 | 内置浏览器 + 本机 HTTP 源 | IDE 编译 React 岛，不是普通文件预览，也不是 Browser 工具。【一手】官方 Canvas / skill |
| 交互 | 本份报告几乎是静态阅读页（`<details>` 折源）；CSP 允许脚本，别的 HTML 可以带图表。【一手】活 HTML + changelog | 表单、筛选、图表、`useCanvasState`；可 `openAgent` / `newComposerChat` 回聊天。【一手】`sdk/hooks.d.ts` |
| 改源 | 工作空间文件 + 变更；官方没把「切到 HTML 源码」写成一等入口。用户可在后续对话里改文件。【一手】右侧边栏；改源手势【未验证】 | 官方允许切 source 手改，更推荐让 Agent 改。【一手】Canvases「Iterating」 |
| 数据 | 写进 HTML（本份全文内嵌）。预览 CSP 允许外链脚本 / `127.0.0.1` connect，**不是**「运行时禁止拉数」。【一手】活 CSP | skill 禁止 canvas 内 `fetch()`；新鲜数据靠 Agent 再查再写回。官方与 skill 冲突时以官方「rerun the underlying query」为准。【一手】[#168](https://github.com/xiaowen-0725/uilab-admin/issues/168) |
| 是否进工作区 | 是。产物列表、变更、右键打开文件夹。changelog：产物列表隐藏 `.workbuddy` 内部文件。【一手】 | 源文件在工作区**外**托管 `canvases/`；跟工作区 canvas list，不跟单次会话绑死。【一手】skill + 官方 |
| 和聊天的关系 | 聊天：摘要 + 路径链接 + 文件卡。预览是结果区浏览器。没有「从报告按钮开一局新 Agent」的公开 SDK。【一手】 | 聊天只插 reference / 路径链接；画布能反向开对话。分享是 toolbar Publish，明确「instead of sharing a full chat thread」。【一手】 |
| 关掉再开 | 产物列表 / 文件卡 / 地址栏；官方未写「工作区画布目录」。历史任务产物恢复 changelog 修过多次。【一手】 | workspace canvas list；交互状态可另存 `.canvas.data.json`。【一手】 |

**一句话：** WorkBuddy 把研究报告做成**可分享的网页文件**；Canvas 把分析做成**可继续操作的 React 工件**。

---

## 4. 和本仓已有面的远近（不选型）

对照 [#169](https://github.com/xiaowen-0725/uilab-admin/issues/169) 的通道表，只排远近。

| 本仓面 | 远近 | 为什么 |
|---|---|---|
| Timeline 产物卡 + 本轮 featured 自动打开 | **近** | WorkBuddy 也是「写文件 → 卡片 → 收尾自动开右侧」。本仓 `useDeliverablePaneAutoOpen` 在本会话第一次看到 `turn.completed` 时开 featured；`html` 在预览白名单里。【shipped】`deliverable-pane-auto-open.ts`、`deliverable-presentation.ts` |
| Browser Work Surface | **近（打开几何）** | 截图右侧就是带 URL 的内置浏览器。本仓 Browser 已认 `http://127.0.0.1` / `localhost` 为 `trusted-preview`。【shipped】`url-utils.ts`。WorkBuddy 多了「先把工作区 html 挂到 `static-html` HTTP 源」这一步；本仓没有这层托管。 |
| Document Work Surface | **远** | GIF 那条 md 预览更像 Document。本仓 `resolveDocumentFormat('index.html')` 是 `code`（Shiki 源码），不是可执行页。【shipped】`format-router.ts` + 测试。changelog 里 WorkBuddy 自己也踩过「HTML 当源码展示」。 |
| `artifact.*` 事件 | **名近实远** | WorkBuddy 产品词就是「产物」。本仓协议有 `artifact.*`，产品 Runtime 不发射，用户看见的产物来自 `file.changed`。【shipped / 名存实亡】[#169](https://github.com/xiaowen-0725/uilab-admin/issues/169)、[#153](https://github.com/xiaowen-0725/uilab-admin/issues/153) |
| `work_surface.open_requested` | **远** | WorkBuddy 开预览是壳层结果区 + `present_files`，不是本仓这条信封。本仓该事件产品侧仍零发射。【shipped 消费 / 名存实亡发射】 |
| Board Widget 沙箱 | **形状近、合同远** | 都是 HTML。Board 是 srcdoc、无网、必须 `widget.ready()` / `widget.data`。WorkBuddy `static-html` 是真 HTTP 源，CSP 放行外链脚本。CONTEXT 禁止把 Widget 叫 Artifact。 |
| Cursor 式对话旁现场件 | **远** | 地图要的是「对着本次 Task 生成的交互件继续聊」。WorkBuddy 这条交付的是读完可分享的整页，不是 `.canvas.tsx` + 回传聊天。#155：AG-UI 无一等 Canvas 事件；Cursor 类画布是另一条面 + 聊天 card。 |

**排序（近 → 远）：** 产物卡 / 自动打开 → Browser（localhost）→ 工作区文件 Document（仅 md 那条像）→ Board HTML 岛 → Cursor 现场件。

---

## 5. 适用场景

| | WorkBuddy 式 HTML 报告 | Cursor Canvas |
|---|---|---|
| 适合 | 深度研究、经营分析、可转发的成品页、页面原型、要外开 / 扫码分享的交付物 | 账单拆解、审计表、对着 MCP / SQL 结果筛一筛、同一视图上改布局再追问 |
| 不适合 | 预览里改筛选条件并让 Agent 看见当前视图状态（公开资料没有这条回传） | 用户只要一份能发微信 / 进资料库的静态页；或已经在改某个现有 HTML 文件（skill 否定清单：改已有工件） |
| 数据新鲜度 | 改文件或再跑一轮研究；预览可刷新。【一手】changelog「文件预览自动刷新」 | Agent 再跑查询后写回画布；canvas 自己不拉网。【一手】#168 |
| 分享 | 产物上传云端 / 腾讯文档 / 微信二维码 / 外开浏览器。【一手】结果查看 + changelog | Publish 出团队只读 snapshot，明确不是分享整段聊天。【一手】Canvases「Sharing」 |

官方 WorkBuddy 自己也把「分析报告」放在产物里，把「网页、原型、本地 Web 应用」放在浏览器里——同一产品里这两类已经分开。【一手】[结果查看](https://www.workbuddy.cn/docs/workbuddy/Results)

---

## 6. 未验证

1. Deep Research 写 HTML 的具体管线：模型直出整页 / Skill 模板填空 / 先 md 再宿主烘炉。
2. `present_files` 的参数与是否桌面唯一开面工具。
3. `static-html` 路径中 hex id 的含义；文件是否同时以原相对路径存在工作区。
4. 端口 `52200` 是否固定，还是每次启动分配。
5. 用户关掉右侧后再点聊天里的文件名，是否走同一 `static-html` URL。
6. 带 ECharts 的 HTML 产物是否仍走同一 `static-html` 源（changelog 说修过外链图表，本份报告无脚本）。
7. WorkBuddy 内置帮助窗口是否还有比官网更细的 Deep Research 说明（本轮只读官网 + 活 HTTP）。

---

## 7. 本轮不做

- 不拆 asar、不写 Workbench 功能、不改地图 #167 正文。
- 不把 CodeBuddy CLI `/deep-research`（报告落回会话）或 CLI `Artifact`（md 服务端渲染分享链）写成 WorkBuddy 桌面深度研究的实现。
