/**
 * DocumentContentPort backed by VoltAgent sidecar GET /workspace/file.
 * Browser only — no Node fs. Voltagent mode product path.
 */

import type {
  DocumentBinaryReadResult,
  DocumentContentPort,
  DocumentReadFailureReason,
  DocumentTextReadResult,
} from '../ports/document-content-port'
import {
  coerceWorkspaceResourceKey,
  maxBytesForFamily,
} from '../surfaces/document/path-utils'
import { resolveDocumentFormat } from '../surfaces/document/format-router'

export type HttpWorkspaceDocumentContentOptions = {
  /** e.g. `/voltagent-runtime` or `http://127.0.0.1:3141` */
  baseUrl: string
  /** Optional fetch override (tests). */
  fetchImpl?: typeof fetch
}

export type WorkspaceInfoResponse = {
  workspaceRoot?: string
  profile?: string
  note?: string
}

/**
 * Best-effort sidecar workspace root label for Document header honesty.
 * Returns null when sidecar is down or response is incomplete (non-fatal).
 */
export async function fetchWorkspaceHint(
  baseUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<string | null> {
  const root = baseUrl.replace(/\/$/, '')
  try {
    const res = await fetchImpl(`${root}/workspace/info`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as WorkspaceInfoResponse
    const hint = typeof body.workspaceRoot === 'string' ? body.workspaceRoot.trim() : ''
    return hint || null
  } catch {
    return null
  }
}

function mapHttpReason(
  status: number,
  bodyReason?: string,
): DocumentReadFailureReason {
  if (bodyReason === 'path-escape') return 'permission-denied'
  if (bodyReason === 'too-large') return 'too-large'
  if (bodyReason === 'not-found' || bodyReason === 'is-directory')
    return 'not-found'
  if (status === 403) return 'permission-denied'
  if (status === 404) return 'not-found'
  if (status === 413) return 'too-large'
  if (status === 400) return 'not-found'
  return 'read-failed'
}

/**
 * Create HTTP DocumentContentPort for real workspace files via sidecar.
 */
export function createHttpWorkspaceDocumentContent(
  options: HttpWorkspaceDocumentContentOptions,
): DocumentContentPort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const baseUrl = options.baseUrl.replace(/\/$/, '')

  async function readRaw(
    resourceKey: string,
  ): Promise<DocumentBinaryReadResult> {
    const key = coerceWorkspaceResourceKey(resourceKey)
    if (!key) {
      return {
        ok: false,
        reason: 'not-found',
        message: '无效的工作区路径',
      }
    }

    const family = resolveDocumentFormat(key)
    const maxBytes = maxBytesForFamily(family)
    const absolute = `${baseUrl}/workspace/file?path=${encodeURIComponent(key)}&maxBytes=${maxBytes}`

    try {
      const res = await fetchImpl(absolute, {
        method: 'GET',
        headers: { Accept: '*/*' },
      })

      if (!res.ok) {
        let bodyReason: string | undefined
        let message: string | undefined
        try {
          const j = (await res.json()) as {
            reason?: string
            message?: string
          }
          bodyReason = j.reason
          message = j.message
        } catch {
          // ignore non-json error body
        }
        return {
          ok: false,
          reason: mapHttpReason(res.status, bodyReason),
          message:
            message ||
            (res.status === 0
              ? '工作区侧车未连接'
              : `读取失败（HTTP ${res.status}）`),
        }
      }

      const buf = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const mimeType = res.headers.get('Content-Type') ?? undefined
      return {
        ok: true,
        bytes,
        byteLength: bytes.byteLength,
        mimeType,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        reason: 'read-failed',
        message: msg.includes('Failed to fetch')
          ? '工作区侧车未连接或网络错误'
          : msg || '读取失败',
      }
    }
  }

  return {
    async readBinary(resourceKey: string): Promise<DocumentBinaryReadResult> {
      return readRaw(resourceKey)
    },

    async readText(resourceKey: string): Promise<DocumentTextReadResult> {
      const bin = await readRaw(resourceKey)
      if (!bin.ok) return bin
      try {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(
          bin.bytes,
        )
        return {
          ok: true,
          text,
          byteLength: bin.byteLength,
        }
      } catch {
        return {
          ok: false,
          reason: 'read-failed',
          message: '无法将文件解码为 UTF-8 文本',
        }
      }
    },
  }
}
