/**
 * Browser-safe sidecar workspace-root checks. No Node / Electron imports.
 * Desktop Host uses these to adopt a live sidecar or wait after replace.
 */

import { normalizeLocalRoot } from './local-root-path'

export type SidecarStartPlan = 'adopt' | 'replace'

export function planSidecarStart(
  liveRoot: string | null,
  expectedRoot: string,
): SidecarStartPlan {
  if (!liveRoot) return 'replace'
  try {
    return normalizeLocalRoot(liveRoot) === normalizeLocalRoot(expectedRoot)
      ? 'adopt'
      : 'replace'
  } catch {
    return 'replace'
  }
}

export async function fetchSidecarWorkspaceRoot(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/workspace/info`, {
      signal,
    })
    if (!res.ok) return null
    const body = (await res.json()) as { workspaceRoot?: string }
    return typeof body.workspaceRoot === 'string' ? body.workspaceRoot : null
  } catch {
    return null
  }
}

export async function waitForSidecarWorkspaceRoot(options: {
  baseUrl: string
  expectedRoot: string
  timeoutMs?: number
  pollMs?: number
  fetchImpl?: typeof fetch
}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const pollMs = options.pollMs ?? 250
  const fetchImpl = options.fetchImpl ?? fetch
  const expected = normalizeLocalRoot(options.expectedRoot)
  const started = Date.now()

  while (true) {
    const remaining = timeoutMs - (Date.now() - started)
    if (remaining <= 0) break

    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), remaining)
    try {
      const live = await fetchSidecarWorkspaceRoot(
        options.baseUrl,
        fetchImpl,
        controller.signal,
      )
      if (planSidecarStart(live, expected) === 'adopt') return
    } finally {
      clearTimeout(abortTimer)
    }

    const leftover = timeoutMs - (Date.now() - started)
    if (leftover <= 0) break
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(pollMs, leftover))
    })
  }

  throw new Error('侧车启动超时：工作根尚未就绪')
}
