/**
 * Example widget HTML source constants (spec §9.5).
 * Each file must pass `board_widget_finish` / validateWidgetSource.
 */

const SHELL = [
  'body{padding:12px;font:13px/1.5 system-ui,sans-serif;color:var(--widget-fg,#0d0d0d);background:var(--widget-bg,#ffffff)}',
  'h1,p,ul{margin:0 0 8px}h1{font-size:14px;font-weight:600}',
  '.muted{color:var(--widget-muted)}',
  'button,input{font:inherit;color:inherit;background:var(--widget-bg);border:1px solid var(--widget-border);border-radius:6px;padding:4px 8px}',
  'button{cursor:pointer}',
  '.row{display:flex;gap:8px;align-items:center}',
  '.stat{font-size:28px;font-weight:600;letter-spacing:-0.03em}',
  'canvas{display:block;width:100%;height:96px}',
].join('')

function page(body: string, script: string): string {
  return [
    '<!doctype html><html><head></head><body>',
    `<style>${SHELL}</style>`,
    body,
    `<script>${script}</script>`,
    '</body></html>',
  ].join('')
}

export const GETTING_STARTED_RESIZE_HTML = page(
  [
    '<h1>拖一拖，拉一拉</h1>',
    '<p>按住顶部标题栏移动这块小组件，拖右下角改大小。</p>',
    '<p class="muted">这块板不是只读的，改完会留下来。</p>',
  ].join(''),
  [
    'widget.onDataChange(function () {});',
    'widget.ready();',
  ].join(''),
)

export const GETTING_STARTED_COUNTER_HTML = page(
  [
    '<h1>点击计数</h1>',
    '<p class="stat" id="value">0</p>',
    '<button type="button" id="inc">点一下</button>',
  ].join(''),
  [
    'var value = document.getElementById("value");',
    'var count = Number(widget.getInput("count")) || 0;',
    'function paint() { value.textContent = String(count); }',
    'document.getElementById("inc").addEventListener("click", function () {',
    '  count += 1;',
    '  widget.saveInput("count", count);',
    '  paint();',
    '  widget.resize();',
    '});',
    'paint();',
    'void widget.data;',
    'widget.ready();',
  ].join(''),
)

export const GETTING_STARTED_TODO_HTML = page(
  [
    '<h1>待办清单</h1>',
    '<p class="muted">用 saveInput 把草稿存在宿主，刷新也不会丢。</p>',
    '<ul id="list"></ul>',
    '<div class="row">',
    '<input id="input" maxlength="80" placeholder="下一件要做的事">',
    '<button type="button" id="add">添加</button>',
    '</div>',
  ].join(''),
  [
    'var list = document.getElementById("list");',
    'var input = document.getElementById("input");',
    'var items = Array.isArray(widget.getInput("items")) ? widget.getInput("items").slice() : [];',
    'function paint() {',
    '  list.textContent = "";',
    '  for (var i = 0; i < items.length; i += 1) {',
    '    var row = document.createElement("li");',
    '    row.textContent = items[i];',
    '    list.appendChild(row);',
    '  }',
    '}',
    'function add() {',
    '  var text = String(input.value || "").trim();',
    '  if (!text) return;',
    '  items.push(text);',
    '  input.value = "";',
    '  widget.saveInput("items", items);',
    '  paint();',
    '  widget.resize();',
    '}',
    'document.getElementById("add").addEventListener("click", add);',
    'input.addEventListener("keydown", function (event) {',
    '  if (event.key === "Enter") add();',
    '});',
    'paint();',
    'void widget.data;',
    'widget.ready();',
  ].join(''),
)

export const GETTING_STARTED_THEME_HTML = page(
  [
    '<h1>主题跟随</h1>',
    '<p id="label"></p>',
    '<p class="muted">宿主切深色时，这里用同一套 CSS 变量一起变。</p>',
  ].join(''),
  [
    'var label = document.getElementById("label");',
    'function paint(theme) {',
    '  label.textContent = theme === "dark" ? "当前是深色" : "当前是浅色";',
    '}',
    'widget.onThemeChange(paint);',
    'paint(widget.theme);',
    'void widget.data;',
    'widget.ready();',
  ].join(''),
)

