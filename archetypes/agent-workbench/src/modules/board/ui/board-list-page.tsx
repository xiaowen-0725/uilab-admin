import { LayoutGrid, MessageSquarePlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BoardListCard } from '../model/board-view'
import { boardOriginBadge } from '../model/preset-board'
import type { WidgetDataSourceRecord } from '../model/types'
import {
  anonymousIdentitySnapshot,
  resolveWidgetRenderState,
} from '../model/widget-render-state'
import type { IdentityScopeSnapshot } from '../ports/identity-scope-port'
import {
  THUMBNAIL_GEOMETRY,
  THUMBNAIL_SCALE,
  THUMBNAIL_SLOTS,
  toThumbnailSlots,
} from '../model/grid'
import { formatRelative } from '../model/relative-time'
import type { WidgetTheme } from '../model/widget-document'
import { BoardCanvas } from './board-canvas'
import { BoardWidgetHost } from './board-widget-host'

export type ThumbnailMode = 'live' | 'static'

export const THUMBNAIL_COST_CEILING_MS = 5000

/** List-page wall clock over this ceiling flips the thumbnail switch to static. */
export function resolveThumbnailMode(listPageElapsedMs: number): ThumbnailMode {
  return listPageElapsedMs > THUMBNAIL_COST_CEILING_MS ? 'static' : 'live'
}

export interface BoardListPageProps {
  boards: readonly BoardListCard[]
  theme: WidgetTheme
  thumbnailMode?: ThumbnailMode
  onOpenBoard: (boardId: string) => void
  onCreateByChat: () => void
  onWidgetReady?: (widgetId: string, elapsedMs: number) => void
  identity?: IdentityScopeSnapshot
}

