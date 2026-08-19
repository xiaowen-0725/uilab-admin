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
import { authorizeDataSourceParameters } from './source-authorization'
import { ANONYMOUS_PRINCIPAL_KEY, type WidgetDataSourceRecord } from './types'

export const IDENTITY_NEEDS_RELOGIN = '需重新登录'

export type WidgetIdentityChrome = 'none' | 'needs_relogin'

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

export function resolveWidgetRenderState(input: {
  latestData: unknown
  source?: WidgetDataSourceRecord | null
  identity: IdentityScopeSnapshot
}): WidgetRenderState {
  if (input.source?.kind === 'preset') {
    return { data: input.latestData, chrome: 'none', masked: false }
  }
  if (!input.identity.valid) {
    return {
      data: undefined,
      chrome: 'needs_relogin',
      masked: true,
    }
  }
  if (
    input.source &&
    !authorizeDataSourceParameters(input.source, input.identity.authorization).ok
  ) {
    return { data: undefined, chrome: 'none', masked: true }
  }
  return { data: input.latestData, chrome: 'none', masked: false }
}
