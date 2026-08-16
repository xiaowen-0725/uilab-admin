# 研究：srcdoc 不透明源沙箱在 Workbench 渲染层的真实约束

- **Date:** 2026-08-15
- **Trigger:** issue #112（地图 #111 · Workbench Board 看板首版可执行规格）
- **Scope:** `archetypes/agent-workbench` 渲染层的 Board Widget 沙箱与宿主桥前置约束
- **非目标:** 不实现产品代码；本轮只创建本文件，未改动仓库任何其它文件

---

## 0. 事实分级约定

本文每条结论都标注来源级别，**不混为一谈**：

| 标记 | 含义 |
| --- | --- |
| `[规范]` | HTML Living Standard / W3C CSP 规范原文保证 |
| `[实测]` | 本轮在本机 Playwright Chromium **147.0.7727.15** 上实际跑出的结果（脚本见 §2） |
| `[仓库]` | 本仓库当前代码事实（给出文件路径） |
| `[MDN]` | MDN 规范性说明（作为规范的可读转述） |
| `[未查明]` | 没查清或没测，明确列入 §10 |

---

## 1. 结论先行

| # | 问题 | 结论 |
| --- | --- | --- |
| 1 | 宿主 CSP 会不会打死 widget？ | **会，而且是决定性的。** `[规范]` srcdoc 文档**克隆父文档的整个 policy container（含 CSP list）**，`[实测]` 宿主 `script-src 'self'` 直接让 widget 内联脚本无法执行。**当前仓库没有任何 CSP** `[仓库]`，所以现在能跑；一旦有人给 `index.html` 或 Electron 加 CSP，全部 widget 立刻黑屏。必须把这条写进 ADR 并加门禁。Kimi 那套「文档自带宽松 CSP + 不继承宿主」**在 srcdoc 路线上不可复制**（那是自定义协议才有的性质）。 |
| 2 | 不透明源下有哪些能力？ | **所有源绑定存储全灭**（localStorage / sessionStorage / IndexedDB / cookie / CacheStorage / ServiceWorker / StorageManager 全部抛 `SecurityError`）`[实测]`；**脚本、内联样式、canvas/WebGL、rAF、Web Crypto（含 subtle）、blob Worker、外链图片 / 外链 CSS / 外链 classic script 全部可用** `[实测]`；**fetch/XHR/字体/ES module 受 CORS 约束且 `Origin: null`**，只有 `ACAO: *` 或 `ACAO: null` 能过 `[实测]`。详见 §4。 |
| 3 | postMessage 怎么安全？ | `event.origin === "null"` 无鉴别力；**`targetOrigin` 只能传 `'*'`**（传 `'null'` / `'about:srcdoc'` 抛 `SyntaxError`，传宿主 origin 不抛但消息不投递）`[实测]`。可靠校验只有 **`event.source === iframe.contentWindow`**（宿主侧）+ **MessageChannel 端口 + 随机 token**（widget 侧）。**`MessagePort.onclose` 在 Chromium 上不可用**——规范已合并，但 Chromium 在 M122 因安全评审 revert，我们的 147 里 `'onclose' in MessagePort.prototype === false`，移除 iframe 后 2.5s 内无 close 事件 `[实测]`。存活探测必须自己做心跳。 |
| 4 | 多 iframe 成本 | **本轮未完成设计中的 5/20/60 headed 压测（用户中止浏览器实测）**，只有部分数字（§6）。但问题规模可以先收敛：参照实现的列表页缩略图**只真实渲染前 4 个 widget**，其余补空占位格，故列表页 iframe 上界是 `看板数 × 4` 而不是 `看板数 × 每板 widget 数`。**量级判断待实施期验证。** |
| 5 | srcdoc 体积与刷新 | `[实测]` 无实际长度上限：1KB / 64KB / 256KB / 1MB / 4MB / 16MB 全部成功且属性长度字节级保真，赋值到子文档就绪耗时 4 / 3 / 10 / 18 / 61 / 212ms（≈13ms/MB）。**每次给 `srcdoc` 赋值都会重新导航**，即使字符串完全相同 `[实测]`——所以**不需要 React `key` 重挂载，也不需要 `blob:` + revision**。卸载归零用 `src = 'about:blank'`（`srcdoc` 属性仍在，需 `removeAttribute('src')` 才能再次用 srcdoc）`[实测]`。 |
| 6 | sandbox token 取舍 | **只给 `allow-scripts` 对番茄钟 / 待办打卡 / K 线图三类目标 widget 够用** `[实测]`。`allow-downloads` 按「导出」需求可选加；`allow-forms` / `allow-popups` / `allow-popups-to-escape-sandbox` 不需要；`allow-modals` **不要给**（不给时 `alert/confirm` 被静默忽略、`confirm()` 立即返回 `false`，正是我们想要的）。**红线：`allow-scripts` + `allow-same-origin` 同给 = 沙箱作废**，`[实测]` 子文档可读宿主 DOM、可写宿主 `localStorage`、**并能删掉自己的 `sandbox` 属性**。 |

---

## 2. 本轮实测条件与脚本（可复现）

- 机器：macOS 25.2.0 / arm64 / `navigator.hardwareConcurrency = 10`
- 浏览器：Playwright 1.59.1 自带 **Chromium 147.0.7727.15**（与 `pnpm test:browser:install` 装的同一份缓存）
- 临时脚本（**不在仓库内**，放在 `/tmp/board-srcdoc/`）：
  - `probe.mjs` — 13 组场景的能力探针（含 srcdoc 体积梯度、刷新语义、postMessage 载荷梯度、`allow-same-origin` 逃逸演示）
  - `probe2.mjs` — 15 组 **CSP 继承矩阵**（宿主 header / meta、子文档 meta、iframe `csp=` 属性、nonce、strict-dynamic）
  - `perf.mjs` — 多 iframe 成本（**headless**，已完成）
  - `perf2.mjs` — 多 iframe 成本（**headed 真实 vsync**，只跑到 n=10 即被中止）
- 局域 HTTP server 提供各种 CORS 组合端点、真实 TTF 字体、跨源第二端口，故 CORS 结论不依赖外网。

**已知实测局限（必须与结论一起读）：**

1. `perf.mjs` 跑在 headless，rAF **未锁 vsync**（每个 widget ~170fps），CPU 压力显著高于真实产品；同时 headless 下所有 sandboxed srcdoc 帧落在**宿主同一个 renderer**（renderer 数恒为 1），而 headed 部分运行里它们进了**独立 renderer**（n=5/n=10 时 renderer 数为 3、宿主 renderer 的 DOM 节点数只有 58/93）。**进程模型 headless ≠ headed，这一条没查清**（§10）。
2. `Memory.getDOMCounters` 的节点计数覆盖范围不确定，本文只用它做**相对比较**，不当绝对值。
3. 第 4 条的正式压测**没做完**。

