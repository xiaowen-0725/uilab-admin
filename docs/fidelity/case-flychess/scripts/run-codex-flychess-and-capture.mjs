#!/usr/bin/env node
/**
 * Drive Codex via CDP: new chat → send flychess PROMPT → poll complete → capture.
 *
 * Usage (repo root):
 *   node docs/fidelity/case-flychess/scripts/run-codex-flychess-and-capture.mjs
 *
 * Env:
 *   CODEX_CDP_URL=http://127.0.0.1:9333
 *   MAX_WAIT_MS=1200000   # 20 min default
 *   SKIP_SEND=1          # only capture current terminal state
 *   NO_NEW_CHAT=1        # send in current thread
 *   CASE_FLYCHESS_RAW_DIR=/abs/path  # raw screenshots+full probe (default: Application Support, outside git)
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  readdirSync,
  statSync,
  createWriteStream,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../../..')
const CASE_ROOT = resolve(__dirname, '..')
const CAPTURE = join(CASE_ROOT, 'capture')
/**
 * Raw CDP screenshots / full probes stay OUTSIDE the git tree by default
 * (Application Support). Repo `capture/codex` only gets sanitized metadata.
 * Override: CASE_FLYCHESS_RAW_DIR=/absolute/path
 */
const RAW_CAPTURE =
  process.env.CASE_FLYCHESS_RAW_DIR ||
  join(
    homedir(),
    'Library/Application Support/uilab-admin/codex-reference/case-flychess',
    new Date().toISOString().slice(0, 10),
  )
const PROMPT_PATH = join(CASE_ROOT, 'PROMPT.md')
const CDP = process.env.CODEX_CDP_URL || 'http://127.0.0.1:9333'
const MAX_WAIT_MS = Number(process.env.MAX_WAIT_MS || 20 * 60 * 1000)
const SKIP_SEND = process.env.SKIP_SEND === '1'
const NO_NEW_CHAT = process.env.NO_NEW_CHAT === '1'
const POLL_MS = 4000

const require = createRequire(import.meta.url)
const { chromium } = require(
  require.resolve('playwright', {
    paths: [join(REPO_ROOT, 'archetypes/agent-workbench'), REPO_ROOT],
  }),
)

function log(...a) {
  console.log(new Date().toISOString(), ...a)
}

function extractPrompt() {
  const md = readFileSync(PROMPT_PATH, 'utf8')
  const m = md.match(/```text\n([\s\S]*?)\n```/)
  if (!m) throw new Error('PROMPT.md missing ```text block')
  return m[1].trim()
}

async function getCodexPage(browser) {
  const pages = []
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) pages.push(p)
  }
  let best = null
  let bestScore = -1
  for (const p of pages) {
    const url = p.url() || ''
    if (url.startsWith('devtools:')) continue
    let s = 0
    if (url.startsWith('app://') && !url.includes('avatar')) s += 50
    try {
      const t = await p.title()
      if (/codex/i.test(t || '')) s += 20
    } catch {
      /* ignore */
    }
    if (s > bestScore) {
      bestScore = s
      best = p
    }
  }
  if (!best || bestScore < 50) throw new Error('Codex main page not found on CDP')
  return best
}

async function clickFirst(page, locators, label) {
  for (const loc of locators) {
    try {
      const n = await loc.count()
      if (n > 0) {
        await loc.first().click({ timeout: 5000 })
        log('clicked', label)
        return true
      }
    } catch {
      /* try next */
    }
  }
  return false
}

