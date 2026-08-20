/**
 * Render-time snapshot visibility (ADR-0025 §2 / §5).
 * Mask is not a run status — it only decides whether the current identity
 * may see its snapshot slot. Preset sources are never masked or cleared.
 */

import {
  ANONYMOUS_IDENTITY_GENERATION,
  UNRESTRICTED_AUTHORIZATION,
  type IdentityScopeSnapshot,
} from '../ports/identity-scope-port'
import {
  authorizeDataSourceParameters,
  isAuthorizationRevoke,
} from './source-authorization'
import { ANONYMOUS_PRINCIPAL_KEY, type WidgetDataSourceRecord } from './types'

export const IDENTITY_NEEDS_RELOGIN = '需重新登录'
export const IDENTITY_NEEDS_LOGIN = '需登录'
export const IDENTITY_INCOMPLETE_BINDING = '待绑定资源'
export const IDENTITY_PERMISSION_REVOKED = '权限已回收'

export type WidgetIdentityChrome =
  | 'none'
  | 'needs_relogin'
  | 'needs_login'
  | 'incomplete_binding'
  | 'permission_revoked'

export interface WidgetRenderState {
  data: unknown
  chrome: WidgetIdentityChrome
  masked: boolean
}

export function anonymousIdentitySnapshot(): IdentityScopeSnapshot {
  return {
    principalKey: ANONYMOUS_PRINCIPAL_KEY,
    generation: ANONYMOUS_IDENTITY_GENERATION,
    valid: true,
    authorization: UNRESTRICTED_AUTHORIZATION,
  }
}

export function identityChromeLabel(
  chrome: WidgetIdentityChrome,
): string | null {
  switch (chrome) {
    case 'needs_login':
      return IDENTITY_NEEDS_LOGIN
    case 'needs_relogin':
      return IDENTITY_NEEDS_RELOGIN
    case 'incomplete_binding':
      return IDENTITY_INCOMPLETE_BINDING
    case 'permission_revoked':
      return IDENTITY_PERMISSION_REVOKED
    case 'none':
      return null
  }
}

export function isIdentityLockedChrome(chrome: WidgetIdentityChrome): boolean {
  return chrome !== 'none'
}

export function resolveWidgetRenderState(input: {
  latestData: unknown
  source?: WidgetDataSourceRecord | null
  identity: IdentityScopeSnapshot
}): WidgetRenderState {
  if (input.source?.kind === 'preset') {
    return visible(input.latestData)
  }
  if (
    input.source?.kind === 'query' &&
    input.identity.principalKey === ANONYMOUS_PRINCIPAL_KEY
  ) {
    return hidden('needs_login')
  }
  if (!input.identity.valid) {
    return hidden('needs_relogin')
  }
  if (input.source) {
    const authorized = authorizeDataSourceParameters(
      input.source,
      input.identity.authorization,
    )
    if (!authorized.ok) {
      if (isAuthorizationRevoke(authorized)) return hidden('permission_revoked')
      return hidden('incomplete_binding')
    }
  }
  return visible(input.latestData)
}

function hidden(chrome: WidgetIdentityChrome): WidgetRenderState {
  return { data: undefined, chrome, masked: true }
}

function visible(data: unknown): WidgetRenderState {
  return { data, chrome: 'none', masked: false }
}