---

## 3. CSP 与 srcdoc 继承（问题 1）

### 3.1 仓库现状：目前完全没有 CSP

| 位置 | 事实 |
| --- | --- |
| `archetypes/agent-workbench/index.html` | 无 `<meta http-equiv="Content-Security-Policy">`（全文 27 行，只有 charset / viewport / theme-color / icon）`[仓库]` |
| `archetypes/agent-workbench/desktop/electron/main.ts` | 无 `session.webRequest.onHeadersReceived` / 无 CSP 注入；`webPreferences` 为 `contextIsolation: true` / `nodeIntegration: false` / `sandbox: false`；`loadURL(DEV_URL)` 指向 dev server `[仓库]` |
| `archetypes/agent-workbench/vite.config.ts` | 无 `server.headers`，不下发任何安全响应头 `[仓库]` |

全仓 grep `Content-Security-Policy` 在 Workbench 下只命中 `.impeccable/live/config.json` 的 `"cspChecked": true`（工具元数据，非运行时策略）`[仓库]`。

**结论：今天的 srcdoc widget 能跑，是因为「宿主没有 CSP」这个偶然状态，不是因为设计上保证了它能跑。**

### 3.2 规范：srcdoc 克隆父文档的 policy container

HTML Living Standard §7.1.7 Policy containers，「determine navigation params policy container」：

> If responseURL is `about:srcdoc`:
> 1. Assert: parentPolicyContainer is not null.
> 2. **Return a clone of parentPolicyContainer.**

policy container 的组成明确包含 **a CSP list** `[规范]`
（来源：<https://html.spec.whatwg.org/multipage/browsers.html#policy-containers>）

所以「widget 文档自带宽松 CSP、不继承宿主」这条 Kimi 事实，**成立的前提是它的文档经自定义协议 URL 加载**（普通 fetch scheme → 走 `responsePolicyContainer`，即响应头自带的策略）。**我们选 srcdoc，就等于选了「强制继承宿主 CSP」**，这是路线级差异，不是配置差异。

### 3.3 实测矩阵（Chromium 147，sandbox 恒为 `allow-scripts`）

harness 的宿主逻辑刻意放在**外部脚本**里，避免宿主自己的内联脚本被自己的 CSP 打死污染结果。

| 宿主策略 | 子文档 meta / 属性 | widget 内联脚本 | widget `new Function` | widget 载宿主源 script | 载第三源 script | widget fetch |
| --- | --- | --- | --- | --- | --- | --- |
| 无 CSP（= 仓库现状） | — | ✅ 执行 | ✅ | ✅ | ✅ | ✅ 两源都通 |
| `script-src 'self'` | — | ❌ **被拦** | — | — | — | — |
| `default-src 'self'` | — | ❌ **被拦**（内联 `<style>` 也被拦） | — | — | — | — |
| `script-src 'self' 'unsafe-inline'` | — | ✅ | ❌ `EvalError` | ✅ | ❌ | ✅ |
| `script-src 'self' 'unsafe-inline' 'unsafe-eval'` | — | ✅ | ✅ | ✅ | ❌ | ✅ |
| `<meta>` 形式 `script-src 'self' 'unsafe-inline'` | — | ✅ | ❌ | ✅ | ❌ | ✅ |
| `script-src 'self' 'unsafe-inline'; frame-src 'none'` | — | ✅ **iframe 照样加载** | ❌ | ✅ | ❌ | ✅ |
| `script-src 'self' 'nonce-X'` | 子脚本带 `nonce="X"` | ✅ **执行** | ❌ | ✅ | ❌ | ✅ |
| `script-src 'self' 'nonce-X'` | 子脚本不带 nonce | ❌ 被拦 | — | — | — | — |
| `script-src 'nonce-X' 'strict-dynamic'` | 子脚本带 `nonce="X"` | ✅ | ❌ | ✅ | ✅ **两源都通** | ✅ |
| `default-src 'self'` | 子文档 meta 自带超宽松 CSP | ❌ **仍被拦** | — | — | — | — |
| 无 CSP | 子文档 meta `script-src 'none'` | ❌ 被拦 | — | — | — | — |
| 无 CSP | iframe **`csp="script-src 'none'"`** 属性 | ❌ **被拦** | — | — | — | — |
| `default-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'` | — | ✅ | ❌ | ✅ | ❌ | ✅ 宿主源 / ❌ 第三源 |

从矩阵得到 5 条可直接用于设计的事实：

1. **继承是真的，且 header 与 `<meta>` 一样生效。** 子文档拿不到「自己那份宽松策略」；`new Function` 被宿主的 `script-src` 打死这一点最能说明策略确实来自宿主。
2. **子文档只能加严，不能放宽。** 宿主 `default-src 'self'` + 子文档 meta `default-src * 'unsafe-inline'` → 仍然被拦 `[实测]`；反向（宿主无 CSP + 子文档 meta `script-src 'none'`）则拦得住。CSP 是交集，符合规范的单调性。这给了我们一个**纵深防御手段**：可以让生成的 widget 自带 `connect-src 'none'` 之类，硬性掐掉外网。
3. **继承策略里的 `'self'` 解析到宿主源，不是「什么都不匹配」。** 实测中子文档在 `'self'` 下能载宿主源脚本 / 图片 / fetch，但载不到第三源。这与 CSP 规范里 CSP list 的 **self-origin** 概念一致：

   > A CSP list is a struct consisting of policies (a list of policies) and a **self-origin** (an origin which is used when matching the `'self'` keyword).
   > Note: This is needed to facilitate the `'self'` checks of **local scheme documents/workers that have inherited their policy but have an opaque origin**.
   > （<https://w3c.github.io/webappsec-csp/#framework-policy>）

   注意这条对我们不是好消息：它意味着**宿主 CSP 的 `connect-src 'self'` 不会阻止 widget 打宿主自己的接口**（例如侧车代理 `/voltagent-runtime`）。widget 不直连外网的铁律得靠 §8 的 `connect-src 'none'` 子策略 + 桥设计，不能只靠宿主 CSP。
4. **`frame-src` 管不住 srcdoc。** `frame-src 'none'` 下 iframe 照常 load、子脚本照常跑 `[实测]`。所以不能用 `frame-src` 当 widget 的开关（也不能指望它当安全边界）。`[未查明]` 这是 Chromium 现行行为还是规范要求，没有逐条核到规范导航检查算法。
5. **`csp=` 属性（CSP Embedded Enforcement）对 srcdoc 有效** `[实测]`。这是**逐 widget 下策略**的可用手段，比全局 CSP 精细，且不需要 widget 配合。

### 3.4 要让 widget 能跑脚本 + 内联 style + Tailwind CDN，必须怎么配

