# 调研：Streamdown 对 mermaid 与 SVG 的插件、消毒与流式行为

- **Date:** 2026-09-10
- **Ticket:** [#191](https://github.com/xiaowen-0725/uilab-admin/issues/191)
- **地图:** [#187](https://github.com/xiaowen-0725/uilab-admin/issues/187)（本票只调研，不更新地图正文）
- **范围:** 本仓库 Workbench Timeline / Document Markdown 的 Streamdown 用法 + Streamdown 官方文档 / 一等插件 + 已安装的 `streamdown@2.5.0` 包内实现
- **非目标:** 不改产品代码，不换渲染器，不实施行内图

来源标记：`[仓库]` 本仓库当前代码；`[包]` `archetypes/agent-workbench/node_modules` 里已解析的 `streamdown@2.5.0` / `@streamdown/code@1.1.1` / `@streamdown/cjk@1.0.3` / `rehype-sanitize@6` / `hast-util-sanitize@5.0.2` / `remend@1.3.0`；`[官方]` streamdown.ai 与 vercel/streamdown skill 文档；`[npm]` `@streamdown/mermaid@1.0.2`（本仓库未安装，对照 `streamdown@2.5.0` 的 devDependency）。

---

## 1. 结论先行

| 问题 | 结论 |
| --- | --- |
| 仓库现在装了什么？ | **只有** `streamdown ^2.5.0` + `@streamdown/cjk ^1.0.3` + `@streamdown/code ^1.1.1`。`[仓库]` **没有** `@streamdown/mermaid`、`@streamdown/math`，也 **没有** SVG / 原始 HTML 专用插件包。 |
| 官方一等插件有哪些？ | 四个：`code` / `mermaid` / `math` / `cjk`。`[官方]` 没有 `@streamdown/svg`、`@streamdown/html`。原始 HTML 是核心默认 rehype 管线，不是插件。 |
| mermaid 现在会画成图吗？ | **不会。** 未传 `plugins.mermaid` 时，`` ```mermaid `` 走代码块（Shiki / 普通 `<code>`）。`[包]` `[官方]` |
| 裸 `<svg>` / SVG 子标签现在会画吗？ | **不会。** 默认 `rehype-sanitize` 用 GitHub schema，`tagNames` **不含** `svg` / `path` / `g` 等；未知标签被剥掉、文本子节点保留。`[包]` |
| 默认是否消毒？ | **是。** 默认 rehype：`rehype-raw` → `rehype-sanitize`（GitHub schema + `tel:`）→ `rehype-harden`（链接/图片前缀默认 `*`，允许 data 图）。`[官方]` `[包]` 脚本类标签在 schema 的 `strip: ['script']`。 |
| `allowedTags` 怎么放行 SVG？ | 把标签名推进 sanitizer `tagNames`，属性数组写入 `attributes`。可同时用 `components.svg`（以及 `path` 等）接自定义 React 组件。**只列 `svg` 不够**，子标签仍会被剥。此 prop **只在仍用默认 rehype 插件时生效**。`[包]` `[官方]` |
| `` ```svg `` 围栏呢？ | **不是 HTML。** 走代码块语言；`allowedTags` 看不见它。官方扩展点是 `plugins.renderers`（按 language 接管），或自定义 `components.code`。`[包]` |
| `mode=streaming` 未闭合围栏？ | remend **不会**补三引号围栏。最后一块若围栏未闭，`isIncomplete = isAnimating && 是最后一块 && 围栏未闭`。`useIsCodeFenceIncomplete()` 读这个值。`[包]` 内置 mermaid UI **没有**读这个钩子，流式过程中会对不完整源反复 `mermaid.render()`。官方文档建议自己用该钩子推迟昂贵渲染。`[官方]` |
| 裸 `<svg>` 流到一半？ | remend `htmlTags`（默认开）会把**末尾未写完的** `<...` 整段切掉；已写出的完整开标签不在此列。`[包]` |
| 首版能否只加插件、不必换渲染器？ | **可以继续用 Streamdown，不必换成别的 Markdown 引擎。** mermaid 首版的「加插件」对 Document 几乎够；对 Timeline **不够**——现有 `components.code` 会换掉整条代码/mermaid/`renderers` 管线，必须改成 `inlineCode`（或等价让路）。SVG **没有**可加的官方插件；围栏走 `renderers`，裸标签走 `allowedTags`（加严格子集）。地图要求「未闭合当代码、闭合后再出图」也 **不是** 装上 `@streamdown/mermaid` 就有的行为。 |

---

## 2. 仓库对照

锁定版本（`archetypes/agent-workbench/package.json` + `pnpm-lock.yaml`）：

| 包 | 版本 |
| --- | --- |
| `streamdown` | `^2.5.0`（lock `2.5.0`） |
| `@streamdown/cjk` | `^1.0.3`（lock `1.0.3`） |
| `@streamdown/code` | `^1.1.1`（lock `1.1.1`） |
| `@streamdown/mermaid` | **未声明、未安装**（`streamdown@2.5.0` 开发依赖写的是 `1.0.2`） |

CSS 已扫描 `streamdown` / `@streamdown/code` / `@streamdown/cjk`，**没有** mermaid 的 `@source`（`archetypes/agent-workbench/src/styles/index.css`）。`[仓库]`

### 2.1 Timeline：`simple-markdown.tsx`

`[仓库]` `archetypes/agent-workbench/src/modules/task/ui/markdown/simple-markdown.tsx`

- 插件：`{ cjk, code }`，无 mermaid。
- `allowedTags={{ 'file-ref': ['path', 'line'] }}`，再配 `components['file-ref']`（文件芯片）。这已是官方「自定义 HTML 标签」路径。
- `components.code` **整段替换** Streamdown 默认代码组件：行内路径芯片，其余（含 `language-mermaid` / `language-svg`）只输出 `<code>`。
- `mode={isAnimating ? 'streaming' : 'static'}`，`parseIncompleteMarkdown`，`controls={false}`，`lineNumbers={false}`。
- 调用方 `foldable-body.tsx` 把 Timeline 流式状态传成 `isAnimating={streaming}`。

Streamdown 2.5.0 默认 `code` 组件的顺序是：`plugins.renderers` 按 language 命中 → 否则 `language==="mermaid"` 且存在 mermaid 插件 → 否则 Shiki 代码块。`[包]` 覆盖 `components.code` 后这三步都不会走。官方也写了：覆盖 `code` 等于换掉行内代码、块代码、mermaid 和自定义 renderer；只改行内应使用虚拟组件 `inlineCode`。`[官方]`

### 2.2 Document：`markdown-renderer.tsx`

`[仓库]` `archetypes/agent-workbench/src/modules/work-surface/surfaces/document/renderers/markdown-renderer.tsx`

- 同一套 `{ cjk, code }`，**不**覆盖 `components`，**不**设 `allowedTags`。
- `mode='static'`，`isAnimating={false}`，`controls={false}`。
- 文件头注释写「Safe default Streamdown pipeline; no raw HTML execution path」：默认管线 **仍启用** `rehype-raw`，只是消毒后不会执行脚本；GitHub allowlist 里的 HTML（如 `<details>`、`<span>`）仍可渲染。`[包]` `[官方]`

两处都把 `controls` 关掉。这与地图首版「静态图、无工具栏」相容：即便装上 mermaid 插件，`controls={false}` 会关掉 mermaid 的下载 / 复制 / 全屏 / 平移缩放按钮。`[包]`

---

## 3. 官方插件与「有没有 SVG / HTML 插件」

`[官方]` PluginConfig（与 2.5.0 类型一致）只有：

| 字段 | 包 | 作用 |
| --- | --- | --- |
| `code` | `@streamdown/code` | Shiki 高亮 |
| `mermaid` | `@streamdown/mermaid` | `` ```mermaid `` → 交互 SVG |
| `math` | `@streamdown/math` | KaTeX |
| `cjk` | `@streamdown/cjk` | CJK 强调 / 自动链接 |
| `renderers` | 应用自备 | `{ language, component }`，按围栏语言接管 |

核心默认 remark：`remark-gfm`。核心默认 rehype：`rehype-raw` + `rehype-sanitize` + `rehype-harden`。`[官方]` `[包]`

**没有** SVG 图插件，也没有「原始 HTML」插件。HTML 是默认管线；SVG 图要么是 mermaid 的输出，要么是消毒后的 HTML，要么是 `renderers` 自己画。

`@streamdown/mermaid@1.0.2` 默认配置：`[npm]`

```js
{ startOnLoad: false, theme: "default", securityLevel: "strict", fontFamily: "monospace", suppressErrorRendering: true }
```

`securityLevel: "strict"` 是 mermaid 自己的消毒（标签编码、点击禁用），与 rehype-sanitize **不是同一层**。画出的 SVG 经 `dangerouslySetInnerHTML` 注入，**不**再走 GitHub HTML schema。`[包]` `[npm]`

---

## 4. 消毒默认值，以及 `allowedTags` 如何放行 SVG

### 4.1 默认 schema 不含 SVG

`streamdown@2.5.0` 的 sanitizer schema = `rehype-sanitize` 的 `defaultSchema`（GitHub 风格）再加：`href` 协议增加 `tel:`，`code` 属性增加 `metastring`。`[包]`

`hast-util-sanitize@5.0.2` 的 `tagNames` 有 `a`/`div`/`img`/`pre`/`table` 等，**没有** `svg`、`path`、`g`、`circle`、`rect`、`line`、`polygon`、`polyline`、`ellipse`、`text`、`use`、`foreignObject`。`script` 在 `strip` 里（整节点丢掉）。未知标签：去掉标签、保留子内容。`[包]`

因此今天：

- 裸 `<svg viewBox="…"><path d="…"/></svg>` → 标签剥光，通常看不见图。
- `` ```svg `` → 代码块（源码），不是图。
- `` ```mermaid `` → 代码块，不是图。

### 4.2 `allowedTags` 实际做什么

仅当 `rehypePlugins` 仍是默认数组时：`[包]`

```text
tagNames  += Object.keys(allowedTags)
attributes = { ...defaultAttributes, ...allowedTags }
```

属性数组是 **覆盖该标签的 attributes 项**，不是与 `*` 全局属性做并集后再按 SVG 词汇表补全。未列出的属性会被丢掉。`data*` 可放行全部 `data-*`。`[官方]`

Workbench Timeline 已经这样放行了 `<file-ref path line>`。同一机制可以放行 SVG，但必须 **枚举子标签和绘图属性**（`viewBox`、`d`、`fill`、`stroke`、`cx`、`cy`、`transform`、`xmlns` 等多数 **不在** schema 的 `*` 列表里）。只写 `svg: ['viewBox']` 时，`path`/`g` 仍会被剥。

自定义组件：`components` 的键是标签名。消毒在前，hast→JSX 在后。标签没进 schema，组件不会被调用。

`allowedTags` 解决的是 **Markdown 里的原始 HTML**。它 **不能** 把 `` ```svg `` 围栏变成图。

### 4.3 放行 SVG 时的安全边界

GitHub schema 默认没有 `onload` / `onclick`。即便放行 `svg`，事件属性仍应保持剔除。仍需避免放行：`foreignObject`、`script`（即使 strip 已有）、`use` + 任意 `href`、`image` + 外部 URL、动画到脚本 URL。

mermaid 图不走这条 HTML 放行；它走插件 + `securityLevel: "strict"`。不要为了 mermaid 去放宽 HTML SVG allowlist。

`rehypePlugins` 一旦整表替换，必须自己带上 `defaultRehypePlugins.sanitize`，否则 `allowedTags` 失效。`[官方]`

---

## 5. 流式 `mode=streaming` 与未闭合围栏

Timeline 在 `isAnimating` 时用 `streaming`；Document 固定 `static`（static 跳过 remend 和按块拆分）。`[仓库]` `[官方]`

### 5.1 remend 补的是行内语法，不是围栏

`parseIncompleteMarkdown` 默认 true。streaming 下会对整串跑 remend：补 `**` / `_` / 行内 `` ` `` / 链接 / `$$` 等。`[官方]` `[包]`

**不会**自动补 `` ``` `` / `~~~` 闭合围栏。未闭合围栏由块解析识别：`[包]`

```text
ht(block) = 按 CommonMark 数围栏开闭，开着则 true
isIncomplete = isAnimating && 是最后一块 && ht(block)
```

`useIsCodeFenceIncomplete()` = 读该 block 的 `isIncomplete`。为 true 当且仅当：正在动画、当前是流式最后一块、该块围栏未闭。围栏一闭，即使后文还在流，钩子也变 false。`[官方]` `[包]`

普通代码块会把 `isIncomplete` 传给 UI。`plugins.renderers` 的组件也会收到 `isIncomplete`。`[包]`

### 5.2 内置 mermaid **不会**等围栏闭合

`language==="mermaid"` 且插件存在时，默认 UI **直接**把当前源交给 `mermaid.render()`，**不**看 `useIsCodeFenceIncomplete`。`[包]`

官方 mermaid 文档同时写了两句：未完成时先当代码块；以及「不要每个 chunk 都重渲，用 `useIsCodeFenceIncomplete` 等到闭合」。`[官方]` 2.5.0 内置路径对应的是后者 **没有**接上。地图 #187 已锁「未闭合当代码、闭合后一次切成图、不要边流边编译」——这要产品侧 renderer/`renderers` 自己做，不是装插件的默认行为。

未闭合 mermaid 在 remark 侧常被当成「到 EOF 为止的代码块」，于是每个 chunk 都会拿半截源去 compile，失败时走错误 UI（插件 `suppressErrorRendering: true`）。`[npm]`

### 5.3 未写完的 HTML / 裸 SVG

remend `htmlTags`（默认 true）：若文本末尾匹配 `/<[a-zA-Z/][^>]*$/`（不在代码块内），从该 `<` 起到结尾全部切掉。`[包]` 例如流到 `<svg viewBox="0` 时，残缺开标签不会进 parser。已经写出的完整 `<svg ...>` 不会被这条规则关掉；未闭合的 SVG **元素**靠 HTML 解析自动补闭 + sanitizer，行为比围栏粗糙。地图说的「围栏未闭合」主要覆盖 `` ```svg `` / `` ```mermaid ``，不是这条 HTML 残标签规则。

---

## 6. 首版还能否只加插件、不换渲染器？

**不换渲染器（继续 Streamdown）可以，而且应该。** 官方就是按「核心 + 可选插件 + `renderers` / `allowedTags`」长的。不必换成 `react-markdown` 或自研 parser。

**「只加 npm 插件、wrapper 一行不改」不够。**

| 源 | 官方能力 | 对当前 Workbench 的缺口 |
| --- | --- | --- |
| `` ```mermaid `` | 加 `@streamdown/mermaid`，`plugins={{ cjk, code, mermaid }}` | Document：基本可画。Timeline：必须先把 `components.code` 让路（改用 `inlineCode` 做文件芯片），否则插件进不去。未闭合不 compile：还要 `renderers` 或等价钩子。CSS 需加 `@source` 到 `@streamdown/mermaid`。 |
| `` ```svg `` | **无插件** | `plugins.renderers`：`language: 'svg'`（或 `'xml'`），`isIncomplete` 时当代码，闭合后消毒再画。 |
| 裸 `<svg>` | **无插件**；`allowedTags` + 可选 `components` | 与现有 `file-ref` 合并 allowlist；必须带子标签子集。流式残标签靠 remend `htmlTags`，不能当成「闭合后一次切图」。 |
| 工具栏 | `controls={false}` 已关 | 与首版静态图一致，不必为 mermaid 打开下载/全屏。 |

实施时仍应保持 Timeline 与 Document **同一套** Streamdown 插件/renderer 配置（地图已锁），不要只在一边加 mermaid。

体积：`@streamdown/mermaid` 依赖 `mermaid ^11.12.2`。`streamdown@2.5.0` 自身也声明了同一 mermaid 依赖，但 **不传 plugin 就不会画图**。`[包]` `[npm]`

---

## 7. 给地图 #187 的可引用要点（本票不改地图）

1. 继续 Streamdown；mermaid 用官方 `@streamdown/mermaid`，不要为图画另一套 Markdown 引擎。
2. SVG 围栏与裸 `<svg>` 是两条管线：围栏 → `renderers`；裸标签 → `allowedTags` + 消毒子集。没有官方 SVG 插件。
3. 默认消毒保持开启。放行 SVG 时只扩绘图子集，不关 `rehype-sanitize`。mermaid 输出走 mermaid `strict`，不要为它放宽 HTML schema。
4. 「未闭合当代码」要产品自己接 `useIsCodeFenceIncomplete` / `renderers.isIncomplete`；不要假定官方 mermaid 插件已经这样做。
5. Timeline 现有 `components.code` 是接线阻塞，应改 `inlineCode`，而不是换渲染器。

---

## 8. 一手出处

- Workbench：`simple-markdown.tsx`、`markdown-renderer.tsx`、`foldable-body.tsx`、`package.json`、`src/styles/index.css`
- 包：`streamdown@2.5.0` `dist/index.d.ts` + `dist/chunk-BO2N2NFS.js`（`allowedTags` 合并、默认 `code` 顺序、`ht` 围栏检测、mermaid `dangerouslySetInnerHTML`）
- `hast-util-sanitize@5.0.2` `lib/schema.js` `tagNames`
- `remend@1.3.0`：`htmlTags` = `/<[a-zA-Z/][^>]*$/`
- `@streamdown/mermaid@1.0.2` `dist/index.js` 默认 `securityLevel: "strict"`
- 官方：<https://streamdown.ai/docs/usage>、<https://streamdown.ai/docs/plugins/mermaid>、<https://streamdown.ai/docs/security>、<https://streamdown.ai/docs/components>、<https://streamdown.ai/docs/termination>、<https://github.com/vercel/streamdown/blob/main/skills/streamdown/references/plugins.md>
