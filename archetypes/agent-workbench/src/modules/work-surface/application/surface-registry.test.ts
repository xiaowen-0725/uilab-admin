import { describe, expect, it } from 'vitest'
import { createSurfaceRegistry } from './surface-registry'
import type { SurfaceDefinition } from '../model/types'

function def(
  kind: string,
  match?: SurfaceDefinition['match'],
): SurfaceDefinition {
  return {
    kind,
    displayName: kind,
    match,
    render: () => null,
  }
}

describe('createSurfaceRegistry', () => {
  it('registers, gets, and lists in registration order', () => {
    const registry = createSurfaceRegistry()
    registry.register(def('browser'))
    registry.register(def('document'))
    registry.register(def('test'))

    expect(registry.get('document')?.kind).toBe('document')
    expect(registry.list().map((d) => d.kind)).toEqual([
      'browser',
      'document',
      'test',
    ])
  })

  it('re-register replaces definition but keeps order', () => {
    const registry = createSurfaceRegistry()
    registry.register(def('test'))
    registry.register({
      ...def('test'),
      displayName: '测试面·替换',
    })
    expect(registry.list()).toHaveLength(1)
    expect(registry.get('test')?.displayName).toBe('测试面·替换')
  })

  it('resolve prefers explicit kind over match', () => {
    const registry = createSurfaceRegistry()
    registry.register(
      def('document', (r) => r.resourceKey.endsWith('.md')),
    )
    registry.register(
      def('test', (r) => r.resourceKey.startsWith('test:')),
    )

    expect(
      registry.resolve({ kind: 'test', resourceKey: 'readme.md' })?.kind,
    ).toBe('test')
    expect(registry.resolve({ resourceKey: 'readme.md' })?.kind).toBe(
      'document',
    )
    expect(registry.resolve({ resourceKey: 'test:fixture' })?.kind).toBe(
      'test',
    )
  })

  it('resolve returns undefined for unknown explicit kind', () => {
    const registry = createSurfaceRegistry()
    registry.register(def('test'))
    expect(
      registry.resolve({ kind: 'ghost', resourceKey: 'x' }),
    ).toBeUndefined()
  })

  it('resolve returns undefined when no match', () => {
    const registry = createSurfaceRegistry()
    registry.register(def('test', (r) => r.resourceKey === 'only'))
    expect(registry.resolve({ resourceKey: 'other' })).toBeUndefined()
  })

  it('register rejects empty kind', () => {
    const registry = createSurfaceRegistry()
    expect(() => registry.register(def(''))).toThrow(/kind/i)
  })
})
