/**
 * Gate ② — resource membership + requiredPermissions (ADR-0024 §2, ADR-0025 §5).
 * Preset sources always pass so example / prefilled data is never cleared.
 */

import type {
  IdentityAuthorization,
  AuthorizedResource,
} from '../ports/identity-scope-port'
import type { WidgetDataSourceRecord } from './types'

export type SourceAuthorizationDenial =
  | 'missing_required_permissions'
  | 'resource_not_authorized'
  | 'permission_denied'
  | 'invalid_resource_parameter'

export type SourceAuthorizationResult =
  | { ok: true }
  | { ok: false; reason: SourceAuthorizationDenial }

export function authorizeDataSourceParameters(
  source: WidgetDataSourceRecord,
  authorization: IdentityAuthorization,
): SourceAuthorizationResult {
  if (source.kind === 'preset') return { ok: true }
  if (authorization.kind === 'unrestricted') return { ok: true }

  if (source.kind === 'query' && !hasRequiredPermissions(source)) {
    return { ok: false, reason: 'missing_required_permissions' }
  }

  const schema = source.parameterSchema ?? {}
  const required = source.requiredPermissions ?? []

  for (const [key, decl] of Object.entries(schema)) {
    if (decl.type !== 'resource') continue
    const ids = resourceIdsFromParameter(source.parameters?.[key])
    if (!ids) return { ok: false, reason: 'invalid_resource_parameter' }
    for (const id of ids) {
      const resource = findResource(authorization.resources, decl.resourceType, id)
      if (!resource) return { ok: false, reason: 'resource_not_authorized' }
      if (!permissionsCover(resource.permissions, required)) {
        return { ok: false, reason: 'permission_denied' }
      }
    }
  }

  return { ok: true }
}

function hasRequiredPermissions(source: WidgetDataSourceRecord): boolean {
  return (source.requiredPermissions?.length ?? 0) > 0
}

function findResource(
  resources: readonly AuthorizedResource[],
  type: string,
  id: string,
): AuthorizedResource | undefined {
  return resources.find((resource) => resource.type === type && resource.id === id)
}

function permissionsCover(
  have: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0) return true
  const owned = new Set(have)
  return required.every((permission) => owned.has(permission))
}

function resourceIdsFromParameter(value: unknown): string[] | null {
  if (value === undefined) return []
  if (typeof value === 'string') {
    const id = value.trim()
    return id ? [id] : null
  }
  if (Array.isArray(value)) {
    const ids: string[] = []
    for (const item of value) {
      if (typeof item !== 'string' || !item.trim()) return null
      ids.push(item.trim())
    }
    return ids
  }
  return null
}