两条路，**建议选 A，把 B 作为「将来真要加 CSP」的兜底**：

**A. 宿主不设 CSP（= 保持现状），逐 widget 用 `csp=` 属性收口**

```html
<!-- 渲染层：widget 侧 -->
<iframe
  sandbox="allow-scripts"
  csp="script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src 'none'"
  srcdoc="…agent 生成的单文件 HTML…"
></iframe>
```

优点：宿主自身不被 `'unsafe-inline'` 污染；widget 的能力面收在一个属性里，可随 widget 声明的能力位调整。

**B. 宿主设 CSP，则必须至少满足**

| widget 需要 | 宿主 CSP 至少要有 | 备注 |
| --- | --- | --- |
| 内联 `<script>` | `script-src 'unsafe-inline'`，或 `'nonce-<每次渲染新随机值>'` 且宿主把同一个 nonce 写进生成的 widget HTML | nonce 方案实测可行，比全局 `'unsafe-inline'` 干净得多 |
| 内联 `<style>` / style 属性 | `style-src 'unsafe-inline'` | 只写 `default-src 'self'` 时内联样式一起被拦 `[实测]` |
| `new Function` / `eval`（图表库常用） | `'unsafe-eval'` | 不给的话大量 CDN 图表库会挂 |
| Tailwind CDN（`https://cdn.tailwindcss.com`） | `script-src https://cdn.tailwindcss.com`（或 `https:`） | 实测在无 CSP 下可加载成功、`typeof window.tailwind === 'object'`，但会打印「不要用于生产」告警 `[实测]` |
| 外链图片 / 字体 | `img-src * data: blob:` / `font-src * data:` | 字体另外还要过 CORS，见 §4 |

**注意 nonce 方案的代价**：nonce 是 per-response 的，宿主必须在每次渲染时生成新值并注入 widget HTML；且一旦 widget 里有 agent 生成的多段脚本，都要带同一个 nonce，等价于对该文档放开了内联执行。它买到的是「宿主自己不需要 `'unsafe-inline'`」，不是「widget 变安全了」——widget 的安全仍然全靠 sandbox。

**关于 Electron**：`main.ts` 目前既不加 CSP 也没关 `webSecurity`，渲染层 CORS 与浏览器一致 `[仓库]`。如果将来按 Electron 安全建议加 CSP（`onHeadersReceived` 注入），会**同时打死所有 widget**——这条必须写进 Board 的 ADR 与 Electron 侧注释。`[未查明]` Electron 官方安全清单的具体措辞未逐字核对。

---

## 4. 不透明源能力清单（问题 2）

全部为 `sandbox="allow-scripts"`、宿主无 CSP、`http://127.0.0.1` 宿主页下的 **Chromium 147 实测**。
身份基线：`window.origin === "null"`、`location.href === "about:srcdoc"`、`document.baseURI === 宿主页 URL`（相对 URL 按宿主页解析 `[MDN]` 亦如此说）、`isSecureContext === true`（从父级继承安全上下文）、`crossOriginIsolated === false`。

| 能力 | 结论 | 实测证据 |
| --- | --- | --- |
| `localStorage` | ❌ 不可用 | `SecurityError: The document is sandboxed and lacks the 'allow-same-origin' flag` |
| `sessionStorage` | ❌ 不可用 | 同上 |
| IndexedDB | ❌ 不可用 | `indexedDB` 对象存在，但 `open()` 抛 `SecurityError: access to the Indexed Database API is denied in this context` |
| cookie | ❌ 不可用 | `document.cookie` setter 抛 `SecurityError` |
| CacheStorage | ❌ 不可用 | 读 `caches` 属性即抛 `SecurityError` |
| ServiceWorker | ❌ 不可用 | 读 `navigator.serviceWorker` 抛 `SecurityError` |
| `navigator.storage.estimate()` | ❌ 不可用 | `TypeError: not supported in this context` |
| `BroadcastChannel` | ⚠️ 有条件 | 同一文档内两个 channel 能互通；**跨 iframe 不能**（每个不透明源互不相同）→ 不能当 widget 间总线 |
| Web Crypto `getRandomValues` / `randomUUID` | ✅ 可用 | — |
| Web Crypto `subtle`（digest / generateKey） | ✅ 可用 | `SHA-256` 得到 32 字节；`AES-GCM` 生成成功（因 `isSecureContext === true`） |
| `<img src>` 外链（无 CORS 头） | ✅ 可用 | 加载成功——**这就是 Kimi 保留「读公开图片」的那个例外** |
| 外链 CSS `<link rel=stylesheet>`（无 CORS 头） | ✅ 可用 | 计算样式生效（`rgb(1, 2, 3)`） |
| classic `<script src>` 外链（无 CORS 头） | ✅ 可用 | 脚本执行、全局变量可见 |
| **Tailwind CDN** | ✅ 可用（需外网） | `https://cdn.tailwindcss.com` 加载成功；带 production 告警 |
| 外链字体 | ⚠️ **必须 CORS** | `ACAO: *` ✅ / `ACAO: null` ✅ / 无 ACAO ❌ `NetworkError`（字体永远走 CORS）|
| ES module 动态 `import()` | ⚠️ **必须 CORS** | `ACAO: *` ✅ / 无 ACAO ❌（module 请求恒为 cors 模式） |
| 内联 `<script type="module">` | ✅ 可用 | 执行 |
| `fetch` / XHR | ⚠️ **`Origin: null`，几乎必挂** | 见下方专表 |
| WebSocket | ⚠️ 未定论 | 服务端**确实收到了 upgrade 请求且 `Origin: null`**（对照 `allow-same-origin` 场景为真实 origin），但本轮 harness 自己手写的握手算错 `Sec-WebSocket-Accept`，握手失败。**没能证明连接可用**（§10）。WebSocket 不受 CORS 约束，但服务端若校验 Origin 会拒 `null` |
| Canvas 2D / `getImageData` | ✅ 可用 | 自绘内容可读 |
| Canvas 跨源图片污染 | ⚠️ 照常污染 | 画入无 CORS 头的跨源图后 `getImageData` 抛 `SecurityError`；给 `crossOrigin='anonymous'` + `ACAO: *` 则可读 |
| WebGL | ✅ 可用 | `webgl2` |
| `requestAnimationFrame` | ✅ 可用（**离屏为 0**） | 在屏 400ms 内 50 帧；**离屏 iframe 一帧都不跑**（§6） |
| blob URL `Worker` | ✅ 可用 | 往返消息成功 |
| `eval` / `new Function` | ✅ 可用（无 CSP 时） | — |
| `structuredClone` | ✅ 可用 | — |
| Notification | ❌ 不可用 | `Notification.permission === 'denied'`，`requestPermission()` 返回 `denied`（权限按源授予，不透明源永远拿不到） |
| 剪贴板 | ⚠️ 未定论 | `navigator.clipboard` 存在；`writeText()` 抛 `NotAllowedError: Document is not focused`（自动化环境焦点问题，**没测出真实用户手势下的结果**）；`document.execCommand('copy')` 返回 `false`（`allow-same-origin` 场景下返回 `true`）；`permissions.query('clipboard-write')` 为 `denied`。另需 `allow="clipboard-write"` Permissions Policy（未测）→ §10 |
| Geolocation / mediaDevices | 对象存在但权限按源授予 → 实际拿不到 | 未逐个走完授权流 |
| `history.pushState` | ❌ 抛 `SecurityError` | 不透明源不能写 history |
| `window.name` | ✅ 可写 | 但不是可靠通道 |
| 顶层导航 | ❌ 抛 `SecurityError` | 无 `allow-top-navigation` |
| `matchMedia('(prefers-color-scheme: dark)')` | ✅ 可读 | **但只反映系统偏好**；宿主应用的 class/属性主题**不会**传进子文档 → 主题必须走桥 |

