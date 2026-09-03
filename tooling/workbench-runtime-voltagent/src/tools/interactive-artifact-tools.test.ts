import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { Hono } from 'hono'
import { defaultBoardStagingRoot } from './board-runtime.js'
import {
  createInteractiveArtifactRuntime,
  defaultInteractiveArtifactStagingRoot,
} from './interactive-artifact-runtime.js'
import {
  toInteractiveModelOutput,
  resultLooksLikeInteractiveHtmlLeak,
} from './interactive-artifact-types.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })))
})

async function runtime(now?: () => number) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ia-runtime-'))
  tempRoots.push(root)
  return createInteractiveArtifactRuntime({
    stagingRoot: path.join(root, 'interactive-artifact-staging'),
    token: 'test-sidecar-token',
    env: { UILAB_RUNTIME_DIR: path.join(root, 'runtime') },
    now,
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

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function tableHtml(label = '可筛选'): string {
  return [
    '<!doctype html><html><body>',
    `<table data-label="${label}"><thead><tr><th>名称</th></tr></thead>`,
    '<tbody><tr><td>一行</td></tr></tbody></table>',
    '<script>document.querySelector("table").dataset.ready="1"</script>',
    '</body></html>',
  ].join('')
}

async function finishDraft(
  ia: Awaited<ReturnType<typeof runtime>>,
  html = tableHtml(),
  title = '筛选表',
) {
  const begun = (await exec(ia.tools.interactive_begin, { title })) as {
    artifactId: string
    draftId: string
  }
  await exec(ia.tools.interactive_append, {
    artifactId: begun.artifactId,
    draftId: begun.draftId,
    seq: 1,
    chunk: html,
  })
  const finished = (await exec(ia.tools.interactive_finish, {
    artifactId: begun.artifactId,
    draftId: begun.draftId,
  })) as { artifactId: string; contentHash: string; bytes: number }
  return { begun, finished, html }
}

describe('interactive artifact staging root', () => {
  it('keeps a namespace apart from board staging', () => {
    const env = { UILAB_RUNTIME_DIR: '/tmp/uilab-runtime-ia' }
    const interactive = defaultInteractiveArtifactStagingRoot(env)
    const board = defaultBoardStagingRoot(env)
    assert.equal(interactive.endsWith('interactive-artifact-staging'), true)
    assert.equal(board.endsWith('board-staging'), true)
    assert.notEqual(interactive, board)
    assert.equal(interactive.includes('board-'), false)
  })
})

describe('interactive artifact append seq', () => {
  it('treats a repeated seq with the same chunk as idempotent', async () => {
    const ia = await runtime()
    const begun = (await exec(ia.tools.interactive_begin, {
      title: '筛选表',
    })) as { artifactId: string; draftId: string }
    const first = (await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 1,
      chunk: '<div>',
    })) as { received: number; nextSeq: number }
    const again = (await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 1,
      chunk: '<div>',
    })) as { received: number; nextSeq: number }
    assert.deepEqual(again, first)
    assert.equal(first.received, 1)
    assert.equal(first.nextSeq, 2)
  })

  it('rejects a repeated seq when the chunk differs', async () => {
    const ia = await runtime()
    const begun = (await exec(ia.tools.interactive_begin, { title: '表' })) as {
      artifactId: string
      draftId: string
    }
    await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 1,
      chunk: '<div>',
    })
    const conflict = (await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 1,
      chunk: '<span>',
    })) as { ok: false; error: string; hint: string }
    assert.equal(conflict.ok, false)
    assert.equal(conflict.error, 'validation_failed')
    assert.match(conflict.hint, /seq/)
  })

  it('rejects an out-of-order seq and lets the missing piece resume', async () => {
    const ia = await runtime()
    const begun = (await exec(ia.tools.interactive_begin, { title: '表' })) as {
      artifactId: string
      draftId: string
    }
    const skipped = (await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 2,
      chunk: '<tbody>',
    })) as { ok: false; error: string; hint: string }
    assert.equal(skipped.ok, false)
    assert.match(skipped.hint, /缺第 1/)

    const first = (await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 1,
      chunk: '<table>',
    })) as { received: number; nextSeq: number }
    const second = (await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 2,
      chunk: '<tbody>',
    })) as { received: number; nextSeq: number }
    assert.equal(first.nextSeq, 2)
    assert.equal(second.nextSeq, 3)
  })
})

