/**
 * Query contribution catalog — declarative entries from enabled manifests.
 * Handlers come only from trusted BuiltinPluginPackage registrations.
 */

import type { PluginManifest, QueryParameterDecl } from './manifest.js'
import type { BuiltinPluginPackage, QueryHandler } from './plugin-package.js'

export type QueryCatalogEntry = {
  pluginId: string
  name: string
  title: string
  parameters: Record<string, QueryParameterDecl>
  requiredPermissions: string[]
  referencableByJob: boolean
}

export function listQueryCatalog(
  manifests: readonly PluginManifest[],
  enabledIds: ReadonlySet<string>,
): QueryCatalogEntry[] {
  const entries: QueryCatalogEntry[] = []
  const seen = new Set<string>()
  for (const manifest of manifests) {
    if (!enabledIds.has(manifest.id)) continue
    for (const query of manifest.contributes?.queries ?? []) {
      if (seen.has(query.name)) continue
      seen.add(query.name)
      entries.push({
        pluginId: manifest.id,
        name: query.name,
        title: query.title,
        parameters: query.parameters,
        requiredPermissions: query.requiredPermissions,
        referencableByJob: query.referencableByJob,
      })
    }
  }
  return entries
}

export function collectQueryHandlers(
  packages: readonly BuiltinPluginPackage[],
  enabledIds: ReadonlySet<string>,
): Record<string, QueryHandler> {
  const handlers: Record<string, QueryHandler> = {}
  for (const pkg of packages) {
    const enabled = pkg.manifests.some((manifest) => enabledIds.has(manifest.id))
    if (!enabled || !pkg.queryHandlers) continue
    for (const [name, handler] of Object.entries(pkg.queryHandlers)) {
      if (handlers[name]) continue
      handlers[name] = handler
    }
  }
  return handlers
}
