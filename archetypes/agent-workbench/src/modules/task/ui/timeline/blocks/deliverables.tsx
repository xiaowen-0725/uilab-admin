import type { ReactNode } from 'react'
import { ConversationIcon } from '@/components/icons/conversation-icon'
import { cn } from '@/lib/utils'
import type { DeliverableRef } from '../../../projection/types'
import {
  deliverableBadgeLabel,
  deliverableCoverageKey,
  deliverableExtension,
  deliverableMetaLabel,
  deliverableOpenRef,
  deliverableTitle,
  featuredDeliverable,
  isDeletedDeliverable,
  isInteractiveDeliverable,
  isOpenableDeliverable,
  shouldShowAllArtifactsLink,
  visibleDeliverableCards,
} from '../deliverable-presentation'
import type { TimelineOpenFileRef } from '../timeline-shared'

export type OpenDeliverablesRequest = {
  items: readonly DeliverableRef[]
  activatePath?: string
}

type DeliverableCardProps = {
  item: DeliverableRef
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  featured?: boolean
}

type DeliverableZoneProps = {
  items: readonly DeliverableRef[]
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onOpenDeliverables?: (request: OpenDeliverablesRequest) => void
}

function badgeTone(item: DeliverableRef): string {
  if (isInteractiveDeliverable(item)) return 'bg-violet-500 text-white'
  const ext = deliverableExtension(item.path ?? '')
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

function DeliverableMarkGlyph({ item }: { item: DeliverableRef }): ReactNode {
  if (isInteractiveDeliverable(item)) {
    return <ConversationIcon name='feather-sparkle' className='size-4' />
  }
  const label = deliverableBadgeLabel(item.path ?? '')
  if (label === 'FILE') {
    return <ConversationIcon name='file' className='size-4' />
  }
  return label
}

function DeliverableMark({ item }: { item: DeliverableRef }): ReactNode {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tracking-wide',
        badgeTone(item),
      )}
    >
      <DeliverableMarkGlyph item={item} />
    </span>
  )
}

export function DeliverableCard({
  item,
  onOpenFileRef,
  featured = false,
}: DeliverableCardProps): ReactNode {
  const canOpen = Boolean(onOpenFileRef) && isOpenableDeliverable(item)
  const openRef = deliverableOpenRef(item)
  const rowClass = 'flex w-full items-center gap-3 px-3.5 py-3'
  const chipTestId = isInteractiveDeliverable(item)
    ? 'interactive-artifact-pointer'
    : 'file-reference-chip'

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

  const chipData = {
    'data-testid': chipTestId,
    'data-kind': item.kind,
    'data-path': item.path,
    'data-artifact-id': item.id,
  }

  const chip = canOpen && openRef ? (
    <button
      type='button'
      className={cn('group bg-transparent text-left shadow-none hover:bg-transparent', rowClass)}
      {...chipData}
      onClick={() => onOpenFileRef?.(openRef)}
    >
      {body}
    </button>
  ) : (
    <div className={rowClass} {...chipData}>
      {body}
    </div>
  )

  return (
    <div
      className={cn(
        'timeline-deliverable-card w-full max-w-[min(100%,28rem)] rounded-2xl bg-neutral-100 shadow-[0_2px_8px_rgb(0_0_0/0.06)] dark:bg-white/8',
        isDeletedDeliverable(item) && 'opacity-70',
      )}
      data-testid='timeline-deliverable'
      data-kind={item.kind ?? 'file'}
      data-path={item.path}
      data-change-kind={item.changeKind}
      data-featured={featured ? 'true' : undefined}
      data-artifact-id={item.id}
    >
      {chip}
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
  const cards = visibleDeliverableCards(items, featured)
  const showAll = shouldShowAllArtifactsLink(items, featured)
  const activatePath = featured?.path ?? deliverableCoverageKey(cards[0] ?? items[0]!)

  return (
    <div
      className='flex flex-col items-start gap-2'
      data-testid='timeline-deliverables'
      data-kind='deliverables'
      data-count={String(items.length)}
    >
      {cards.map((item) => (
        <DeliverableCard
          key={deliverableCoverageKey(item) ?? item.title ?? item.path}
          item={item}
          onOpenFileRef={onOpenFileRef}
          featured={featured != null && item === featured}
        />
      ))}
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
