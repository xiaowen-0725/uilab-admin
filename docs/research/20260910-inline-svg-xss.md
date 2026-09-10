# 调研：行内 SVG 的 XSS 面与消毒方案（对比 Interactive Artifact 岛）

- **Date:** 2026-09-10
- **Ticket:** [#190](https://github.com/xiaowen-0725/uilab-admin/issues/190)
- **Map:** [#187](https://github.com/xiaowen-0725/uilab-admin/issues/187)（Wayfinder：Workbench 助手正文行内图）
- **对照 ADR:** [ADR-0021](../adr/0021-workbench-csp-and-widget-subdocument-policy.md)、[ADR-0026](../adr/0026-interactive-artifact-html-island.md)
- **非目标:** 不设计最终政策（留给 grilling [#192](https://github.com/xiaowen-0725/uilab-admin/issues/192)）；不实现产品代码；不更新地图正文

---

## 0. 事实分级

| 标记 | 含义 |
| --- | --- |
| `[规范]` | HTML Living Standard / SVG 2 / CommonMark / CSP 规范原文保证 |
| `[库文档]` | DOMPurify / rehype-sanitize / Streamdown 官方文档或源码白名单 |
| `[仓库]` | 本仓库当前代码或已采纳 ADR |
| `[MDN]` | MDN 对规范行为的转述 |
| `[未查明]` | 本轮未测；列入 §7 |

本文只回答「同源 DOM 行内 SVG 的 XSS 面是什么」。白名单档位、失败回退、要不要认裸 `<svg>`，一律不裁定。

---

## 1. 结论先行

| # | 问题 | 结论 |
| --- | --- | --- |
| 1 | 行内 SVG 的 XSS 面相对岛差在哪？ | **脚本跑在 Workbench 宿主源上。** 岛靠 `iframe sandbox` + 不透明源把权限关掉；`<svg>` 没有 sandbox 属性，节点就是主文档的一部分。一旦脚本跑起来，能读宿主 DOM / IndexedDB / 侧车 `connect-src`，等价于「把 agent HTML 直接注入主文档」——这正是 ADR-0021 实测的 sandbox 逃逸后果，只不过行内图连 iframe 这层都没有。 |
| 2 | 必须剥掉什么？ | **执行面：** `script`（含 `href` / `xlink:href` 外链脚本）、全部 `on*` 事件属性、SMIL 事件属性（`onbegin` / `onend`）。**HTML 再入：** `foreignObject`；出现在 SVG 里的 `iframe` / `object` / `embed`。**引用面：** `use`（含 `data:`）、`javascript:` / 危险协议的 `href`·`xlink:href`，以及能改 `href` 的 SMIL（`animate` / `set`）。**样式面：** 不信任的 `<style>` 与 `style=""`（宿主 `style-src` 含 `'unsafe-inline'`）。`title` / `desc` 是无障碍需要的标签，但它们是 HTML 集成点，子树必须按 HTML 再消毒，不能当「SVG 内所以惰性」。 |
| 3 | 常见消毒路径会在哪失败？ | 三条主流路径都有已知坑：**(a)** 把 SVG 当 `<img>` / `data:image/svg+xml` 隔离——脚本不跑，但不是「行内 DOM」、也吃不到宿主 `currentColor`；**(b)** DOMPurify `USE_PROFILES: { svg: true }`——默认已把 `script` / `foreignObject` / `use` / `animate` / `set` 放进 `svgDisallowed`，`ADD_TAGS: ['use']` 会立刻把 `xlink:href` 变回 XSS 面；**(c)** 扩 Streamdown 的 GitHub 风 `rehype-sanitize`——默认 schema **一个 SVG 标签都没有**，`allowedTags` 只加根 `svg` 画不出图；一旦把 `use` / `foreignObject` / 任意 `href` 加进去，而默认 `rehype-harden` 又是 `allowedProtocols: ["*"]`，协议闸门等于没了。 |
| 4 | 为什么不能拿 ADR-0021 / 0026 的岛交差？ | `sandbox` 只作用于 iframe 的 nested browsing context `[规范]`。行内图产品约束是 Timeline `prose` 同源 DOM，不是子文档。宿主 CSP 是纵深防御，**不能**替代消毒：它拦得住无 nonce 的 inline script / `on*`，拦不住消毒失败后的 DOM 形状、同源 `use`、内联 CSS、以及「脚本一旦跑起来就能打侧车」这一档。岛的 `csp=` 可以在子文档上把 `connect-src` 收到 `'none'`；行内节点用的就是宿主那条、含侧车的策略。 |
| 5 | 裸 `<svg>` 比 ` ```svg ` 围栏多什么？ | 围栏在 Markdown 里是 **code 节点**，SVG 源是纯文本，要出图必须另走「取出字符串 → 消毒 → 插入」；未闭合围栏可以继续当代码（地图已锁）。裸 `<svg>` 走 CommonMark **原始 HTML**（`<svg>` 不在 type 6 块标签表里，能走 type 7 或 inline HTML），空白行会切断 HTML 块、Markdown 能插进标签缝、流式半截标签会进活 DOM。这是 **解析器混淆面**，不是多几个标签那么简单。 |

---

## 2. 仓库现状（对照用，不是政策）

| 位置 | 事实 |
| --- | --- |
| Timeline / Document Markdown | 同一套 Streamdown。`SimpleMarkdown` 只额外放行 `<file-ref>`；Document 注释写明「Safe default Streamdown pipeline; no raw HTML execution path」`[仓库]` `archetypes/agent-workbench/src/modules/task/ui/markdown/simple-markdown.tsx`、`.../document/renderers/markdown-renderer.tsx` |
| Streamdown 默认管线 | `rehype-raw` → `rehype-sanitize`（GitHub 风 schema + `tel:`）→ `rehype-harden`。harden **默认** `allowedImagePrefixes/LinkPrefixes/Protocols = "*"`，`allowDataImages: true` `[库文档]` <https://streamdown.ai/docs/security> |
| GitHub 风 schema | `tagNames` 无任何 SVG 元素；`strip: ['script']`；`href` 协议仅 `http/https/irc/ircs/mailto/xmpp` `[库文档]` [hast-util-sanitize `defaultSchema`](https://github.com/syntax-tree/hast-util-sanitize/blob/main/lib/schema.js) |
| 宿主 CSP | `index.html` 已按 ADR-0021 落 meta：`script-src 'self' 'nonce-…'`（无 `'unsafe-inline'` / `'unsafe-eval'`），`style-src 'self' 'unsafe-inline'`，`img-src 'self' data: blob:`，`connect-src` 含本机侧车，`frame-src 'self'` `[仓库]` |
| 岛 | Board Widget / Interactive Artifact：`srcdoc` iframe，`sandbox="allow-scripts"`，**不加** `allow-same-origin`，另写更严的 iframe `csp=` `[仓库]` ADR-0021 / 0026，`BoardWidgetFrame` |
| ADR-0021 的前提句 | 「本机桌面应用，宿主侧无渲染不可信 HTML 的路径」。行内图如果把模型 SVG 插进宿主 DOM，这条前提不再成立——这是面，不是本票要改的 ADR。 |

今天这条管线碰到裸 `<svg>`：**根元素不在白名单，会被 unwrap**；里面的 `path` / `g` 同样不在名单。所以现状不是「已经安全地画出了 SVG」，而是 **根本没画**。出图 = 主动扩大白名单或另接消毒插入，XSS 面从这一步才打开。

---

## 3. 必须剥掉（或等价处理）的元素与属性

下面按 **机制** 分组。名字来自 SVG 2 / HTML 解析规范，不是本仓白名单提案。

### 3.1 直接执行

| 面 | 为什么危险 | 来源 |
| --- | --- | --- |
| `<script>`（SVG 与 HTML） | SVG 2：`script` **等价于 HTML `script`**，函数作用域是 **整个当前文档**。行内 SVG 里的脚本 = Workbench 主文档脚本。 | `[规范]` [SVG 2 §15.10](https://www.w3.org/TR/SVG2/interact.html#ScriptElement) |
| `<script href>` / `xlink:href` | 外链脚本加载进当前页；`SVGScriptElement.href.baseVal` 被标成 injection sink。 | `[MDN]` [SVGScriptElement.href](https://developer.mozilla.org/en-US/docs/Web/API/SVGScriptElement/href) |
| 全部 `on*` | 事件属性的内容按 ECMAScript 解释（`application/ecmascript`）。`onload` / `onerror` / `onclick` / `onmouseover` 以及 SMIL 的 `onbegin` / `onend`。 | `[规范]` [SVG 2 §15.9 Event attributes](https://www.w3.org/TR/SVG2/interact.html#EventAttributes) |
| SVG Tiny `handler` | 旧式事件壳，现代浏览器少见，白名单漏了就会变成第二条 `script`。 | `[规范]` SVG Tiny 1.2（遗留） |

宿主 CSP 的 `script-src` 无 `'unsafe-inline'` 时，**无 nonce 的** inline `<script>` 与 `on*` 会被浏览器拒绝。这是后盾，不是「可以留在 DOM 里」的理由：消毒失败后的节点形状、以及 CSP 管不到的面（见 §5.3）仍然在。

### 3.2 HTML 再入（集成点）

HTML 树构建规定：外国内容（SVG / MathML）里若干节点是 **HTML integration point**，子孙改按 HTML 解析——不能假设「在 SVG 里所以是惰性 XML」。

| 节点 | 作用 | 消毒含义 |
| --- | --- | --- |
| `foreignObject` | 经典再入。可嵌 `iframe` / `img onerror` / `xmp` 等。DOMPurify 默认放进 `svgDisallowed`。 | `[规范]` [HTML parsing · HTML integration point](https://html.spec.whatwg.org/multipage/parsing.html#html-integration-point)；`[库文档]` DOMPurify `svgDisallowed` |
| SVG `title`、`desc` | 同属 HTML 集成点。无障碍会用它们，但子树必须当 HTML 走一遍（可含 `<img onerror>`）。 | `[规范]` 同上 |
| MathML `annotation-xml encoding="text/html"` | 另一条再入。行内图首版若不碰 MathML，仍要防止 SVG 旁边的裸 HTML 块把它带进来。 | `[规范]` 同上 |

`foreignObject` 出现在模型 SVG 里时，**剥掉**是唯一不依赖「我们 HTML 消毒也完美」的做法。`title` / `desc` 若保留，必须递归套 HTML 消毒，而不是只看 SVG 标签名。

### 3.3 引用与克隆：`use` / `image` / `a`

| 面 | 机制 | 备注 |
| --- | --- | --- |
| `<use href>` / `xlink:href` | 把目标子树 **克隆进当前文档的 shadow tree**。同源文档引用仍可把本图别处（或同页其他节点）的危险子树实例化。历史上 `data:` URL 被当成同源，造成 XSS + Trusted Types / Sanitizer API 绕过；Blink 已移除 `SVGUseElement` 的 `data:`。 | `[规范]` [SVG 2 Linking](https://www.w3.org/TR/SVG/linking.html)；`[规范]` [svgwg #901](https://github.com/w3c/svgwg/pull/901)；`[MDN]` [`<use>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/use) |
| 跨源 `use` | 浏览器可按同源策略拒绝；**没有** CORS 属性可配。不能当可移植安全边界。 | `[MDN]` 同上 |
| `<image href>` | 外链图走 `img-src`（宿主目前 `'self' data: blob:`，远程会被 CSP 挡）。`data:` 仍允许。SVG-as-image 语境下脚本本来就不跑；**行内** `<image>` 只是资源加载，不是 script 加载。 | `[仓库]` ADR-0021；`[MDN]` [SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image) |
| `<a href>` | `javascript:` 在 CSP3 里通常当 inline script 拦；`https:` 钓鱼链仍是产品面。Streamdown 默认 harden 不限制域。 | `[库文档]` Streamdown Security |

`use` 是「看起来像无害的图标复用、实际是文档内克隆」的典型失败点。DOMPurify 把它放进默认禁止表，维护者明确说：用 `ADD_TAGS: ['use']` 就要自己承担 `xlink:href` 的 JS / Data URI 风险 `[库文档]` [DOMPurify#1058](https://github.com/cure53/DOMPurify/issues/1058)。

### 3.4 SMIL：`animate` / `set` / `animateTransform`

可把目标元素的 `href` / 事件属性改成 `javascript:`，或在时间线上触发 `onbegin`。DOMPurify 默认禁止 `animate` 与 `set`（`animatemotion` / `animatetransform` / `animatecolor` 仍在 SVG 允许表里，属库的已知形状，调用方若只抄 `USE_PROFILES` 需要知情）。

### 3.5 样式

ADR-0021 宿主 `style-src` 含 `'unsafe-inline'`。因此：

- SVG `<style>` 与 `style=""` **不会**被 CSP 当 inline style 拒绝。
- 现代引擎没有 IE `expression()`，但 CSS `url()` 仍是外传 / 跟踪面；是否命中 `img-src` 取决于资源类型。
- 行内 SVG 若保留 `<style>`，等于在已经放宽的 style 指令上再开一个作者可控样式表。

### 3.6 汇总：剥掉 vs 必须再走 HTML 消毒

**应当从行内 SVG 源里剥掉（或根本不要放进白名单）的：**

- 元素：`script`、`foreignObject`、`iframe`、`object`、`embed`、`use`、`animate`、`set`、以及作为脚本壳的遗留 `handler`
- 属性：全部 `on*`（含 SMIL 事件属性）；`href` / `xlink:href` 上的 `javascript:`、`data:`（尤其 `use` / `script`）、非碎片的外链（是否留 `https:` 留给 #192）
- 能改 `href` 的 SMIL 属性（`attributeName` + `to` / `from` / `values`）

**不能只按标签名放行、必须按 HTML 再消毒子树的：** `title`、`desc`（以及任何漏网的 `foreignObject`）。

**几何本身通常不执行脚本、但仍要属性消毒的：** `path` / `g` / `circle` / `rect` / `text` / `tspan` 等。危险在它们身上的 `on*` 与 URL 属性，不在几何命令。

---

## 4. 常见消毒库 / 白名单路径与失败模式

四条路径。本票不选哪条落地。

### 4.1 不当 HTML 插入：图像语境隔离

把 SVG 放进 `<img src="data:image/svg+xml,…">`、CSS `background-image`、或 Canvas `drawImage`。

- **性质：** 浏览器在 **image 语境**禁用 JavaScript，并限制外链资源 `[MDN]` [SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)。
- **失败 / 代价：** 不是同源行内 DOM——吃不到宿主 CSS 变量 / `currentColor` 的正常继承；内部文本对无障碍是一张图；`data:` 体积与 `img-src data:` 策略绑在一起。地图锁定的是 Timeline 正文行内图，这条是 **对照面**，不是已经批准的产品形态。

### 4.2 iframe 岛（ADR-0021 / 0026）——行内图不能靠它交差

见 §5。列为路径只为说明「消毒」与「隔离」不是同一件事。

### 4.3 DOMPurify（DOM 上的 SVG profile）

```text
DOMPurify.sanitize(dirty, { USE_PROFILES: { svg: true, svgFilters: true } })
```

- **允许表（`svg`）：** 几何与文本为主，含 `style`、`image`、`a`；**默认禁止** `script`、`foreignObject`、`use`、`animate`、`set` `[库文档]` [cure53/DOMPurify `src/tags.ts`](https://github.com/cure53/DOMPurify/blob/main/src/tags.ts)（`svg` vs `svgDisallowed`）。
- **合同：** 输出只对「再插入 HTML 解析语境」安全。官方第一原则：`element.innerHTML = clean` 可以；`svgElement.innerHTML = clean`、模板引擎再解析、属性槽，都是另一套 sink `[库文档]` [Attack Classes](https://github.com/cure53/DOMPurify/wiki/Attack-Classes-&-Bypass-History)。

**失败模式：**

| 模式 | 说明 |
| --- | --- |
| 配置把禁止项加回来 | `ADD_TAGS: ['use']` / `['foreignObject']` 是文档里真实出现的「我只是要图标/HTML 标签」需求；一加就回到 §3。 |
| mXSS / 命名空间 | 消毒看的是 **第一次** parse 的 DOM；序列化后再 parse 可能长出可执行节点。防御靠命名空间合法性检查 + `SAFE_FOR_XML`。历史绕过几乎都从 SVG/MathML 切换起步。 |
| `foreignObject` 再入 | 集成点子孙必须当 HTML 走；只扫「SVG 子树」会漏。 |
| `use` + shadow | 消毒时看起来干净的节点，实例化后克隆出未再走一遍的子树。`data:` `use` 已从 Blink 拿掉，**同源 fragment `use` 仍在**。 |
| 深度压平 | 超深嵌套（Blink/WebKit 约 512）会把子孙变成兄弟，源码缩进 ≠ 最终祖先。 |
| 版本债 | 调用方必须钉版本。配置 hook / `ALLOWED_URI_REGEXP` 放宽会静默打开 `javascript:`。 |
| 错误 sink | React `dangerouslySetInnerHTML` 对 HTML 还可以；若将来改成 SVG 命名空间 `innerHTML` 或 `DOMParser` XML 模式，契约就破了。 |

### 4.4 rehype-sanitize / Streamdown（本仓已在用的那条）

hast 白名单，**默认零 SVG 标签**。Streamdown `allowedTags` 只是把自定义标签 **并进** 这份 schema；未列出的属性仍剥掉 `[库文档]` Streamdown Security。

**失败模式（对行内 SVG 特别尖）：**

| 模式 | 说明 |
| --- | --- |
| 只放行根 `svg` | `path`/`g`/`text` 仍会被 unwrap，图是空的。要出图必须显式扩 `tagNames` + 每标签属性。 |
| `*` 属性过宽 | GitHub schema 的 `*` 含 `id`/`name`（再加 `clobberPrefix: user-content-`）。扩 SVG 时若取消 clobber，`use href="#x"` 与 DOM clobber 会回来。 |
| 给 `href` / `xLinkHref` 却不配 `protocols` | schema 的协议闸是按 **属性名** 配的。漏掉 `xlink:href` 的协议表 = 只靠下一层。 |
| 默认 harden 是 `*` | Streamdown 自己写：默认 permissive，不信任来源应收紧。**sanitize 才是协议真闸；harden 默认不补这道闸。** |
| HAST ≠ 浏览器 HTML | `rehype-raw` 用 parse5。序列化进 React DOM 时若再经一次 HTML 修复，仍有 mXSS 类缝。AST 消毒 **没有** DOMPurify 那套运行时命名空间检查。 |
| 与 `rehype-raw` 绑死 | 裸 `<svg>` 要进 HAST，必须开 raw。围栏出图可以 **不** 把 SVG 当 Markdown HTML，只对 code 字符串消毒。两条入口的攻击面不同（§6）。 |
| `parseIncompleteMarkdown` | Timeline 流式开着。半截 HTML / 半截 SVG 标签会先进入活树，再在后续 token 里改形状。 |

`sanitize-html`（htmlparser2）是 HTML 中心解析器，**不当 SVG 命名空间工具**；用它「剥 script」会漏掉 SVG 的 `animate` / `use` / 集成点。列在这里只作为失败对照，不是候选。

### 4.5 自绘 XML 白名单

`DOMParser` + 遍历：只留几何标签、URL 只许 `#fragment`。失败模式是自己重写 DOMPurify 十年的测试集（命名空间、集成点、SMIL）。没有回归库就不要当「更小所以更安全」。

---

## 5. 与 ADR-0021 / ADR-0026 岛的差异：为什么行内图不能靠 sandbox 交差

### 5.1 规范：sandbox 根本不挂在 `<svg>` 上

HTML：`sandbox` 是 **iframe** 属性，「对 iframe **托管的任何内容**加额外限制」；内容被当成 **unique opaque origin**，脚本 / 表单 / 导航默认关。`allow-scripts` 不加 `allow-same-origin` 时，源保持不透明 `[规范]` [iframe `sandbox`](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)。

`<svg>` 没有等价属性。行内 SVG 的 browsing context 就是 **宿主文档**。

把 SVG 再塞进 `srcdoc` iframe 才能套上 ADR-0021 那套——那就变成岛，不再是地图说的 Timeline 正文行内图。

### 5.2 岛实际买到的权限差（本仓已锁）

| 能力 | 岛（ADR-0021 / 0026） | 行内 `<svg>`（同源 DOM） |
| --- | --- | --- |
| 源 | 不透明（禁止 `allow-same-origin`） | Workbench 源 |
| 读宿主 DOM / IDB / localStorage | 禁止（红线：双 token 同给可删自己的 sandbox） | 脚本一旦执行 = 全速 |
| 独立 CSP | iframe `csp=` 可把 `connect-src` 收到 `'none'`，`img-src` 仅 `data: blob:` | **不能**另写；用的就是宿主 meta |
| 打本机侧车 | 子文档 `'self'` 解析为不透明源；再加 `connect-src 'none'` | 宿主 `connect-src` **显式允许** `http://127.0.0.1:<sidecar>` |
| `allow-scripts` | 岛 **需要** 脚本（widget / 交互产物） | 行内图首版是静态图；若脚本能跑，不是功能，是事故 |
| 主题 / 排印 | 岛读不到宿主 class，要桥 | 行内图 **就是** 为了继承宿主排印才进 DOM |

ADR-0026 原文：「Interactive Surface 是放宽的 HTML 岛：复用 ADR-0021 的子文档收紧……岛内无网、无桥、无存储。」行内图的产品句子正好相反：在 `prose` 里、跟字一个流、不是 Artifact。

### 5.3 宿主 CSP 是后盾，不是岛的替代

ADR-0021 的 `script-src 'self' 'nonce-…'`（无 `'unsafe-inline'`）会挡住：

- 无 nonce 的 SVG `<script>` 正文
- `on*` 事件处理器（CSP 把它们当 inline script）
- 多数 `javascript:` 导航（CSP3）

它 **挡不住** 或只部分挡住：

- 消毒失败后的 DOM 形状（clobber、`use` 克隆、集成点再入后的 HTML）
- `style-src 'unsafe-inline'` 下的 SVG 样式
- `img-src data:` 下的巨大 `data:` 图
- `<a href="https://…">` 钓鱼（harden 默认 `*`）
- **脚本一旦因消毒漏洞跑起来**：同源 + 侧车 `connect-src` = 岛专门用 `csp=` 封掉的那扇门

ADR-0021 还写过「静态打包下 nonce 退化为构建期常量」，理由是「宿主侧无渲染不可信 HTML 的路径」。行内图会把模型输出变成这样一条路径。政策票可以决定「CSP 后盾 + 窄白名单」够不够；本票只记录：**岛的 sandbox 机制在这里物理上套不上。**

---

## 6. 裸 `<svg>` 相对 ` ```svg ` 围栏多出来的风险

地图两种源不要合成一个词。安全面上它们也不是「同一种图、两种写法」。

### 6.1 围栏：Markdown 把它当代码

CommonMark 围栏代码块的内容是字面文本，**不会**按 HTML 解析，围栏内部的 Markdown 也不生效 `[规范]` [CommonMark fenced code](https://spec.commonmark.org/0.31.2/#fenced-code-blocks)。

出图必须有一次 **显式** 编译：取出 code 字符串 → 选一个 §4 路径消毒 → 插入 DOM。未闭合围栏可以继续当代码（#187 已锁「闭合后一次切成图」）。攻击者能控制的是那一段字符串，边界清晰。

### 6.2 裸 `<svg>`：原始 HTML，切块规则不照顾 SVG

CommonMark HTML 块 type 6 的块级标签表 **不含 `svg`** `[规范]` [HTML blocks](https://spec.commonmark.org/0.31.2/#html-blocks)。因此：

| 规则 | 后果 |
| --- | --- |
| type 7：一行上放完整开标签，遇到空行结束 | 带空行的 SVG 会被切成 **多段 HTML 块**；中间若被 Markdown 接回去，标签可以错配。 |
| type 7 **不能打断段落** | 段落中间的 `<svg>` 变成 **inline HTML**。 |
| inline HTML **不配对** 开闭标签 | 只把标签当 token 透传。闭标签可以去关 **前面另一个 HTML 块** 留下的开元素。 |
| type 1（`<script` / `<style` / `<pre` / `<textarea`） | 与 SVG 无关也能在同一篇 prose 里单独开一块原始脚本/样式；依赖现有 `strip: ['script']` 与 CSP。裸 HTML 总开关是 `rehype-raw`，不是 SVG 渲染器。 |

流式：`SimpleMarkdown` 使用 `parseIncompleteMarkdown`。半截 `<svg …` 或未闭合的 `<script` 会先出现在活树上，再在后续 delta 里改写。围栏可以「未闭合就不当图」；裸 HTML **没有**同等的语言级未闭合状态。

### 6.3 与已有自定义 HTML 的叠加

`preprocessFileReferences` 已经把部分 Markdown 收成 `<file-ref>`（`allowedTags` 仅 `path`/`line`）。裸 SVG 一旦放行，同一篇 prose 里会同时存在：自定义标签、GitHub schema HTML、以及扩大后的 SVG schema。集成点 + 未配对 HTML + 自定义标签，是 mXSS 测试集里的标准配料，围栏编译路径碰不到这组配料。

### 6.4 多出来的风险清单（相对围栏）

1. **解析器混淆：** CommonMark 切块 × HTML 树构建 ×（若用 rehype）HAST 再序列化。
2. **流式半截标签** 进入宿主 DOM，没有「未闭合 = 代码」这道门。
3. **同气泡其它原始 HTML** 可以给 SVG 集成点当子孙，或被 SVG 的闭标签误关。
4. **扩大 Streamdown schema 是全局的：** 放行 `svg`/`path` 之后，任意 Markdown（助手 prose、Document `.md`、用户 Composer 若共用管线）都能喂这些标签。围栏编译可以只接 `language-svg`。
5. **大小写 / 命名空间前缀 / 注释切开标签** 只出现在 HTML 入口（`<svg:svg>`、`<!-- --><script>`）。围栏字符串可以在进 HTML 解析器 **之前** 做拒绝。

围栏 **不是**「不用消毒」。围栏只是把消毒输入收成一块有界文本。裸 `<svg>` 多出来的是 **无界 HTML 入口**。认不认它，是 #192 的裁定，不是本票的建议。

---

## 7. 未查明

| # | 项 | 为什么重要 |
| --- | --- | --- |
| 1 | 本机 Chromium 对「宿主 CSP 已启用时，行内 SVG `on*` / `<script>` / `javascript:` / 同源 `use`」的逐条探针 | ADR-0021 的探针是岛，不是主文档行内 SVG。后盾强度应以同样 Playwright 再测一次。 |
| 2 | Streamdown `parseIncompleteMarkdown` / Remend 对半截 `<svg>` 的具体改写 | 决定裸 SVG 在 streaming 模式下有没有「先插入再修复」的 mXSS 窗。属 #191 更合适。 |
| 3 | 本仓 Electron 与浏览器 dev 的 CSP nonce 是否仍是构建期常量 | 影响「CSP 后盾」在桌面态的真实强度；不改变「sandbox 套不上」这条。 |
| 4 | mermaid 运行时吐出的 SVG 是否含 `foreignObject`（htmlLabels） | mermaid 是地图的另一源；其 XSS 面应单独对照其 `securityLevel`。本票不把 mermaid 输出算进行内 SVG 白名单。 |

---

## 8. 给 #192 的输入（不是裁定）

grilling 需要拍板的三件事，本文只提供约束：

1. **源形态：** 围栏有界、裸 `<svg>` 是额外 HTML 入口。两者消毒成本不对等。
2. **标签档：** 几何标签 ≠ 执行/再入/克隆标签。`use` / `foreignObject` / `script` / `on*` / 危险 URL 是标准禁止集；`title`/`desc` 若留，子树按 HTML 消毒。
3. **外链：** 宿主 `img-src` 已经很窄；`href` 还要过 Streamdown harden（默认 `*`）。岛用子文档 CSP 把网掐死；行内做不到同等掐法。

对照岛的一句话：**行内图要的是宿主排印，付的是宿主权限；sandbox 买不到这种组合。**
