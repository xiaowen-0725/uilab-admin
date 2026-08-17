/**
 * Board writing-rule catalog (spec §6.4 / §6.5).
 * Validator check ids and SKILL.md headings share these ids — one list, two surfaces.
 */

export type BoardWritingCheck = 'static' | 'uncheckable'

export type BoardWritingRule = {
  id: string
  layer: 'widget' | 'job'
  rule: string
  violation: string
  check: BoardWritingCheck
  /** Validator check ids that implement this rule. Empty when uncheckable. */
  checkIds: readonly string[]
}

export const WIDGET_WRITING_RULES: readonly BoardWritingRule[] = [
  {
    id: 'W1',
    layer: 'widget',
    rule: '单文件：只产出 <style> 内容与 JS 主体，不引任何外部 URL。',
    violation: '外链 src/href 被 CSP 拦截，小组件白屏或资源加载失败。',
    check: 'static',
    checkIds: ['W1'],
  },
  {
    id: 'W2',
    layer: 'widget',
    rule: '不联网：数据只能来自 widget.data / widget.onDataChange。要外部数据必须配套建取数作业。',
    violation: 'fetch/XHR/WebSocket 被 CSP 拦截；未读 data 也未订阅 onDataChange 时 finish 拒收。',
    check: 'static',
    checkIds: ['W2-network', 'W2-data'],
  },
  {
    id: 'W3',
    layer: 'widget',
    rule: '主体写成「被 SDK 调用」的形状；不要自己 addEventListener("message")，不要依赖 DOMContentLoaded。',
    violation: '桥消息被抢走或主体从未执行，内容停在空白。',
    check: 'uncheckable',
    checkIds: [],
  },
  {
    id: 'W4',
    layer: 'widget',
    rule: 'data 可能是 null（尚未取数）→ 必须画空态/加载态，不能崩。',
    violation: '作业未跑完时脚本抛错，iframe 停在错误态。',
    check: 'uncheckable',
    checkIds: [],
  },
  {
    id: 'W5',
    layer: 'widget',
    rule: '状态只走 widget.saveInput / getInput；不要 localStorage / sessionStorage / cookie。',
    violation: '不透明源下存储 API 不可用，刷新后草稿丢失或脚本抛错。',
    check: 'static',
    checkIds: ['W5'],
  },
  {
    id: 'W6',
    layer: 'widget',
    rule: '不要 alert / confirm / prompt；需要确认走 widget.submit()。',
    violation: '未给 allow-modals，confirm() 直接返回 false，用户看不到对话框。',
    check: 'static',
    checkIds: ['W6'],
  },
  {
    id: 'W7',
    layer: 'widget',
    rule: '不要导航或开窗：window.open、location =、target="_blank" 均无效；外链走 widget.openLink(href)。',
    violation: '点击无反应，或被沙箱吞掉导航。',
    check: 'static',
    checkIds: ['W7'],
  },
  {
    id: 'W8',
    layer: 'widget',
    rule: '不要画自己的标题栏 / 刷新 / 全屏按钮——那些是宿主 chrome，只画内容区。',
    violation: '出现双标题栏或无效按钮，用户点了没反应。',
    check: 'uncheckable',
    checkIds: [],
  },
  {
    id: 'W9',
    layer: 'widget',
    rule: '高度自适应：内容直接放 body，调 widget.resize()；不要 height: 100vh、不要自己滚。',
    violation: '出现双滚动条或内容被裁切。',
    check: 'static',
    checkIds: ['W9'],
  },
  {
    id: 'W10',
    layer: 'widget',
    rule: '主题用宿主注入的 CSS 变量并监听 onThemeChange；不要只适配浅色。',
    violation: '深色模式下文字消失或对比度崩溃。',
    check: 'uncheckable',
    checkIds: [],
  },
  {
    id: 'W11',
    layer: 'widget',
    rule: '图表用 <canvas> 手绘或内联 SVG，不引图表库。',
    violation: '外链图表库被 CSP 拦截，图表区域空白。',
    check: 'uncheckable',
    checkIds: [],
  },
  {
    id: 'W12',
    layer: 'widget',
    rule: '不要 eval / new Function / 动态 import()；不要内联事件处理器，只能 addEventListener。',
    violation: 'CSP 拦截脚本，finish 报 csp_violation。',
    check: 'static',
    checkIds: ['W12-eval', 'W12-function', 'W12-inline', 'W12-import'],
  },
  {
    id: 'W13',
    layer: 'widget',
    rule: '不许把元素 append 进自己的后代（会让 DOM 无限增长）。',
    violation: '每次刷新或数据更新都再挂一层，内存与布局失控。',
    check: 'uncheckable',
    checkIds: [],
  },
  {
    id: 'W14',
    layer: 'widget',
    rule: '不要监听 wheel 并 preventDefault（会打断宿主滚轮转发）。',
    violation: '看板画布无法滚动，或滚动卡在小组件内。',
    check: 'uncheckable',
    checkIds: [],
  },
  {
    id: 'W15',
    layer: 'widget',
    rule: '必须调用 widget.ready()。',
    violation: '宿主无法确认内容已画完，finish 报 sdk_contract_violation，预览可能一直转圈。',
    check: 'static',
    checkIds: ['W15'],
  },
]

export const JOB_WRITING_RULES: readonly BoardWritingRule[] = [
  {
    id: 'J1',
    layer: 'job',
    rule: '单文件、零依赖，导出 run(ctx)；不得 import 任何模块。',
    violation: '--no-remote --cached-only 让 import 直接失败，finish 拒收。',
    check: 'static',
    checkIds: ['J1-import', 'J1-run'],
  },
  {
    id: 'J2',
    layer: 'job',
    rule: '用全局 fetch；所有要访问的主机必须在 allowedHosts 显式声明。',
    violation: '未声明主机会被 Deno 权限层直接拒。',
    check: 'static',
    checkIds: ['J2-hosts'],
  },
  {
    id: 'J3',
    layer: 'job',
    rule: '只能读写 ctx.runDir；碰不到工作区，也碰不到自己的代码。',
    violation: '路径逃逸被静态拒，或运行时写盘失败。',
    check: 'static',
    checkIds: ['J3'],
  },
  {
    id: 'J4',
    layer: 'job',
    rule: '源码静态上限 64 KiB；返回可 JSON 序列化对象，产物硬顶 512 KiB，聚合/裁剪在作业里做。',
    violation: '源码超 64 KiB 时 finish 拒；产物超 512 KiB 时运行时拒，原样回传上游会撑爆。',
    check: 'static',
    checkIds: ['J4-size'],
  },
  {
    id: 'J5',
    layer: 'job',
    rule: '首版只支持公开端点：不要写死密钥，也读不到环境变量。',
    violation: 'Deno.env / Deno.run 被静态拒；密钥会出现在审批卡上。',
    check: 'static',
    checkIds: ['J5-env', 'J5-run'],
  },
  {
    id: 'J6',
    layer: 'job',
    rule: '60 s 超时（硬顶 120 s）：不要重试风暴、不要长轮询。',
    violation: '作业被宿主杀掉，chrome 显示超时。',
    check: 'uncheckable',
    checkIds: [],
  },
  {
    id: 'J7',
    layer: 'job',
    rule: '幂等：审批一次之后可被重复静默执行，作业不得有副作用。',
    violation: '每次刷新都改远端状态，用户无法预知后果。',
    check: 'uncheckable',
    checkIds: [],
  },
]

export const BOARD_WRITING_RULES: readonly BoardWritingRule[] = [
  ...WIDGET_WRITING_RULES,
  ...JOB_WRITING_RULES,
]
