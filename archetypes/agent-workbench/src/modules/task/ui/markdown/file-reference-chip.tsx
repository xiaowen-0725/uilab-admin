/**
 * Inline file mention in assistant prose. Inherits surrounding type size.
 */

import type { ReactNode } from 'react'
import { ConversationIcon } from '@/components/icons/conversation-icon'
import { cn } from '@/lib/utils'

export type FileReferenceChipProps = {
  label: string
  path?: string
  line?: number
  className?: string
  /** Same path as a turn deliverable — keep the name, drop the paperclip control. */
  plain?: boolean
  onOpen?: (info: { path?: string; line?: number; label: string }) => void
}

const CHIP_CLASS =
  'tl-file-ref inline-flex max-w-full items-baseline gap-0.5 align-baseline rounded-sm px-0.5 py-0 text-[length:1em] font-medium leading-[inherit]'

export function FileReferenceChip({
  label,
  path,
  line,
  className,
  plain = false,
  onOpen,
}: FileReferenceChipProps): ReactNode {
  if (plain) {
    return (
      <span
        data-testid='file-reference-plain'
        data-path={path}
        className={cn('font-medium', className)}
      >
        {label}
      </span>
    )
  }

  const title = [path, line != null ? `line ${line}` : null]
    .filter(Boolean)
    .join(':')
  const content = (
    <>
      <ConversationIcon
        name='paperclip'
        className='relative top-0.5 size-4 opacity-90'
      />
      <span className='min-w-0 break-words whitespace-normal'>{label}</span>
    </>
  )
  const attrs = {
    title: title || label,
    'data-file-reference': 'true' as const,
    'data-testid': 'file-reference-chip',
    'data-path': path,
    'data-line': line != null ? String(line) : undefined,
    className: cn(CHIP_CLASS, className),
    style: { color: 'var(--tl-link)' },
  }

  if (!onOpen) {
    return <span {...attrs}>{content}</span>
  }

  return (
    <button
      type='button'
      {...attrs}
      className={cn(attrs.className, 'underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none')}
      onClick={(event) => {
        event.preventDefault()
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
  if (/^[\w.@/-]+\.\w{1,10}$/.test(t)) return true
  if (/^[\w.@-]+\/[\w.@/-]+$/.test(t)) return true
  return false
}

export function parseFileRefTarget(
  href?: string | null,
  label?: string,
): { path?: string; line?: number; label: string } {
  const raw = (href ?? '').replace(/^wb-file:|^file:\/\//, '')
  const withLine = raw.match(/^(.+?)(?::|#|%3A)(\d+)$/i) || raw.match(/^(.+?):(\d+)$/)
  if (withLine) {
    return {
      path: withLine[1],
      line: Number(withLine[2]),
      label: label || `${withLine[1]?.split('/').pop()} (line ${withLine[2]})`,
    }
  }
  const lineMatch = (label || '').match(/\((?:line\s*)?(\d+)\)\s*$/i)
  if (raw) {
    return {
      path: raw || undefined,
      line: lineMatch ? Number(lineMatch[1]) : undefined,
      label: label || raw,
    }
  }
  return { label: label || raw || 'file' }
}