async function tryApprove(page) {
  // Only explicit permission / command approval — never HANDOFF / 回顾 / 继续工作.
  const clicked = await page.evaluate(() => {
    const allow =
      /^(允许|始终允许|批准|Approve|Allow once|Always allow|Run|运行命令|执行命令|Accept)$/i
    const allowLoose =
      /允许此|允许运行|批准命令|Approve command|Allow command|Run command|始终允许/i
    const deny =
      /HANDOFF|回顾|继续工作|新对话|归档|置顶|取消置顶|搜索|停止|Stop|拒绝|Deny|Cancel/i
    const btns = [...document.querySelectorAll('button, [role="button"]')]
    for (const b of btns) {
      const t = ((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '')).trim()
      if (!t || t.length > 64) continue
      if (deny.test(t)) continue
      if (!(allow.test(t) || allowLoose.test(t))) continue
      const r = b.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      if (r.y < 0 || r.y > window.innerHeight) continue
      b.click()
      return t.slice(0, 60)
    }
    return null
  })
  if (clicked) log('auto-approve clicked:', clicked)
  return Boolean(clicked)
}

async function pageStatus(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || ''
    // Turn toggle only — ignore sidebar history that may contain 「已处理」
    let toggle = null
    for (const el of document.querySelectorAll('button')) {
      const t = (el.innerText || '').trim()
      if (!/^已处理(\s|$)/.test(t) || t.length > 48) continue
      const r = el.getBoundingClientRect()
      // Main column roughly center; skip left nav
      if (r.x < 280 || r.width < 40) continue
      if (r.y < 0 || r.y > window.innerHeight + 2000) continue
      toggle = {
        text: t,
        ariaExpanded: el.getAttribute('aria-expanded'),
        x: Math.round(r.x),
        y: Math.round(r.y),
      }
      // prefer visible one
      if (r.y >= 0 && r.y < window.innerHeight) break
    }
    const hasThinking = /正在思考|处理中…|正在搜索|正在写入|正在读取/.test(text)
    const hasStop = [...document.querySelectorAll('button')].some((b) => {
      const t = ((b.innerText || '') + (b.getAttribute('aria-label') || '')).trim()
      if (!/^(停止|Stop|停止生成)$/i.test(t) && !/^停止/.test(t)) return false
      const r = b.getBoundingClientRect()
      return r.width > 0 && r.y > 0 && r.y < window.innerHeight
    })
    const fileMentions = [
      ...document.querySelectorAll('[data-file-reference], [data-file-reference="true"]'),
    ]
      .map((el) => (el.innerText || '').trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 20)
    const promptSent = /飞行棋调研|flychess\/index\.html|固定产出，供 UI 回放金样|禁止子智能体/.test(text)
    // Do NOT match the forbid clause in the user prompt itself.
    // Flag only action-like language (agent is actually delegating).
    const subagentSmell =
      /启动了?子智能体|已派[遣发].{0,12}(子)?智能体|spawn(ed|ing)?\s+(a\s+)?subagent|delegat(ed|ing)\s+to\s+(a\s+)?subagent|正在委派|子 agent 已|multi-agent run/i.test(
        text,
      ) && !/禁止[\s\S]{0,40}子智能体/.test(text.slice(-2000))
    // simpler: count "禁止" near subagent vs action verbs
    const actionSub =
      /(?:启动|派发|委派|spawn|delegat)\w*.{0,20}(?:子智能体|subagent)|(?:子智能体|subagent).{0,20}(?:已启动|running|完成)/i.test(
        text,
      )
    return {
      hasDone: Boolean(toggle),
      hasThinking,
      hasStop,
      toggle,
      fileMentions,
      promptSent,
      subagentSmell: actionSub,
      bodyLen: text.length,
      snippet: text.slice(-400).replace(/\s+/g, ' '),
    }
  })
}

