/**
 * Composition-side open validation for user/runtime channels.
 * Keeps Session free of path/URL policy; returns a command payload or reject reason.
 */

import type { SurfaceRegistry } from '../model/types'
import { normalizeBrowserUrl } from '../surfaces/browser/url-utils'
import { toWorkspaceResourceKey } from '../surfaces/document/path-utils'

export type OpenWorkSurfaceIntentInput = {
  kind?: string
  resourceKey: string
  title?: string
  source: 'user' | 'runtime'
  focus?: 'pane' | 'tab' | 'none'
}

export type OpenWorkSurfaceIntentResult =
  | {
      ok: true
      kind: string
      resourceKey: string
      title: string
      source: 'user' | 'runtime'
      focus?: 'pane' | 'tab' | 'none'
    }
  | {
      ok: false
      reason:
        | 'empty'
        | 'invalid-path'
        | 'invalid-url'
        | 'unresolved-kind'
    }

function looksLikeUrl(raw: string): boolean {
  return /^(https?:|blob:|file:)/i.test(raw)
}

/**
 * Resolve and validate open intent against Registry + path/URL rules.
 */
export function resolveOpenWorkSurfaceIntent(
  registry: SurfaceRegistry,
  input: OpenWorkSurfaceIntentInput,
): OpenWorkSurfaceIntentResult {
  const raw = (input.resourceKey ?? '').trim()
  if (!raw) return { ok: false, reason: 'empty' }

  // Explicit browser kind or URL schemes
  if (input.kind === 'browser' || looksLikeUrl(raw)) {
    const n = normalizeBrowserUrl(raw)
    if (!n.ok) return { ok: false, reason: 'invalid-url' }
    const def =
      registry.get('browser') ??
      registry.resolve({ kind: 'browser', resourceKey: n.url, url: n.url })
    if (!def) return { ok: false, reason: 'unresolved-kind' }
    let title = input.title?.trim()
    if (!title) {
      try {
        title = new URL(n.url).hostname || n.url
      } catch {
        title = n.url
      }
    }
    return {
      ok: true,
      kind: 'browser',
      resourceKey: n.url,
      title,
      source: input.source,
      focus: input.focus,
    }
  }

  // test: surface
  if (raw.startsWith('test:') || input.kind === 'test') {
    if (!registry.get('test') && input.kind === 'test') {
      return { ok: false, reason: 'unresolved-kind' }
    }
    return {
      ok: true,
      kind: 'test',
      resourceKey: raw.startsWith('test:') ? raw : `test:${raw}`,
      title: input.title?.trim() || raw,
      source: input.source,
      focus: input.focus,
    }
  }

  // Document / workspace path — policy sole entry in path-utils (segment `..` only)
  const pathKey = toWorkspaceResourceKey(raw)
  if (!pathKey) {
    return { ok: false, reason: 'invalid-path' }
  }

  // Explicit kind must be registered — never fall back (Review etc. must not open as document).
  if (input.kind) {
    if (!registry.get(input.kind)) {
      return { ok: false, reason: 'unresolved-kind' }
    }
    return {
      ok: true,
      kind: input.kind,
      resourceKey: pathKey,
      title:
        input.title?.trim() ||
        pathKey.split('/').filter(Boolean).pop() ||
        pathKey,
      source: input.source,
      focus: input.focus,
    }
  }

  const resolved = registry.resolve({
    resourceKey: pathKey,
    path: pathKey,
  })
  const finalKind = resolved?.kind ?? (registry.get('document') ? 'document' : null)
  if (!finalKind) return { ok: false, reason: 'unresolved-kind' }

  return {
    ok: true,
    kind: finalKind,
    resourceKey: pathKey,
    title:
      input.title?.trim() ||
      pathKey.split('/').filter(Boolean).pop() ||
      pathKey,
    source: input.source,
    focus: input.focus,
  }
}
