/**
 * Read-only workspace file API for Workbench Document Surface (HTTP).
 * Reuses path containment helpers — no model / no tool call.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  resolveExistingPathWithinRoot,
  resolvePathWithinRoot,
} from './workspace-root.js'

export type WorkspaceFileReadFailure =
  | 'empty-path'
  | 'not-found'
  | 'path-escape'
  | 'too-large'
  | 'is-directory'
  | 'read-failed'

export type WorkspaceFileReadResult =
  | {
      ok: true
      bytes: Buffer
      byteLength: number
      /** Relative path under workspace root (posix-ish) */
      relativePath: string
    }
  | {
      ok: false
      reason: WorkspaceFileReadFailure
      message: string
    }

/**
 * Normalize client path to a path safe for resolvePathWithinRoot.
 * - strips leading `/` (virtual workspace root style)
 * - if absolute path is under root, rewrites to relative
 */
export function normalizeClientWorkspacePath(
  root: string,
  inputPath: string,
): string | null {
  const raw = (inputPath ?? '').trim()
  if (!raw) return null

  const rootAbs = path.resolve(root)
  // Host absolute path inside workspace → relative under root
  if (path.isAbsolute(raw)) {
    const abs = path.resolve(raw)
    const rel = path.relative(rootAbs, abs)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return rel.split(path.sep).join('/') || '.'
    }
    // POSIX absolute outside root: treat as VoltAgent *virtual* path
    // (`/output/x` → `output/x`), not host `/output/x`.
    return raw.replace(/^\/+/, '')
  }

  return raw.replace(/^\/+/, '')
}

/**
 * Read file bytes under workspace root with size limit and containment.
 */
export async function readWorkspaceFile(
  root: string,
  inputPath: string,
  options?: { maxBytes?: number },
): Promise<WorkspaceFileReadResult> {
  const maxBytes = options?.maxBytes ?? 25 * 1024 * 1024
  const normalized = normalizeClientWorkspacePath(root, inputPath)
  if (!normalized || normalized === '.') {
    return {
      ok: false,
      reason: 'empty-path',
      message: '缺少 path 参数',
    }
  }

  let abs: string
  try {
    // Lexical check first for clear escape errors
    resolvePathWithinRoot(root, normalized)
    abs = await resolveExistingPathWithinRoot(root, normalized)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/路径越界/.test(msg)) {
      return { ok: false, reason: 'path-escape', message: msg }
    }
    return {
      ok: false,
      reason: 'not-found',
      message: msg || '文件不存在',
    }
  }

  try {
    const st = await stat(abs)
    if (st.isDirectory()) {
      return {
        ok: false,
        reason: 'is-directory',
        message: '目标是目录，不是文件',
      }
    }
    if (st.size > maxBytes) {
      return {
        ok: false,
        reason: 'too-large',
        message: `文件过大（${st.size} 字节，上限 ${maxBytes}）`,
      }
    }
    const bytes = await readFile(abs)
    const rootAbs = path.resolve(root)
    let relativePath = path.relative(rootAbs, abs).split(path.sep).join('/')
    if (!relativePath || relativePath.startsWith('..')) {
      relativePath = normalized.replace(/^\/+/, '')
    }
    return {
      ok: true,
      bytes,
      byteLength: bytes.byteLength,
      relativePath,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { ok: false, reason: 'not-found', message: '文件不存在' }
    }
    return {
      ok: false,
      reason: 'read-failed',
      message: msg || '读取失败',
    }
  }
}

export function httpStatusForWorkspaceRead(
  reason: WorkspaceFileReadFailure,
): number {
  switch (reason) {
    case 'empty-path':
      return 400
    case 'not-found':
    case 'is-directory':
      return 404
    case 'path-escape':
      return 403
    case 'too-large':
      return 413
    case 'read-failed':
    default:
      return 500
  }
}

export function guessMimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.md':
    case '.txt':
    case '.log':
    case '.csv':
    case '.json':
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.py':
    case '.css':
    case '.html':
    case '.yml':
    case '.yaml':
      return 'text/plain; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.pdf':
      return 'application/pdf'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    default:
      return 'application/octet-stream'
  }
}
