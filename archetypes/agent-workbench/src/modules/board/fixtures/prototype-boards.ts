/**
 * Prototype fixtures — hand-written stand-ins for agent-generated widgets.
 *
 * They are written the way generated widgets must be written: no network calls,
 * data only from the bridge, no `alert`/`confirm`, all state through
 * `widget.saveInput`. If a fixture cannot be expressed under those rules, the
 * SDK surface is wrong.
 */
import type { Board, BoardWidget } from '../model/board'

const HOUR = 3600_000

function widget(partial: Omit<BoardWidget, 'dataState'> & { dataState?: BoardWidget['dataState'] }): BoardWidget {
  return {
    dataState: partial.data === null ? 'idle' : 'ready',
    ...partial,
  }
}

const POMODORO: BoardWidget = widget({
  id: 'w-pomodoro',
  title: '番茄钟',
  placement: { x: 0, y: 0, w: 4, h: 5 },
  data: null,
  job: null,
  source: {
    css: [
      '.clock { font: 600 34px/1 ui-monospace, monospace; letter-spacing: 1px; text-align: center; margin: 14px 0 12px; }',
      '.row { display: flex; gap: 6px; justify-content: center; }',
      'button { flex: 1; padding: 6px 0; border: 1px solid #d4d4d8; border-radius: 6px; background: #fafafa; font: inherit; cursor: pointer; }',
      'button:hover { background: #f4f4f5; }',
      '.done { margin-top: 10px; text-align: center; font-size: 11px; color: #71717a; }',
      ':root[data-widget-theme="dark"] button { background: #27272a; border-color: #3f3f46; color: inherit; }',
    ].join('\n'),
    script: [
      'var total = 25 * 60;',
      'var left = total;',
      'var timer = null;',
      'var done = (widget.getInput() && widget.getInput().done) || 0;',
      'document.body.innerHTML =',
      '  \'<div class="clock" id="clock">25:00</div>\' +',
      '  \'<div class="row">\' +',
      '  \'<button id="toggle">开始</button><button id="reset">重置</button>\' +',
      '  \'</div><div class="done" id="done"></div>\';',
      'var clock = document.getElementById("clock");',
      'var toggle = document.getElementById("toggle");',
      'var doneEl = document.getElementById("done");',
      'function paint() {',
      '  var m = Math.floor(left / 60);',
      '  var s = left % 60;',
      '  clock.textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;',
      '  doneEl.textContent = "今天完成 " + done + " 个";',
      '}',
      'function stop() { if (timer) { clearInterval(timer); timer = null; } toggle.textContent = "开始"; }',
      'toggle.onclick = function () {',
      '  if (timer) { stop(); return; }',
      '  toggle.textContent = "暂停";',
      '  timer = setInterval(function () {',
      '    left -= 1;',
      '    if (left <= 0) { left = total; done += 1; widget.saveInput({ done: done }); stop(); }',
      '    paint();',
      '  }, 1000);',
      '};',
      'document.getElementById("reset").onclick = function () { stop(); left = total; paint(); };',
      'paint();',
    ].join('\n'),
  },
})

const CHECKLIST: BoardWidget = widget({
  id: 'w-checklist',
  title: '待办打卡',
  placement: { x: 4, y: 0, w: 4, h: 5 },
  data: null,
  job: null,
  source: {
    css: [
      'ul { list-style: none; margin: 0; padding: 0; }',
      'li { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid #f4f4f5; }',
      'li:last-child { border-bottom: 0; }',
      'li.on span { color: #a1a1aa; text-decoration: line-through; }',
      'input { accent-color: #18181b; }',
      '.count { margin-top: 8px; font-size: 11px; color: #71717a; }',
    ].join('\n'),
    script: [
      'var labels = ["读 30 分钟", "运动 20 分钟", "写日志", "整理收件箱"];',
      'var saved = widget.getInput() || {};',
      'var list = document.createElement("ul");',
      'var count = document.createElement("div");',
      'count.className = "count";',
      'function refresh() {',
      '  var on = labels.filter(function (label) { return saved[label]; }).length;',
      '  count.textContent = "已完成 " + on + " / " + labels.length;',
      '}',
      'labels.forEach(function (label) {',
      '  var li = document.createElement("li");',
      '  var box = document.createElement("input");',
      '  box.type = "checkbox";',
      '  box.checked = Boolean(saved[label]);',
      '  var text = document.createElement("span");',
      '  text.textContent = label;',
      '  li.className = box.checked ? "on" : "";',
      '  box.onchange = function () {',
      '    saved[label] = box.checked;',
      '    li.className = box.checked ? "on" : "";',
      '    widget.saveInput(saved);',
      '    refresh();',
      '  };',
      '  li.appendChild(box);',
      '  li.appendChild(text);',
      '  list.appendChild(li);',
      '});',
      'document.body.appendChild(list);',
      'document.body.appendChild(count);',
      'refresh();',
    ].join('\n'),
  },
})

