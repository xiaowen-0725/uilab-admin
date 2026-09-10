# 调研：Codex / ChatGPT / Claude 助手正文里的行内图

> **调研日**：2026-09-10
> **Issue**：[调研：Codex / ChatGPT / Claude 助手正文里的行内图](https://github.com/xiaowen-0725/uilab-admin/issues/189)
> **地图**：[Wayfinder 地图：Workbench 助手正文行内图（SVG / mermaid）首版规格](https://github.com/xiaowen-0725/uilab-admin/issues/187)
> **分支**：`research/mainstream-inline-figures`
> **非目标**：不改产品代码；不更新地图 187 正文；不设计 Workbench 像素或交互稿。
> **领域词**：行内图 / Inline Figure = 助手正文里嵌着渲染的图，不是 Artifact / Canvas / Interactive Artifact。
> **方法**：只查公开帮助中心、官方 changelog / 开发者文档，以及可见的产品行为（官方仓库 issue / 已合并 PR、帮助中心对 Preview 的说明）。**未登录** ChatGPT / Codex / Claude 做点击验收。缺证据标 **unknown**。

---

## Executive summary

1. **三家都有「图」，但多数不是同一职责。** 要分开看四条轨：Markdown **mermaid 围栏**、**SVG 围栏 / 裸 SVG**、**HTML 交互岛**、**位图附件**（生成图 / 搜索图）。混成一个「画图」会把 Interactive Artifact 和行内图并掉。
2. **最接近「助手正文里的行内图」的官方表述是 Codex 任务 transcript 里的 mermaid。** ChatGPT for iOS changelog 写明 *rendering Mermaid diagrams inline in task transcripts*；桌面 Codex 更早有 mermaid 错误处理与标签展开；Android 用户报告 mermaid 围栏不画、同线程独立 SVG 能显示。
3. **ChatGPT 普通对话不把 mermaid 自动画进散文。** 官方路径是 **code block + 用户点 Preview**（支持 HTML / React / SVG / mermaid / Vega）。GPT-5.5 起写作/代码从 Canvas 旁路改回 **写在回复里的 writing / code block**。生成图走 ChatGPT Images，是会话里的位图，不是围栏。`@Visualize` 是交互 HTML，CLI/IDE 不渲染，职责更像交互产物。
4. **Claude 官方把「对话里的图」写成 Custom visuals：源是 HTML（兼提 SVG），画在回复里，可交互、默认不持久。** mermaid / SVG 作为 **Artifact** 走右侧专用窗。帮助中心**没有**写「chat 气泡会编译 ` ```mermaid `」。用户报告 claude.ai web 会画围栏，Claude Code 桌面页不会——官方未确认。
5. **流式未闭合：公开证据最硬的是 Codex CLI 的 `::codex-inline-vis`——不完整指令直接隐藏。** mermaid 围栏边流边编译，三家帮助中心都没写。GitHub 上的实现讨论普遍建议：未闭合当源码，闭合后再画。
6. **调研建议（不是产品裁定）：首版行内图学 Codex GUI 任务正文的职责——mermaid（以及能显示的 SVG）落在助手 transcript 里，不是旁路 Canvas。** 不要学 Claude Artifact / ChatGPT Canvas / `@Visualize` / Claude Custom visuals 的交互与旁路。ChatGPT 的 Code/Preview 只作「源还在」的次要参考。

---

## 证据分级

| 等级 | 含义 |
| --- | --- |
| **官方** | 帮助中心、OpenAI/Anthropic changelog、developers.openai.com |
| **实现** | `openai/codex` 已合并 PR 的用户可见行为（TUI 如何处理指令） |
| **用户报告** | 公开 issue 里对 GUI 的观察；可能过时或仅某端 |
| **unknown** | 帮助中心与上述来源都没写 |

第三方浏览器扩展、教程博客只说明「用户觉得默认不够」，不当成产品行为。

---

## 1. ChatGPT

普通 chatgpt.com 对话。与 Codex 任务、`@Visualize` 分开写。

### 1.1 源围栏

| 源 | 结论 | 证据 |
| --- | --- | --- |
| **mermaid** | **code block**，语言标签 mermaid；**不是**自动替换成散文插图。支持时出现 **Preview**。 | 官方：[Working with writing blocks and code blocks](https://help.openai.com/en/articles/20001246) 列出 Preview 含 *Mermaid diagrams*。OpenAI Support 在社区贴（2026-09-06）指向同一文：[Rendering support for Mermaid code](https://community.openai.com/t/rendering-support-for-mermaid-code/1085642)。2026-04 仍有用户说「还是不能渲染」，说明 Preview **按账号/设备/rollout 不一定出现**。 |
| **svg** | 同样走 **code block Preview**（*SVG images*）。裸 `<svg>` 是否当图：**unknown**。 | 同上帮助中心。 |
| **html** | 同上：HTML pages / React components 可 Preview。这是沙箱预览，不是 markdown 行内图。 | 同上。 |
| **图片附件** | **ChatGPT Images** 生成位图，出现在会话里，并进 Images 库。另有搜索结果「inline images from the web」（Free + 5.5 Instant 的发布说明）。都不是 mermaid/SVG 围栏。 | [Images in ChatGPT](https://help.openai.com/en/articles/11084440)；[ChatGPT Release Notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) |

社区长期有 Tampermonkey / Chrome 扩展给 ChatGPT 网页补 mermaid 渲染——旁证是：**默认对话不会把围栏自动画成图**，否则扩展没有存在理由。

### 1.2 图画在哪

| 表面 | 落点 | 是否行内图 |
| --- | --- | --- |
| **Code / writing block** | **在回复里**，但与周围正文分开；可全屏、编辑、Code ↔ Preview。GPT-5.5 Instant/Thinking **不再用 Canvas** 做写作/代码。 | 帮助中心 *directly in chat responses*；Release Notes：*canvas will no longer be available in GPT-5.5 Instant or GPT-5.5 Thinking*。 |
| **Canvas** | 对话旁编辑窗，偏长文/代码协作。官方 Intro Canvas **不**把 mermaid/SVG 当一等预览类型。 | [Introducing canvas](https://openai.com/index/introducing-canvas/)；上条 sunset 说明。 |
| **@Visualize** | 交互图表/模拟/计算器，在 ChatGPT web/桌面（及部分移动）聊天里；**Codex CLI 与 IDE 不渲染**。 | [Visualizations](https://developers.openai.com/codex/visualizations) |
| **生成图** | 会话内位图，可点开编辑器。 | Images 帮助中心 |

**职责翻译**：ChatGPT 把「能预览的图」做成 **回复内的代码块控件**（要点 Preview），不是围栏闭合后替换成静图。

### 1.3 流式未闭合

**unknown**（帮助中心未写）。

合理推断（非观察）：Preview 是用户对已有 code block 的动作，流式半截 mermaid 时 Preview 很可能还没有或不可用。未登录验证。

### 1.4 对本仓首版的职责对照

ChatGPT 普通对话 **不是**「围栏闭合 → 气泡里静图」的对标。它学的是 **块级 Preview 控件**。地图已锁「无工具栏、无源码切换」的话，不要抄 Code/Preview 交互，只记住：源是围栏/代码块，图画在回复流里而不是 Canvas。

---

## 2. Codex

Codex 要按表面拆：ChatGPT 里的任务 / 桌面应用、远程移动端、CLI TUI。模型常写 mermaid，但 **谁负责画** 因表面而异。

### 2.1 源围栏

| 源 | GUI 任务（web / 桌面 / iOS） | CLI TUI | 证据 |
| --- | --- | --- | --- |
| **mermaid 围栏** | **会画进任务 transcript**（至少 iOS 官方点名；桌面 changelog 有 mermaid 错误处理与标签）。Android 远程线程：**用户报告不画**。 | **不画**（到 2026-09 仍是功能请求 / 原型提案）。 | 官方：[Codex changelog](https://developers.openai.com/codex/changelog) 2026-07-20 *Added support for rendering Mermaid diagrams inline in task transcripts*；2026-02-26 *Mermaid diagram error handling*；2026-07-09 *expanded Mermaid diagram labels*。用户报告：[openai/codex#32356](https://github.com/openai/codex/issues/32356)（Android 不画 mermaid）；[#35628](https://github.com/openai/codex/issues/35628)（CLI 仍显示源码）。 |
| **SVG** | **用户报告**：Android 远程线程里「独立 SVG mockup」能显示。桌面是否编译 ` ```svg ` 或裸 `<svg>`：**unknown**（changelog 没写 svg 围栏）。 | 不把 SVG 围栏画成终端图（公开文档无此能力）。 | #32356；开发者用例建议 Markdown 目标不支持 mermaid 时改 **检入 SVG/PNG 再链接**：[Learn a new concept](https://developers.openai.com/codex/use-cases/learn-a-new-concept) |
| **html / 交互可视化** | **Inline visualizations**：任务里的 HTML 碎片。iOS 2026-07-13 *Added support for inline visualizations in Codex tasks*。 | 不内嵌 HTML。识别助手 Markdown 里的 `::codex-inline-vis{file="..."}`，换成可点开浏览器的链接。 | changelog；已合并 [PR #33925](https://github.com/openai/codex/pull/33925) |
| **图片附件** | 可在 Codex 里用 ChatGPT Images 生成/编辑位图。 | TUI 不内嵌位图（changelog / 可视化文档：CLI 不渲染 Visualizations）。 | [Images in ChatGPT](https://help.openai.com/en/articles/11084440) *You can also generate and edit images in Codex*；[Visualizations](https://developers.openai.com/codex/visualizations) *Codex CLI doesn't render Visualizations* |

`::codex-inline-vis` **不是** mermaid 围栏。它是助手 Markdown 里的指令，指向线程可视化目录里的 **HTML 文件**。职责更接近「正文里的交互岛指针」，与静态 mermaid 行内图不同。

### 2.2 图画在哪

| 表面 | 落点 |
| --- | --- |
| **ChatGPT iOS Codex 任务** | mermaid **inline in task transcripts**；inline visualizations 也在任务里，并跟随 iOS 外观（2026-08-26）。 |
| **桌面 Codex / ChatGPT 桌面里的 Codex** | 任务视图里处理 mermaid（错误处理、PR 场景下的标签）。是否与 iOS 完全同一套 DOM：**unknown**，但官方从未说这是右侧 Canvas。 |
| **Android 远程** | mermaid 围栏 **不渲染**（用户报告）；SVG 图 **能显示**（用户报告）。 |
| **CLI** | mermaid 当代码块；inline vis 变成 **链接**（外开浏览器沙箱 viewer）。提案 [#36660](https://github.com/openai/codex/issues/36660) 想在流结束后把顶层围栏画成终端图，**尚未**当已发布行为。 |

开发者文档还把 **@Visualize** 算 ChatGPT 聊天能力，明确 **CLI / IDE extension 不渲染**——不要把那条轨当成 Codex 助手正文。

### 2.3 流式未闭合

| 源 | 流式行为 | 证据 |
| --- | --- | --- |
| **`::codex-inline-vis`（CLI）** | **隐藏未完成的流式指令**；非法/缺失文件给「不可用」；代码块和用户 Markdown 里保留字面量。有指令时用整段 canonical 重绘，避免半截指令把前缀弄乱。 | PR [#33925](https://github.com/openai/codex/pull/33925) *hide incomplete streaming directives*；[#34217](https://github.com/openai/codex/pull/34217) |
| **mermaid 围栏（GUI）** | **unknown**。changelog 只说「inline 渲染」，没写半截围栏。 |
| **mermaid 围栏（CLI）** | 当前当源码流。Issue [#35628](https://github.com/openai/codex/issues/35628) 建议 **看到闭合围栏再画**，因为 mermaid 布局会随后续行全局变。这是请求，不是已发布行为。 |
| **TUI 顶层可视化围栏原型** | 提案写明 **streaming 结束后**再异步渲染。 | [#36660](https://github.com/openai/codex/issues/36660) |

### 2.4 对本仓首版的职责对照

**学这里的职责（GUI 任务 transcript）**：助手 Markdown 里的 **mermaid 围栏**变成 transcript 里的图，人不用离开气泡去 Canvas。SVG 至少作为「能显示的独立图」存在（移动端用户报告），但官方没有把 ` ```svg ` 写成与 mermaid 对等的一等围栏。

**不要学 CLI 的职责**：终端用链接把 HTML 可视化送出进程；mermaid 仍是源码。也不要学 `::codex-inline-vis` 的 HTML 岛——那更接近交互产物，地图 167 的轨。

---

## 3. Claude

claude.ai / Claude Desktop 聊天。Claude Code CLI / Desktop Code 页单独标注。

### 3.1 源围栏

Claude 官方把「图」拆成两条产品轨，**都不是**「Workbench 那种只编译 mermaid/SVG 围栏」的完整同构。

| 源 | 对话 Custom visuals | Artifact 旁路 | 普通 ` ```mermaid ` 围栏 |
| --- | --- | --- | --- |
| **mermaid** | 官方 **不**把 Custom visuals 写成 mermaid DSL。Academy 说流程图现在也可能用 **HTML / Imagine**，而不是代码 Artifact。 | Artifact 类型含 **Mermaid diagrams**；文件创建 FAQ 也举 mermaid diagrams。画在 **右侧专用窗**，可 Preview / Code。 | **官方 unknown**。帮助中心没有「气泡编译 mermaid 围栏」。**用户报告**：claude.ai web 会画，Claude Desktop 的 Code 页当源码（[anthropics/claude-code#52517](https://github.com/anthropics/claude-code/issues/52517)）。第三方 skill 记录：2026-07-05 发布的 **Markdown Artifact** 里 mermaid 仍是等宽代码块。 |
| **svg** | 帮助中心 *Can Claude produce images?*：对话里的图用 **HTML and SVG**。Custom visuals 下载可选 **.svg 或 .html**。 | Artifact 类型含 **SVG images**，在 Artifact 窗渲染。 | 气泡是否编译裸 `<svg>` / ` ```svg `：**unknown**。 |
| **html** | Custom visuals **用 HTML 搭**，可交互（按钮、滑块、全屏）。 | 单页 HTML / React Artifact。 | — |
| **图片附件** | **不**做 ChatGPT Images 那种照片生成。用户上传图可分析。 | 非本调研重点。 | [Can Claude produce images?](https://support.claude.com/en/articles/9002504-can-claude-produce-images) |

### 3.2 图画在哪

| 表面 | 官方落点 | 与行内图的关系 |
| --- | --- | --- |
| **Custom visuals** | **回复里**（*rendered inline as part of the response*）。默认短暂，像白板；可 Copy as image / Download / **Save as artifact**。点击内部可发 follow-up（Cowork 还没有 click-to-follow-up）。仅 web/desktop；iOS/Android **不渲染**。 | **位置**像行内图；**职责**像可交互 HTML 岛（更接近 Interactive Artifact + 可升级成 Artifact）。 |
| **Artifacts** | **主对话右侧专用窗**。SVG、mermaid、HTML、React、文档。 | **不是**气泡行内图。 |
| **天气 / 食谱 widget** | 也是对话里的视觉块，但是固定数据源，不是模型围栏。 | [Visual and interactive content](https://support.claude.com/en/articles/13641943-visual-and-interactive-content) |
| **Claude Code** | Desktop Code 页：mermaid 围栏 = 源码（用户报告）。CLI：需第三方插件/MCP 才能预览。 | #52517；非官方帮助中心。 |

### 3.3 流式未闭合

| 源 | 流式行为 |
| --- | --- |
| **Custom visuals** | **unknown**。官方只说 Claude「当场搭一张」；生成可能要一段时间。未写半截 HTML 是否边流边进气泡。 |
| **Artifact mermaid/SVG** | **unknown**。常见形态是窗里 Preview，不是气泡流式编译。 |
| **chat mermaid 围栏** | 官方 **unknown**。#52517 用户建议：*A partially streamed fence is invalid Mermaid. Draw on fence close, show source until then*——这是诉求，不是官方行为。 |

### 3.4 对本仓首版的职责对照

**不要把 Claude Custom visuals 或 Artifacts 当行内图首版对标。** Custom visuals 的源是 HTML、默认可交互、可点进 follow-up、可另存 Artifact——这是地图 167 的交互产物职责，不是「静态行内图」。Artifact 明确是旁路窗。

若只问「mermaid 围栏最终有没有可能出现在 Claude 气泡里」：**官方未承诺；用户报告仅 web。** 不足以当规格真源。

---

## 4. 对照表（每个产品分开）

缺证据写 unknown。落点「气泡内」= 在助手回复流里（可仍是块级控件）；「旁路」= 右侧窗 / 外开浏览 / Canvas。

### ChatGPT（普通对话）

| 问题 | 答案 |
| --- | --- |
| 源围栏 | mermaid / svg / html → **code block**；图要 **Preview**。位图 = Images 工具，不是围栏。裸 svg：**unknown**。 |
| 落点 | **回复内的 block**（GPT-5.5 起取代 Canvas 写作/代码）。Canvas 仍是旁路编辑，且新模型在收。`@Visualize` 是另一条交互 HTML 轨。 |
| 流式未闭合 | **unknown** |
| 首版是否学职责 | **次要。** 学「图画在回复流、不是 Canvas」；不要学必须点 Preview、也不要学 `@Visualize`。 |

### Codex

| 问题 | GUI 任务 transcript | CLI TUI |
| --- | --- | --- |
| 源围栏 | **mermaid 围栏**（官方 iOS；桌面有 mermaid 渲染相关修复）。SVG：用户报告可显示独立 SVG。HTML = inline vis 文件，不是 mermaid。 | mermaid = 源码。HTML vis = `::codex-inline-vis` 文件指令。 |
| 落点 | **任务正文 / transcript 内** | 链接外开；不在终端里画 mermaid |
| 流式未闭合 | mermaid：**unknown**。 | **隐藏未完成的 vis 指令**（实现）。mermaid 未画。 |
| 首版是否学职责 | **主要对标：GUI mermaid 落在 transcript。** | 不学（链接/HTML 岛）。 |

### Claude

| 问题 | Custom visuals | Artifacts | chat mermaid 围栏 |
| --- | --- | --- | --- |
| 源围栏 | **html**（官方）；兼 **svg** 导出/构建 | mermaid、svg、html、react | 官方 **unknown**；用户报告 web 会画 |
| 落点 | **回复内**，可交互 | **右侧窗** | 若存在则在气泡（用户报告）；Code 页不画 |
| 流式未闭合 | **unknown** | **unknown** | **unknown** |
| 首版是否学职责 | **不学**（交互 HTML / 可升级 Artifact） | **不学**（旁路） | 证据不足，不当真源 |

---

## 5. 调研建议（不是产品裁定）

给地图 187 后续规格票用，**不**改地图正文。

1. **首版职责对齐 Codex GUI 任务 transcript 的 mermaid：图是助手正文的一部分，源是 Markdown 围栏，不是右侧 Canvas，也不是要用户点 Preview 才出现的控件。** 这与地图已锁定的「Timeline 助手正文、不是交互产物」一致。
2. **SVG：** Codex 只有「独立 SVG 能显示」的用户报告，没有与 mermaid 对等的官方围栏说明。ChatGPT 把 SVG 放进 code block Preview。Claude Artifact 才把 SVG 当一等类型，但那是旁路。首版若同时做 SVG 围栏 / 裸 `<svg>`，是 **本仓 CONTEXT 已写的源**，不是从某一家完整抄来的。
3. **明确不要抄的职责：**
   - Claude Artifact / ChatGPT Canvas：旁路窗。
   - Claude Custom visuals / ChatGPT `@Visualize` / Codex `::codex-inline-vis` HTML：交互岛，归交互产物，不归行内图。
   - ChatGPT Images：位图附件。
4. **流式：** 公开材料里没有一家帮助中心说「边流边编译 mermaid」。唯一写进实现的是 Codex **藏起未闭合的 vis 指令**。GitHub 上 Codex / Claude Code 讨论都倾向 **闭合后再画**。这与地图已锁「围栏未闭合当代码块」同方向；本调研不提供相反证据。
5. **工具栏 / 源码切换：** ChatGPT Preview 与 Claude Artifact 都是 Code/Preview。地图已锁首版无工具栏。若以后要「能看源」，那是第二版，且更像 ChatGPT block，不是 Codex iOS changelog 里那句 inline mermaid。

---

## 6. 仍 unknown（有意不猜）

- ChatGPT / Codex GUI / Claude web：**未闭合 mermaid 围栏**在流式过程中的真实像素（半截代码块？空白？闪烁编译？）。
- ChatGPT / Codex 是否把 **裸 `<svg>`** 当图，还是必须 ` ```svg ` / 附件。
- Codex 桌面与 iOS 的 mermaid 是否同一渲染器、是否支持全部 mermaid 图种。
- claude.ai 气泡是否官方支持 mermaid 围栏（仅用户报告）。
- 任一家是否在 **过程旁白 / thinking** 里也画围栏（本调研未看到帮助中心区分）。

---

## 来源

- [Working with writing blocks and code blocks in ChatGPT](https://help.openai.com/en/articles/20001246)
- [Images in ChatGPT](https://help.openai.com/en/articles/11084440)
- [ChatGPT — Release Notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)（GPT-5.5 与 Canvas → in-chat blocks）
- [Codex changelog](https://developers.openai.com/codex/changelog)
- [Visualizations](https://developers.openai.com/codex/visualizations)
- [Learn a new concept（Mermaid vs SVG/PNG vs imagegen）](https://developers.openai.com/codex/use-cases/learn-a-new-concept)
- [Introducing canvas](https://openai.com/index/introducing-canvas/)
- OpenAI Support 回复：[Rendering support for Mermaid code](https://community.openai.com/t/rendering-support-for-mermaid-code/1085642)
- [What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Custom visuals in chat and Cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork)
- [Can Claude produce images?](https://support.claude.com/en/articles/9002504-can-claude-produce-images)
- [Visual and interactive content](https://support.claude.com/en/articles/13641943-visual-and-interactive-content)
- [Create and edit files with Claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)（Artifact 仍含 mermaid / SVG）
- [Creating with artifacts · Claude Academy](https://academy.claude.com/courses/claude-101/creating-with-artifacts)
- 可见实现 / 用户报告：openai/codex [#33925](https://github.com/openai/codex/pull/33925)、[#34217](https://github.com/openai/codex/pull/34217)、[#32356](https://github.com/openai/codex/issues/32356)、[#35628](https://github.com/openai/codex/issues/35628)、[#36660](https://github.com/openai/codex/issues/36660)；[anthropics/claude-code#52517](https://github.com/anthropics/claude-code/issues/52517)
