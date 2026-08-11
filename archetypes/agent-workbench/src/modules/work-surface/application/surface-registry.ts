import type {
  OpenResourceRef,
  SurfaceDefinition,
  SurfaceKind,
  SurfaceRegistry,
} from '../model/types'

/**
 * In-memory Surface Registry.
 * Only Composition Root should call register (no side-effect self-registration).
 */
export function createSurfaceRegistry(): SurfaceRegistry {
  const byKind = new Map<SurfaceKind, SurfaceDefinition>()
  /** Preserve registration order for match() resolution. */
  const order: SurfaceKind[] = []

  return {
    register(def: SurfaceDefinition): void {
      if (!def.kind) {
        throw new Error('SurfaceDefinition.kind is required')
      }
      if (!byKind.has(def.kind)) {
        order.push(def.kind)
      }
      byKind.set(def.kind, def)
    },

    get(kind: SurfaceKind): SurfaceDefinition | undefined {
      return byKind.get(kind)
    },

    list(): readonly SurfaceDefinition[] {
      return order
        .map((k) => byKind.get(k))
        .filter((d): d is SurfaceDefinition => d != null)
    },

    resolve(
      input: { kind?: SurfaceKind } & OpenResourceRef,
    ): SurfaceDefinition | undefined {
      if (input.kind) {
        return byKind.get(input.kind)
      }
      const resource: OpenResourceRef = {
        resourceKey: input.resourceKey,
        mediaType: input.mediaType,
        path: input.path,
        url: input.url,
      }
      for (const kind of order) {
        const def = byKind.get(kind)
        if (def?.match?.(resource)) return def
      }
      return undefined
    },
  }
}
