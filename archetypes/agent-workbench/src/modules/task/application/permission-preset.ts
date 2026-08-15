/**
 * Default-permission preset: renderer-side auto-response policy for
 * `approval.requested`. Mapping table is the single source of truth
 * (Spec-β appendix A / design v3). Sidecar stays fail-closed.
 */

import { useCallback, useSyncExternalStore } from 'react'

export type PermissionPreset = 'auto-approve' | 'full-access'

export type ApprovalResponseDecision = 'approve' | 'dock'

export const DEFAULT_PERMISSION_PRESET: PermissionPreset = 'auto-approve'

/** Exact-match whitelist for `auto-approve` file-write tools. */
export const AUTO_APPROVE_WRITE_TOOLS = [
  'write_file',
  'edit_file',
  'delete_file',
  'rmdir',
  'mkdir',
] as const

const AUTO_APPROVE_WRITE_TOOL_SET: ReadonlySet<string> = new Set(
  AUTO_APPROVE_WRITE_TOOLS,
)

export const PERMISSION_PRESET_OPTIONS = [
  {
    id: 'auto-approve' as const,
    label: '帮我批准',
    description: '文件修改自动批准；执行命令等高风险操作仍会询问',
    autoApproveReason: '已按「帮我批准」预设自动批准',
  },
  {
    id: 'full-access' as const,
    label: '完全访问',
    description: '不再逐次询问；操作仍在工作区沙箱内执行',
    autoApproveReason: '已按「完全访问」预设自动批准',
  },
] as const

type PresetOption = (typeof PERMISSION_PRESET_OPTIONS)[number]
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function presetOption(id: PermissionPreset): PresetOption {
  for (const option of PERMISSION_PRESET_OPTIONS) {
    if (option.id === id) return option
  }
  return PERMISSION_PRESET_OPTIONS[0]
}

const STORAGE_KEY = 'uilab.agent-workbench.permission-preset.v1'

const memory = new Map<string, PermissionPreset>()
const listeners = new Set<() => void>()
let storage: BrowserStorage | null = resolveBrowserStorage()
let hydrated = false

export function isPermissionPreset(
  value: unknown,
): value is PermissionPreset {
  return value === 'auto-approve' || value === 'full-access'
}

/**
 * Decide how the renderer should answer one approval request.
 * Unknown / missing tool names fail closed under `auto-approve`.
 * Question Request (`ask_user_question` / `run.input_requested`) never
 * enters this path — presets must not auto-answer questions.
 */
export function decideApprovalResponse(
  preset: PermissionPreset,
  toolName: string | null | undefined,
): ApprovalResponseDecision {
  switch (preset) {
    case 'full-access':
      return 'approve'
    case 'auto-approve':
      if (
        typeof toolName === 'string' &&
        AUTO_APPROVE_WRITE_TOOL_SET.has(toolName)
      ) {
        return 'approve'
      }
      return 'dock'
  }
}

export function autoApproveReason(preset: PermissionPreset): string {
  return presetOption(preset).autoApproveReason
}

export function permissionPresetLabel(preset: PermissionPreset): string {
  return presetOption(preset).label
}

export function getPermissionPreset(
  taskId: string | null | undefined,
): PermissionPreset {
  hydrate()
  const id = taskId?.trim()
  if (!id) return DEFAULT_PERMISSION_PRESET
  return memory.get(id) ?? DEFAULT_PERMISSION_PRESET
}

export function setPermissionPreset(
  taskId: string,
  preset: PermissionPreset,
): void {
  const id = taskId.trim()
  if (!id || !isPermissionPreset(preset)) return
  hydrate()
  memory.set(id, preset)
  persist()
  emit()
}

export function subscribePermissionPresets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePermissionPreset(taskId: string | null | undefined): {
  preset: PermissionPreset
  setPreset: (preset: PermissionPreset) => void
} {
  const preset = useSyncExternalStore(
    subscribePermissionPresets,
    () => getPermissionPreset(taskId),
    () => DEFAULT_PERMISSION_PRESET,
  )
  const setPreset = useCallback(
    (next: PermissionPreset) => {
      if (!taskId?.trim()) return
      setPermissionPreset(taskId, next)
    },
    [taskId],
  )
  return { preset, setPreset }
}

/** Test-only: clear memory (and storage unless `persistStorage`). */
export function resetPermissionPresetStoreForTests(options?: {
  storage?: BrowserStorage | null
  persistStorage?: boolean
}): void {
  memory.clear()
  hydrated = false
  if (options && 'storage' in options) {
    storage = options.storage ?? null
  } else {
    storage = resolveBrowserStorage()
  }
  if (!options?.persistStorage) {
    try {
      storage?.removeItem(STORAGE_KEY)
    } catch {
      // ignore quota / private-mode
    }
  }
  emit()
}

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (!storage) return
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    for (const [taskId, value] of Object.entries(parsed)) {
      if (!taskId.trim() || !isPermissionPreset(value)) continue
      memory.set(taskId, value)
    }
  } catch {
    // malformed storage → empty map (fail closed to default)
  }
}

function persist(): void {
  if (!storage) return
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(memory.entries())),
    )
  } catch {
    // ignore quota / private-mode
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function resolveBrowserStorage(): BrowserStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined'
      ? null
      : globalThis.localStorage
  } catch {
    return null
  }
}
