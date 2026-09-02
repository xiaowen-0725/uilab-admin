/**
 * InteractiveArtifactContentPort via sidecar GET /interactive/staging.
 * Token is optional; missing or 401 maps to a tool error code.
 */

import type {
  InteractiveArtifactContentFailure,
  InteractiveArtifactContentOk,
  InteractiveArtifactContentPort,
} from '../ports/interactive-artifact-content-port'

const NETWORK_ERROR_RE =
  /failed to fetch|load failed|networkerror|network request failed/i

export type HttpInteractiveArtifactContentOptions = {
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

function failure(
  error: string,
  hint: string,
  body?: { error?: string; hint?: string } | null,
): InteractiveArtifactContentFailure {
  return {
    ok: false,
    error: body?.error ?? error,
    hint: body?.hint ?? hint,
  }
}

function failureFromStatus(
  status: number,
  body: { error?: string; hint?: string } | null,
): InteractiveArtifactContentFailure {
  if (status === 401 || status === 403) {
    return failure(
      'not_authorized',
      '缺少或无效的本机侧车凭据，无法拉取草稿',
      body,
    )
  }
  if (status === 404) {
    return failure(
      'unknown_build',
      '草稿已过期或不存在，请重新 begin / finish',
      body,
    )
  }
  if (status === 410) {
    return failure('build_not_ready', '草稿已过期或已被拉取', body)
  }
  return failure(
    'runtime_unavailable',
    `内容端点不可达（HTTP ${status}）`,
    body,
  )
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

export function createHttpInteractiveArtifactContent(
  options: HttpInteractiveArtifactContentOptions,
): InteractiveArtifactContentPort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const token = options.token

  return {
    async pullReady(
      draftId: string,
    ): Promise<InteractiveArtifactContentOk | InteractiveArtifactContentFailure> {
      const id = draftId.trim()
      if (!id) return failure('unknown_build', '缺少 draftId')
      try {
        const res = await fetchImpl(
          `${baseUrl}/interactive/staging/${encodeURIComponent(id)}/content`,
          {
            method: 'GET',
            headers: authHeaders(token),
          },
        )
        if (!res.ok) return failureFromStatus(res.status, await readErrorBody(res))
        const content = await res.text()
        const hash = res.headers.get('X-Content-Hash') ?? ''
        const bytes = Number(res.headers.get('X-Byte-Length') ?? content.length)
        return {
          ok: true,
          content,
          hash,
          bytes: Number.isFinite(bytes) ? bytes : content.length,
          title: decodeHeader(res.headers.get('X-Draft-Title')) || undefined,
        }
      } catch (err) {
        if (isNetworkClassError(err)) {
          return failure(
            'runtime_unavailable',
            '内容端点不可达，侧车未连接或网络错误',
          )
        }
        return failure(
          'runtime_unavailable',
          err instanceof Error ? err.message : '内容端点不可达',
        )
      }
    },
  }
}