### 4.1 `Origin: null` 下 CORS 的真实行为（实测）

| 响应头 | 请求方式 | 结果 |
| --- | --- | --- |
| `ACAO: *` | `fetch` 默认 | ✅ 200，`type: cors` |
| `ACAO: null` | `fetch` 默认 | ✅ 200 |
| `ACAO: <宿主 origin>` | `fetch` 默认 | ❌ `TypeError: Failed to fetch`（浏览器报「value …8791 that is not equal to the supplied origin」） |
| 无 `ACAO` | `fetch` 默认 | ❌ Failed to fetch |
| 无 `ACAO` | `fetch mode:'no-cors'` | ✅ 但 `status: 0` / `type: opaque` / 正文不可读 |
| `ACAO: *` + `ACAC: true` | `credentials: 'include'` | ❌ 通配符不允许带凭据 |
| **`ACAO: null` + `ACAC: true`** | `credentials: 'include'` | ✅ **200 且能读正文** |

最后一行是个安全注记：**服务端回 `Access-Control-Allow-Origin: null` 等于对所有沙箱化不透明源开门**。我们自己的侧车 / 代理接口**不得**回 `ACAO: null`。

**对 #111「widget 不直连外网」铁律的支撑**：不是「技术上完全不可能」，而是「除 `ACAO: */null` 的公开端点外都会挂，且密钥无处安放」。铁律成立，但理由要写准。

---

## 5. postMessage 在不透明源下的安全模式（问题 3）

### 5.1 实测事实

| 事实 | 实测值 |
| --- | --- |
| 宿主收到 widget 消息时的 `event.origin` | 字符串 `"null"`（`typeof === 'string'`） |
| `event.source === iframe.contentWindow` | `true` |
| 宿主 → widget `postMessage(msg, '*')` | ✅ 投递 |
| 宿主 → widget `postMessage(msg, 'null')` | ❌ **抛 `SyntaxError`**（`'null'` 不是合法 URL） |
| 宿主 → widget `postMessage(msg, 'about:srcdoc')` | ❌ 抛 `SyntaxError` |
| 宿主 → widget `postMessage(msg, location.origin)` | 不抛，但**消息不投递**，控制台警告 `target origin ('http://…') does not match the recipient window's origin ('null')` |
| 宿主 `iframe.contentWindow.eval(...)` | ❌ `SecurityError`（宿主也读不进子文档，隔离是双向的） |
| `new MessageChannel()` 在 sandbox 内 | ✅ 可用，端口可随 `postMessage` transfer 进 widget |
| `'onclose' in MessagePort.prototype` | **`false`** |
| 移除 iframe 后 `port1` 的 close 事件 | **2.5s 内未触发** |
| 载荷体积（宿主 → widget，`postMessage` 不抛） | 1 / 8 / 16 / 32 / 64 / **128 MB** 全部未抛异常（**只验证了发送端不抛，未验证接收端收到**，§10） |

### 5.2 三种来源校验做法的取舍

| 做法 | 能证明什么 | 不能证明什么 | 结论 |
| --- | --- | --- | --- |
| 校验 `event.origin` | 什么都证明不了（恒为 `"null"`，任何沙箱化 iframe、任何 `data:`/`blob:` 文档都是 `"null"`） | — | **禁止**单独用它做判据；只能用来断言「不是 `"null"` 就丢弃」 |
| 校验 `event.source === iframe.contentWindow` | 消息确实来自**这一个** iframe 的 window | 不能证明是 widget 里哪段脚本发的 | **宿主侧必选**。宿主持有 iframe 引用，是唯一不可伪造的身份 |
| MessageChannel 端口传递 | 持有 `port` 的一方在握手时被宿主选定；后续 `port.onmessage` 天然只收该端口消息，不需要再判 origin | 端口在 widget 内部可被同文档任意脚本拿到 | **推荐主通道**。握手用 `window.postMessage(…, '*', [port2])`，之后全走 port |
| 随机 token 握手 | 消息发送者知道 token | token 随载荷进过 widget 文档，widget 内任意脚本都能读 | **只作辅助**（用于 widget → 宿主的请求配对 / 幂等），**不能**当安全边界；`targetOrigin` 只能 `'*'` 意味着**任何插进来的 iframe 都可能收到宿主广播**，所以宿主发出的载荷里**不得含密钥** |

### 5.3 推荐桥形态

```text
宿主                                   widget（opaque origin）
 │  1. iframe.srcdoc = html
 │  2. 等 widget 发 {type:'widget/ready', nonce}   ← window.postMessage(…, '*')
 │     校验 event.source === iframe.contentWindow
 │  3. postMessage({type:'host/port'}, '*', [port2])
 │  4. 之后 data / theme / resize / saveInput / emit 全走 port
 │  5. 心跳：每 N 秒 port.postMessage({type:'ping'})，
 │     M 次未回 pong → 判定失活 → 重挂（不能用 MessagePort.onclose）
```

### 5.4 `MessagePort.onclose`：规范有、Chromium 没有

- `[规范]` HTML Standard 已合并 close 事件：「Fire an event named `close` at otherPort」，且明确会在「显式 `close()`、拥有它的文档被销毁、端口被 GC」时触发（<https://html.spec.whatwg.org/multipage/web-messaging.html>；spec PR whatwg/html#9933）。
- Chromium 曾 ship 又 **在 M122 revert**：commit `cfb68d0 [M122] Revert "Enable MessagePort close event"`，理由是安全评审结论「该特性泄露对端进程的 GC 活动，可被用于推断导航等信息」（crbug.com/323695987）。
- `[实测]` Chromium 147 中 `'onclose' in MessagePort.prototype === false`，移除 iframe 后无 close 事件。

