/**
 * Normalize tool results into Timeline-friendly `summary` / `items`.
 * Pure — used by fullStream mapper and (fallback) projection.
 */

/** Max chars for a single summary string. */
export const TOOL_OUTPUT_SUMMARY_MAX_CHARS = 4_000

/** Max expandable child lines. */
export const TOOL_OUTPUT_ITEMS_MAX = 80

/** Max chars per expandable item line. */
export const TOOL_OUTPUT_ITEM_MAX_CHARS = 240

/** Bound work before multi-line splits (avoids multi-MB scans). */
export const TOOL_OUTPUT_SCAN_MAX_CHARS =
  TOOL_OUTPUT_ITEMS_MAX * TOOL_OUTPUT_ITEM_MAX_CHARS + 2_000

export interface NormalizedToolOutput {
  summary?: string
  items?: string[]
}

const PATH_KEYS = ['path', 'file_path', 'filePath', 'filepath'] as const
const CONTENT_KEYS = ['content', 'text', 'data'] as const
const LIST_KEYS = ['entries', 'files', 'items', 'paths', 'results', 'lines'] as const

function redactSecrets(text: string): string {
  return text
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[redacted]')
    .replace(/\b(Bearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi, '$1[redacted]')
    .replace(
      /\b(token|password|secret|api[_-]?key|access_token|refresh_token)\s*[:=]\s*\S+/gi,
      '$1=[redacted]',
    )
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  if (max <= 1) return '…'
  return `${text.slice(0, max - 1)}…`
}

function cleanText(text: string, max = TOOL_OUTPUT_SUMMARY_MAX_CHARS): string {
  return truncate(redactSecrets(text), max)
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function stringField(
  rec: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = asNonEmptyString(rec[key])
    if (value) return value
  }
  return undefined
}

function limitItems(lines: string[]): string[] | undefined {
  if (lines.length === 0) return undefined
  const capped = lines
    .slice(0, TOOL_OUTPUT_ITEMS_MAX)
    .map((line) => cleanText(line, TOOL_OUTPUT_ITEM_MAX_CHARS))
  if (lines.length > TOOL_OUTPUT_ITEMS_MAX) {
    capped.push(`…(+${lines.length - TOOL_OUTPUT_ITEMS_MAX} more)`)
  }
  return capped
}

function asItemList(lines: string[]): NormalizedToolOutput {
  const items = limitItems(lines)
  if (!items) return {}
  return { summary: truncate(items[0]!, 120), items }
}

function jsonSummary(value: unknown): string {
  try {
    return cleanText(JSON.stringify(value))
  } catch {
    return '[unserializable tool output]'
  }
}

function normalizeString(text: string): NormalizedToolOutput {
  const bounded =
    text.length > TOOL_OUTPUT_SCAN_MAX_CHARS
      ? `${text.slice(0, TOOL_OUTPUT_SCAN_MAX_CHARS)}…`
      : text
  const redacted = redactSecrets(bounded)
  const lines = redacted
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)

  // Multi-line listings (ls, list_tree, short grep hits) → expandable items.
  if (lines.length >= 2) {
    const shortLines = lines.every((line) => line.length <= TOOL_OUTPUT_ITEM_MAX_CHARS)
    if (shortLines || lines.length >= 3) return asItemList(lines)
  }

  return { summary: truncate(redacted, TOOL_OUTPUT_SUMMARY_MAX_CHARS) }
}

function lineFromObject(rec: Record<string, unknown>): string | undefined {
  const path = stringField(rec, PATH_KEYS) ?? asNonEmptyString(rec.name)
  if (path) {
    const kind = asNonEmptyString(rec.type) ?? asNonEmptyString(rec.kind)
    return kind ? `${path} (${kind})` : path
  }
  return asNonEmptyString(rec.title) ?? asNonEmptyString(rec.label)
}

function normalizeArray(arr: unknown[]): NormalizedToolOutput {
  const lines: string[] = []
  for (const entry of arr) {
    if (typeof entry === 'string' && entry.length > 0) {
      lines.push(entry)
      continue
    }
    if (entry && typeof entry === 'object') {
      const line = lineFromObject(entry as Record<string, unknown>)
      if (line) lines.push(line)
    }
  }
  const listed = asItemList(lines)
  return listed.items ? listed : { summary: jsonSummary(arr) }
}

function normalizeRecord(rec: Record<string, unknown>): NormalizedToolOutput {
  const content = stringField(rec, CONTENT_KEYS)
  if (content) return normalizeString(content)

  for (const key of LIST_KEYS) {
    const val = rec[key]
    if (Array.isArray(val)) return normalizeArray(val)
  }

  const path = stringField(rec, PATH_KEYS)
  if (path) {
    const type = asNonEmptyString(rec.type)
    const line = type ? `${path} (${type})` : path
    return asItemList([redactSecrets(line)])
  }

  const message = asNonEmptyString(rec.message) ?? asNonEmptyString(rec.error)
  if (message) return { summary: cleanText(message) }

  return { summary: jsonSummary(rec) }
}

/** Normalize tool `output` / `result` for Timeline presentation. */
export function normalizeToolOutput(output: unknown): NormalizedToolOutput {
  if (output == null) return {}
  if (typeof output === 'string') {
    return output.length === 0 ? {} : normalizeString(output)
  }
  if (typeof output === 'number' || typeof output === 'boolean') {
    return { summary: String(output) }
  }
  if (Array.isArray(output)) return normalizeArray(output)
  if (typeof output === 'object') {
    return normalizeRecord(output as Record<string, unknown>)
  }
  return {}
}

/**
 * Envelope residual: redact + size-bound debug copy.
 * UI should prefer summary/items from normalizeToolOutput.
 */
export function sanitizeToolOutputForEnvelope(output: unknown): unknown {
  if (output == null || typeof output === 'number' || typeof output === 'boolean') {
    return output
  }
  if (typeof output === 'string') return cleanText(output)
  if (Array.isArray(output)) {
    return output.slice(0, TOOL_OUTPUT_ITEMS_MAX).map((entry) =>
      typeof entry === 'string' ? cleanText(entry, TOOL_OUTPUT_ITEM_MAX_CHARS) : entry,
    )
  }
  if (typeof output === 'object') {
    const next: Record<string, unknown> = { ...(output as Record<string, unknown>) }
    for (const key of [...CONTENT_KEYS, 'message', 'error'] as const) {
      if (typeof next[key] === 'string') {
        next[key] = cleanText(next[key] as string)
      }
    }
    return next
  }
  return output
}
