/**
 * DocumentContentPort backed by the browser File System Access API.
 * No Node/Electron — Chromium `showDirectoryPicker` + DirectoryHandle only.
 * Product honesty: optional local folder bind; not multi-tenant remote storage.
 */

import type {
  DocumentBinaryReadResult,
  DocumentContentPort,
  DocumentTextReadResult,
} from '../ports/document-content-port'
import {
  coerceWorkspaceResourceKey,
  maxBytesForFamily,
} from '../surfaces/document/path-utils'
import { resolveDocumentFormat } from '../surfaces/document/format-router'

export type PickWorkspaceDirectoryResult =
  | { ok: true; handle: FileSystemDirectoryHandle }
  | {
      ok: false
      reason: 'unsupported' | 'aborted' | 'denied'
      message: string
    }

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: FileSystemHandle | string
  }) => Promise<FileSystemDirectoryHandle>
}

function defaultPickerWindow(): DirectoryPickerWindow {
  return globalThis as unknown as DirectoryPickerWindow
}

/** True when the current browsing context can offer folder pick. */
export function isFsAccessDirectoryPickerSupported(
  win: DirectoryPickerWindow = defaultPickerWindow(),
): boolean {
  return typeof win.showDirectoryPicker === 'function'
}

/**
 * User-gesture folder pick (must be called from a click handler).
 * Returns Chinese-facing failure messages for unsupported / cancel / denied.
 */
export async function pickWorkspaceDirectory(
  win: DirectoryPickerWindow = defaultPickerWindow(),
): Promise<PickWorkspaceDirectoryResult> {
  if (typeof win.showDirectoryPicker !== 'function') {
    return {
      ok: false,
      reason: 'unsupported',
      message:
        '当前浏览器不支持选择本地文件夹。请使用 Chromium 内核浏览器，或通过侧车 WORKSPACE_ROOT 绑定工作区。',
    }
  }
  try {
    const handle = await win.showDirectoryPicker({ mode: 'read' })
    return { ok: true, handle }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        reason: 'aborted',
        message: '已取消选择文件夹',
      }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      reason: 'denied',
      message: msg || '无法访问所选文件夹',
    }
  }
}

/**
 * Walk a DirectoryHandle tree for a workspace-relative resourceKey.
 * Rejects escape / empty via coerce; never traverses `..`.
 */
export async function resolveFsAccessFileHandle(
  root: FileSystemDirectoryHandle,
  resourceKey: string,
): Promise<
  | { ok: true; file: FileSystemFileHandle }
  | { ok: false; reason: 'not-found' | 'permission-denied'; message: string }
> {
  const key = coerceWorkspaceResourceKey(resourceKey)
  if (!key) {
    return {
      ok: false,
      reason: 'not-found',
      message: '无效的工作区路径',
    }
  }

  const parts = key.split('/').filter(Boolean)
  if (parts.length === 0) {
    return {
      ok: false,
      reason: 'not-found',
      message: '无效的工作区路径',
    }
  }

  try {
    let dir = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!
      dir = await dir.getDirectoryHandle(seg)
    }
    const file = await dir.getFileHandle(parts[parts.length - 1]!)
    return { ok: true, file }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return {
        ok: false,
        reason: 'permission-denied',
        message: '没有权限读取该文件夹中的文件',
      }
    }
    return {
      ok: false,
      reason: 'not-found',
      message: '找不到该文件。路径可能已变更或不在所选文件夹内。',
    }
  }
}

export type FsAccessDocumentContentOptions = {
  root: FileSystemDirectoryHandle
  /** Display name for workspace hint (defaults to handle.name). */
  label?: string
}

/**
 * Create DocumentContentPort over a user-picked directory handle.
 */
export function createFsAccessDocumentContent(
  options: FsAccessDocumentContentOptions,
): DocumentContentPort {
  const { root } = options

  async function readRaw(
    resourceKey: string,
  ): Promise<DocumentBinaryReadResult> {
    const resolved = await resolveFsAccessFileHandle(root, resourceKey)
    if (!resolved.ok) {
      return {
        ok: false,
        reason: resolved.reason,
        message: resolved.message,
      }
    }

    const key = coerceWorkspaceResourceKey(resourceKey)
    const family = key ? resolveDocumentFormat(key) : 'unsupported'
    const maxBytes = maxBytesForFamily(family)

    try {
      const file = await resolved.file.getFile()
      if (file.size > maxBytes) {
        return {
          ok: false,
          reason: 'too-large',
          message: `文件过大（上限 ${maxBytes} 字节）`,
        }
      }
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      return {
        ok: true,
        bytes,
        byteLength: bytes.byteLength,
        mimeType: file.type || undefined,
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        return {
          ok: false,
          reason: 'permission-denied',
          message: '没有权限读取该文件',
        }
      }
      const msg = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        reason: 'read-failed',
        message: msg || '读取失败',
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

/** Label for Document header when a local folder is bound. */
export function fsAccessWorkspaceHint(
  handle: FileSystemDirectoryHandle,
  label?: string,
): string {
  const name = (label ?? handle.name ?? '').trim()
  return name ? `本地文件夹 · ${name}` : '本地文件夹'
}
