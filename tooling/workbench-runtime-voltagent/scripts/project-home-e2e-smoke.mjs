#!/usr/bin/env node
/**
 * Spec-α E2E smoke: temp project root → sidecar WORKSPACE_ROOT → workspace/info
 * + Document file read + optional Turn write.
 *
 * Honesty: requires a real local VoltAgent sidecar (API key in
 * tooling/workbench-runtime-voltagent/.env). Does not fake a local stream.
 *
 * Usage:
 *   node tooling/workbench-runtime-voltagent/scripts/project-home-e2e-smoke.mjs
 *
 * Evidence:
 *   .scratch/issue-87-spec-alpha/evidence/
 */

import { spawn } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sidecarDir = path.resolve(here, '..')
const repoRoot = path.resolve(sidecarDir, '../..')
const evidenceDir = path.join(
  repoRoot,
  '.scratch/issue-87-spec-alpha/evidence',
)
const port = String(process.env.PROJECT_HOME_SMOKE_PORT ?? '3147')
const baseUrl = `http://127.0.0.1:${port}`

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

async function json(pathname, init) {
  const res = await fetch(`${baseUrl}${pathname}`, {
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
  return { res, body, text }
}

function hasModelKey() {
  return Boolean(
    process.env.DEEPSEEK_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
  )
}

async function loadDotenv() {
  try {
    const raw = await readFile(path.join(sidecarDir, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eq = trimmed.indexOf('=')
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // no .env
  }
}

function spawnSidecar(workspaceRoot) {
  return spawn('pnpm', ['exec', 'tsx', '--env-file-if-exists=.env', 'src/server.ts'], {
    cwd: sidecarDir,
    env: {
      ...process.env,
      WORKSPACE_ROOT: workspaceRoot,
      PORT: port,
      // Do not inherit office from sidecar .env — this smoke asserts write_file.
      AGENT_PROFILE: process.env.PROJECT_HOME_SMOKE_PROFILE || 'minimal',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function parseSseDataLine(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return data === '[DONE]' ? 'done' : null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function unwrapSseEvent(event) {
  if (!event || typeof event !== 'object') return event
  const nested = event.data
  if (nested && typeof nested === 'object' && typeof nested.type === 'string') {
    return nested
  }
  return event
}

function findWriteFileApproval(events) {
  for (const raw of events) {
    const event = unwrapSseEvent(raw)
    if (!event || typeof event !== 'object') continue
    if (
      event.type !== 'tool-approval-request' &&
      event.type !== 'approval-requested'
    ) {
      continue
    }
    const nested =
      event.toolCall && typeof event.toolCall === 'object' ? event.toolCall : null
    const toolName = nested?.toolName ?? nested?.name ?? event.toolName
    if (toolName !== 'write_file') continue
    const approvalId = event.approvalId ?? event.requestId
    if (!approvalId) continue
    return {
      approvalId,
      toolCallId: nested?.toolCallId ?? nested?.id ?? event.toolCallId ?? approvalId,
      toolName,
      input: nested?.input ?? nested?.args ?? nested?.arguments ?? event.input,
    }
  }
  return null
}

function sawWriteFileResult(events) {
  return events.some((raw) => {
    const event = unwrapSseEvent(raw)
    return (
      event &&
      event.type === 'tool-result' &&
      (event.toolName === 'write_file' ||
        event.toolCall?.toolName === 'write_file')
    )
  })
}

async function consumeSse(res, { until, timeoutMs }) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('stream has no body')
  const decoder = new TextDecoder()
  let buf = ''
  const events = []
  const deadline = Date.now() + timeoutMs
  let timedOut = false
  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const timed = Promise.race([
        reader.read(),
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ done: true, value: undefined, timedOut: true }),
            remaining,
          ),
        ),
      ])
      const { done, value, timedOut: sliceTimedOut } = await timed
      if (sliceTimedOut) {
        timedOut = true
        break
      }
      if (value) buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const parsed = parseSseDataLine(line)
        if (parsed === null || parsed === 'done') continue
        events.push(parsed)
      }
      if (until(events)) return { events, timedOut: false, aborted: true }
      if (done) break
    }
    if (buf.trim()) {
      const parsed = parseSseDataLine(buf)
      if (parsed && parsed !== 'done') events.push(parsed)
    }
    return { events, timedOut, aborted: false }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // ignore
    }
  }
}

