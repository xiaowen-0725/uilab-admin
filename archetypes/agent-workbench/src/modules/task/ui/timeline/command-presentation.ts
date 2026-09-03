import type { TimelineItem } from '../../projection/types'

const TITLE_PREFIX = /^(?:\$\s*)?(?:正在执行|已执行|命令失败)\s+/

export type CommandRunStatus = 'running' | 'success' | 'failed'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function stringField(
  rec: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = rec[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

/** Full shell input for the wrapped command card. */
export function commandInputText(item: TimelineItem): string | undefined {
  const fromMeta = item.meta?.command?.trim()
  if (fromMeta) return fromMeta
  const title = item.title?.trim() ?? ''
  const stripped = title.replace(TITLE_PREFIX, '').trim()
  return stripped || undefined
}

export function commandRunStatus(status: string | undefined): CommandRunStatus {
  if (status === 'running' || status === 'streaming') return 'running'
  if (
    status === 'failed' ||
    status === 'error' ||
    status === 'rejected' ||
    status === 'denied'
  ) {
    return 'failed'
  }
  return 'success'
}

export function commandRunStatusLabel(status: CommandRunStatus): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'failed':
      return '运行失败'
    case 'success':
      return '运行成功'
  }
}

function looksLikeJsonObject(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.startsWith('{') && trimmed.endsWith('}')
}

/**
 * Command body for the input card. Drops protocol JSON dumps;
 * keeps stderr / stdout / a plain sandbox sentence.
 */
export function presentCommandOutput(body: string | undefined): string | undefined {
  if (!body?.trim()) return undefined
  const text = body.trim()
  if (!looksLikeJsonObject(text)) return text

  try {
    const rec = asRecord(JSON.parse(text) as unknown)
    if (!rec) return undefined
    const stdout = stringField(rec, ['stdout'])
    const stderr = stringField(rec, ['stderr', 'error'])
    if (stdout && stderr) return `${stdout}\n${stderr}`
    return stdout ?? stderr
  } catch {
    return text
  }
}
