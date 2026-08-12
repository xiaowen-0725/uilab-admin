#!/usr/bin/env node
/**
 * Capability Surface golden path (§G) against a **real** local VoltAgent sidecar.
 *
 * Requires:
 * - Sidecar running with real model keys (DEEPSEEK_API_KEY / OPENAI_API_KEY)
 * - AGENT_PROFILE=office
 * - PLUGINS_ENABLED includes cli.feishu
 * - lark-cli on PATH (or FEISHU_CLI_PATH)
 *
 * Does **not** use Workbench Fake Runtime.
 *
 * Usage:
 *   node tooling/workbench-runtime-voltagent/scripts/capability-surface-golden-path.mjs
 *   CAPABILITY_BASE_URL=http://127.0.0.1:3141 node ...
 *
 * Optional:
 *   FEISHU_DOC_ID=...   document URL/token for native lark-cli docs smoke
 *   SKIP_STREAM=1       only snapshot/selection/auth probes
 */

import { createToolStreamObserver } from './lib/capability-stream-observer.mjs'

const baseUrl = (
  process.env.CAPABILITY_BASE_URL ??
  process.env.VOLTAGENT_BASE_URL ??
  'http://127.0.0.1:3141'
).replace(/\/$/, '')

const taskId = process.env.CAPABILITY_TASK_ID ?? `cap-golden-${Date.now()}`
const agentId = process.env.VOLTAGENT_AGENT_ID ?? 'workbench'
const docId = process.env.FEISHU_DOC_ID?.trim() || ''
const skipStream = process.env.SKIP_STREAM === '1'

/** @type {Array<{ id: string, ok: boolean, detail: string }>} */
const results = []

function pass(id, detail) {
  results.push({ id, ok: true, detail })
  console.log(`PASS  ${id}  ${detail}`)
}
function fail(id, detail) {
  results.push({ id, ok: false, detail })
  console.error(`FAIL  ${id}  ${detail}`)
}

async function json(path, init) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text.slice(0, 500) }
  }
  return { res, body }
}

