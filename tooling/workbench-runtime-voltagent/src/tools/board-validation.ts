/**
 * Static validators for board_widget_finish / board_job_finish (spec §5.5).
 * Errors return a code + one actionable hint — never the full source.
 */

import {
  BOARD_JOB_MAX_BYTES,
  BOARD_WIDGET_MAX_BYTES,
  boardToolError,
  type BoardToolError,
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

function snippet(source: string, match: RegExpMatchArray | null): string {
  if (!match || match.index == null) return ''
  return source.slice(match.index, match.index + 40).replace(/\s+/g, ' ')
}

function locate(source: string, index: number): { line: number } {
  const line = source.slice(0, Math.max(0, index)).split('\n').length
  return { line }
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

export function validateWidgetSource(html: string): BoardValidationResult {
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > BOARD_WIDGET_MAX_BYTES) {
    return boardToolError(
      'validation_failed',
      `小组件超过体积上限 ${BOARD_WIDGET_MAX_BYTES} 字节（当前 ${bytes}）`,
    )
  }
  if (!SCRIPT_RE.test(html)) {
    return boardToolError('validation_failed', 'HTML 必须包含 <script>，小组件需要一段自洽脚本')
  }

  const external = html.match(EXTERNAL_SRC_HREF_RE)
  if (external) {
    const { line } = locate(html, external.index ?? 0)
    return boardToolError(
      'csp_violation',
      `第 ${line} 行禁止外链 src/href（${snippet(html, external)}）。小组件必须单文件自洽`,
    )
  }
  const inline = html.match(INLINE_HANDLER_RE)
  if (inline) {
    const { line } = locate(html, inline.index ?? 0)
    return boardToolError(
      'csp_violation',
      `第 ${line} 行禁止内联事件处理器（${snippet(html, inline)}）。请改用 addEventListener`,
    )
  }

  for (const [re, label] of [
    [FETCH_RE, 'fetch('],
    [XHR_RE, 'XMLHttpRequest'],
    [WEBSOCKET_RE, 'WebSocket'],
    [EVAL_RE, 'eval('],
    [NEW_FUNCTION_RE, 'new Function'],
  ] as const) {
    const match = html.match(re)
    if (match) {
      const { line } = locate(html, match.index ?? 0)
      return boardToolError(
        'csp_violation',
        `第 ${line} 行禁止 ${label}（${snippet(html, match)}）。外部数据必须走取数作业`,
      )
    }
  }

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
  const bytes = Buffer.byteLength(code, 'utf8')
  if (bytes > BOARD_JOB_MAX_BYTES) {
    return boardToolError(
      'validation_failed',
      `作业代码超过体积上限 ${BOARD_JOB_MAX_BYTES} 字节（当前 ${bytes}）`,
    )
  }
  if (!JOB_RUN_RE.test(code)) {
    return boardToolError(
      'validation_failed',
      '作业必须 `export function run(ctx)`（或 async），顶层脚本不是入口',
    )
  }
  const imported = code.match(IMPORT_RE)
  if (imported) {
    const { line } = locate(code, imported.index ?? 0)
    return boardToolError(
      'validation_failed',
      `第 ${line} 行禁止 import（${snippet(code, imported)}）。作业必须零依赖单文件`,
    )
  }
  const env = code.match(DENO_ENV_RE)
  if (env) {
    const { line } = locate(code, env.index ?? 0)
    return boardToolError(
      'validation_failed',
      `第 ${line} 行禁止 Deno.env（${snippet(code, env)}）。首版作业读不到环境变量`,
    )
  }
  const run = code.match(DENO_RUN_RE)
  if (run) {
    const { line } = locate(code, run.index ?? 0)
    return boardToolError(
      'validation_failed',
      `第 ${line} 行禁止 Deno.run / Deno.Command（${snippet(code, run)}）`,
    )
  }
  const escape = code.match(PATH_ESCAPE_RE)
  if (escape) {
    const { line } = locate(code, escape.index ?? 0)
    return boardToolError(
      'validation_failed',
      `第 ${line} 行疑似写文件路径逃逸（${snippet(code, escape)}）。只能读写 ctx.runDir`,
    )
  }
  return { ok: true }
}
