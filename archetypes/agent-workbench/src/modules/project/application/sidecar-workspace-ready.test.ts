import { describe, expect, it } from 'vitest'
import {
  planSidecarStart,
  waitForSidecarWorkspaceRoot,
} from './sidecar-workspace-ready'

describe('sidecar workspace ready', () => {
  it('adopts when the live sidecar already serves the expected root', () => {
    expect(
      planSidecarStart(
        '/Users/me/AgentWorkbench/desk',
        '/Users/me/AgentWorkbench/desk/',
      ),
    ).toBe('adopt')
  })

  it('replaces when the occupant serves a different root or is missing', () => {
    expect(
      planSidecarStart(
        '/Users/me/AgentWorkbench/old',
        '/Users/me/AgentWorkbench/desk',
      ),
    ).toBe('replace')
    expect(planSidecarStart(null, '/Users/me/AgentWorkbench/desk')).toBe(
      'replace',
    )
  })

  it('aborts a hung /workspace/info fetch when the overall timeout expires', async () => {
    await expect(
      waitForSidecarWorkspaceRoot({
        baseUrl: 'http://127.0.0.1:3141',
        expectedRoot: '/tmp/expected',
        timeoutMs: 40,
        pollMs: 5,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal
            if (!signal) return
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
      }),
    ).rejects.toThrow(/侧车启动超时：工作根尚未就绪/)
  })

  it('times out while /workspace/info stays on another root', async () => {
    await expect(
      waitForSidecarWorkspaceRoot({
        baseUrl: 'http://127.0.0.1:3141',
        expectedRoot: '/tmp/expected',
        timeoutMs: 30,
        pollMs: 5,
        fetchImpl: async () =>
          new Response(JSON.stringify({ workspaceRoot: '/tmp/occupant' }), {
            status: 200,
          }),
      }),
    ).rejects.toThrow(/侧车启动超时：工作根尚未就绪/)
  })
})