describe('interactive artifact finish', () => {
  it('returns a hash without HTML after sequential chunks on one draft', async () => {
    const ia = await runtime()
    const html = tableHtml()
    const begun = (await exec(ia.tools.interactive_begin, {
      title: '筛选表',
    })) as { artifactId: string; draftId: string }

    const first = (await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 1,
      chunk: html.slice(0, 40),
    })) as { received: number; nextSeq: number }
    const second = (await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 2,
      chunk: html.slice(40),
    })) as { received: number; nextSeq: number }
    assert.equal(first.received, 1)
    assert.equal(first.nextSeq, 2)
    assert.equal(second.received, 2)
    assert.equal(second.nextSeq, 3)

    const finished = (await exec(ia.tools.interactive_finish, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
    })) as { artifactId: string; contentHash: string; bytes: number }
    assert.equal(finished.artifactId, begun.artifactId)
    assert.equal(finished.contentHash, hashText(html))
    assert.equal(finished.bytes, Buffer.byteLength(html, 'utf8'))
    const raw = JSON.stringify(finished)
    assert.equal(raw.includes('<html'), false)
    assert.equal(raw.includes('<!doctype'), false)
    assert.equal(Object.hasOwn(finished, 'content'), false)
    assert.equal(Object.hasOwn(finished, 'html'), false)
    assert.equal(resultLooksLikeInteractiveHtmlLeak(finished), false)
    assert.deepEqual(toInteractiveModelOutput(finished), {
      type: 'json',
      value: finished,
    })
  })

  it('keeps the same artifactId when begin is given an existing id', async () => {
    const ia = await runtime()
    const begun = (await exec(ia.tools.interactive_begin, {
      title: '清单',
      artifactId: 'ia_existing',
    })) as { artifactId: string; draftId: string }
    assert.equal(begun.artifactId, 'ia_existing')
    await exec(ia.tools.interactive_append, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
      seq: 1,
      chunk: tableHtml('清单'),
    })
    const finished = (await exec(ia.tools.interactive_finish, {
      artifactId: begun.artifactId,
      draftId: begun.draftId,
    })) as { artifactId: string }
    assert.equal(finished.artifactId, 'ia_existing')
  })
})

describe('interactive artifact content endpoint', () => {
  it('rejects a content pull without credentials', async () => {
    const ia = await runtime()
    const { begun } = await finishDraft(ia)
    const app = new Hono()
    ia.mountRoutes(app)
    const res = await app.request(`/interactive/staging/${begun.draftId}/content`)
    assert.equal(res.status, 401)
    const body = (await res.json()) as { ok: false; error: string }
    assert.equal(body.ok, false)
    assert.equal(body.error, 'not_authorized')
  })

  it('returns assembled content once, then refuses a second read', async () => {
    const ia = await runtime()
    const { begun, finished, html } = await finishDraft(ia)
    const app = new Hono()
    ia.mountRoutes(app)
    const headers = { authorization: 'Bearer test-sidecar-token' }
    const first = await app.request(
      `/interactive/staging/${begun.draftId}/content`,
      { headers },
    )
    assert.equal(first.status, 200)
    assert.equal(await first.text(), html)
    assert.equal(first.headers.get('x-content-hash'), finished.contentHash)
    assert.equal(first.headers.get('x-byte-length'), String(finished.bytes))
    assert.equal(first.headers.get('x-artifact-id'), begun.artifactId)

    const second = await app.request(
      `/interactive/staging/${begun.draftId}/content`,
      { headers },
    )
    assert.ok(second.status === 404 || second.status === 410)
    const denied = (await second.json()) as { ok: false }
    assert.equal(denied.ok, false)
    assert.equal(JSON.stringify(denied).includes('<html'), false)
  })

  it('does not serve interactive drafts on the board staging path', async () => {
    const ia = await runtime()
    const { begun } = await finishDraft(ia)
    const app = new Hono()
    ia.mountRoutes(app)
    const res = await app.request(
      `/board/staging/${begun.draftId}/content`,
      { headers: { authorization: 'Bearer test-sidecar-token' } },
    )
    assert.equal(res.status, 404)
  })
})

describe('interactive artifact tool policy', () => {
  it('registers interactive_commit as a client-side tool', async () => {
    const ia = await runtime()
    const names = ia.toolList.map((tool) => tool.name)
    assert.deepEqual(
      names.filter((name) => String(name).startsWith('interactive_')),
      [
        'interactive_begin',
        'interactive_append',
        'interactive_finish',
        'interactive_commit',
      ],
    )
    assert.equal(
      names.some((name) => String(name).startsWith('board_')),
      false,
    )
    const commit = ia.toolList.find((tool) => tool.name === 'interactive_commit')
    assert.equal(commit?.execute, undefined)
    assert.notEqual(commit?.needsApproval, true)
    assert.notEqual(ia.tools.interactive_begin.needsApproval, true)
    assert.notEqual(ia.tools.interactive_append.needsApproval, true)
    assert.notEqual(ia.tools.interactive_finish.needsApproval, true)
  })
})
