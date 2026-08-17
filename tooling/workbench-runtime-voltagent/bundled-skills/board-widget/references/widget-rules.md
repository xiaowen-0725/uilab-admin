# 小组件写作规范

每条附违反时的表现。标了「无法机器校验」的条目 finish 不会拦，但仍必须遵守。

### W1

单文件：只产出 `<style>` 内容与 JS 主体，**不引任何外部 URL**。

违反：外链 `src` / `href` 被 CSP 拦截，小组件白屏或资源加载失败。

### W2

**不联网**：数据只能来自 `widget.data` / `widget.onDataChange`。要外部数据 → 必须配套建取数作业。

违反：`fetch` / XHR / WebSocket 被 CSP 拦截；未读 data 也未订阅 `onDataChange` 时 finish 拒收。

### W3

主体写成「被 SDK 调用」的形状；**不要**自己 `addEventListener('message')`，**不要**依赖 `DOMContentLoaded`。

违反：桥消息被抢走或主体从未执行，内容停在空白。无法机器校验。

### W4

`data` 可能是 `null`（尚未取数）→ 必须画空态/加载态，不能崩。

违反：作业未跑完时脚本抛错，iframe 停在错误态。无法机器校验。

### W5

状态只走 `widget.saveInput` / `getInput`；**不要** localStorage / sessionStorage / cookie。

违反：不透明源下存储 API 不可用，刷新后草稿丢失或脚本抛错。

### W6

不要 `alert` / `confirm` / `prompt`（未给 `allow-modals`，`confirm()` 直接返回 `false`）；需要确认走 `widget.submit()`。

违反：用户看不到对话框，流程被静默否决。

### W7

不要导航或开窗：`window.open`、`location =`、`target="_blank"` 均无效；外链走 `widget.openLink(href)`。

违反：点击无反应，或被沙箱吞掉导航。

### W8

**不要画自己的标题栏 / 刷新 / 全屏按钮**——那些是宿主 chrome，只画内容区。

违反：出现双标题栏或无效按钮。无法机器校验。

### W9

高度自适应：内容直接放 body，调 `widget.resize()`；不要 `height: 100vh`、不要自己滚。

违反：出现双滚动条或内容被裁切。

### W10

主题用宿主注入的 CSS 变量并监听 `onThemeChange`；不要只适配浅色。

违反：深色模式下文字消失或对比度崩溃。无法机器校验。

### W11

图表用 `<canvas>` 手绘或内联 SVG，**不引图表库**。

违反：外链图表库被 CSP 拦截，图表区域空白。无法机器校验（外链本身由 W1 拦住）。

### W12

不要 `eval` / `new Function` / 动态 `import()`；不要内联事件处理器（nonce 覆盖不到），只能 `addEventListener`。

违反：CSP 拦截脚本，finish 报 `csp_violation`。

### W13

不许把元素 append 进自己的后代（会让 DOM 无限增长）。

违反：每次刷新或数据更新都再挂一层，内存与布局失控。无法机器校验。

### W14

不要监听 `wheel` 并 `preventDefault`（会打断宿主滚轮转发）。

违反：看板画布无法滚动，或滚动卡在小组件内。无法机器校验。

### W15

必须调用 `widget.ready()`。

违反：宿主无法确认内容已画完，finish 报 `sdk_contract_violation`，预览可能一直转圈。
