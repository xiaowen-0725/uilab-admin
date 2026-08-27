import { describe, expect, it } from 'vitest'
import {
  humanizeRuntimeFailure,
  previewText,
  VOLTAGENT_RUNTIME_HONESTY_COPY,
} from './runtime-honesty'

describe('VOLTAGENT_RUNTIME_HONESTY_COPY', () => {
  it('discloses local sidecar Runtime and never claims Fake', () => {
    const c = VOLTAGENT_RUNTIME_HONESTY_COPY
    expect(c.banner).toMatch(/本机 VoltAgent/)
    expect(c.banner).toMatch(/非远程生产集群/)
    expect(c.timelineAriaLabel).toMatch(/本机 VoltAgent/)
    expect(c.banner).not.toMatch(/Fake/)
    expect(c.emptyTimeline).toMatch(/执行记录/)
    expect(c.emptyTimeline).not.toMatch(/Fake/i)
    expect(c.waitingInput).toMatch(/回答|直接回复/)
    expect(c.waitingInput).not.toMatch(/provideRunInput|Fake/i)
    expect(c.submitAccepted).not.toMatch(/Fake/)
    expect(c.cancelAccepted).toMatch(/本机 VoltAgent/)
    expect(c.cancelAccepted).toMatch(/非远程生产集群/)
    expect(c).not.toHaveProperty('cancelRequested')
    expect(c).not.toHaveProperty('contextItems')
    expect(c.waitingApproval).toMatch(/本机侧车/)
    expect(c.approvalApproved).toMatch(/本机侧车/)
    expect(c.approvalApproved).not.toMatch(/Fake/)
    expect(c.approvalRejected).not.toMatch(/Fake/)
    expect(c.retryAccepted).toMatch(/已重试本轮/)
    expect(c.retryAccepted).not.toMatch(/Turn/)
    for (const key of [
      'retryAccepted',
      'queueAccepted',
      'steerAccepted',
      'reconcileAccepted',
    ] as const) {
      expect(c[key]).not.toMatch(/Fake/i)
      expect(c[key]).toMatch(/本机|VoltAgent/)
    }
  })

  it('humanizeRuntimeFailure maps fetch failures to sidecar recovery copy', () => {
    const fetchFail = humanizeRuntimeFailure('Failed to fetch')
    expect(fetchFail.title).toBe('无法连接本机运行时')
    expect(fetchFail.body).toMatch(/localhost:3141/)
    expect(fetchFail.body).not.toMatch(/Failed to fetch/)
    expect(fetchFail.raw).toBe('Failed to fetch')

    const generic = humanizeRuntimeFailure('运行失败')
    expect(generic.title).toBe('这一轮没完成')
    expect(generic.body).toMatch(/重试/)

    const chinese = humanizeRuntimeFailure('模型额度已用尽')
    expect(chinese.title).toBe('这一轮没完成')
    expect(chinese.body).toBe('模型额度已用尽')

    const proxyDown = humanizeRuntimeFailure('侧车 HTTP 502: Bad Gateway')
    expect(proxyDown.title).toBe('无法连接本机运行时')
    expect(proxyDown.body).toMatch(/localhost:3141/)
    expect(proxyDown.body).not.toMatch(/502|Bad Gateway|侧车 HTTP/)
    expect(proxyDown.raw).toBe('侧车 HTTP 502: Bad Gateway')

    const sidecarHttp = humanizeRuntimeFailure('侧车 HTTP 500: Internal Server Error')
    expect(sidecarHttp.title).toBe('这一轮没完成')
    expect(sidecarHttp.body).toMatch(/重试/)
    expect(sidecarHttp.body).not.toMatch(/500|Internal Server Error|侧车 HTTP/)
    expect(sidecarHttp.raw).toBe('侧车 HTTP 500: Internal Server Error')
  })

  it('previewText truncates with ellipsis', () => {
    expect(previewText('短')).toBe('短')
    expect(previewText('a'.repeat(50))).toBe(`${'a'.repeat(40)}…`)
  })
})
