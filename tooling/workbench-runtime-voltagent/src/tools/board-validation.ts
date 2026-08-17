/**
 * Static validators for board_widget_finish / board_job_finish (spec §5.5).
 * Errors return a code + one actionable hint — never the full source.
 */

import {
  BOARD_JOB_MAX_BYTES,
  BOARD_WIDGET_MAX_BYTES,
  boardToolError,
  type BoardToolError,
  type BoardToolErrorCode,
} from './board-types.js'

const FETCH_RE = /\bfetch\s*\(/
const XHR_RE = /\bXMLHttpRequest\b/
const WEBSOCKET_RE = /\bWebSocket\b/
const EVAL_RE = /\beval\s*\(/
const NEW_FUNCTION_RE = /\bnew\s+Function\s*\(/
const INLINE_HANDLER_RE = /\son[a-z]+\s*=/i
const EXTERNAL_SRC_HREF_RE =
  /\b(?:src|href)\s*=\s*(?:["'](?:https?:)?\/\/[^"']+|https?:\/\/|(?:https?:)?\/\/)/i
const WIDGET_READY_RE = /\bwidget\.ready\s*\(/
const WIDGET_DATA_RE = /\bwidget\.data\b/
const WIDGET_ON_DATA_RE = /\bwidget\.onDataChange\s*\(/
const SCRIPT_RE = /<script[\s>]/i
const JOB_RUN_RE = /export\s+(?:async\s+)?function\s+run\s*\(/
const IMPORT_RE = /\bimport\s*(?:[\s'"({]|$)/
const DENO_ENV_RE = /\bDeno\.env\b/
const DENO_RUN_RE = /\bDeno\.(?:run|Command|spawn)\b/
const PATH_ESCAPE_RE = /(?:\.\.[/\\]|[/\\](?:etc|Users|home|root|var)[/\\])/

const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::\d{1,5})?$/i

export type BoardValidationOk = { ok: true }

export type BoardValidationResult = BoardValidationOk | BoardToolError

type SourceRule = {
  re: RegExp
  error: BoardToolErrorCode
  hint: (line: number, excerpt: string) => string
}

function excerpt(source: string, match: RegExpMatchArray): string {
  return source.slice(match.index ?? 0, (match.index ?? 0) + 40).replace(/\s+/g, ' ')
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, Math.max(0, index)).split('\n').length
}

function rejectIfTooLarge(
  source: string,
  maxBytes: number,
  label: string,
): BoardToolError | null {
  const bytes = Buffer.byteLength(source, 'utf8')
  if (bytes <= maxBytes) return null
  return boardToolError(
    'validation_failed',
    `${label}超过体积上限 ${maxBytes} 字节（当前 ${bytes}）`,
  )
}

function firstRuleError(source: string, rules: readonly SourceRule[]): BoardToolError | null {
  for (const rule of rules) {
    const match = source.match(rule.re)
    if (!match) continue
    return boardToolError(
      rule.error,
      rule.hint(lineNumber(source, match.index ?? 0), excerpt(source, match)),
    )
  }
  return null
}

export function validateAllowedHosts(hosts: readonly string[]): BoardValidationResult {
  if (hosts.length === 0) {
    return boardToolError('validation_failed', 'allowedHosts 不能为空，请声明作业可访问的主机名')
  }
  for (const host of hosts) {
    const trimmed = host.trim()
    if (!HOST_RE.test(trimmed) || trimmed.includes('/') || trimmed.includes('*')) {
      return boardToolError(
        'validation_failed',
        `allowedHosts 含非法主机名「${trimmed.slice(0, 40)}」，只接受主机名或主机名:端口`,
      )
    }
  }
  return { ok: true }
}

function cspHint(label: string) {
  return (line: number, text: string) =>
    `第 ${line} 行禁止 ${label}（${text}）。外部数据必须走取数作业`
}

const WIDGET_RULES: readonly SourceRule[] = [
  {
    re: EXTERNAL_SRC_HREF_RE,
    error: 'csp_violation',
    hint: (line, text) =>
      `第 ${line} 行禁止外链 src/href（${text}）。小组件必须单文件自洽`,
  },
  {
    re: INLINE_HANDLER_RE,
    error: 'csp_violation',
    hint: (line, text) =>
      `第 ${line} 行禁止内联事件处理器（${text}）。请改用 addEventListener`,
  },
  { re: FETCH_RE, error: 'csp_violation', hint: cspHint('fetch(') },
  { re: XHR_RE, error: 'csp_violation', hint: cspHint('XMLHttpRequest') },
  { re: WEBSOCKET_RE, error: 'csp_violation', hint: cspHint('WebSocket') },
  { re: EVAL_RE, error: 'csp_violation', hint: cspHint('eval(') },
  { re: NEW_FUNCTION_RE, error: 'csp_violation', hint: cspHint('new Function') },
]

const JOB_RULES: readonly SourceRule[] = [
  {
    re: IMPORT_RE,
    error: 'validation_failed',
    hint: (line, text) =>
      `第 ${line} 行禁止 import（${text}）。作业必须零依赖单文件`,
  },
  {
    re: DENO_ENV_RE,
    error: 'validation_failed',
    hint: (line, text) =>
      `第 ${line} 行禁止 Deno.env（${text}）。首版作业读不到环境变量`,
  },
  {
    re: DENO_RUN_RE,
    error: 'validation_failed',
    hint: (line, text) =>
      `第 ${line} 行禁止 Deno.run / Deno.Command（${text}）`,
  },
  {
    re: PATH_ESCAPE_RE,
    error: 'validation_failed',
    hint: (line, text) =>
      `第 ${line} 行疑似写文件路径逃逸（${text}）。只能读写 ctx.runDir`,
  },
]

export function validateWidgetSource(html: string): BoardValidationResult {
  const oversized = rejectIfTooLarge(html, BOARD_WIDGET_MAX_BYTES, '小组件')
  if (oversized) return oversized
  if (!SCRIPT_RE.test(html)) {
    return boardToolError('validation_failed', 'HTML 必须包含 <script>，小组件需要一段自洽脚本')
  }
  const violation = firstRuleError(html, WIDGET_RULES)
  if (violation) return violation
  if (!WIDGET_READY_RE.test(html)) {
    return boardToolError(
      'sdk_contract_violation',
      '必须调用 widget.ready()，否则宿主无法确认内容已画完',
    )
  }
  if (!WIDGET_DATA_RE.test(html) && !WIDGET_ON_DATA_RE.test(html)) {
    return boardToolError(
      'sdk_contract_violation',
      '必须读取 widget.data 或注册 widget.onDataChange，外部数据只能经宿主桥投入',
    )
  }
  return { ok: true }
}

export function validateJobSource(code: string): BoardValidationResult {
  const oversized = rejectIfTooLarge(code, BOARD_JOB_MAX_BYTES, '作业代码')
  if (oversized) return oversized
  if (!JOB_RUN_RE.test(code)) {
    return boardToolError(
      'validation_failed',
      '作业必须 `export function run(ctx)`（或 async），顶层脚本不是入口',
    )
  }
  return firstRuleError(code, JOB_RULES) ?? { ok: true }
}