**因此：issue #112 里「Kimi 用 `MessagePort.onclose` 做存活探测」这条参照事实，在 Chromium 上大概率是不会触发的死代码**（除非其 Electron 显式打开了 `MessagePortCloseEvent` runtime flag —— `[未查明]`）。我们**必须**用心跳 + ready 超时，不要照抄。Kimi 的另外两条参照（**ready 8 秒超时 + 最多 2 次自动重载**）反而是可以直接抄的，因为那正是没有 close 事件时的正确兜底。

关于 **10.5 MB 载荷上限**：`[实测]` 平台层面 128MB 都不抛异常，所以 10.5MB 更像 Kimi 自己的产品级护栏，不是浏览器限制。建议我们也设自己的上限（同量级即可），理由是 structuredClone 的复制成本与 IDB 写入成本，不是 API 限制。

---

## 6. 多 iframe 并存的成本（问题 4）—— **未完成实测**

### 6.1 声明

**本轮没有完成设计中的 N = 5 / 20 / 60 headed 压测**：headed 运行只跑到 n=10 就按用户要求终止了所有浏览器实测。下面分三块：（a）已经跑出来的数字，标注条件；（b）已查明的事实如何收敛问题规模；（c）定性判断与风险点。**量级判断待实施期验证。**

### 6.2 (a) 已跑出的数字

**Headless 全量（Chromium 147 / headless / 1440×900 / 3 列网格 / 每个 iframe 1150×750 缩放 0.4 / widget = canvas rAF 动画 + ~40 DOM 节点）。注意 headless 下 rAF 未锁 vsync（每 widget ~170fps），CPU 压力高于真实产品；且所有沙箱帧落在宿主同一 renderer。**

| N | opt | 全部 load 耗时 | **实际拿到 rAF 帧的 widget 数** | Document 数 | 宿主页 JS 堆 | 浏览器进程树 RSS（较空载） | renderer 数 | 宿主 rAF p95 间隔 | long task |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | — | 40ms | 0 | 3 | 1 MB | 256 MB (+11) | 1 | 9ms | 0 |
| 5 | none | 134ms | **5 / 5** | 13 | 3 MB | 374 MB (+141) | 1 | 9ms | 0 |
| 20 | none | 115ms | **9 / 20** | 43 | 10 MB | 409 MB (+164) | 1 | 9ms | 0 |
| 60 | none | 159ms | **9 / 60** | 123 | 25 MB | 425 MB (+192) | 1 | 9ms | 0 |
| 20 | `content-visibility:auto` | 95ms | 9 / 20 | 43 | 10 MB | 445 MB | 1 | 9ms | 0 |
| 60 | `content-visibility:auto` | 171ms | 9 / 60 | 123 | 26 MB | 413 MB | 1 | 9ms | 0 |
| 60 | `loading="lazy"` | — | 9 / 60 | **61** | 23 MB | 468 MB | 1 | 9ms | 0 |
| 60 | IntersectionObserver 延挂 | — | 9 / 60 | **61** | 22 MB | 474 MB | 1 | 9ms | 0 |

**Headed 部分（真实 vsync，本机 120Hz，p50 帧间隔 8.4ms）：**

| N | 首屏（在屏 widget 全部出首帧） | 静止 rAF p95 / max | **滚动中 rAF p95 / max** | long task | 事件循环延迟 p95 | RSS（较空载） | renderer 数 | 宿主 renderer DOM 节点 | 在屏 widget fps | 离屏 widget fps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | — | 10.6 / 16.7ms | 12.5 / 16.8ms | 0 | 5.8ms | 615.7 MB | 2 | 27 | — | — |
| 5 | 688ms | 11 / 17.5ms | 10.5 / **29.6ms** | 0 | 5.6ms | 742.2 MB (+141.6) | **3** | 58 | 224 | — |
| 10 | 2189ms | 11 / 16.8ms | 13.9 / **43ms** | 0 | 6.7ms | 762.3 MB (+140) | **3** | 93 | 129 | **0** |

从这些数字能站得住的几条：

1. **离屏 iframe 不跑 rAF，一帧都不跑。** headless 与 headed 都是这个结果（`fpsOff = 0`；N=20/60 时只有在屏的 9 个拿到过首帧）。**Chromium 自己已经做了离屏 iframe 渲染节流**，这是最重要的一条——它意味着「多 iframe 的动画成本」主要由**在屏数量**决定，不是总数。
2. **但离屏 iframe 的文档照样创建、脚本照样执行。** headed n=10 中 10 个 widget 全部上报了 `script-start`（其中至少 1 个离屏）。所以「widget 初始化时干重活」（大 JSON 解析、建大 DOM）**不会**被节流省掉。
3. **不加优化时，60 个 iframe 会创建 123 个 Document**（每个 iframe 保留初始 `about:blank` 文档 + srcdoc 文档）；用 IntersectionObserver 延挂降到 61。
4. **`loading="lazy"` 对 srcdoc 是「部分生效、不可控」。** `[规范]` HTML 的 process the iframe attributes 算法里，srcdoc 分支确实带 lazy load resumption steps（即规范支持），但 Chromium 的触发距离阈值由浏览器决定、作者不可控；实测 60 个里只延后了一部分（Document 从 123 降到 61，但 load 事件仍然 60 个都发生了）。**不要把它当确定性手段。**
5. **`content-visibility: auto` 对「iframe 内部是否运行」几乎没帮助。** 实测 Document 数与 JS 堆和不加时一致（43 / 123、10 / 26 MB）——它省的是宿主自己的布局/绘制，不阻止子文档创建与脚本执行。真正省资源的是「不给 `srcdoc` 赋值」。
6. **首屏时间随在屏 widget 数明显变差**：headed 下 5 个在屏 688ms、10 个在屏 2189ms。这条最该在实施期复测——它直接决定列表页手感。
7. **卸载不会立刻归零**：headless 下 `src='about:blank'` 后 RSS 反而短时上升（n=60：425 → 472 MB），再 `remove()` 元素后回落到 447 MB，仍高于空载。**要按「延迟回收」设计，不要指望卸载即回收。**
8. **宿主主线程在测到的规模内没有出现 long task**（静止/滚动都是 0），滚动时最大帧间隔从空载 16.8ms 涨到 n=10 的 43ms（约丢 2–4 帧）。**滚动是最先劣化的场景**，比静止渲染敏感得多。

**这些数字不能用来断言 60 个 iframe 安全**：headless 的 CPU 画像不真实、headed 只跑到 10、进程模型两者不一致（headless 1 个 renderer vs headed 3 个），且真实 widget 由 agent 生成、复杂度不受控。

### 6.3 (b) 用已查明事实收敛问题规模

参照实现（Kimi）的看板列表页缩略图**只真实渲染前 4 个 widget**，不足补空占位格。

