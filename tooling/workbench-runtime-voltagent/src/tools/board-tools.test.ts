import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { Hono } from 'hono'
import { createBoardRuntime } from './board-runtime.js'
import { BOARD_AUTO_APPROVE_TOOLS, BOARD_JOB_FINISH_TOOL } from './board-policy.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })))
})

async function runtime() {
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'board-staging-'))
  tempRoots.push(stagingRoot)
  return createBoardRuntime({
    stagingRoot,
    token: 'test-sidecar-token',
  })
}

async function exec(
  tool: { execute?: (...args: never[]) => unknown },
  input: Record<string, unknown>,
) {
  assert.equal(typeof tool.execute, 'function')
  return (tool.execute as (args: Record<string, unknown>, opts: object) => Promise<unknown>)(
    input,
    {},
  )
}

function validWidgetHtml(): string {
  return [
    '<!doctype html><html><head></head><body>',
    '<div id="root"></div>',
    '<script>',
    'widget.onDataChange(function (data) {',
    '  document.getElementById("root").textContent = data ? "ok" : "empty";',
    '});',
    'widget.ready();',
    '</script>',
    '</body></html>',
  ].join('')
}

function widgetWithFetch(): string {
  return [
    '<!doctype html><html><head></head><body>',
    '<div id="root"></div>',
    '<script>',
    'fetch("https://evil.example/data");',
    'widget.onDataChange(function () {});',
    'widget.ready();',
    '</script>',
    '</body></html>',
  ].join('')
}

function validJobCode(): string {
  return [
    'export async function run(ctx) {',
    '  const res = await fetch("https://api.example.com/rate");',
    '  return await res.json();',
    '}',
    '',
  ].join('\n')
}

describe('board widget append seq', () => {
  it('treats a repeated seq with the same chunk as idempotent', async () => {
    const board = await runtime()
    const begun = (await exec(board.tools.board_widget_begin, {
      title: '汇率',
    })) as { widgetId: string; buildId: string }
    const first = (await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: '<div>',
    })) as { received: number; nextSeq: number }
    const again = (await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: '<div>',
    })) as { received: number; nextSeq: number }
    assert.deepEqual(again, first)
    assert.equal(first.received, 1)
    assert.equal(first.nextSeq, 2)
  })

  it('rejects a repeated seq when the chunk differs', async () => {
    const board = await runtime()
    const begun = (await exec(board.tools.board_widget_begin, {
      title: '汇率',
    })) as { widgetId: string; buildId: string }
    await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: '<div>',
    })
    const conflict = (await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: '<span>',
    })) as { ok: false; error: string; hint: string }
    assert.equal(conflict.ok, false)
    assert.equal(conflict.error, 'validation_failed')
    assert.match(conflict.hint, /seq/)
  })

  it('rejects an out-of-order seq', async () => {
    const board = await runtime()
    const begun = (await exec(board.tools.board_widget_begin, {
      title: '汇率',
    })) as { widgetId: string; buildId: string }
    const skipped = (await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 2,
      chunk: 'oops',
    })) as { ok: false; error: string; hint: string }
    assert.equal(skipped.ok, false)
    assert.equal(skipped.error, 'validation_failed')
    assert.match(skipped.hint, /1/)
  })
})

describe('board widget / job finish validation', () => {
  it('rejects a widget that calls fetch( and returns an error code plus hint', async () => {
    const board = await runtime()
    const begun = (await exec(board.tools.board_widget_begin, {
      title: '坏组件',
    })) as { widgetId: string; buildId: string }
    await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: widgetWithFetch(),
    })
    const finished = (await exec(board.tools.board_widget_finish, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
    })) as { ok: false; error: string; hint: string }
    assert.equal(finished.ok, false)
    assert.ok(
      finished.error === 'csp_violation' || finished.error === 'validation_failed',
    )
    assert.match(finished.hint, /fetch/)
    assert.equal(JSON.stringify(finished).includes('fetch("https://evil'), false)
  })

  it('rejects a job that does not export function run', async () => {
    const board = await runtime()
    const widget = (await exec(board.tools.board_widget_begin, {
      title: '组件',
    })) as { widgetId: string }
    const begun = (await exec(board.tools.board_job_begin, {
      widgetId: widget.widgetId,
      title: '取汇率',
      description: '公开接口',
      allowedHosts: ['api.example.com'],
    })) as { jobId: string; buildId: string }
    await exec(board.tools.board_job_append, {
      jobId: begun.jobId,
      buildId: begun.buildId,
      seq: 1,
      chunk: 'const run = async (ctx) => ctx;\n',
    })
    const finished = (await exec(board.tools.board_job_finish, {
      jobId: begun.jobId,
      buildId: begun.buildId,
    })) as { ok: false; error: string; hint: string }
    assert.equal(finished.ok, false)
    assert.equal(finished.error, 'validation_failed')
    assert.match(finished.hint, /run/)
  })

  it('refuses a third validation failure on the same draft', async () => {
    const board = await runtime()
    const begun = (await exec(board.tools.board_widget_begin, {
      title: '坏组件',
    })) as { widgetId: string; buildId: string }
    await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: widgetWithFetch(),
    })
    const first = (await exec(board.tools.board_widget_finish, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
    })) as { ok: false; error: string }
    const second = (await exec(board.tools.board_widget_finish, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
    })) as { ok: false; error: string }
    const third = (await exec(board.tools.board_widget_finish, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
    })) as { ok: false; error: string; hint: string }
    assert.notEqual(first.error, 'repair_budget_exhausted')
    assert.notEqual(second.error, 'repair_budget_exhausted')
    assert.equal(third.error, 'repair_budget_exhausted')
    assert.match(third.hint, /停止|换方案|说明/)
  })

  it('returns finish metadata without HTML or job source', async () => {
    const board = await runtime()
    const begun = (await exec(board.tools.board_widget_begin, {
      title: '汇率',
    })) as { widgetId: string; buildId: string }
    const html = validWidgetHtml()
    await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: html,
    })
    const finished = (await exec(board.tools.board_widget_finish, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
    })) as { widgetId: string; contentHash: string; bytes: number }
    assert.equal(finished.widgetId, begun.widgetId)
    assert.equal(typeof finished.contentHash, 'string')
    assert.ok(finished.contentHash.length >= 32)
    assert.equal(finished.bytes, Buffer.byteLength(html, 'utf8'))
    const raw = JSON.stringify(finished)
    assert.equal(raw.includes('<script>'), false)
    assert.equal(raw.includes('widget.ready'), false)
    assert.equal(Object.hasOwn(finished, 'html'), false)
    assert.equal(Object.hasOwn(finished, 'code'), false)
    assert.equal(Object.hasOwn(finished, 'data'), false)
  })
})