export const GETTING_STARTED_GUIDE_HTML = page(
  [
    '<h1>用对话做自己的组件</h1>',
    '<p>在对话里说「做一块看板，上面有汇率和待办」。Agent 会生成小组件并落到你的看板里。</p>',
    '<p class="muted">外部数据必须走取数作业；小组件自己不能访问网络。</p>',
  ].join(''),
  [
    'widget.onDataChange(function () {});',
    'widget.ready();',
  ].join(''),
)

export const DAILY_BRIEF_CHART_HTML = page(
  [
    '<h1>本周访问</h1>',
    '<canvas id="chart" width="320" height="96"></canvas>',
    '<p class="muted" id="caption"></p>',
  ].join(''),
  [
    'function draw(data) {',
    '  var canvas = document.getElementById("chart");',
    '  var caption = document.getElementById("caption");',
    '  var points = data && Array.isArray(data.points) ? data.points : [];',
    '  caption.textContent = points.length ? "预填示例曲线，不是实时数" : "还没有数据";',
    '  var ctx = canvas.getContext("2d");',
    '  if (!ctx) return;',
    '  ctx.clearRect(0, 0, canvas.width, canvas.height);',
    '  if (points.length < 2) return;',
    '  var min = Math.min.apply(null, points);',
    '  var max = Math.max.apply(null, points);',
    '  var span = Math.max(1, max - min);',
    '  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--widget-fg");',
    '  ctx.lineWidth = 2;',
    '  ctx.beginPath();',
    '  for (var i = 0; i < points.length; i += 1) {',
    '    var x = (i / (points.length - 1)) * (canvas.width - 8) + 4;',
    '    var y = canvas.height - 8 - ((points[i] - min) / span) * (canvas.height - 16);',
    '    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);',
    '  }',
    '  ctx.stroke();',
    '}',
    'widget.onDataChange(draw);',
    'widget.ready();',
  ].join(''),
)

export const DAILY_BRIEF_STAT_HTML = page(
  [
    '<h1 id="label">计数</h1>',
    '<p class="stat" id="value">—</p>',
    '<p class="muted" id="delta"></p>',
  ].join(''),
  [
    'function paint(data) {',
    '  var row = data && typeof data === "object" ? data : {};',
    '  document.getElementById("label").textContent = row.label || "计数";',
    '  document.getElementById("value").textContent = row.value == null ? "—" : String(row.value);',
    '  document.getElementById("delta").textContent = row.delta == null ? "" : ("较昨日 +" + row.delta);',
    '}',
    'widget.onDataChange(paint);',
    'if (widget.capabilities && widget.capabilities.canSubmit) widget.submit({ painted: widget.data });',
    'widget.ready();',
  ].join(''),
)

export const DAILY_BRIEF_FORM_HTML = page(
  [
    '<h1 id="headline">今日摘要</h1>',
    '<ul id="items"></ul>',
    '<div class="row">',
    '<input id="note" maxlength="80" placeholder="记一笔给明天的自己">',
    '<button type="button" id="save">保存</button>',
    '</div>',
    '<p class="muted" id="saved"></p>',
  ].join(''),
  [
    'var items = document.getElementById("items");',
    'var note = document.getElementById("note");',
    'var saved = document.getElementById("saved");',
    'note.value = String(widget.getInput("note") || "");',
    'saved.textContent = note.value ? "已记下：" + note.value : "";',
    'function paint(data) {',
    '  var row = data && typeof data === "object" ? data : {};',
    '  document.getElementById("headline").textContent = row.headline || "今日摘要";',
    '  items.textContent = "";',
    '  var list = Array.isArray(row.items) ? row.items : [];',
    '  for (var i = 0; i < list.length; i += 1) {',
    '    var li = document.createElement("li");',
    '    li.textContent = list[i];',
    '    items.appendChild(li);',
    '  }',
    '}',
    'document.getElementById("save").addEventListener("click", function () {',
    '  var text = String(note.value || "").trim();',
    '  widget.saveInput("note", text);',
    '  saved.textContent = text ? "已记下：" + text : "";',
    '  widget.resize();',
    '});',
    'widget.onDataChange(paint);',
    'if (widget.capabilities && widget.capabilities.canSubmit) widget.submit({ painted: widget.data });',
    'widget.ready();',
  ].join(''),
)
