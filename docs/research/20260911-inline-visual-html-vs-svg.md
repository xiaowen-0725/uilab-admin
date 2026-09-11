# 调研：对话里的「看见」——HTML / SVG / mermaid 各是哪条水管

> **调研日**：2026-09-11
> **问题**：Claude 看起来像 SVG，WorkBuddy 那张对比卡是 HTML。Agent 领域有没有专名？主流各怎么做？
> **词表**：根 `CONTEXT.md` **行内视觉** / **行内图** / **交互产物**；ADR-0028
> **对照**：[#188 WorkBuddy 渲染](https://github.com/xiaowen-0725/uilab-admin/issues/188) · [#189 Codex/ChatGPT/Claude 行内图](https://github.com/xiaowen-0725/uilab-admin/issues/189) · 用户要的效果是 WorkBuddy 对话列对比卡（不是 mermaid 灰框）
> **非目标**：本文件是调研真源。实施见 [职责稿](../plans/workbench-agent-initiated-visualization.md)。

---

## 先答

**你要的那张双色对比卡不是 mermaid。** 它是 **对话里的 HTML 视觉块**（里面常用 SVG 画装饰/图标，所以看起来「像 SVG」）。

官方/产品里没有一个全球统一专名。业界把同一职责拆成几条水管，名称各家自造：

| 职责 | 常见叫法 | 源 | 画在哪 |
|---|---|---|---|
| **讲解当下看见**（对比、流程示意、当场能点） | Claude **Custom visuals**；WorkBuddy **Visualizer / widget**；业界常说 **generative UI**（偏宽） | **HTML**（可内嵌 SVG/CSS/JS） | **回复中间**，默认短暂 |
| **结构示意图**（流程图、时序） | **Mermaid**（DSL） | ` ```mermaid ` | 气泡里自动画，或代码块要点 Preview |
| **可带走的成品** | Claude **Artifact**；ChatGPT 曾用 **Canvas**（GPT-5.5 起写作/代码改回回复内 block）；Cursor **Canvas**；本仓 **交互产物** | HTML / React / SVG / 文档 | **旁路窗**，可迭代、下载、分享 |
| **位图** | ChatGPT Images 等 | PNG/JPEG | 会话附件，不是围栏 |

**SVG 不是第三条产品轨。** 它是画图的像素格式：可以是 HTML 里的 `<svg>`，可以是 Artifact 类型，也可以是下载后缀。Claude 帮助中心写 Custom visuals **用 HTML 搭建**，下载才给 `.svg` 或 `.html`。所以「Claude 好像是 SVG」= 看见了矢量图，**搭建语言仍是 HTML**。

WorkBuddy 的 `show_widget` 合同写明：`widget_code` 可以是 **原始 SVG**（viewBox 约束）或 **HTML 片段**。你截的对比卡是 HTML 排版（两列、列表、标题栏），不是 mermaid subgraph。

---

## 1. 专名怎么用（不要合成一个「画图」）

### 1.1 产品名（各家）

- **Custom visuals**（Claude，2026-04 帮助中心）：Claude 自己决定何时在回复里搭一张图；可交互；默认不持久，像白板；可另存 Artifact。源：**HTML，不是照片**。
- **Visualizer**（WorkBuddy）：工具 `read_me` + `show_widget`，把 SVG/HTML **流进聊天列** iframe。标题栏、折叠、菜单是 widget chrome。
- **Artifact**（Claude）：右侧专用窗，持久、可分享。类型含 HTML、SVG、Mermaid、React。
- **Canvas**（ChatGPT 旧；Gemini / Cursor 仍用）：旁路协作面。ChatGPT GPT-5.5 Instant/Thinking **不再用 Canvas 做写作/代码**，改成回复里的 writing/code block。
- **Inline visualizations**（Codex 任务）：任务正文里的 HTML 碎片；CLI 则是 `::codex-inline-vis` 链接，不在终端里跑 HTML。
- **@Visualize**（ChatGPT）：交互图表/模拟；Codex CLI/IDE **不渲染**。

### 1.2 领域词（跨产品、不精确）

- **Generative UI**：模型不（只）回字，当场产出可渲染 UI。太宽：Custom visuals、Artifact、Canvas 都能往里塞。
- **Inline visual / in-conversation visual**：强调 **落在回复流**，不是旁路窗。
- **Widget**：WorkBuddy 对那张卡的实现名；不是业界标准协议。
- **Mermaid**：图的 **DSL**，不是视觉卡。只能节点/边/子图，做不出双色栏 + 要点列表那种排版。

**本仓建议（词表）：**

| 中文 | 英文 | 是什么 | 不是什么 |
|---|---|---|---|
| **行内视觉** | Inline Visual | 助手回复里的 HTML 视觉块（对比卡、示意、轻交互） | Artifact、交互产物、mermaid、位图 |
| **行内图** | Inline Figure | 已交付：闭合 mermaid → 浅框静图 | 不要再拿来指对比卡 |
| **交互产物** | Interactive Artifact | 本 Task 旁路岛，可迭代的 HTML 应用 | 不要把对比卡塞进右侧 |

行内视觉 ≈ Claude Custom visuals / WorkBuddy Visualizer 的 **职责**。实现上源是 HTML，安全走岛（iframe），不要把任意 HTML 消毒后塞进宿主（那是行内图/ADR-0027 的 SVG 白名单，不够罩 HTML）。

---

## 2. 主流怎么做（2026-09 公开材料）

### Claude

两条官方轨，帮助中心写死了：

| | Custom visuals | Artifacts |
|---|---|---|
| 官方句 | 图比字好时 **当场搭一张**，嵌在回复里 | 要带走的工具/页/文档，右侧窗 |
| 源 | **HTML**（可含 SVG）；下载 `.svg` 或 `.html` | HTML / SVG / Mermaid / React / 文档 |
| 交互 | 可点、滑块、全屏；聊天里点内部会 follow-up | Preview/Code、版本、发布 |
| 持久 | 默认短暂，可「Save as artifact」 | 一开始就可分享 |

对比两选项的例子，帮助中心就写在 Custom visuals（*side-by-side comparison*）。**这就是用户要的那张卡的职责。**

Claude Code 的 Artifact 另有 CSP：页面不能外链；图优先 SVG/HTML/CSS，少塞 raster。那是 **旁路页**，不是气泡。

### WorkBuddy

聊天至少三条，不要并：

1. **` ```mermaid `**：助手 Markdown 编译成图（有代码/图表工具栏）。
2. **Visualizer / `show_widget`**：HTML 或 SVG 进 **对话列 widget 卡**（沙箱 iframe）。流式会灌 iframe。
3. 文件 / Artifact 式交付：另一条。

Ask 模板 **同时**有 Visualizer 段和「计划时用 mermaid」。对比/讲解走 Visualizer；流程图才 mermaid。

### ChatGPT / Codex

- **普通 ChatGPT**：mermaid / SVG / HTML 多在 **code block**，用户点 **Preview** 才看见。不是围栏一闭合就换成散文插图。
- **GPT-5.5**：写作/代码从 Canvas 收到 **回复内的 block**。
- **Codex GUI 任务**：changelog 写 mermaid **inline in task transcripts**；另有 **inline visualizations**（HTML）。CLI 不画 mermaid，HTML vis 变链接。
- **@Visualize**：交互 HTML，偏模拟，不是对比卡。

### Gemini

- **Canvas**：旁路做文档/代码/原型。
- **Interactive simulations**（2026-08 Workspace 更新）：聊天里自定义交互可视化（表、网格、模拟）。源是可运行的 HTML/JS。Gemini 网页 **不**把 mermaid 当一等自动出图（商店里有第三方扩展补渲染）。

### Cursor

- **Chat mermaid**：部分图种在对话里自动画（flowchart 等），timeline 等不支持。
- **Canvas**（Cursor 3.x）：Agent 产出仪表盘/报表，**编辑器旁路**，用受控组件而不是任意 HTML 围栏。

---

## 3. SVG vs HTML 到底差在哪

| | HTML 视觉块 | 纯 SVG | Mermaid |
|---|---|---|---|
| 能做什么 | 两列对比、列表、按钮、表格、图表库 | 矢量图、图标、示意图 | 节点/边/子图 |
| 排版 | CSS 随便排 | 自己算坐标 | 布局器说了算 |
| 交互 | 按钮/滑块（若允许脚本） | 有限（hover 都费劲） | 静图 |
| 安全 | 必须岛（iframe sandbox） | 可白名单插入宿主（ADR-0027） | 编译成 SVG 再走白名单 |
| 你那张卡 | **这条** | 看起来像，因为卡里常嵌 SVG | 灰框 subgraph，做不出 |

所以：Claude 用 HTML 搭 Custom visuals，导出可以是 SVG；WorkBuddy widget 两种源都收。用户看见「矢量、圆角、色块」≠ 产品源是 ` ```svg `。

---

## 4. 对本仓的含义（给实施用）

用户要的效果 = **行内视觉（HTML 对比卡）**，学 Claude Custom visuals / WorkBuddy Visualizer 的职责：

- Agent **自己**出卡，用户只说任务。
- 画在 **Timeline 助手正文**，不要打开交互产物。
- 源是 **HTML 片段**（可内嵌 SVG），不是 mermaid，不是 ` ```svg ` 围栏。
- 安全：**复用交互产物的岛**（`sandbox="allow-scripts"`、不加 `allow-same-origin`、子文档 CSP），不要把 HTML 插进宿主。
- mermaid 浅框 **保留给真流程图/时序**，对比/讲解不要再走 subgraph。

不要做：

- 把这张卡升级成交互产物指针（那是旁路）。
- 把任意 HTML 走 ADR-0027 消毒插宿主。
- 再教模型用 mermaid 冒充对比卡。

---

## 来源

- [Custom visuals in chat and Cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork)（2026-04-22：*built using HTML*；download `.svg` or `.html`）
- [What are artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Can Claude produce images?](https://support.claude.com/en/articles/9002504-can-claude-produce-images)（对话视觉用 HTML and SVG）
- Codex changelog：mermaid inline in task transcripts；inline visualizations
- [ChatGPT writing/code blocks](https://help.openai.com/en/articles/20001246)（Preview：HTML / React / SVG / mermaid / Vega）
- [ChatGPT Release Notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)（GPT-5.5 收 Canvas）
- [Gemini interactive simulations](https://workspaceupdates.googleblog.com/2026/08/generate-interactive-simulations-and-models-in-the-gemini-app.html)
- 本机 WorkBuddy 提示词导出 + asar 调研 #188：`show_widget` HTML/SVG；mermaid 另管
- 本仓 #189 行内图调研（mermaid 轨仍有效；Custom visuals 当时标「不学」——**对比卡职责现在要学，实现学岛不学旁路 Artifact**）