describe('board staging content endpoint', () => {
  it('rejects a content pull without credentials', async () => {
    const board = await runtime()
    const begun = (await exec(board.tools.board_widget_begin, {
      title: '汇率',
    })) as { widgetId: string; buildId: string }
    await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: validWidgetHtml(),
    })
    await exec(board.tools.board_widget_finish, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
    })

    const app = new Hono()
    board.mountRoutes(app)
    const res = await app.request(`/board/staging/${begun.buildId}/content`)
    assert.equal(res.status, 401)
    const body = (await res.json()) as { ok: false; error: string }
    assert.equal(body.ok, false)
    assert.equal(body.error, 'not_authorized')
  })

  it('returns assembled content once, then refuses a second read', async () => {
    const board = await runtime()
    const begun = (await exec(board.tools.board_widget_begin, {
      title: '汇率',
    })) as { widgetId: string; buildId: string }
    const html = validWidgetHtml()
    await exec(board.tools.board_widget_append, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
      seq: 1,
      chunk: html,
    })
    const finished = (await exec(board.tools.board_widget_finish, {
      widgetId: begun.widgetId,
      buildId: begun.buildId,
    })) as { contentHash: string; bytes: number }

    const app = new Hono()
    board.mountRoutes(app)
    const headers = { authorization: 'Bearer test-sidecar-token' }
    const first = await app.request(`/board/staging/${begun.buildId}/content`, {
      headers,
    })
    assert.equal(first.status, 200)
    assert.equal(await first.text(), html)
    assert.equal(first.headers.get('x-content-hash'), finished.contentHash)
    assert.equal(first.headers.get('x-byte-length'), String(finished.bytes))

    const second = await app.request(`/board/staging/${begun.buildId}/content`, {
      headers,
    })
    assert.ok(second.status === 404 || second.status === 410)
  })
})

describe('board tool policy', () => {
  it('keeps board_job_finish off the auto-approve list', () => {
    assert.equal(BOARD_JOB_FINISH_TOOL, 'board_job_finish')
    assert.equal(
      (BOARD_AUTO_APPROVE_TOOLS as readonly string[]).includes('board_job_finish'),
      false,
    )
    assert.deepEqual(
      [...BOARD_AUTO_APPROVE_TOOLS].sort(),
      [
        'board_job_append',
        'board_job_begin',
        'board_widget_append',
        'board_widget_begin',
        'board_widget_finish',
      ].sort(),
    )
  })

  it('registers board_status and board_commit as client-side tools', async () => {
    const board = await runtime()
    const names = board.toolList.map((tool) => tool.name)
    assert.ok(names.includes('board_status'))
    assert.ok(names.includes('board_commit'))
    const status = board.toolList.find((tool) => tool.name === 'board_status')
    const commit = board.toolList.find((tool) => tool.name === 'board_commit')
    assert.equal(status?.execute, undefined)
    assert.equal(commit?.execute, undefined)
    assert.notEqual(status?.needsApproval, true)
    assert.notEqual(commit?.needsApproval, true)
  })

  it('marks only board_job_finish as needing approval', async () => {
    const board = await runtime()
    assert.notEqual(board.tools.board_widget_begin.needsApproval, true)
    assert.notEqual(board.tools.board_widget_append.needsApproval, true)
    assert.notEqual(board.tools.board_widget_finish.needsApproval, true)
    assert.notEqual(board.tools.board_job_begin.needsApproval, true)
    assert.notEqual(board.tools.board_job_append.needsApproval, true)
    assert.equal(board.tools.board_job_finish.needsApproval, true)
  })
})
