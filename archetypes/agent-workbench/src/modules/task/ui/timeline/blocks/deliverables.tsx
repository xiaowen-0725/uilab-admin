import type { ReactNode } from 'react'
import { ConversationIcon } from '@/components/icons/conversation-icon'
import { cn } from '@/lib/utils'
import type { DeliverableRef } from '../../../projection/types'
import {
  deliverableBadgeLabel,
  deliverableBasename,
  deliverableExtension,
  deliverableMetaLabel,
  deliverableTitle,
  featuredDeliverable,
  isDeletedDeliverable,
  isOpenableDeliverable,
  shouldShowAllArtifactsLink,
} from '../deliverable-presentation'
import type { TimelineOpenFileRef } from '../timeline-shared'

export type OpenDeliverablesRequest = {
  items: readonly DeliverableRef[]
  activatePath?: string
}

type DeliverableCardProps = {
  item: DeliverableRef
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
}

type DeliverableZoneProps = {
  items: readonly DeliverableRef[]
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onOpenDeliverables?: (request: OpenDeliverablesRequest) => void
}

function badgeTone(path: string): string {
  const ext = deliverableExtension(path)
  if (ext === 'md' || ext === 'mdx' || ext === 'markdown') {
    return 'bg-teal-500 text-white'
  }
  if (ext === 'pdf') return 'bg-red-500 text-white'
  if (ext === 'html' || ext === 'htm') return 'bg-orange-500 text-white'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg') {
    return 'bg-sky-500 text-white'
  }
  if (ext === 'docx') return 'bg-blue-600 text-white'
  if (ext === 'xlsx') return 'bg-emerald-600 text-white'
  return 'bg-neutral-500 text-white'
}

function DeliverableMark({ item }: { item: DeliverableRef }): ReactNode {
  const label = deliverableBadgeLabel(item.path)
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tracking-wide',
        badgeTone(item.path),
      )}
    >
      {label === 'FILE' ? <ConversationIcon name='file' className='size-4' /> : label}
    </span>
  )
}

function FeaturedDeliverableCard({
  item,
  onOpenFileRef,
}: DeliverableCardProps): ReactNode {
  const canOpen = Boolean(onOpenFileRef) && isOpenableDeliverable(item)
  const rowClass = 'flex w-full items-center gap-3 px-3.5 py-3'

  const body = (
    <>
      <DeliverableMark item={item} />
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate text-sm font-medium text-foreground'>
          {deliverableTitle(item)}
        </span>
        <span className='truncate text-xs text-muted-foreground'>
          {deliverableMetaLabel(item)}
        </span>
      </span>
      {canOpen ? (
        <ConversationIcon
          name='arrow-up-right'
          className='size-4 text-muted-foreground transition-colors duration-[var(--tl-motion-fast)] ease-[var(--tl-ease-standard)] group-hover:text-foreground'
        />
      ) : null}
    </>
  )

  return (
    <div
      className={cn(
        'timeline-deliverable-card w-full max-w-[min(100%,28rem)] rounded-2xl bg-neutral-100 shadow-[0_2px_8px_rgb(0_0_0/0.06)] dark:bg-white/8',
        isDeletedDeliverable(item) && 'opacity-70',
      )}
      data-testid='timeline-deliverable'
      data-path={item.path}
      data-change-kind={item.changeKind}
      data-featured='true'
    >
      {canOpen ? (
        <button
          type='button'
          className={cn('group bg-transparent text-left shadow-none hover:bg-transparent', rowClass)}
          data-testid='file-reference-chip'
          data-path={item.path}
          onClick={() =>
            onOpenFileRef?.({
              path: item.path,
              label: deliverableBasename(item.path),
            })
          }
        >
          {body}
        </button>
      ) : (
        <div className={rowClass} data-testid='file-reference-chip' data-path={item.path}>
          {body}
        </div>
      )}
    </div>
  )
}

export function DeliverableZone({
  items,
  onOpenFileRef,
  onOpenDeliverables,
}: DeliverableZoneProps): ReactNode {
  if (items.length === 0) return null
  const featured = featuredDeliverable(items)
  const showAll = shouldShowAllArtifactsLink(items, featured)
  const activatePath = featured?.path

  return (
    <div
      className='flex flex-col items-start gap-2'
      data-testid='timeline-deliverables'
      data-kind='deliverables'
      data-count={String(items.length)}
    >
      {featured ? (
        <FeaturedDeliverableCard item={featured} onOpenFileRef={onOpenFileRef} />
      ) : null}
      {showAll ? (
        <button
          type='button'
          className='tl-chrome inline-flex items-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground'
          data-testid='timeline-deliverables-all'
          onClick={() =>
            onOpenDeliverables?.({
              items,
              activatePath,
            })
          }
        >
          查看所有产物 ({items.length})
          <ConversationIcon name='chevron-up' className='size-3.5 rotate-90' />
        </button>
      ) : null}
    </div>
  )
}