async function sendPrompt(page, prompt) {
  // Prefer project new chat in uilab-admin / current monorepo names
  if (!NO_NEW_CHAT) {
    const started =
      (await clickFirst(
        page,
        [
          page.locator('button[aria-label="在 uilab-admin 中开始新聊天"]'),
          page.getByRole('button', { name: /在 uilab-admin 中开始新聊天/ }),
          page.getByRole('button', { name: /^新对话$/ }),
          page.locator('button[aria-label="新对话"]'),
        ],
        'new-chat-uilab-admin',
      )) || false
    if (started) {
      await page.waitForTimeout(2000)
    } else {
      log('new-chat button not found; continuing in current thread')
    }
  }

  const box = page.locator('[role="textbox"][aria-label="随心输入"], [contenteditable="true"][aria-label="随心输入"]')
  await box.first().waitFor({ state: 'visible', timeout: 15000 })
  await box.first().click()
  await page.waitForTimeout(200)

  // Clear existing content
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+A`)
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(100)

  // Fill via insertText in chunks (ProseMirror-friendly)
  // Playwright fill may not work on contenteditable; use keyboard.insertText
  const chunk = 800
  for (let i = 0; i < prompt.length; i += chunk) {
    await page.keyboard.insertText(prompt.slice(i, i + chunk))
  }
  await page.waitForTimeout(300)

  // Verify non-empty
  const typed = await box.first().innerText()
  if (!typed || typed.trim().length < 50) {
    // fallback: evaluate paste into ProseMirror
    await page.evaluate((text) => {
      const el = document.querySelector('[role="textbox"][aria-label="随心输入"]')
      if (!el) throw new Error('no textbox')
      el.focus()
      document.execCommand('selectAll')
      document.execCommand('insertText', false, text)
    }, prompt)
  }
  log('prompt length in box ~', (await box.first().innerText()).length)

  // Submit: Enter often works; also try send button near composer
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)

  // If still only composer (no stop/thinking), try Meta+Enter or click send
  let st = await pageStatus(page)
  if (!st.hasThinking && !st.hasStop && !st.hasDone) {
    log('Enter may not have submitted; trying Mod+Enter')
    await box.first().click()
    await page.keyboard.press(`${mod}+Enter`)
    await page.waitForTimeout(1000)
    st = await pageStatus(page)
  }
  if (!st.hasThinking && !st.hasStop && !st.hasDone) {
    // click bottom-right-ish buttons without text that look like send
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      const candidates = btns.filter((b) => {
        const r = b.getBoundingClientRect()
        const t = (b.innerText || '').trim()
        const aria = b.getAttribute('aria-label') || ''
        if (r.y < window.innerHeight - 120 || r.y > window.innerHeight) return false
        if (r.x < window.innerWidth * 0.5) return false
        if (/麦克风|附件|添加|设置|model|模式/i.test(t + aria)) return false
        return r.width > 20 && r.height > 20
      })
      const send = candidates.find((b) => /发送|Send|提交/i.test((b.innerText || '') + (b.getAttribute('aria-label') || '')))
        || candidates[candidates.length - 1]
      send?.click()
    })
  }
  log('submit attempted')
  // Wait briefly for agent to start
  for (let i = 0; i < 10; i++) {
    const st = await pageStatus(page)
    if (st.promptSent || st.hasThinking || st.hasStop) {
      log('agent activity detected', {
        promptSent: st.promptSent,
        hasThinking: st.hasThinking,
        hasStop: st.hasStop,
      })
      return
    }
    await page.waitForTimeout(500)
  }
  log('WARNING: no agent activity detected after submit; may need manual send')
}

async function waitComplete(page) {
  const t0 = Date.now()
  let lastLog = 0
  while (Date.now() - t0 < MAX_WAIT_MS) {
    await tryApprove(page)
    const st = await pageStatus(page)
    if (Date.now() - lastLog > 15000) {
      log('poll', {
        elapsedSec: Math.round((Date.now() - t0) / 1000),
        hasDone: st.hasDone,
        hasThinking: st.hasThinking,
        hasStop: st.hasStop,
        toggle: st.toggle,
        files: st.fileMentions.slice(0, 5),
        subagentSmell: st.subagentSmell,
        bodyLen: st.bodyLen,
      })
      lastLog = Date.now()
    }
    if (st.subagentSmell) {
      log('WARN: possible live subagent delegation language on page')
    }
    // Complete only when main-column turn toggle exists and agent is not stopping/running
    if (st.hasDone && st.toggle && !st.hasStop && !st.hasThinking) {
      if (st.toggle.ariaExpanded === 'true') {
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('button')) {
            const t = (el.innerText || '').trim()
            if (!/^已处理(\s|$)/.test(t)) continue
            if (el.getAttribute('aria-expanded') === 'true') el.click()
          }
        })
        await page.waitForTimeout(500)
      }
      // Prefer seeing flychess mentions if prompt was ours
      log('terminal state reached', st.toggle)
      return st
    }
    if (st.hasDone && st.toggle?.ariaExpanded === 'true') {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('button')) {
          const t = (el.innerText || '').trim()
          if (/^已处理(\s|$)/.test(t) && el.getAttribute('aria-expanded') === 'true') el.click()
        }
      })
    }
    await page.waitForTimeout(POLL_MS)
  }
  throw new Error(`timeout after ${MAX_WAIT_MS}ms waiting for 已处理`)
}

async function measureProbe(page) {
  return page.evaluate(() => {
    const pick = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName,
        role: el.getAttribute('role'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        text: (el.innerText || '').trim().slice(0, 120),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        fontWeight: cs.fontWeight,
        color: cs.color,
        padding: cs.padding,
        gap: cs.gap,
        borderRadius: cs.borderRadius,
      }
    }
    let turn = null
    for (const el of document.querySelectorAll('button')) {
      const t = (el.innerText || '').trim()
      if (/^已处理/.test(t) && t.length < 48) {
        turn = el
        break
      }
    }
    const fileRefs = [...document.querySelectorAll('[data-file-reference], [data-file-reference="true"]')]
      .map((el) => {
        const nodes = [el, ...el.querySelectorAll('*')]
        let paint = el
        for (const n of nodes) {
          if (!(n instanceof HTMLElement)) continue
          const c = getComputedStyle(n).color
          if (c.includes('0.511') || c.includes('0.71')) {
            paint = n
            break
          }
        }
        return pick(paint)
      })
      .filter(Boolean)
      .slice(0, 12)

    const toolsVisible = (() => {
      if (!turn) return null
      const tr = turn.getBoundingClientRect()
      let n = 0
      for (const el of document.querySelectorAll('button, div')) {
        if (!(el instanceof HTMLElement)) continue
        const r = el.getBoundingClientRect()
        if (r.y < tr.y + tr.height || r.y > tr.y + 500) continue
        const t = (el.innerText || '').trim()
        if (/^(已|正在|read|search|run|write)/i.test(t) && t.length < 80 && r.height > 10 && r.height < 40) n++
      }
      return n
    })()

    return {
      state: 'S-done-collapsed',
      source: 'codex-desktop',
      capturedAt: new Date().toISOString(),
      excludes: ['composer'],
      turnToggle: pick(turn),
      toolsExpanded: turn?.getAttribute('aria-expanded') ?? null,
      toolsHiddenWhenCollapsed:
        turn?.getAttribute('aria-expanded') === 'false' ? toolsVisible === 0 || toolsVisible === null : null,
      toolsVisibleCount: toolsVisible,
      fileReferences: fileRefs,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    }
  })
}

function sha256File(p) {
  const h = createHash('sha256')
  h.update(readFileSync(p))
  return h.digest('hex')
}

function findFlychessDirs() {
  const candidates = [
    join(REPO_ROOT, 'flychess'),
    join(CASE_ROOT, 'capture/artifacts/flychess'),
    join(process.env.HOME || '', 'develop/github/uilab-admin/flychess'),
    // common codex workspaces
    join(process.env.HOME || '', 'develop/github/zhoujw-skills/flychess'),
    join(process.env.HOME || '', 'develop/github/parking-agent/flychess'),
  ]
  // also search shallow under ~/develop/github/*/flychess
  try {
    const root = join(process.env.HOME || '', 'develop/github')
    for (const name of readdirSync(root)) {
      const p = join(root, name, 'flychess')
      if (existsSync(join(p, 'index.html'))) candidates.push(p)
    }
  } catch {
    /* ignore */
  }
  const found = []
  for (const d of candidates) {
    if (existsSync(join(d, 'index.html')) || existsSync(join(d, 'README.md'))) found.push(d)
  }
  return [...new Set(found)]
}

function sanitizeProbe(probe) {
  // Repo-safe subset only (metrics / chrome). No free-form chat body.
  return {
    state: probe?.state ?? null,
    source: probe?.source ?? 'codex-desktop',
    capturedAt: probe?.capturedAt ?? new Date().toISOString(),
    excludes: probe?.excludes ?? ['composer'],
    turnToggle: probe?.turnToggle
      ? {
          text: probe.turnToggle.text,
          w: probe.turnToggle.w,
          h: probe.turnToggle.h,
          fontSize: probe.turnToggle.fontSize,
          lineHeight: probe.turnToggle.lineHeight,
          fontWeight: probe.turnToggle.fontWeight,
          ariaExpanded: probe.turnToggle.ariaExpanded,
        }
      : null,
    toolsExpanded: probe?.toolsExpanded ?? null,
    toolsHiddenWhenCollapsed: probe?.toolsHiddenWhenCollapsed ?? null,
    toolsVisibleCount: probe?.toolsVisibleCount ?? null,
    fileReferences: Array.isArray(probe?.fileReferences)
      ? probe.fileReferences.map((f) => ({
          text: f.text,
          w: f.w,
          h: f.h,
          fontSize: f.fontSize,
        }))
      : [],
    bodyBg: probe?.bodyBg ?? null,
    viewport: probe?.viewport ?? null,
    rawCaptureDir: RAW_CAPTURE,
    note: 'Sanitized repo probe. Full-window screenshots + raw probe live under rawCaptureDir (outside git by default).',
  }
}

async function captureArtifacts(page, probe) {
  mkdirSync(join(CAPTURE, 'codex/regions'), { recursive: true })
  mkdirSync(join(CAPTURE, 'artifacts/flychess'), { recursive: true })
  mkdirSync(join(CAPTURE, 'events'), { recursive: true })
  mkdirSync(join(CAPTURE, 'notes'), { recursive: true })
  mkdirSync(join(RAW_CAPTURE, 'codex'), { recursive: true })

  // scroll turn into view
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('button')) {
      const t = (el.innerText || '').trim()
      if (/^已处理/.test(t) && t.length < 48) {
        el.scrollIntoView({ block: 'center' })
        break
      }
    }
  })
  await page.waitForTimeout(400)

  // Raw full-window screenshots + full probe stay outside the git tree.
  await page.screenshot({
    path: join(RAW_CAPTURE, 'codex/viewport.png'),
    fullPage: false,
  })
  await page.evaluate(() => window.scrollBy(0, 200))
  await page.waitForTimeout(200)
  await page.screenshot({
    path: join(RAW_CAPTURE, 'codex/viewport-scrolled.png'),
    fullPage: false,
  })
  writeFileSync(join(RAW_CAPTURE, 'codex/probe.json'), JSON.stringify(probe, null, 2) + '\n')
  log('raw CDP assets written under', RAW_CAPTURE)

  // Repo-facing probe: metrics only, no full-window bitmaps.
  writeFileSync(
    join(CAPTURE, 'codex/probe.json'),
    JSON.stringify(sanitizeProbe(probe), null, 2) + '\n',
  )

  // visible timeline: active turn / main task surface only (not whole sidebar history)
  const timeline = await page.evaluate(() => {
    const pickRoot = () => {
      const byRole = document.querySelector(
        '[data-slot="task-surface"], [data-testid="task-surface"], main, [role="main"]',
      )
      if (byRole) return byRole
      // Prefer the pane that contains the latest「已处理」toggle.
      const buttons = [...document.querySelectorAll('button')]
      const done = buttons.find((el) => {
        const t = (el.innerText || '').trim()
        return /^已处理/.test(t) && t.length < 48
      })
      if (done) {
        let n = done.parentElement
        for (let i = 0; i < 12 && n; i += 1) {
          if (n.scrollHeight > 200 && n.clientWidth > 320) return n
          n = n.parentElement
        }
      }
      return null
    }
    const root = pickRoot()
    const text = root?.innerText || ''
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    const tools = lines
      .filter((l) =>
        /搜索|读取|写入|运行|已处理|正在|web|search|read|write|flychess/i.test(l),
      )
      .slice(0, 80)
    return {
      toolishLines: tools,
      bodyLen: text.length,
      scoped: Boolean(root),
    }
  })
  writeFileSync(
    join(CAPTURE, 'events/visible-timeline.jsonl'),
    timeline.toolishLines
      .map((l, i) => JSON.stringify({ seq: i + 1, kind: 'visible_line', text: l }))
      .join('\n') + (timeline.toolishLines.length ? '\n' : ''),
  )

  // copy flychess artifacts
  const dirs = findFlychessDirs()
  log('flychess dirs found:', dirs)
  const artOut = join(CAPTURE, 'artifacts/flychess')
  const hashes = []
  // Prefer newest mtime among dirs that have both index.html + README.md
  let srcDir = null
  let bestMtime = -1
  for (const d of dirs) {
    const indexPath = join(d, 'index.html')
    const readmePath = join(d, 'README.md')
    if (!existsSync(indexPath) || !existsSync(readmePath)) continue
    try {
      const m = Math.max(statSync(indexPath).mtimeMs, statSync(readmePath).mtimeMs)
      if (m >= bestMtime) {
        bestMtime = m
        srcDir = d
      }
    } catch {
      /* ignore */
    }
  }
  if (!srcDir && dirs[0]) srcDir = dirs[0]
  if (srcDir) {
    for (const name of ['index.html', 'README.md', 'NOTES.md']) {
      const src = join(srcDir, name)
      if (!existsSync(src)) continue
      const dest = join(artOut, name)
      copyFileSync(src, dest)
      const sha = sha256File(dest)
      hashes.push({ path: `flychess/${name}`, sha256: sha, bytes: statSync(dest).size, sourceDir: srcDir })
    }
  } else {
    log('WARNING: no flychess artifacts on disk yet')
  }
  writeFileSync(
    join(CAPTURE, 'artifacts/sha256sums.txt'),
    hashes.map((h) => `${h.sha256}  ${h.path}`).join('\n') + (hashes.length ? '\n' : ''),
  )

  // Build a provisional event-stream capture (will refine later)
  const prompt = extractPrompt()
  const durationLabel = probe.turnToggle?.text?.replace(/^已处理\s*/, '') || null
  const durationMs = (() => {
    if (!durationLabel) return 0
    const m = durationLabel.match(/(?:(\d+)m)?\s*(\d+)s/)
    if (!m) return 0
    return (Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 1000
  })()
  const eventStream = {
    id: 'case-flychess-codex-replay',
    title: '飞行棋调研 + HTML + 总结（Codex 冻结回放）',
    prompt,
    notes:
      'Auto-compiled skeleton from live Codex session; tool rows may need manual densification from visible-timeline. Not live Runtime.',
    events: [
      { id: 'u1', type: 'user_message', ts: 0, text: prompt.slice(0, 500) + (prompt.length > 500 ? '…' : '') },
      { id: 's-run', type: 'turn_status', ts: 80, status: 'running', label: '正在思考' },
      ...timeline.toolishLines.slice(0, 30).flatMap((line, i) => {
        const id = `tool-vis-${i}`
        const ts = 1000 + i * 2000
        const toolKind = /搜索|search|web/i.test(line)
          ? 'web_search'
          : /读|read/i.test(line)
            ? 'read'
            : /写|write|html|README/i.test(line)
              ? 'generic'
              : /运行|command|shell|ls/i.test(line)
                ? 'command'
                : 'generic'
        return [
          {
            id,
            type: 'tool_activity',
            ts,
            toolKind,
            status: 'completed',
            label: line.slice(0, 80),
            detail: line.slice(0, 120),
          },
        ]
      }),
      {
        id: 'a1',
        type: 'assistant_message',
        ts: Math.max(durationMs - 5000, 60000),
        markdown:
          '## 交付\n\n- [flychess/index.html](wb-file:flychess/index.html:1)\n- [flychess/README.md](wb-file:flychess/README.md:1)\n\n（终稿正文以 Codex 会话与 artifacts 为准；本条为回放占位，可后补全文。）\n',
      },
      {
        id: 's-done',
        type: 'turn_status',
        ts: durationMs || 90000,
        status: 'completed',
        label: '已处理',
        durationMs: durationMs || 90000,
      },
    ],
  }
  writeFileSync(join(CAPTURE, 'events/event-stream-capture.json'), JSON.stringify(eventStream, null, 2) + '\n')

  const meta = {
    schema_version: '1.0.0',
    case_id: 'case-flychess',
    title: '飞行棋调研 + HTML + 总结',
    prompt_ref: 'docs/fidelity/case-flychess/PROMPT.md',
    captured_at: new Date().toISOString(),
    codex: { endpoint: CDP, app: 'ChatGPT.app / Codex' },
    terminal_state: 'S-done-collapsed',
    excludes: ['composer', 'navigator-business-tree'],
    stats: {
      toolRowCount: probe.toolsVisibleCount,
      fileRefCount: probe.fileReferences?.length || 0,
      fileCardCount: null,
      toolsHiddenWhenCollapsed: probe.toolsHiddenWhenCollapsed,
      durationLabel,
      durationMs,
    },
    artifacts: hashes,
    flychess_source_dir: srcDir,
    files: {
      probe: 'codex/probe.json',
      event_stream: 'events/event-stream-capture.json',
      timeline: 'events/visible-timeline.jsonl',
      sanitize: 'notes/sanitize-log.md',
      raw_capture_dir: RAW_CAPTURE,
    },
  }
  writeFileSync(join(CAPTURE, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')

  // Always record where raw CDP assets went (outside git by default).
  {
    const sanitizePath = join(CAPTURE, 'notes/sanitize-log.md')
    const stamp = new Date().toISOString()
    const note = [
      '',
      `## ${stamp} raw CDP location`,
      '',
      `- Raw screenshots + full probe: \`${RAW_CAPTURE}\` (not under git tree by default)`,
      `- Repo probe: \`capture/codex/probe.json\` (sanitized metrics only)`,
      `- Timeline extract: scoped to active task surface (not full document.body)`,
      '',
    ].join('\n')
    if (existsSync(sanitizePath)) {
      writeFileSync(sanitizePath, readFileSync(sanitizePath, 'utf8') + note)
    } else {
      writeFileSync(
        sanitizePath,
        `# Sanitize log\n\n（采集时填写：删除/改写的路径、账号、token）\n${note}`,
      )
    }
  }

  return meta
}

async function main() {
  log('CDP', CDP)
  const browser = await chromium.connectOverCDP(CDP)
  const page = await getCodexPage(browser)
  log('page', page.url())

  if (!SKIP_SEND) {
    const prompt = extractPrompt()
    log('sending prompt chars', prompt.length)
    await sendPrompt(page, prompt)
    await waitComplete(page)
  } else {
    log('SKIP_SEND: capturing current state only')
  }

  // collapse if needed
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('button')) {
      const t = (el.innerText || '').trim()
      if (/^已处理/.test(t) && el.getAttribute('aria-expanded') === 'true') el.click()
    }
  })
  await page.waitForTimeout(300)

  const probe = await measureProbe(page)
  const meta = await captureArtifacts(page, probe)
  log('capture done', {
    meta: join(CAPTURE, 'meta.json'),
    artifacts: meta.artifacts?.length || 0,
    toolsHidden: probe.toolsHiddenWhenCollapsed,
  })
  console.log(JSON.stringify({ ok: true, capture: CAPTURE, meta }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
