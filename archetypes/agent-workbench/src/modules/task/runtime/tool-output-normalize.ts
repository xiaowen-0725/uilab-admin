/**
 * Normalize tool results into Timeline-friendly `summary` / `items`.
 * Pure — used by fullStream mapper and (fallback) projection.
 *
 * Goals:
 * - string / {content} → readable summary (truncated)
 * - directory-like multi-line or string[] → items for expandable tool rows
 * - never invent secrets; light redaction of obvious token shapes
 */

/** Max chars for a single summary string (Timeline body / fold-friendly). */
export const TOOL_OUTPUT_SUMMARY_MAX_CHARS = 4_000

/** Max expandable child lines. */
export const TOOL_OUTPUT_ITEMS_MAX = 80

/** Max chars per expandable item line. */
export const TOOL_OUTPUT_ITEM_MAX_CHARS = 240

/**
 * Bound work before splitting multi-line blobs (avoids multi-MB string scans).
 * ~items max × item line budget + headroom.
 */
export const TOOL_OUTPUT_SCAN_MAX_CHARS =
  TOOL_OUTPUT_ITEMS_MAX * TOOL_OUTPUT_ITEM_MAX_CHARS + 2_000

export interface NormalizedToolOutput {
  /** Short body for tool-group (also split into lines by Timeline if no items). */
  summary?: string
  /** Expandable child lines (paths, dir entries, short result lines). */
  items?: string[]
}

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

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t.length > 0 ? value : undefined
}

function limitItems(lines: string[]): string[] | undefined {
  if (lines.length === 0) return undefined
  const capped = lines.slice(0, TOOL_OUTPUT_ITEMS_MAX).map((line) =>
    truncate(redactSecrets(line), TOOL_OUTPUT_ITEM_MAX_CHARS),
  )
  if (lines.length > TOOL_OUTPUT_ITEMS_MAX) {
    capped.push(`…(+${lines.length - TOOL_OUTPUT_ITEMS_MAX} more)`)
  }
  return capped
}

function linesFromMultiline(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
}

/**
 * Prefer items when the string looks like a directory / multi-entry listing.
 * Otherwise treat as a single summary blob.
 */
function normalizeString(text: string): NormalizedToolOutput {
  const bounded =
    text.length > TOOL_OUTPUT_SCAN_MAX_CHARS
      ? `${text.slice(0, TOOL_OUTPUT_SCAN_MAX_CHARS)}…`
      : text
  const redacted = redactSecrets(bounded)
  const lines = linesFromMultiline(redacted)
  if (lines.length >= 2) {
    const shortLines = lines.every((l) => l.length <= TOOL_OUTPUT_ITEM_MAX_CHARS)
    // Multi-line listings (ls, list_tree, grep hits) → expandable items.
    if (shortLines || lines.length >= 3) {
      return {
        summary: truncate(lines[0]!, 120),
        items: limitItems(lines),
      }
    }
  }
  return {
    summary: truncate(redacted, TOOL_OUTPUT_SUMMARY_MAX_CHARS),
  }
}

function normalizeArray(arr: unknown[]): NormalizedToolOutput {
  const lines: string[] = []
  for (const entry of arr) {
    if (typeof entry === 'string' && entry.length > 0) {
      lines.push(entry)
      continue
    }
    if (entry && typeof entry === 'object') {
      const rec = entry as Record<string, unknown>
      const path =
        asNonEmptyString(rec.path) ??
        asNonEmptyString(rec.file_path) ??
        asNonEmptyString(rec.filePath) ??
        asNonEmptyString(rec.name)
      if (path) {
        const kind = asNonEmptyString(rec.type) ?? asNonEmptyString(rec.kind)
        lines.push(kind ? `${path} (${kind})` : path)
        continue
      }
      const title = asNonEmptyString(rec.title) ?? asNonEmptyString(rec.label)
      if (title) {
        lines.push(title)
        continue
      }
    }
  }
  const items = limitItems(lines)
  if (!items) {
    try {
      return {
        summary: truncate(
          redactSecrets(JSON.stringify(arr)),
          TOOL_OUTPUT_SUMMARY_MAX_CHARS,
        ),
      }
    } catch {
      return { summary: '[unserializable tool output]' }
    }
  }
  return {
    summary: truncate(items[0]!, 120),
    items,
  }
}

function normalizeRecord(rec: Record<string, unknown>): NormalizedToolOutput {
  // Common read_file / FS shapes
  const content =
    asNonEmptyString(rec.content) ??
    asNonEmptyString(rec.text) ??
    asNonEmptyString(rec.data)
  if (content) {
    return normalizeString(content)
  }

  for (const key of ['entries', 'files', 'items', 'paths', 'results', 'lines'] as const) {
    const val = rec[key]
    if (Array.isArray(val)) {
      return normalizeArray(val)
    }
  }

  // Single path result (stat / write ack without content)
  const path =
    asNonEmptyString(rec.path) ??
    asNonEmptyString(rec.file_path) ??
    asNonEmptyString(rec.filePath)
  if (path) {
    const type = asNonEmptyString(rec.type)
    const line = type ? `${path} (${type})` : path
    return { summary: redactSecrets(line), items: limitItems([line]) }
  }

  const message = asNonEmptyString(rec.message) ?? asNonEmptyString(rec.error)
  if (message) {
    return { summary: truncate(redactSecrets(message), TOOL_OUTPUT_SUMMARY_MAX_CHARS) }
  }

  // Fallback: compact JSON (no secret invention; still redact patterns)
  try {
    return {
      summary: truncate(
        redactSecrets(JSON.stringify(rec)),
        TOOL_OUTPUT_SUMMARY_MAX_CHARS,
      ),
    }
  } catch {
    return { summary: '[unserializable tool output]' }
  }
}

/**
 * Normalize an arbitrary tool `output` / `result` value for Timeline presentation.
 */
export function normalizeToolOutput(output: unknown): NormalizedToolOutput {
  if (output == null) return {}

  if (typeof output === 'string') {
    if (output.length === 0) return {}
    return normalizeString(output)
  }

  if (typeof output === 'number' || typeof output === 'boolean') {
    return { summary: String(output) }
  }

  if (Array.isArray(output)) {
    return normalizeArray(output)
  }

  if (typeof output === 'object') {
    return normalizeRecord(output as Record<string, unknown>)
  }

  return {}
}

/**
 * Envelope-safe tool output for Runtime events: redact + size-bound.
 * Prefer summary/items for UI; this keeps a debug-friendly residual without
 * multi-MB secret dumps on the event stream.
 */
export function sanitizeToolOutputForEnvelope(output: unknown): unknown {
  if (output == null) return output

  if (typeof output === 'string') {
    return truncate(redactSecrets(output), TOOL_OUTPUT_SUMMARY_MAX_CHARS)
  }

  if (typeof output === 'number' || typeof output === 'boolean') {
    return output
  }

  if (Array.isArray(output)) {
    const limited = output.slice(0, TOOL_OUTPUT_ITEMS_MAX)
    return limited.map((entry) => {
      if (typeof entry === 'string') {
        return truncate(redactSecrets(entry), TOOL_OUTPUT_ITEM_MAX_CHARS)
      }
      return entry
    })
  }

  if (typeof output === 'object') {
    const rec = output as Record<string, unknown>
    const next: Record<string, unknown> = { ...rec }
    for (const key of ['content', 'text', 'data', 'message', 'error'] as const) {
      if (typeof next[key] === 'string') {
        next[key] = truncate(
          redactSecrets(next[key] as string),
          TOOL_OUTPUT_SUMMARY_MAX_CHARS,
        )
      }
    }
    return next
  }

  return output
}
