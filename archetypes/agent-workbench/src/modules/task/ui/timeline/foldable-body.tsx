import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SimpleMarkdown } from '../markdown/simple-markdown'
import type { TimelineOpenFileRef } from './timeline-shared'

export const TIMELINE_FOLD_THRESHOLD = 600
/** Process-fold asides / reasoning: a couple of lines, not a wall. */
export const PROCESS_PROSE_PREVIEW = 140

export function FoldableBody({
  itemId,
  body,
  markdown = false,
  muted = false,
  streaming = false,
  enableFold = true,
  compact = false,
  onOpenFileRef,
  plainFilePaths,
}: {
  itemId: string
  body: string
  markdown?: boolean
  muted?: boolean
  streaming?: boolean
  enableFold?: boolean
  compact?: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  plainFilePaths?: readonly string[]
}) {
  const limit = compact ? PROCESS_PROSE_PREVIEW : TIMELINE_FOLD_THRESHOLD
  const long = enableFold && body.length > limit
  const [open, setOpen] = useState(!long)
  const tone = muted
    ? 'tl-thought text-foreground/70'
    : 'text-foreground'
  const preview = `${body.slice(0, limit)}…`

  const bodyNode = (source: string, clamp = false) =>
    markdown ? (
      <SimpleMarkdown
        source={source}
        className={cn(tone, clamp && 'line-clamp-3')}
        isAnimating={streaming}
        plainFilePaths={plainFilePaths}
        onOpenFileRef={onOpenFileRef}
      />
    ) : (
      <div
        className={cn(
          'tl-thought whitespace-pre-wrap',
          tone,
          clamp && 'line-clamp-3',
        )}
      >
        {source}
      </div>
    )

  if (!long) return bodyNode(body)

  return (
    <div data-testid={`timeline-fold-${itemId}`}>
      {open ? (
        <div className={cn(compact && 'max-h-36 overflow-y-auto')}>
          {bodyNode(body)}
        </div>
      ) : (
        bodyNode(preview, compact)
      )}
      {compact ? (
        <button
          type='button'
          className='tl-chrome mt-0.5 text-foreground/55 hover:text-foreground active:scale-[0.96] transition-transform'
          data-testid={`timeline-fold-toggle-${itemId}`}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? '收起' : '展开'}
        </button>
      ) : (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='mt-1 h-7 px-2 text-xs active:scale-[0.96] transition-transform'
          data-testid={`timeline-fold-toggle-${itemId}`}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? '收起' : '展开全文'}
        </Button>
      )}
    </div>
  )
}
