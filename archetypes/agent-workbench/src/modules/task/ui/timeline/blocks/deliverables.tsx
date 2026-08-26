import type { ReactNode } from 'react'
import { ConversationIcon } from '@/components/icons/conversation-icon'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { DeliverableRef } from '../../../projection/types'
import type { TimelineOpenFileRef } from '../timeline-shared'

type DeliverableCardProps = {
  item: DeliverableRef
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
}

type DeliverableZoneProps = {
  items: readonly DeliverableRef[]
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
}

function basename(path: string): string {
  return path.split('/').pop() || path
}

function fileExtLabel(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'FILE'
  return name.slice(dot + 1).toUpperCase().slice(0, 4)
}

function deliverableTitle(item: DeliverableRef): string {
  if (item.title && item.title !== item.path) return item.title
  return basename(item.path)
}

function deliverableMeta(item: DeliverableRef): string {
  const ext = fileExtLabel(item.path)
  if (item.changeKind === 'deleted') return `已删除 · ${ext}`
  if (item.kind === 'image') return `图片 · ${ext}`
  return `文档 · ${ext}`
}

function DeliverableMark({ ext }: { ext: string }): ReactNode {
  return (
    <span
      aria-hidden
      className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-medium tracking-wide text-muted-foreground'
    >
      {ext === 'FILE' ? <ConversationIcon name='file' /> : ext}
    </span>
  )
}

function DeliverableCardBody({
  item,
  showOpenHint,
}: {
  item: DeliverableRef
  showOpenHint: boolean
}): ReactNode {
  return (
    <>
      <DeliverableMark ext={fileExtLabel(item.path)} />
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <CardTitle className='truncate'>{deliverableTitle(item)}</CardTitle>
        <CardDescription className='truncate'>{deliverableMeta(item)}</CardDescription>
      </span>
      {showOpenHint ? (
        <ConversationIcon
          name='arrow-up-right'
          className='text-muted-foreground transition-colors duration-[var(--tl-motion-fast)] ease-[var(--tl-ease-standard)] group-hover:text-foreground'
        />
      ) : null}
    </>
  )
}

function DeliverableCard({
  item,
  onOpenFileRef,
}: DeliverableCardProps): ReactNode {
  const deleted = item.changeKind === 'deleted'
  const canOpen = Boolean(onOpenFileRef) && !deleted
  const rowClass = 'flex w-full items-center gap-3 px-3 py-2.5'

  return (
    <Card
      size='sm'
      className={cn(
        'w-full max-w-[min(100%,28rem)] gap-0 rounded-2xl py-0 shadow-none',
        deleted && 'opacity-70',
      )}
      data-testid='timeline-deliverable'
      data-path={item.path}
      data-change-kind={item.changeKind}
    >
      {canOpen ? (
        <button
          type='button'
          className={cn(
            'group bg-transparent text-left shadow-none hover:bg-transparent',
            rowClass,
          )}
          data-testid='file-reference-chip'
          data-path={item.path}
          onClick={() =>
            onOpenFileRef?.({
              path: item.path,
              label: basename(item.path),
            })
          }
        >
          <DeliverableCardBody item={item} showOpenHint />
        </button>
      ) : (
        <div
          className={rowClass}
          data-testid='file-reference-chip'
          data-path={item.path}
        >
          <DeliverableCardBody item={item} showOpenHint={false} />
        </div>
      )}
    </Card>
  )
}

export function DeliverableZone({
  items,
  onOpenFileRef,
}: DeliverableZoneProps): ReactNode {
  if (items.length === 0) return null
  return (
    <div
      className='flex flex-col gap-2'
      data-testid='timeline-deliverables'
      data-kind='deliverables'
    >
      <p className='tl-chrome text-muted-foreground'>
        本次产出 · {items.length} 个文件
      </p>
      <div className='flex flex-col gap-2'>
        {items.map((item) => (
          <DeliverableCard
            key={item.path}
            item={item}
            onOpenFileRef={onOpenFileRef}
          />
        ))}
      </div>
    </div>
  )
}