于是列表页 iframe 数的上界是：

```text
列表页 iframe 数 ≤ 看板数 × 4          （不是 看板数 × 每板 widget 数）
详情页 iframe 数 ≤ 每板 widget 上限（#111 已定，量级参考 20）
```

配合「#111 不设 Board 数量上限」，列表页的真正风险变量是**看板数**。以常见量级估：

| 看板数 | 列表页 iframe 上界 | 与已测数据的关系 |
| --- | --- | --- |
| 5 | 20 | 落在已测 headless n=20 区间内 |
| 15 | 60 | 落在已测 headless n=60 区间内 |
| 40+ | 160+ | **超出本轮全部实测范围** |

而**在屏**数量因为缩略图卡片较大，通常只有 6–12 个；结合 §6.2 第 1 条（离屏不跑 rAF），**「在屏 iframe 数」这个真正花钱的量在任何看板数下都基本恒定**。

### 6.4 (c) 定性判断与风险点

**定性判断（未做完整实测，待实施期验证）：**

- 首版按「列表页每板最多 4 个缩略 widget + IntersectionObserver 延挂 + 滚出视口后卸载」设计，**在几十块看板量级内不构成结构性风险**；主要成本是 Document 创建与 widget 初始化脚本，不是动画。
- **不要**把安全线写成一个固定的 iframe 数字。真正该设的护栏是**同时"活着"（已赋值 `srcdoc`）的 iframe 数**，建议实施期以 **在屏 + 前后各一屏 ≈ 12–16 个活跃 iframe** 为初始预算，用真实 widget 复测后再定。
- 详情页（单板 ≤20 个 widget）比列表页更接近「全部在屏」，**它才是更该压测的页面**，不是列表页。

**风险点：**

1. **懒加载不能靠 `loading="lazy"`**：srcdoc 场景下阈值不可控、只部分生效。必须用 IntersectionObserver 自己控制「何时赋值 `srcdoc`」——这也是唯一能真正省下 Document 与初始化脚本的手段。
2. **`content-visibility: auto` 不是省 iframe 的工具**：它省宿主渲染，不省子文档。可以加（对长列表布局有好处），但不要把它当成本控制手段记进规格。
3. **卸载策略必须显式设计**：`src = 'about:blank'` 能断掉子文档，但（a）内存不会即时回收；（b）`srcdoc` 属性仍在 DOM 上，想再用 srcdoc 必须先 `removeAttribute('src')` `[实测]`；（c）卸载即丢状态，widget 的用户输入（番茄钟计时、打卡记录）必须在卸载前已经通过桥 `saveInput` 落到宿主，否则滚动一次就丢。**卸载语义要和 `saveInput` 语义一起定。**
4. **widget 初始化重活不被节流**：离屏 iframe 的脚本照样跑。要在 SDK 合同里约定「首帧前只做最小渲染，重活等 `data` 事件」，否则 60 个离屏 widget 的初始化会串成一段可感知的卡顿。
5. **滚动是最先劣化的场景**：已测到 n=10 时滚动最大帧间隔 43ms。实施期的验收场景应该是「列表页滚动」而不是「列表页静止截图」。
6. **进程模型未定论**：headless 全在宿主 renderer、headed 进了独立 renderer。如果生产是 OOP，主线程隔离好但内存更贵；如果同进程，一个 widget 死循环就能卡死整个 Workbench。**这条决定要不要给 widget 加"看门狗"**，必须在实施期查清（§10）。

---

## 7. srcdoc 的体积上限与缓存 / 刷新语义（问题 5）

### 7.1 体积（实测）

| srcdoc 字符串 | 属性长度（字节级保真？） | 子文档就绪耗时 |
| --- | --- | --- |
| ~1 KB | 1,182 = 1,182 ✅ | 4ms |
| ~64 KB | 65,694 = 65,694 ✅ | 3ms |
| ~256 KB | 262,302 = 262,302 ✅ | 10ms |
| ~1 MB | 1,048,734 ✅ | 18ms |
| ~4 MB | 4,194,462 ✅ | 61ms |
| ~16 MB | 16,777,374 ✅ | 212ms |

- **没有观察到任何长度上限**，也没有截断。约 **13ms/MB**。
- Agent 生成的单文件 widget 现实量级是几十 KB 到几百 KB → **赋值成本 3–10ms，可忽略**。
- `[规范]` srcdoc 属性的值必须是 HTML 语法的完整文档；`srcdoc` 与 `src` 同时存在时 **`srcdoc` 优先**（<https://html.spec.whatwg.org/multipage/iframe-embed-object.html>）。
- `[MDN]` 写进 srcdoc 属性要做双重转义（`&` → `&amp;`、`"` → `&quot;`）。**用 DOM 的 `iframe.srcdoc = string` 赋值可以完全绕开这套转义**，React 里也应当用 ref 赋属性或直接 `srcDoc={html}`（React 会正确转义），**不要**手工拼 HTML 字符串。

### 7.2 刷新 / 缓存失效（实测）

| 操作 | 结果 |
| --- | --- |
| 首次 `f.srcdoc = v1` | 加载 v1 |
| **再次赋值完全相同的字符串** | **重新加载 v1**（确实重新导航，不是 no-op） |
| 赋值不同字符串 v2 | 加载 v2 |
| `f.src = 'about:blank'` 之后 | `srcdoc` 属性**仍在** DOM 上 |
| `removeAttribute('src')` 再赋 `srcdoc = v3` | 加载 v3 |

`[规范]` 对应算法：「Whenever an `iframe` element with a non-null content navigable has its `srcdoc` attribute **set, changed, or removed**, the user agent must process the `iframe` attributes」，且 srcdoc 分支会「Navigate an `iframe` … given element, `about:srcdoc`, the empty string, and the value of element's `srcdoc` attribute」。**设置即导航，不看值是否变化。**

### 7.3 三条刷新路线对比

| 路线 | 需要什么 | 优点 | 缺点 | 建议 |
| --- | --- | --- | --- | --- |
| **直接重赋 `srcdoc`** | 无 | 最简；**无需 React `key` 重挂载**（赋值本身就重新导航）；无需 URL 生命周期管理 | 每次全量传字符串（几百 KB 无所谓，见 §7.1） | ✅ **首版采用** |
| `key` 重挂载 iframe 元素 | React key = revision | 语义直白 | 多余：会销毁 iframe 元素、丢掉宿主侧 port/心跳状态，还要重建桥 | ❌ 不用 |
| `blob:` URL + revision 查询参数 | `createObjectURL` / `revokeObjectURL` 生命周期 | 可被 devtools 当真实文档调试；有真实 URL | **`blob:` 文档同样克隆创建者的 policy container** `[规范]`（`create a policy container from a fetch response` 第 1 步对 blob 特判为克隆），所以并不能绕开宿主 CSP；且引入 URL 泄漏风险与回收负担 | ❌ 首版不用；**若将来要绕 CSP，blob 也绕不掉**，只有自定义协议能绕（见下） |
| 自定义协议（Kimi 路线） | Electron `protocol.handle` + 一次性 token | **文档不再是 local scheme → 不继承宿主 CSP，可自带宽松 CSP**；可流式、可缓存 | **破坏 browser-only 前提**（#111 已锁定渲染层 browser-only、Electron 仅可选增强）；纯浏览器 dev 模式下无法工作 | ❌ 与 #111 前提冲突，不进首版 |