async function main() {
  console.log(`Capability golden path → ${baseUrl} task=${taskId}`)
  console.log('Honesty: real sidecar + real model path (not Fake Runtime)\n')

  // G.0 health
  try {
    const { res, body } = await json('/workspace/info')
    if (!res.ok) {
      fail('G.0', `sidecar /workspace/info HTTP ${res.status}`)
    } else {
      pass(
        'G.0',
        `sidecar up profile=${body?.profile ?? '?'} workspace=${body?.workspaceRoot ?? '?'}`,
      )
    }
  } catch (err) {
    fail('G.0', `cannot reach sidecar: ${err instanceof Error ? err.message : err}`)
    summarizeAndExit()
    return
  }

  // Snapshot before selection
  {
    const { res, body } = await json(
      `/capability/snapshot?taskId=${encodeURIComponent(taskId)}`,
    )
    if (!res.ok) {
      fail('G.1', `snapshot HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
    } else {
      const feishu = body.connectors?.find((c) => c.id === 'connector.feishu')
      if (!feishu) {
        fail('G.1', 'snapshot missing connector.feishu')
      } else {
        pass(
          'G.1',
          `feishu enabled=${feishu.enabled} connected=${feishu.connected} authBoundary=${body.honesty?.authBoundary}`,
        )
        if (body.honesty?.authBoundary !== 'provider_declared') {
          fail('G.1b', 'honesty.authBoundary must be provider_declared')
        } else {
          pass('G.1b', 'cli_session honesty label present')
        }
        if (!String(body.honesty?.note ?? '').includes('不进入 Renderer')) {
          fail('G.1c', 'honesty note should deny credentials reaching Renderer')
        } else {
          pass('G.1c', 'honesty note denies credentials reaching Renderer')
        }
      }
    }
  }

  // startAuth (CLI device flow; may already be connected)
  {
    const { res, body } = await json('/capability/auth/start', {
      method: 'POST',
      body: JSON.stringify({ connectorId: 'connector.feishu', domains: ['docs'] }),
    })
    if (!res.ok && body?.error === 'cli_binary_missing') {
      fail('G.2', `lark-cli missing: ${body.message}`)
    } else if (body?.ok) {
      pass(
        'G.2',
        `startAuth phase=${body.phase} kind=${body.kind} url=${body.verificationUrl ? 'yes' : 'n/a'}`,
      )
      if (body.kind !== 'cli_session') {
        fail('G.2b', 'startAuth kind must be cli_session')
      } else {
        pass('G.2b', 'startAuth kind=cli_session')
      }
      if (JSON.stringify(body).includes('access_token')) {
        fail('G.2c', 'startAuth response must not contain access_token')
      } else {
        pass('G.2c', 'no token in startAuth response')
      }
    } else {
      fail('G.2', `startAuth failed: ${JSON.stringify(body).slice(0, 300)}`)
    }
  }

  // refresh after possible prior login
  {
    const { res, body } = await json('/capability/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ taskId, connectorId: 'connector.feishu' }),
    })
    if (!res.ok) {
      fail('G.3', `auth refresh HTTP ${res.status}`)
    } else {
      const feishu = body.snapshot?.connectors?.find((c) => c.id === 'connector.feishu')
      pass(
        'G.3',
        `refresh connected=${feishu?.connected} connectionState=${feishu?.connectionState}`,
      )
    }
  }

  // Select feishu + expert
  {
    const { res, body } = await json('/capability/selection', {
      method: 'POST',
      body: JSON.stringify({
        taskId,
        active: true,
        selection: {
          connectorIds: ['connector.feishu'],
          skillIds: [],
          expertId: 'expert.office-meeting',
        },
      }),
    })
    if (!res.ok) {
      fail('G.4', `selection HTTP ${res.status}`)
    } else {
      const snap = body.snapshot
      const feishu = snap?.connectors?.find((c) => c.id === 'connector.feishu')
      const expert = snap?.experts?.find((e) => e.id === 'expert.office-meeting')
      if (!feishu?.taskSelected || !expert?.taskSelected) {
        fail('G.4', 'taskSelected flags missing after selection')
      } else {
        pass(
          'G.4',
          `selected feishu capabilityEffective=${feishu.capabilityEffective} effectiveCommands=${(snap.effectiveCommandScopes ?? []).join(',') || '(none)'}`,
        )
      }
      if (
        feishu?.connected &&
        feishu?.capabilityEffective &&
        feishu?.effectiveCommandScopes?.includes('lark-cli')
      ) {
        pass('G.4b', 'connected+selected → native lark-cli command scope effective')
      } else if (!feishu?.connected) {
        pass('G.4b', 'not connected → command scope absent (expected until CLI login)')
      } else {
        fail('G.4b', 'connected+selected but lark-cli command scope is absent')
      }
    }
  }

  // Deselect → tools absent
  {
    const { res, body } = await json('/capability/selection', {
      method: 'POST',
      body: JSON.stringify({
        taskId,
        active: true,
        selection: {
          connectorIds: [],
          skillIds: [],
          expertId: 'expert.office-meeting',
        },
      }),
    })
    const snap = body.snapshot
    if (!res.ok) {
      fail('G.6', `deselect HTTP ${res.status}`)
    } else if ((snap?.effectiveCommandScopes ?? []).includes('lark-cli')) {
      fail('G.6', 'lark-cli command scope still effective after deselect')
    } else {
      pass('G.6', 'deselect → no lark-cli in effectiveCommandScopes')
    }
  }

  // Re-select for stream
  await json('/capability/selection', {
    method: 'POST',
    body: JSON.stringify({
      taskId,
      active: true,
      selection: {
        connectorIds: ['connector.feishu'],
        skillIds: [],
        expertId: 'expert.office-meeting',
      },
    }),
  })

  if (skipStream) {
    pass('G.5', 'SKIP_STREAM=1 — stream probe skipped')
    summarizeAndExit()
    return
  }

  // Real-model stream: native lark-cli always goes through the generic Shell.
  // Never infer a tool call from prompt/tool-schema echoes.
  const expectedToolName = 'execute_command'
  const expectedArgs = docId
    ? ['docs', '+fetch', '--doc', docId, '--doc-format', 'markdown']
    : ['skills', 'list']
  const prompt = docId
    ? `请先读取匹配的官方 lark-doc Skill，再实际调用 execute_command：command="lark-cli", args=${JSON.stringify(expectedArgs)}。若未批准或不可用，请明确说明，不要编造文档内容。`
    : `请实际调用 execute_command：command="lark-cli", args=${JSON.stringify(expectedArgs)} 列出官方 Skills；必须调用工具。`

  try {
    const res = await fetch(`${baseUrl}/agents/${encodeURIComponent(agentId)}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        input: prompt,
        options: {
          memory: {
            userId: 'capability-golden',
            conversationId: taskId,
          },
          maxSteps: 8,
        },
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      fail('G.5', `stream HTTP ${res.status}: ${t.slice(0, 200)}`)
      summarizeAndExit()
      return
    }
    const reader = res.body?.getReader()
    if (!reader) {
      fail('G.5', 'stream has no body')
      summarizeAndExit()
      return
    }
    const decoder = new TextDecoder()
    let buf = ''
    const observer = createToolStreamObserver({
      toolName: expectedToolName,
      inputMatches: (input) =>
        input?.command === 'lark-cli' &&
        JSON.stringify(input?.args ?? []) === JSON.stringify(expectedArgs),
    })
    let chunks = 0
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        chunks += 1
        observer.observeData(data)
      }
      if (observer.summary().expectedToolSucceeded) break
    }
    try {
      reader.cancel()
    } catch {
      // ignore
    }
    const observed = observer.summary()
    if (observed.expectedToolSucceeded) {
      pass(
        'G.5',
        `stream observed successful tool-result ${expectedToolName} (chunks≈${chunks})`,
      )
    } else if (observed.expectedToolApprovalRequested) {
      pass(
        'G.5',
        'model requested exact native lark-cli argv through execute_command; Host approval correctly paused execution',
      )
    } else if (observed.sawAnyToolActivity) {
      fail(
        'G.5',
        `expected successful ${expectedToolName}; observed=${observed.observedToolNames.join(',') || '(none)'} called=${observed.expectedToolCalled}`,
      )
    } else {
      fail(
        'G.5',
        `stream produced no actual tool-call/tool-result (chunks≈${chunks}). Prompt/schema echoes do not count.`,
      )
    }
  } catch (err) {
    fail('G.5', `stream error: ${err instanceof Error ? err.message : err}`)
  }

  summarizeAndExit()
}

function summarizeAndExit() {
  const failed = results.filter((r) => !r.ok)
  console.log('\n--- summary ---')
  console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`)
  if (failed.length) {
    for (const f of failed) console.log(`  - ${f.id}: ${f.detail}`)
    process.exitCode = 1
  } else {
    console.log('GOLDEN PATH PROBES OK (manual UI G.* still required for full acceptance)')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