const GUIDE: BoardWidget = widget({
  id: 'w-guide',
  title: '这个看板怎么用',
  placement: { x: 0, y: 5, w: 8, h: 4 },
  data: null,
  job: null,
  source: {
    css: [
      'h4 { margin: 0 0 6px; font-size: 13px; }',
      'ol { margin: 0; padding-left: 18px; }',
      'li { margin-bottom: 4px; }',
      'code { background: #f4f4f5; padding: 1px 4px; border-radius: 3px; font-size: 11px; }',
      ':root[data-widget-theme="dark"] code { background: #27272a; }',
    ].join('\n'),
    script: [
      'document.body.innerHTML =',
      '  "<h4>三件事</h4>" +',
      '  "<ol>" +',
      '  "<li>拖动小组件标题栏可以换位置，右下角可以调尺寸。</li>" +',
      '  "<li>需要新组件时用「对话创建」，描述你要看什么。</li>" +',
      '  "<li>要外部数据的组件由<code>取数作业</code>供数，组件本身不联网。</li>" +',
      '  "</ol>";',
    ].join('\n'),
  },
})

const NEWS: BoardWidget = widget({
  id: 'w-news',
  title: 'AI 资讯速览',
  placement: { x: 0, y: 0, w: 5, h: 8 },
  job: {
    id: 'j-news',
    name: '抓取 AI 资讯',
    enabled: true,
    lastRunAt: Date.now() - HOUR,
    lastRunOutcome: 'succeeded',
  },
  data: {
    items: [
      { title: '某开源模型发布 128K 上下文版本', source: '社区', minutes: 12 },
      { title: '推理成本季度环比下降 40%', source: '行业报告', minutes: 48 },
      { title: '浏览器端沙箱执行的新提案进入草案', source: '标准组织', minutes: 96 },
      { title: 'Agent 评测基准新增长任务集合', source: '研究', minutes: 140 },
    ],
  },
  source: {
    css: [
      '.item { padding: 6px 0; border-bottom: 1px solid #f4f4f5; }',
      '.item:last-child { border-bottom: 0; }',
      '.title { font-size: 12px; line-height: 1.45; }',
      '.meta { margin-top: 2px; font-size: 11px; color: #71717a; }',
      '.empty { color: #a1a1aa; font-size: 12px; }',
    ].join('\n'),
    script: [
      'function render(data) {',
      '  var items = (data && data.items) || [];',
      '  if (items.length === 0) {',
      '    document.body.innerHTML = \'<p class="empty">正在获取最新 AI 资讯…</p>\';',
      '    return;',
      '  }',
      '  document.body.innerHTML = items.map(function (item) {',
      '    return \'<div class="item"><div class="title">\' + item.title +',
      '      \'</div><div class="meta">\' + item.source + " · " + item.minutes + " 分钟前</div></div>";',
      '  }).join("");',
      '}',
      'render(widget.data);',
      'widget.onData(render);',
    ].join('\n'),
  },
})

const RATES: BoardWidget = widget({
  id: 'w-rates',
  title: '汇率牌价',
  placement: { x: 5, y: 0, w: 7, h: 4 },
  job: {
    id: 'j-rates',
    name: '抓取汇率',
    enabled: true,
    lastRunAt: Date.now() - 6 * 60_000,
    lastRunOutcome: 'succeeded',
  },
  data: {
    rates: [
      { pair: 'USD/CNY', value: 7.1234, change: -0.12 },
      { pair: 'EUR/CNY', value: 7.7412, change: 0.31 },
      { pair: 'JPY/CNY', value: 0.0468, change: 0.04 },
      { pair: 'HKD/CNY', value: 0.9126, change: -0.02 },
    ],
  },
  source: {
    css: [
      'table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }',
      'th, td { padding: 4px 0; text-align: right; font-size: 12px; }',
      'th:first-child, td:first-child { text-align: left; }',
      'th { font-size: 11px; font-weight: 500; color: #71717a; border-bottom: 1px solid #f4f4f5; }',
      '.up { color: #16a34a; }',
      '.down { color: #dc2626; }',
    ].join('\n'),
    script: [
      'function render(data) {',
      '  var rates = (data && data.rates) || [];',
      '  var rows = rates.map(function (rate) {',
      '    var cls = rate.change >= 0 ? "up" : "down";',
      '    var sign = rate.change >= 0 ? "+" : "";',
      '    return "<tr><td>" + rate.pair + "</td><td>" + rate.value.toFixed(4) +',
      '      \'</td><td class="\' + cls + \'">\' + sign + rate.change.toFixed(2) + "%</td></tr>";',
      '  }).join("");',
      '  document.body.innerHTML =',
      '    "<table><thead><tr><th>货币对</th><th>中间价</th><th>日内</th></tr></thead>" +',
      '    "<tbody>" + rows + "</tbody></table>";',
      '}',
      'render(widget.data);',
      'widget.onData(render);',
    ].join('\n'),
  },
})