**卸载归零**：`src = 'about:blank'` 是正确做法（子文档被替换、脚本停止），但要注意 §6.4 第 3 条的三个陷阱。若要彻底释放，还要 `iframe.remove()`；即使如此内存也不即时回落 `[实测]`。

---

## 8. `sandbox` token 取舍（问题 6）

### 8.1 红线（必须写进 ADR）

> **`allow-scripts` 与 `allow-same-origin` 绝不可同时出现在 Board Widget 的 sandbox 上。**

- `[规范]` 「Setting both the allow-scripts and allow-same-origin keywords together when the embedded page has the same origin as the page containing the `iframe` allows the embedded page to **simply remove the `sandbox` attribute and then reload itself, effectively breaking out of the sandbox altogether**.」（HTML Standard，iframe sandbox 一节）
- `[MDN]` 同样明确列为「strongly discouraged」。
- `[实测]` 在 `sandbox="allow-scripts allow-same-origin"` 的 srcdoc 场景下：`window.origin` 变成宿主 origin；子文档能读宿主 `document.title`、能写宿主 `localStorage`、**并成功执行了 `parent.document.querySelector("iframe").removeAttribute("sandbox")`**；`event.origin` 也变成真实宿主 origin。**沙箱完全作废，等于把 agent 生成的代码直接注入 Workbench 主文档。**
- **srcdoc 尤其危险**：srcdoc 的「precursor origin」就是宿主 origin，所以 `allow-same-origin` 一定让 widget 与 Workbench 同源，一定满足上面那条逃逸条件。
- `[仓库]` 已有先例需注意：`src/modules/work-surface/surfaces/browser/url-utils.ts` 的 `sandboxForTrust()` 在 `trusted-preview`（localhost）分支返回 `'allow-scripts allow-same-origin allow-forms allow-popups'`。那是 **`src` 加载的 localhost 页面**（不同端口 → 不同源，逃逸条件不成立），与 Board 的 srcdoc 场景**不可类比**。Board 不得复用这个函数。

### 8.2 逐个 token 对目标 widget（番茄钟 / 待办打卡 / K 线图）的必要性

| token | 不给时的实际行为（实测） | 三类目标 widget 是否需要 | 结论 |
| --- | --- | --- | --- |
| `allow-scripts` | 不给则完全不执行脚本 | 全都需要 | ✅ **必给**（唯一必给项） |
| `allow-same-origin` | 不给则不透明源（本文全部结论的基础） | 都不需要（存储走桥） | ❌ **绝不给**（红线） |
| `allow-forms` | `form.submit()` 被拦，控制台 `Blocked form submission … 'allow-forms' permission is not set`；**`submit()` 本身不抛异常** | 三类都不需要（交互走桥 `emit(submit)`，不是 HTML 表单提交） | ❌ 不给。注意它**只拦提交**，`<input>`/`<button>` 照常可用可交互 |
| `allow-modals` | `alert()` 立即返回、`confirm()` 立即返回 `false`，控制台 `Ignored call to 'confirm()'. The document is sandboxed, and the 'allow-modals' keyword is not set.` | 待办打卡的「确认删除」用得到，但**应由宿主提供确认 UI** | ❌ **不给**。理由有二：(a) 模态会阻塞整个 Workbench 主线程与用户流；(b) `confirm()` 静默返回 `false` 是**安全的默认**（widget 拿到"取消"，不会误执行）。SDK 应提供 `confirm()` 桥方法，用宿主的 Base UI Dialog 渲染。<br>`[规范]` 另有一条更强的说法：「To allow alert(), confirm(), and prompt() inside sandboxed content, **both** the allow-modals **and** allow-same-origin keywords need to be specified」——即对不透明源文档，光给 `allow-modals` 按规范也不够。但 `[实测]` 我们在 `allow-scripts allow-modals`（无 same-origin）下**确实**捕获到了 dialog 事件，与规范这句不一致（可能是自动化环境的拦截产物）。**两种解释都指向同一个决定：不要给，也不要依赖 alert/confirm。** |
| `allow-downloads` | `a[download].click()` 不抛异常；本轮**未能在控制台确认拦截信息**，也未验证真实下载是否发生（§10） | K 线图导出 PNG / 待办导出 CSV 会用到 | ⚠️ **首版不给**；等真有「导出」需求时，优先让 widget 把数据经桥交给宿主、由**宿主**触发下载（这样能过宿主的文件命名与落盘策略），只在做不到时才加这个 token |
| `allow-popups` | `window.open()` 返回 `null`，控制台 `Blocked opening … 'allow-popups' permission is not set` | 都不需要（widget 内不应该开外链窗口；要开就经桥交宿主） | ❌ 不给 |
| `allow-popups-to-escape-sandbox` | — | 不需要 | ❌ 不给。**且注意：它单独给是没意义的**——没有 `allow-popups` 就根本开不出新上下文（`[推断]`，基于 `[MDN]` 对两个 token 的定义，本轮未单独实测）。参照实现给了这个 token 但同一条 sandbox 里没给 `allow-popups`，看起来是冗余配置，不必照抄 |
| `allow-top-navigation*` | 顶层导航抛 `SecurityError` | 不需要 | ❌ 不给 |

### 8.3 建议的最终形态

```html
<iframe
  sandbox="allow-scripts"
  csp="script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src 'none'"
  referrerpolicy="no-referrer"
  title="<widget 中文标题>"
  srcdoc="…"
></iframe>
```

- `sandbox="allow-scripts"` —— 唯一必给项。
- `csp="… connect-src 'none'"` —— 纵深防御：即使 widget 里被塞进 `fetch`，也连不出去（实测子文档 CSP 可以加严且确实生效）。**这是把 #111「widget 不直连外网」从"约定"变成"强制"的唯一可用手段**，因为宿主 CSP 的 `connect-src 'self'` 会被解析到宿主源、反而允许 widget 打我们自己的接口（§3.3 第 3 条）。
- `title` —— 可访问性；`[MDN]` 明确要求 iframe 有 title。
- `[未查明]` `csp=` 属性对 srcdoc 的规范依据（CSP Embedded Enforcement 对 local scheme 的处理）没逐字核到，只有实测证据。若要写进硬规则，实施期补规范核对。

