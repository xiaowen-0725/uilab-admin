import { describe, expect, it } from 'vitest'
import { previewText, runtimeHonestyCopy } from './runtime-honesty'

describe('runtimeHonestyCopy', () => {
  it('fake copy keeps Deterministic Fake wording', () => {
    const c = runtimeHonestyCopy('fake')
    expect(c.banner).toMatch(/Deterministic Fake Runtime/)
    expect(c.submitAccepted).toMatch(/非生产/)
    expect(c.waitingApproval).toMatch(/Fake/)
  })

  it('voltagent copy must not claim Fake', () => {
    const c = runtimeHonestyCopy('voltagent')
    expect(c.banner).toMatch(/本机 VoltAgent/)
    expect(c.banner).not.toMatch(/Fake/)
    expect(c.submitAccepted).not.toMatch(/Fake/)
    expect(c.waitingApproval).toMatch(/本机侧车/)
    expect(c.contextItems.some((i) => /VoltAgent/.test(i))).toBe(true)
  })

  it('previewText truncates with ellipsis', () => {
    expect(previewText('短')).toBe('短')
    expect(previewText('a'.repeat(50))).toBe(`${'a'.repeat(40)}…`)
  })
})