const TREND: BoardWidget = widget({
  id: 'w-trend',
  title: '本周专注时长',
  placement: { x: 5, y: 4, w: 7, h: 4 },
  job: null,
  data: { series: [42, 65, 51, 78, 96, 30, 12] },
  source: {
    css: [
      'canvas { width: 100%; height: calc(100% - 16px); display: block; }',
      '.legend { font-size: 11px; color: #71717a; }',
    ].join('\n'),
    script: [
      'document.body.innerHTML = \'<canvas id="c"></canvas><div class="legend" id="l"></div>\';',
      'var canvas = document.getElementById("c");',
      'var legend = document.getElementById("l");',
      'function draw(data) {',
      '  var series = (data && data.series) || [];',
      '  var ratio = window.devicePixelRatio || 1;',
      '  var w = canvas.clientWidth;',
      '  var h = canvas.clientHeight;',
      '  canvas.width = w * ratio;',
      '  canvas.height = h * ratio;',
      '  var ctx = canvas.getContext("2d");',
      '  ctx.scale(ratio, ratio);',
      '  ctx.clearRect(0, 0, w, h);',
      '  if (series.length === 0) return;',
      '  var max = Math.max.apply(null, series) || 1;',
      '  var gap = 6;',
      '  var barWidth = (w - gap * (series.length - 1)) / series.length;',
      '  ctx.fillStyle = "#71717a";',
      '  series.forEach(function (value, index) {',
      '    var barHeight = Math.max(2, (value / max) * (h - 4));',
      '    ctx.fillRect(index * (barWidth + gap), h - barHeight, barWidth, barHeight);',
      '  });',
      '  var sum = series.reduce(function (a, b) { return a + b; }, 0);',
      '  legend.textContent = "合计 " + sum + " 分钟 · 峰值 " + max + " 分钟";',
      '}',
      'draw(widget.data);',
      'widget.onData(draw);',
      'window.addEventListener("resize", function () { draw(widget.data); });',
    ].join('\n'),
  },
})

const BROKEN: BoardWidget = widget({
  id: 'w-broken',
  title: '故障演示组件',
  placement: { x: 0, y: 8, w: 4, h: 3 },
  data: null,
  job: null,
  source: {
    css: '',
    // Exercises the failure strip: the host must keep the board usable.
    script: 'throw new Error("取数作业还没跑过，组件拿不到数据");',
  },
})

export function prototypeBoards(): Board[] {
  const now = Date.now()
  return [
    {
      id: 'b-getting-started',
      name: '上手示例',
      isExample: true,
      updatedAt: now - 2 * HOUR,
      widgets: [POMODORO, CHECKLIST, GUIDE],
    },
    {
      id: 'b-daily-data',
      name: '每日数据',
      isExample: true,
      updatedAt: now - 30 * 60_000,
      widgets: [NEWS, RATES, TREND],
    },
    {
      id: 'b-mine',
      name: '我的工作台',
      isExample: false,
      updatedAt: now - 5 * 60_000,
      // Five widgets on purpose: thumbnails must draw only the first four.
      widgets: [
        { ...RATES, placement: { x: 0, y: 0, w: 6, h: 4 } },
        { ...TREND, placement: { x: 6, y: 0, w: 6, h: 4 } },
        { ...POMODORO, placement: { x: 0, y: 4, w: 4, h: 5 } },
        { ...CHECKLIST, placement: { x: 4, y: 4, w: 4, h: 5 } },
        { ...BROKEN, placement: { x: 8, y: 4, w: 4, h: 5 } },
      ],
    },
  ]
}

/** A board with no widgets, for the detail-page empty state. */
export function emptyPrototypeBoard(): Board {
  return {
    id: 'b-empty',
    name: '空看板',
    isExample: false,
    updatedAt: Date.now(),
    widgets: [],
  }
}

export const PROTOTYPE_WIDGETS = {
  POMODORO,
  CHECKLIST,
  GUIDE,
  NEWS,
  RATES,
  TREND,
  BROKEN,
}
