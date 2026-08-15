/**
 * Codex-style post-turn file change summary card (not full diff editor).
 * Dense bar: icon + "已编辑 path" + +N -M · actions 撤销/审核 (fixture stubs).
 */

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ToolActivityIcon } from '../tool-activity-icon'

export type FileChangeSummaryCardProps = {
  path: string
  additions?: number
  deletions?: number
  /** Optional preview lines for expanded body */
  previewLines?: string[]
  className?: string
  testId?: string
  onOpen?: (path: string) => void
}

export function FileChangeSummaryCard({
  path,
  additions,
  deletions,
  previewLines,
  className,
  testId = 'file-change-summary',
  onOpen,
}: FileChangeSummaryCardProps) {
  const [open, setOpen] = useState(false)
  const base = path.split('/').pop() || path

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/50',
        'bg-[color-mix(in_oklch,var(--muted)_55%,transparent)]',
        className,
      )}
      data-kind='file-change-summary'
      data-testid={testId}
      data-path={path}
    >
      <div className='flex items-center gap-2 px-3 py-2.5'>
        <button
          type='button'
          className='flex min-w-0 flex-1 items-center gap-2 text-left'
          data-testid={`${testId}-open`}
          onClick={() => {
            setOpen((v) => !v)
            onOpen?.(path)
          }}
        >
          <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted'>
            <ToolActivityIcon
              kind='write'
              className='size-4 text-muted-foreground'
            />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-[445] leading-5 text-foreground'>
              已编辑 {base}
            </span>
            {(additions != null || deletions != null) && (
              <span className='mt-0.5 block font-mono text-xs tabular-nums'>
                {additions != null ? (
                  <span className='text-[var(--wb-success)]'>+{additions}</span>
                ) : null}
                {additions != null && deletions != null ? ' ' : null}
                {deletions != null ? (
                  <span className='text-[var(--wb-danger)]'>-{deletions}</span>
                ) : null}
              </span>
            )}
          </span>
        </button>
        <div className='flex shrink-0 items-center gap-1'>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-8 gap-1 px-2 text-xs text-muted-foreground'
            data-testid={`${testId}-undo`}
            onClick={(e) => e.stopPropagation()}
          >
            <RotateCcw className='size-3.5' aria-hidden />
            撤销
          </Button>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            className='h-8 px-3 text-xs'
            data-testid={`${testId}-review`}
            onClick={(e) => e.stopPropagation()}
          >
            审核
          </Button>
        </div>
      </div>
      {open && previewLines && previewLines.length > 0 ? (
        <pre className='max-h-40 overflow-auto border-t border-border/40 px-3 py-2 font-mono text-xs leading-4 text-muted-foreground'>
          {previewLines.join('\n')}
        </pre>
      ) : null}
    </div>
  )
}

/** Parse "+10 -0" style detail from tool rows. */
export function parsePlusMinus(detail?: string): {
  additions?: number
  deletions?: number
} {
  if (!detail) return {}
  const a = detail.match(/\+(\d+)/)
  const d = detail.match(/-(\d+)/)
  return {
    additions: a ? Number(a[1]) : undefined,
    deletions: d ? Number(d[1]) : undefined,
  }
}
