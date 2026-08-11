/**
 * Canonical Provider tool identity ↔ model-visible public tool name.
 * Namespacing is reversible metadata, never a replacement for originalName.
 */

export type ToolChannel = 'mcp' | 'domain_cli'

export type ToolCanonicalIdentity = {
  pluginId: string
  channel: ToolChannel
  channelId: string
  originalName: string
}

export type RegisteredToolIdentity = {
  publicName: string
  canonical: ToolCanonicalIdentity
}

export type ToolIdentityRegistry = {
  register(
    canonical: ToolCanonicalIdentity,
    options?: { preferredPublicName?: string },
  ): RegisteredToolIdentity
  resolve(publicName: string): RegisteredToolIdentity | undefined
  list(): RegisteredToolIdentity[]
}

const MODEL_TOOL_NAME = /^[a-zA-Z0-9_-]+$/

function normalizeSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_')
  return normalized || 'tool'
}

function canonicalKey(identity: ToolCanonicalIdentity): string {
  return [
    identity.pluginId,
    identity.channel,
    identity.channelId,
    identity.originalName,
  ].join('\u0000')
}

export function createToolIdentityRegistry(): ToolIdentityRegistry {
  const byPublicName = new Map<string, RegisteredToolIdentity>()
  const byCanonical = new Map<string, RegisteredToolIdentity>()

  return {
    register(canonical, options) {
      const key = canonicalKey(canonical)
      const existing = byCanonical.get(key)
      if (existing) return existing

      const requested = options?.preferredPublicName ?? canonical.originalName
      const normalizedOriginal = MODEL_TOOL_NAME.test(requested)
        ? requested
        : normalizeSegment(requested)
      const candidates = [
        normalizedOriginal,
        `${normalizeSegment(canonical.channelId)}__${normalizedOriginal}`,
        `${normalizeSegment(canonical.pluginId)}__${normalizeSegment(canonical.channelId)}__${normalizedOriginal}`,
      ]

      let publicName = candidates.find((candidate) => !byPublicName.has(candidate))
      if (!publicName) {
        const base = candidates[candidates.length - 1]!
        let suffix = 2
        while (byPublicName.has(`${base}__${suffix}`)) suffix += 1
        publicName = `${base}__${suffix}`
      }

      const registered: RegisteredToolIdentity = {
        publicName,
        canonical: { ...canonical },
      }
      byPublicName.set(publicName, registered)
      byCanonical.set(key, registered)
      return registered
    },
    resolve(publicName) {
      return byPublicName.get(publicName)
    },
    list() {
      return [...byPublicName.values()]
    },
  }
}
