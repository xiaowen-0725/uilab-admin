import { describe, expect, it, vi } from 'vitest'
import { VirtualClock } from './virtual-clock'

describe('VirtualClock', () => {
  it('starts at configured epoch and formats ISO', () => {
    const clock = new VirtualClock({ startMs: 0 })
    expect(clock.now()).toBe(0)
    expect(clock.nowIso()).toBe('1970-01-01T00:00:00.000Z')
  })

  it('advance moves time and runs due jobs in order', () => {
    const clock = new VirtualClock({ startMs: 1000 })
    const order: number[] = []
    clock.schedule(50, () => order.push(1))
    clock.schedule(100, () => order.push(2))
    clock.schedule(25, () => order.push(0))

    clock.advance(30)
    expect(clock.now()).toBe(1030)
    expect(order).toEqual([0])

    clock.advance(100)
    expect(clock.now()).toBe(1130)
    expect(order).toEqual([0, 1, 2])
  })

  it('pause defers job execution until resume', () => {
    const clock = new VirtualClock()
    const fn = vi.fn()
    clock.schedule(10, fn)
    clock.pause()
    clock.advance(20)
    expect(fn).not.toHaveBeenCalled()
    expect(clock.now()).toBe(20)
    clock.resume()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush runs remaining jobs and advances to last due time', () => {
    const clock = new VirtualClock()
    const order: string[] = []
    clock.schedule(5, () => order.push('a'))
    clock.schedule(40, () => order.push('b'))
    clock.flush()
    expect(order).toEqual(['a', 'b'])
    expect(clock.now()).toBe(40)
  })

  it('flush is no-op while paused', () => {
    const clock = new VirtualClock()
    const fn = vi.fn()
    clock.schedule(10, fn)
    clock.pause()
    clock.flush()
    expect(fn).not.toHaveBeenCalled()
    expect(clock.now()).toBe(0)
  })

  it('cancel prevents scheduled job from running', () => {
    const clock = new VirtualClock()
    const fn = vi.fn()
    const handle = clock.schedule(10, fn)
    handle.cancel()
    clock.advance(20)
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects negative advance', () => {
    const clock = new VirtualClock()
    expect(() => clock.advance(-1)).toThrow(RangeError)
  })
})