export function BoardListPage({
  boards,
  theme,
  thumbnailMode = 'live',
  onOpenBoard,
  onCreateByChat,
  onWidgetReady,
  identity = anonymousIdentitySnapshot(),
}: BoardListPageProps) {
  return (
    <div
      className='flex h-full min-h-0 flex-col'
      data-testid='board-list-page'
      data-thumbnail-mode={thumbnailMode}
    >
      <header className='flex shrink-0 items-center gap-3 border-b border-border/60 px-6 py-4'>
        <h1 className='flex-1 text-base font-semibold text-foreground'>看板</h1>
        <Button
          type='button'
          size='sm'
          data-testid='board-create-by-chat'
          onClick={onCreateByChat}
        >
          <MessageSquarePlus className='size-4' aria-hidden />
          对话创建
        </Button>
      </header>

      {boards.length === 0 ? (
        <div
          className='flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center'
          data-testid='board-list-empty'
        >
          <LayoutGrid className='size-8 text-muted-foreground/60' aria-hidden />
          <p className='text-sm text-foreground'>还没有看板</p>
          <p className='max-w-sm text-xs text-muted-foreground'>
            用一句话描述你想长期盯着的东西，比如「每天早上给我一个待办和汇率概览」，看板和小组件会在对话里生成。
          </p>
          <Button type='button' size='sm' onClick={onCreateByChat}>
            <MessageSquarePlus className='size-4' aria-hidden />
            对话创建
          </Button>
        </div>
      ) : (
        <div className='min-h-0 flex-1 overflow-auto px-6 py-5'>
          <ul className='grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4'>
            {boards.map((card) => (
              <li key={card.board.id}>
                <BoardCard
                  card={card}
                  theme={theme}
                  thumbnailMode={thumbnailMode}
                  identity={identity}
                  onOpen={onOpenBoard}
                  onWidgetReady={onWidgetReady}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function BoardCard({
  card,
  theme,
  thumbnailMode,
  identity,
  onOpen,
  onWidgetReady,
}: {
  card: BoardListCard
  theme: WidgetTheme
  thumbnailMode: ThumbnailMode
  identity: IdentityScopeSnapshot
  onOpen: (boardId: string) => void
  onWidgetReady?: (widgetId: string, elapsedMs: number) => void
}) {
  const { board, widgets } = card
  const slots = toThumbnailSlots(widgets.map((widget) => widget.id))
  const items = slots.map((slot, index) => ({
    id: slot.widgetId ?? `empty-${index}`,
    placement: slot.placement,
  }))
  const hiddenCount = Math.max(0, widgets.length - THUMBNAIL_SLOTS)
  const originBadge = boardOriginBadge(board)

  return (
    <div
      className='group flex w-full flex-col gap-2 rounded-xl border border-border/70 bg-card p-3 text-left transition-colors hover:border-border has-focus-visible:border-ring'
      data-testid='board-card'
      data-board-id={board.id}
      onClick={() => onOpen(board.id)}
    >
      <div
        className='pointer-events-none overflow-hidden rounded-lg bg-muted/40 p-2'
        data-testid='board-card-thumbnail'
        aria-hidden
      >
        <BoardCanvas
          items={items}
          geometry={THUMBNAIL_GEOMETRY}
          mode='read-only'
          data-testid='board-thumbnail-canvas'
          renderItem={(id) => (
            <ThumbnailCell
              widget={widgets.find((candidate) => candidate.id === id)}
              source={card.sources?.get(id)}
              identity={identity}
              theme={theme}
              thumbnailMode={thumbnailMode}
              onWidgetReady={onWidgetReady}
            />
          )}
        />
      </div>

      <div className='flex min-w-0 items-center gap-2'>
        <button
          type='button'
          className='min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
          data-testid='board-card-open'
          onClick={(event) => {
            event.stopPropagation()
            onOpen(board.id)
          }}
        >
          {board.title}
        </button>
        {originBadge ? (
          <Badge variant='secondary' data-testid={originBadge.testId}>
            {originBadge.label}
          </Badge>
        ) : null}
      </div>
      <p className='text-xs text-muted-foreground'>
        {widgets.length} 个小组件 · {formatRelative(board.updatedAt)}更新
        {hiddenCount > 0 ? ` · 另有 ${hiddenCount} 个未放入预览` : ''}
      </p>
    </div>
  )
}

function ThumbnailCell({
  widget,
  source,
  identity,
  theme,
  thumbnailMode,
  onWidgetReady,
}: {
  widget: BoardListCard['widgets'][number] | undefined
  source?: WidgetDataSourceRecord
  identity: IdentityScopeSnapshot
  theme: WidgetTheme
  thumbnailMode: ThumbnailMode
  onWidgetReady?: (widgetId: string, elapsedMs: number) => void
}) {
  if (!widget) {
    return (
      <div
        className='h-full w-full rounded-md bg-muted-foreground/10'
        data-testid='board-thumbnail-placeholder'
      />
    )
  }
  const painted = resolveWidgetRenderState({
    latestData: widget.latestData,
    source,
    identity,
  })
  if (thumbnailMode === 'static') {
    return (
      <div
        className='flex h-full w-full items-center justify-center rounded-md border border-border/60 bg-card px-1 text-center text-[9px] leading-tight text-muted-foreground'
        data-testid='board-thumbnail-static'
      >
        {widget.title}
      </div>
    )
  }
  return (
    <div className='relative h-full w-full overflow-hidden rounded-md'>
      <div
        className='origin-top-left'
        data-testid='board-thumbnail-scale'
        style={{
          width: `${100 / THUMBNAIL_SCALE}%`,
          height: `${100 / THUMBNAIL_SCALE}%`,
          transform: `scale(${THUMBNAIL_SCALE})`,
        }}
      >
        <BoardWidgetHost
          widgetId={widget.id}
          title={widget.title}
          html={widget.html}
          data={painted.data}
          theme={theme}
          chrome='none'
          heartbeat={false}
          inert
          hasJob={false}
          status={widget.status}
          identityChrome={painted.chrome}
          onReady={(elapsedMs) => onWidgetReady?.(widget.id, elapsedMs)}
          className='rounded-md'
        />
      </div>
      <span
        className='absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-[9px] leading-tight text-foreground'
        data-testid='board-thumbnail-title'
      >
        {widget.title}
      </span>
    </div>
  )
}
