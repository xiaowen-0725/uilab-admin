import { describe, expect, it } from 'vitest'
import { previewText, runtimeHonestyCopy } from './runtime-honesty'

describe('runtimeHonestyCopy', () => {
  it('discloses local sidecar Runtime and never claims Fake', () => {
    const c = runtimeHonestyCopy()
    expect(c.banner).toMatch(/本机 VoltAgent/)
    expect(c.banner).toMatch(/非远程生产集群/)
    expect(c.banner).not.toMatch(/Fake/)
    expect(c.submitAccepted).not.toMatch(/Fake/)
    expect(c.waitingApproval).toMatch(/本机侧车/)
    expect(c.approvalApproved).toMatch(/本机侧车/)
    expect(c.approvalApproved).not.toMatch(/Fake/)
    expect(c.approvalRejected).not.toMatch(/Fake/)
    expect(c.contextItems.some((i) => /VoltAgent/.test(i))).toBe(true)
    expect(c.contextItems.some((i) => /非远程生产集群/.test(i))).toBe(true)
    for (const key of [
      'retryAccepted',
      'queueAccepted',
      'steerAccepted',
      'reconcileAccepted',
    ] as const) {
      expect(c[key]).not.toMatch(/Fake/i)
      expect(c[key]).toMatch(/本机|VoltAgent/)
    }
    expect(c.cancelRequested).toBe(c.cancelAccepted)
  })

  it('previewText truncates with ellipsis', () => {
    expect(previewText('短')).toBe('短')
    expect(previewText('a'.repeat(50))).toBe(`${'a'.repeat(40)}…`)
  })
})
