import { describe, expect, it, vi } from 'vitest'
import { readWritableRuntimeGate } from './writable-runtime-gate'

describe('readWritableRuntimeGate', () => {
  it('treats a missing waiter as writable', async () => {
    await expect(readWritableRuntimeGate()).resolves.toEqual({ ok: true })
    await expect(readWritableRuntimeGate(null)).resolves.toEqual({ ok: true })
  })

  it('returns the failed gate message and does not invent one', async () => {
    const wait = vi.fn(async () => ({
      ok: false as const,
      message: '项目工作根切换超时，请稍后重试',
    }))
    await expect(readWritableRuntimeGate(wait)).resolves.toEqual({
      ok: false,
      message: '项目工作根切换超时，请稍后重试',
    })
    expect(wait).toHaveBeenCalledTimes(1)
  })

  it('passes through a successful gate', async () => {
    await expect(
      readWritableRuntimeGate(async () => ({ ok: true })),
    ).resolves.toEqual({ ok: true })
  })
})
