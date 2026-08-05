/**
 * Local title policy (design §6) — pure, deterministic, no Runtime wait.
 *
 * Algorithm:
 * 1. Unicode trim
 * 2. First non-empty line (by newline)
 * 3. If line starts with optional whitespace + `/` + ASCII slash-command token
 *    ([A-Za-z0-9_-]+), strip token and following whitespace; empty remainder → fallback
 * 4. Collapse internal whitespace on that line only
 * 5. Cap at 24 Unicode graphemes; if longer append `…`
 * 6. Strip trailing whitespace; empty → `未命名任务`
 */

export const UNTITLED_TASK_FALLBACK = '未命名任务'
const MAX_TITLE_GRAPHEMES = 24
const ELLIPSIS = '…'

/** ASCII slash-command token after leading `/`. */
const SLASH_COMMAND_RE = /^(\s*)\/([A-Za-z0-9_-]+)(\s*)/

/** Minimal Segmenter surface so we do not require lib es2022 in tsconfig. */
type GraphemeSegmenter = {
  segment(input: string): Iterable<{ segment: string }>
}

function getGraphemeSegmenter(): GraphemeSegmenter | null {
  const IntlWithSegmenter = Intl as typeof Intl & {
    Segmenter?: new (
      locales?: string | string[],
      options?: { granularity?: string },
    ) => GraphemeSegmenter
  }
  if (typeof IntlWithSegmenter.Segmenter !== 'function') return null
  return new IntlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' })
}

function segmentGraphemes(text: string): string[] {
  const segmenter = getGraphemeSegmenter()
  if (segmenter) {
    return Array.from(segmenter.segment(text), (s) => s.segment)
  }
  // Code-point fallback when Segmenter is unavailable.
  return Array.from(text)
}

function firstNonEmptyLine(text: string): string | null {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (line.trim().length > 0) return line
  }
  return null
}

/**
 * Derive a local task title from the first user prompt.
 * Pure function; does not await Runtime title suggestions.
 */
export function localTitleFromPrompt(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length === 0) return UNTITLED_TASK_FALLBACK

  const line = firstNonEmptyLine(trimmed)
  if (line === null) return UNTITLED_TASK_FALLBACK

  let working = line

  // Strip leading slash command token only when the token is pure ASCII [A-Za-z0-9_-]+.
  const slashMatch = SLASH_COMMAND_RE.exec(working)
  if (slashMatch) {
    // Remove optional leading whitespace, `/token`, and following whitespace (if any).
    const afterToken = working.slice(slashMatch[0].length)
    working = afterToken
    if (working.trim().length === 0) return UNTITLED_TASK_FALLBACK
  }

  // Collapse internal whitespace; keep punctuation.
  working = working.replace(/\s+/g, ' ').trim()
  if (working.length === 0) return UNTITLED_TASK_FALLBACK

  const graphemes = segmentGraphemes(working)
  if (graphemes.length > MAX_TITLE_GRAPHEMES) {
    return graphemes.slice(0, MAX_TITLE_GRAPHEMES).join('') + ELLIPSIS
  }
  return working
}