---

## 9. 对 Board 设计的直接影响

1. **CSP 是全局单点开关，必须进 ADR + 门禁。** srcdoc 强制继承宿主 policy container，所以「有没有 CSP」是 Board 能否工作的前提，不是安全加固的自由选项。要么维持"宿主无 CSP + 逐 widget `csp=` 属性"，要么走 nonce 注入。任何人给 `index.html` / Electron / vite 加 CSP 都必须同步改 Board 渲染层。
2. **`widget 不直连外网` 要靠 `csp="connect-src 'none'"` 落地，不能只靠约定。** 不透明源的 CORS 只挡住了「没配 `ACAO: */null` 的接口」；而宿主 CSP 的 `'self'` 会解析到宿主源，反而给 widget 开了打我们侧车代理的门。同时我们自己的接口**不得**回 `ACAO: null`。
3. **桥协议：`targetOrigin` 只能 `'*'`，来源校验只能靠 `event.source` + MessageChannel。** 宿主广播的载荷里不得含任何密钥。`MessagePort.onclose` 在 Chromium 上不可用（规范有、M122 被 revert、147 实测无），存活探测必须心跳 + ready 超时 + 有限次自动重载。
4. **所有 widget 状态必须走桥落到宿主。** widget 侧 `localStorage` / IndexedDB / cookie 全灭，这直接决定了 SDK 的 `saveInput` 是**必需项**而不是便利项，并且它的时机必须和「滚出视口卸载」策略配套定义，否则番茄钟 / 打卡状态会随滚动丢失。
5. **主题必须走桥。** widget 只能读到系统级 `prefers-color-scheme`，读不到 Workbench 应用内的主题切换（class/属性在宿主文档上）。#111 里 `theme` 属于 SDK 是对的，且它不是可选项。
6. **样式建议内联，不建议依赖 CDN。** Tailwind CDN 在无 CSP 下确实能加载，但依赖外网、且会打印生产告警；更稳的是让 agent 生成内联 `<style>`，或由宿主随 srcdoc 注入一份基础 CSS + 主题变量。
7. **列表页缩略图按"每板前 4 个 + IntersectionObserver 延挂 + 卸载"设计，详情页才是压测重点。** 离屏 iframe 不跑 rAF（Chromium 自带节流），但**文档会创建、初始化脚本会执行**；`content-visibility` 与 `loading="lazy"` 都不是可靠的成本控制手段。真正的护栏是"同时活着的 iframe 数"。
8. **刷新用直接重赋 `srcdoc`，不要 `key` 重挂载、不要 `blob:`、不要自定义协议。** 赋值即导航（相同字符串也会重载），几百 KB 的赋值成本个位数毫秒；`blob:` 同样继承宿主 CSP，绕不开；自定义协议与 #111 的 browser-only 前提冲突。

---

## 10. 未查明清单

| # | 未查明项 | 为什么重要 | 建议怎么补 |
| --- | --- | --- | --- |
| 1 | **N = 20 / 60 的 headed（真实 vsync）成本**，以及"安全线"的确定数字 | 决定列表页 / 详情页的 widget 上限与懒加载策略 | 实施期用真实 agent 生成的 widget，在详情页（≤20 个全在屏）与列表页（看板数 × 4）两个场景各跑一次；验收场景必须包含**滚动**而不只是静止 |
| 2 | **沙箱 srcdoc iframe 的进程模型**：headless 实测全在宿主 renderer（1 个），headed 实测进了独立 renderer（3 个）。是 `IsolateSandboxedIframes` 之类的特性差异还是别的原因？ | 决定「一个死循环 widget 会不会卡死整个 Workbench」，从而决定要不要给 widget 加看门狗；也决定内存画像 | 用 `chrome://process-internals` 或 CDP `Target.getTargets` 在 headed / headless / Electron 三种宿主下各查一次；查 Chromium 该特性的 flag 现状 |
| 3 | **WebSocket 在不透明源下能否真正连通** | 若能连，widget 直连本机侧车就成了一个需要显式封堵的攻击面（`csp connect-src 'none'` 是否也覆盖 WebSocket 需一并确认） | harness 的握手是自己手写的、算错了 `Sec-WebSocket-Accept`；用 `ws` 库重测即可。已确认的部分：服务端**确实**收到 upgrade 且 `Origin: null` |
| 4 | **`postMessage` 大载荷的接收端行为**（只验证了发送端 1–128MB 不抛） | 决定桥的载荷上限该设在哪、超限时的失败形态是什么 | 让 widget 回传收到的 `length` 并计时；同时测 `structuredClone` 的耗时曲线 |
| 5 | **真实用户手势下的剪贴板行为**（`navigator.clipboard.writeText` / `execCommand('copy')`），以及是否需要 `allow="clipboard-write"` | 「复制 K 线数据」这类交互能否在 widget 内直接做，还是必须经桥 | 需要有焦点的 headed 会话 + 真实点击；再各测一次带 / 不带 `allow` 属性 |
| 6 | **`allow-downloads` 的真实拦截行为**（本轮没能在控制台确认拦截信息，也没验证真实下载） | 决定「导出」功能是 widget 自己下载还是经桥交宿主 | 用 CDP download 事件或 Playwright `download` 事件验证 |
| 7 | **`frame-src` 不拦 srcdoc** 是 Chromium 现行行为还是规范要求 | 影响能不能用 CSP 做 widget 的开关（目前结论是不能） | 核 CSP 规范的导航检查算法（`frame-src` pre-navigation check）对 local scheme 的处理 |
| 8 | **`csp=` 属性对 srcdoc 生效**的规范依据（只有实测证据） | §8.3 建议把它写进硬规则，需要规范背书 | 核 CSP Embedded Enforcement 规范对 local scheme / `about:srcdoc` 的措辞 |
| 9 | **Kimi 的 `MessagePort.onclose` 是否真的在跑** | 若其 Electron 开了 `MessagePortCloseEvent` flag，说明这条路在桌面端可行；否则那是死代码 | 查其 Electron 版本对应的 Chromium 与启动参数；但**无论结论如何我们都要做心跳**（浏览器 dev 模式必须可用） |
| 10 | **Electron 官方安全清单对 CSP 的具体措辞**，以及若将来加 CSP 的推荐注入位置 | 决定 ADR 里怎么写「加 CSP 时必须同步改什么」 | 核 Electron security 文档（`session.defaultSession.webRequest.onHeadersReceived`） |
| 11 | **Notification / Geolocation 等权限类 API 的完整授权路径** | 番茄钟"到点提醒"是刚需，目前只知不透明源拿不到 Notification 权限 | 结论大概率是「提醒必须经桥由宿主发」，实施期确认一次即可 |