async function postAgentStream(input, conversationId) {
  const res = await fetch(`${baseUrl}/agents/workbench/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      input,
      options: {
        memory: {
          userId: 'spec-alpha-smoke',
          conversationId,
        },
        maxSteps: 6,
      },
    }),
  })
  return res
}

async function waitHealthy(expectedRoot, timeoutMs = 20_000) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < timeoutMs) {
    try {
      const { res, body } = await json('/workspace/info')
      if (res.ok && typeof body?.workspaceRoot === 'string') {
        if (path.resolve(body.workspaceRoot) === path.resolve(expectedRoot)) {
          return body
        }
        last = `root mismatch: ${body.workspaceRoot}`
      } else {
        last = `HTTP ${res.status}`
      }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`sidecar not ready: ${last}`)
}

async function writeEvidence(payload) {
  await mkdir(evidenceDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(evidenceDir, `project-home-e2e-${stamp}.json`)
  await writeFile(file, JSON.stringify(payload, null, 2))
  return file
}

async function main() {
  console.log('Spec-α project-home E2E smoke')
  console.log('Honesty: real sidecar required; no Fake Runtime\n')

  await loadDotenv()
  if (!hasModelKey()) {
    fail(
      'S.0',
      '无模型密钥（DEEPSEEK_API_KEY / OPENAI_API_KEY），无法启动侧车。这不是桌面及格线通过。',
    )
    const evidence = await writeEvidence({
      ok: false,
      results,
      note: 'sidecar not started — missing API key',
    })
    console.error(`evidence: ${evidence}`)
    process.exit(1)
  }

  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'wb-projects-home-'))
  const projectRoot = path.join(tempHome, 'smoke-project')
  await mkdir(projectRoot, { recursive: true })
  await writeFile(
    path.join(projectRoot, 'project-created.txt'),
    'spec-alpha-open-or-create\n',
    'utf8',
  )

  const child = spawnSidecar(projectRoot)
  let sidecarLog = ''
  child.stdout?.on('data', (buf) => {
    sidecarLog += buf.toString()
  })
  child.stderr?.on('data', (buf) => {
    sidecarLog += buf.toString()
  })

  let info
  try {
    info = await waitHealthy(projectRoot)
    pass(
      'S.1',
      `sidecar up workspaceRoot=${info.workspaceRoot} profile=${info.profile ?? '?'}`,
    )
  } catch (err) {
    fail(
      'S.1',
      `无法启动或探测侧车：${err instanceof Error ? err.message : err}`,
    )
    child.kill('SIGTERM')
    const evidence = await writeEvidence({
      ok: false,
      results,
      sidecarLog: sidecarLog.slice(-4000),
      projectRoot,
    })
    console.error(`evidence: ${evidence}`)
    process.exit(1)
  }

  try {
    const { res } = await json(
      `/workspace/file?path=${encodeURIComponent('project-created.txt')}`,
    )
    if (!res.ok) {
      fail('S.2', `GET /workspace/file HTTP ${res.status}`)
    } else {
      pass('S.2', 'Document /workspace/file 读到建项标记文件')
    }
  } catch (err) {
    fail('S.2', `workspace/file: ${err instanceof Error ? err.message : err}`)
  }

  // Turn: write_file always needs HITL. Sidecar has no POST /approvals;
  // resume the same conversation with a UIMessage tool part
  // state=approval-responded (same protocol as VoltAgentRuntimeAdapter).
  const conversationId = `smoke-${Date.now()}`
  const writePrompt =
    '必须调用 write_file 在工作区根目录创建 turn-smoke.txt，内容仅为 ok，不要解释。Do not echo the filename instead of calling the tool.'
  try {
    const res = await postAgentStream(writePrompt, conversationId)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      fail('S.3', `Turn stream HTTP ${res.status} ${text.slice(0, 200)}`)
    } else {
      const first = await consumeSse(res, {
        until: (events) => Boolean(findWriteFileApproval(events)),
        timeoutMs: 90_000,
      })
      const approval = findWriteFileApproval(first.events)
      if (!approval) {
        fail(
          'S.3',
          `未见 write_file 的 tool-approval-request（events=${first.events.length} timedOut=${first.timedOut}）。不允许把 prompt 回显当成调用。`,
        )
      } else {
        const resumeRes = await postAgentStream(
          [
            {
              id: `user-${conversationId}`,
              role: 'user',
              parts: [{ type: 'text', text: writePrompt }],
            },
            {
              id: `asst-${conversationId}`,
              role: 'assistant',
              parts: [
                {
                  type: `tool-${approval.toolName}`,
                  toolCallId: approval.toolCallId,
                  toolName: approval.toolName,
                  state: 'approval-responded',
                  input: approval.input,
                  approval: { id: approval.approvalId, approved: true },
                },
              ],
            },
          ],
          conversationId,
        )
        if (!resumeRes.ok) {
          const text = await resumeRes.text().catch(() => '')
          fail(
            'S.3',
            `审批续流 HTTP ${resumeRes.status} ${text.slice(0, 200)}`,
          )
        } else {
          const second = await consumeSse(resumeRes, {
            until: (events) => sawWriteFileResult(events),
            timeoutMs: 60_000,
          })
          if (sawWriteFileResult(second.events)) {
            pass(
              'S.3',
              `write_file 已批准并收到 tool-result（approvalId=${approval.approvalId}）`,
            )
          } else {
            fail(
              'S.3',
              `已批准 write_file，但续流未见 tool-result（events=${second.events.length} timedOut=${second.timedOut}）。不伪装成功。`,
            )
          }
        }
      }
    }
  } catch (err) {
    fail('S.3', `Turn 提交失败：${err instanceof Error ? err.message : err}`)
  }

  const smokePath = path.join(projectRoot, 'turn-smoke.txt')
  let turnWritten = false
  let smokeContent = ''
  const pollUntil = Date.now() + 8_000
  while (Date.now() < pollUntil) {
    try {
      smokeContent = await readFile(smokePath, 'utf8')
      turnWritten = true
      break
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  const files = await readdir(projectRoot)
  if (turnWritten) {
    pass(
      'S.4',
      `根内可读 turn-smoke.txt（${JSON.stringify(smokeContent.slice(0, 80))}）；files=${files.join(', ')}`,
    )
  } else {
    fail(
      'S.4',
      `Turn 后根内未见可读的 turn-smoke.txt（现有文件：${files.join(', ') || '(empty)'}）。不伪装成功。`,
    )
  }

  child.kill('SIGTERM')
  const ok = results.every((r) => r.ok)
  const evidence = await writeEvidence({
    ok,
    results,
    projectRoot,
    files,
    workspaceInfo: info,
    sidecarLog: sidecarLog.slice(-4000),
  })
  console.log(`\nevidence: ${evidence}`)
  process.exit(ok ? 0 : 1)
}

main().catch(async (err) => {
  fail('S.fatal', err instanceof Error ? err.message : String(err))
  await writeEvidence({ ok: false, results, fatal: String(err) })
  process.exit(1)
})
