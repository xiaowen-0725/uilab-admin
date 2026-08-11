/**
 * Codex-style inline file reference (data-file-reference mention).
 * CDP: span[data-file-reference] > Mention — 14px/22, weight 500,
 * color color(srgb 0.511 0.712 0.900) ≈ #82b5e6, icon 21×21, role=button.
 */

import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FileReferenceChipProps = {
  /** Display label, e.g. "AWP-21 (line 3)" or path basename */
  label: string
  /** Optional absolute/workspace path for click handler */
  path?: string
  /** Optional 1-based line */
  line?: number
  className?: string
  onOpen?: (info: { path?: string; line?: number; label: string }) => void
}

/** Soft Codex link blue (dark UI sample). */
export const CODEX_FILE_LINK_COLOR = 'color(srgb 0.511373 0.712157 0.900392)'

export function FileReferenceChip({
  label,
  path,
  line,
  className,
  onOpen,
}: FileReferenceChipProps) {
  const title = [path, line != null ? `line ${line}` : null]
    .filter(Boolean)
    .join(':')

  const content = (
    <>
      <FileText
        className='relative top-0.5 size-[14px] shrink-0 opacity-90'
        strokeWidth={1.75}
        aria-hidden
      />
      <span className='min-w-0 break-words whitespace-normal'>{label}</span>
    </>
  )

  if (!onOpen) {
    return (
      <span
        title={title || label}
        data-file-reference='true'
        data-testid='file-reference-chip'
        data-path={path}
        data-line={line != null ? String(line) : undefined}
        className={cn(
          'codex-file-ref inline-flex max-w-full items-baseline gap-0.5',
          'align-baseline rounded-sm px-0.5 py-0',
          'text-[14px] font-medium leading-[22px]',
          className,
        )}
        style={{ color: CODEX_FILE_LINK_COLOR }}
      >
        {content}
      </span>
    )
  }

  return (
    <button
      type='button'
      title={title || label}
      data-file-reference='true'
      data-testid='file-reference-chip'
      data-path={path}
      data-line={line != null ? String(line) : undefined}
      className={cn(
        'codex-file-ref inline-flex max-w-full items-baseline gap-0.5',
        'align-baseline rounded-sm px-0.5 py-0',
        'text-[14px] font-medium leading-[22px]',
        'underline-offset-2 hover:underline',
        'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
      style={{ color: CODEX_FILE_LINK_COLOR }}
      onClick={(e) => {
        e.preventDefault()
        onOpen({ path, line, label })
      }}
    >
      {content}
    </button>
  )
}

/** Path-like inline code: `src/foo.ts` or `notes/plan.txt` */
export function isFilePathToken(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 200 || /\s/.test(t)) return false
  if (/^https?:\/\//i.test(t)) return false
  // has extension or nested path
  if (/^[\w.@/-]+\.\w{1,10}$/.test(t)) return true
  if (/^[\w.@-]+\/[\w.@/-]+$/.test(t)) return true
  return false
}

/** Parse `path:line` or `path#line` from href/label. */
export function parseFileRefTarget(
  href?: string | null,
  label?: string,
): { path?: string; line?: number; label: string } {
  const raw = (href ?? '').replace(/^wb-file:|^file:\/\//, '')
  const m = raw.match(/^(.+?)(?::|#|%3A)(\d+)$/i) || raw.match(/^(.+?):(\d+)$/)
  if (m) {
    return {
      path: m[1],
      line: Number(m[2]),
      label: label || `${m[1]?.split('/').pop()} (line ${m[2]})`,
    }
  }
  const lm = (label || '').match(/\((?:line\s*)?(\d+)\)\s*$/i)
  if (raw) {
    return {
      path: raw || undefined,
      line: lm ? Number(lm[1]) : undefined,
      label: label || raw,
    }
  }
  return { label: label || raw || 'file' }
}
