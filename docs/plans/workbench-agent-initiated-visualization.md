# 职责稿：Workbench Agent 主动可视化

**Status:** 行内视觉（HTML 对比卡）与 mermaid 行内图已按职责拆开；对比不再走 mermaid subgraph
**Date:** 2026-09-11
**Tracker:** [规格：Agent 主动可视化](https://github.com/xiaowen-0725/uilab-admin/issues/202) · [调研 #203](https://github.com/xiaowen-0725/uilab-admin/issues/203) · [实施 #204](https://github.com/xiaowen-0725/uilab-admin/issues/204)
**Research:** [20260911-inline-visual-html-vs-svg](../research/20260911-inline-visual-html-vs-svg.md)
**ADR:** [0027 行内图](../adr/0027-inline-figure-same-origin-sanitized-svg.md) · [0028 行内视觉](../adr/0028-inline-visual-html-island.md)
**Supersedes (product job):** 本稿上一版「对比也用 mermaid」；以及 [workbench-inline-figure-spec](./workbench-inline-figure-spec.md) 里把「用户写 ` ```svg `」当成出图能力的那一段
**Keeps:** mermaid 围栏 → 浅框静图；ADR-0027 消毒仍只服务 mermaid 画出的 SVG
**Does not replace:** [交互产物规格](./workbench-interactive-artifact-spec.md)、Board Widget、工作区 `.svg` 文件预览

诚实边界：用户只说任务、不点名格式。对比 / 讲解出现 **行内视觉**（对话列 HTML 卡）；流程 / 时序出现 **行内图**（mermaid 浅框）。` ```svg ` 不是产品出图。

---

## 0. 对照主流（调研结论）

领域没有一个叫「画图」的标准专名。要拆 **职责 + 落点 + 源格式**：

| 职责 | 常见叫法 | 源 | 画在哪 | 本仓 |
|---|---|---|---|---|
| 讲解当下看见（对比、当场能懂） | Claude **Custom visuals**；WorkBuddy **Visualizer** | **HTML**（可内嵌 SVG） | **回复中间** | **行内视觉** |
| 结构示意图 | Mermaid | ` ```mermaid ` | 气泡里自动画 | **行内图** |
| 可带走 / 可迭代的成品 | Claude Artifact；Cursor Canvas；本仓交互产物 | HTML 应用 | 旁路窗 | 交互产物 |

Claude 帮助中心写 Custom visuals **用 HTML 搭建**，下载才给 `.svg` 或 `.html`。所以「Claude 好像是 SVG」是看见了矢量，搭建语言仍是 HTML。WorkBuddy `show_widget` 收 SVG 或 HTML 片段；用户要的双色对比卡是 HTML 排版。

#189 对「静图 mermaid」仍然有效；对「对比卡不要学 Custom visuals」**作废**——对比卡职责现在要学，实现学岛（ADR-0021）不学旁路 Artifact。

---

## 1. 错在哪

把「对比这两种方案」画成 mermaid subgraph，得到的是灰框分组，不是双色栏 + 要点列表。那是显示器在工作，产品职责走错了水管。

---

## 2. 要办的事

用户要结构时，助手正文里出现合适的视觉：

1. 「对比这两种方案」→ **行内视觉**（HTML 卡，标题栏、双列）。
2. 「把审批流程讲清楚」→ **行内图**（mermaid 浅框）。
3. 提示词 **不含** `svg` / `mermaid` / `visual` / `html` / 「画图」。
4. 用户气泡 / Composer / 旁白仍是字。
5. 可筛选表、要迭代的小应用仍走交互产物。

---

## 3. 四条水管（不要再合成一个「画图」）

| 轨 | 产品对象 | 谁触发 | 画在哪 | 源 |
|---|---|---|---|---|
| **A. 行内图** | 流程 / 时序 / 状态机 / 架构 | Agent 写 mermaid | Timeline 助手 `prose` | ` ```mermaid ` |
| **B. 行内视觉** | 对比 / 讲解 / 双栏 | Agent 写 visual 围栏 | Timeline 助手 `prose`（岛） | ` ```visual ` |
| **C. 交互产物** | 可筛选表、小应用 | `interactive_*` | 对话旁 Interactive Surface | staging + 提交 |
| **D. 文件** | 工作区 `.svg` / `.png` | 用户点芯片 | Document | 文件 |

WorkBuddy 的 Visualizer / `show_widget` 对齐 **B 的职责**，不是 C。不要新造 `show_widget`；围栏已经把 HTML 放进 `prose`。

` ```html ` 是代码样本，不是行内视觉。

---

## 4. 已锁决定

1. **触发方是 Agent，不是用户提示词。**
2. **对比 / 讲解 = 行内视觉（HTML 岛）。** 流程 / 时序 = mermaid。禁止用 mermaid subgraph 冒充对比卡。
3. **行内视觉源只有 `visual` 围栏。** 不认 `html`、`svg`、裸标签、用户气泡、Composer、旁白。
4. **安全走 ADR-0028 / ADR-0021 岛**，不把 HTML 插进宿主。作者脚本剥掉；高度用宿主 `postMessage`。
5. **宿主 chrome**：标题（`<title>` 或围栏 meta）+ 折叠。点卡不开 Interactive Surface。
6. **不新造协议事件。**
7. **Document `.md` 预览** 与 Timeline 共用 renderer。
8. **可筛选 / 要迭代的应用** 仍走 `interactive_*`。不要为对照去开右侧面。
9. **` ```svg ` 不是产品出图。**

---

## 5. 验收

必须双进程：`pnpm dev:workbench` + `pnpm dev:workbench-runtime`。侧车改提示词后重启侧车。

主路径：

- 新对话，只发「对比这两种方案」或等价中文，**不含**格式词。
- 助手 `prose` 出现至少一张 **行内视觉**（`[data-testid=inline-visual]`），双列 HTML 卡，不是 mermaid 灰框。
- 另开对话「把请假审批流程讲清楚」→ mermaid 浅框仍在。

反例：

- 用户贴 ` ```visual ` / ` ```html ` / ` ```svg `：Composer 与用户气泡不出卡。
- 点行内视觉不开 Interactive Surface。
- 闭合 ` ```html ` 仍是代码。

---

## 6. 实施顺序

1. 调研落盘（HTML vs SVG / 专名 / 主流）。
2. 词表：`CONTEXT.md` **行内视觉**；ADR-0028。
3. Timeline / Document：`visual` 围栏 → 沙箱 iframe 卡。
4. 侧车写作约定：对比走 visual，流程走 mermaid；交互产物不再把「对比」抢走。
5. 人眼：提示词无格式词，对比出 HTML 卡。
