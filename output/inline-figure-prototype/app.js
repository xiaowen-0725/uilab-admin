const SVG_BARS = `
<svg viewBox="0 0 640 220" role="img" aria-label="上周三场充电量：陆家嘴 12840，徐家汇 9760，虹桥 15120">
  <line x1="48" y1="176" x2="608" y2="176" stroke="currentColor" stroke-opacity="0.16" />
  <rect x="88" y="64" width="112" height="112" rx="8" fill="#0cbf5b" />
  <text x="144" y="52" text-anchor="middle" fill="currentColor" font-size="13">12,840</text>
  <text x="144" y="200" text-anchor="middle" fill="currentColor" font-size="13">陆家嘴</text>
  <rect x="264" y="92" width="112" height="84" rx="8" fill="#737373" />
  <text x="320" y="80" text-anchor="middle" fill="currentColor" font-size="13">9,760</text>
  <text x="320" y="200" text-anchor="middle" fill="currentColor" font-size="13">徐家汇</text>
  <rect x="440" y="40" width="112" height="136" rx="8" fill="#dc2626" />
  <text x="496" y="28" text-anchor="middle" fill="currentColor" font-size="13">15,120</text>
  <text x="496" y="200" text-anchor="middle" fill="currentColor" font-size="13">虹桥</text>
</svg>
`;

const SVG_FLOW = `
<svg class="figure-mm" viewBox="0 0 640 168" role="img" aria-label="场站超额审批路径：申请、经理审批、执行或退回">
  <rect class="mm-node" x="16" y="56" width="128" height="56" rx="8" stroke-width="1.25" />
  <text x="80" y="90" text-anchor="middle" font-size="14">提出申请</text>
  <path class="mm-edge" d="M144 84 H200" stroke-width="1.25" />
  <polygon class="mm-head" points="200,84 190,79 190,89" />
  <rect class="mm-node" x="208" y="56" width="144" height="56" rx="8" stroke-width="1.25" />
  <text x="280" y="90" text-anchor="middle" font-size="14">经理审批</text>
  <path class="mm-edge" d="M352 84 H408" stroke-width="1.25" />
  <polygon class="mm-head" points="408,84 398,79 398,89" />
  <text x="380" y="72" text-anchor="middle" font-size="11" fill="currentColor">通过</text>
  <rect class="mm-node" x="416" y="56" width="128" height="56" rx="8" stroke-width="1.25" />
  <text x="480" y="90" text-anchor="middle" font-size="14">写入执行</text>
  <path class="mm-edge" d="M280 112 V140 H80 V112" stroke-width="1.25" />
  <polygon class="mm-head" points="80,112 75,122 85,122" />
  <text x="180" y="134" text-anchor="middle" font-size="11">退回</text>
</svg>
`;

function thread(layout) {
  const dark = document.documentElement.classList.contains("dark");
  return `
    <div class="shell">
      <aside class="rail">
        <div class="brand">工作台</div>
        <div>
          <p class="nav-label">任务</p>
          <button class="nav-item" data-current type="button">三场用量与审批路径</button>
          <button class="nav-item" type="button">新对话</button>
        </div>
      </aside>
      <div class="main">
        <header class="titlebar">
          <strong>三场用量与审批路径</strong>
          <button class="theme-toggle" type="button" data-theme>${dark ? "浅色" : "深色"}</button>
        </header>
        <div class="scroll">
          <div class="col layout-${layout}">
            <div class="user">
              <div class="bubble">把上周三场充电量画一张图，再给审批路径。超额的场站要标红。</div>
            </div>
            <button class="process" type="button">
              过程 · 4s
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M4 2.5 8 6 4 9.5" fill="none" stroke="currentColor" stroke-width="1.4" />
              </svg>
            </button>
            <div class="answer">
              <p>上周三场里虹桥用量最高，也是唯一环比为负的场。柱子颜色按你的规则：正常绿、持平灰、超额红。</p>
              <div class="figure figure-svg">${SVG_BARS}</div>
              <p>超额要走场站经理审批，通过才写入执行单。退回就回到申请。</p>
              <div class="figure">${SVG_FLOW}</div>
              <p>还有一张路径图用了 HTML 标签，消毒没过，按代码块留下：</p>
              <pre class="fence"><span class="lang">mermaid</span><code>flowchart LR
  subgraph s["&lt;b&gt;审批&lt;/b&gt;"]
    A[申请] --&gt; B[经理]
  end</code></pre>
            </div>
          </div>
        </div>
        <div class="composer">随心输入，输入 / 调用命令与技能</div>
      </div>
    </div>
  `;
}

const variants = [
  () => thread("flush"),
  () => thread("inset"),
  () => thread("framed"),
];

const stage = document.getElementById("stage");
const picker = document.querySelector(".proto-picker");
const highlight = picker.querySelector(".proto-picker-highlight");
const items = [...picker.querySelectorAll(".proto-picker-item:not(.proto-picker-replay)")];
let current = 0;

function moveHighlight() {
  const el = items[current];
  highlight.style.width = el.offsetWidth + "px";
  highlight.style.transform = `translateX(${el.offsetLeft}px)`;
}

function bindShell() {
  const button = stage.querySelector("[data-theme]");
  button?.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
    mount(current);
  });
}

function mount(i) {
  stage.innerHTML = "";
  requestAnimationFrame(() => {
    stage.innerHTML = variants[i]();
    bindShell();
  });
}

function setActive(i) {
  if (i < 0 || i >= variants.length) return;
  current = i;
  items.forEach((el, j) => {
    el.toggleAttribute("data-active", j === i);
    if (j === i) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  });
  moveHighlight();
  const url = new URL(location);
  url.searchParams.set("v", i + 1);
  history.replaceState(null, "", url);
  mount(i);
}

items.forEach((el, i) => el.addEventListener("click", () => setActive(i)));
window.addEventListener("resize", moveHighlight);

document.addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= variants.length) setActive(num - 1);
  else if (e.key === "ArrowRight") setActive((current + 1) % variants.length);
  else if (e.key === "ArrowLeft") setActive((current - 1 + variants.length) % variants.length);
});

setActive((parseInt(new URLSearchParams(location.search).get("v"), 10) || 3) - 1);
requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute("data-ready", "")));
