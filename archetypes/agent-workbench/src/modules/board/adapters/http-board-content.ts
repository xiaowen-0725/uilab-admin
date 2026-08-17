/**
 * BoardContentPort backed by sidecar GET /board/staging.
 * Browser-safe. Token stays optional; missing/401 maps to a tool error code.
 */

import type {
  BoardContentFailure,
  BoardContentOk,
  BoardContentPort,
  BoardDraftKind,
  BoardStagingDraft,
} from '../ports/board-content-port'

const NETWORK_ERROR_RE =
  /failed to fetch|load failed|networkerror|network request failed/i

export type HttpBoardContentOptions = {
  baseUrl: string
  token?: string | null
  fetchImpl?: typeof fetch
}

function isNetworkClassError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  const msg = err instanceof Error ? err.message : String(err)
  return NETWORK_ERROR_RE.test(msg)
}

function decodeHeader(value: string | null): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function authHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = { Accept: '*/*' }
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`
  return headers
}

function failureFromStatus(
  status: number,
  body: { error?: string; hint?: string } | null,
): BoardContentFailure {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: body?.error ?? 'not_authorized',
      hint: body?.hint ?? '缺少或无效的本机侧车凭据，无法拉取草稿',
    }
  }
  if (status === 404) {
    return {
      ok: false,
      error: body?.error ?? 'unknown_build',
      hint: body?.hint ?? '草稿已过期或不存在，请重新 begin / finish',
    }
  }
  if (status === 410) {
    return {
      ok: false,
      error: body?.error ?? 'build_not_ready',
      hint: body?.hint ?? '草稿已过期或已被拉取',
    }
  }
  return {
    ok: false,
    error: body?.error ?? 'runtime_unavailable',
    hint: body?.hint ?? `内容端点不可达（HTTP ${status}）`,
  }
}

async function readErrorBody(
  res: Response,
): Promise<{ error?: string; hint?: string } | null> {
  try {
    return (await res.json()) as { error?: string; hint?: string }
  } catch {
    return null
  }
}

export function createHttpBoardContent(
  options: HttpBoardContentOptions,
): BoardContentPort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const token = options.token

  return {
    async pullReady(draftId: string): Promise<BoardContentOk | BoardContentFailure> {
      const id = draftId.trim()
      if (!id) {
        return {
          ok: false,
          error: 'unknown_build',
          hint: '缺少 draftId',
        }
      }
      try {
        const res = await fetchImpl(`${baseUrl}/board/staging/${encodeURIComponent(id)}/content`, {
          method: 'GET',
          headers: authHeaders(token),
        })
        if (!res.ok) return failureFromStatus(res.status, await readErrorBody(res))
        const content = await res.text()
        const hash = res.headers.get('X-Content-Hash') ?? ''
        const bytes = Number(res.headers.get('X-Byte-Length') ?? content.length)
        const kind = (res.headers.get('X-Draft-Kind') ?? 'widget') as BoardDraftKind
        const allowed = res.headers.get('X-Allowed-Hosts')
        return {
          ok: true,
          kind: kind === 'job' ? 'job' : 'widget',
          content,
          hash,
          bytes: Number.isFinite(bytes) ? bytes : content.length,
          title: decodeHeader(res.headers.get('X-Draft-Title')),
          description: decodeHeader(res.headers.get('X-Draft-Description')) || undefined,
          allowedHosts: allowed
            ? allowed.split(',').map((host) => host.trim()).filter(Boolean)
            : undefined,
          widgetId: res.headers.get('X-Widget-Id') ?? undefined,
          jobId: res.headers.get('X-Job-Id') ?? undefined,
        }
      } catch (err) {
        if (isNetworkClassError(err)) {
          return {
            ok: false,
            error: 'runtime_unavailable',
            hint: '内容端点不可达，侧车未连接或网络错误',
          }
        }
        return {
          ok: false,
          error: 'runtime_unavailable',
          hint: err instanceof Error ? err.message : '内容端点不可达',
        }
      }
    },

    async listDrafts(): Promise<readonly BoardStagingDraft[]> {
      try {
        const res = await fetchImpl(`${baseUrl}/board/staging`, {
          method: 'GET',
          headers: { ...authHeaders(token), Accept: 'application/json' },
        })
        if (!res.ok) return []
        const body = (await res.json()) as { drafts?: BoardStagingDraft[] }
        return Array.isArray(body.drafts) ? body.drafts : []
      } catch {
        return []
      }
    },
  }
}
