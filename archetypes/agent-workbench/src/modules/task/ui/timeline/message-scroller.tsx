import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TimelineFollowMode } from '../../projection/types'

function isNearBottom(el: HTMLElement, threshold = 80): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function scrollElementToBottom(el: HTMLElement): void {
  el.scrollTop = el.scrollHeight
}

export interface MessageScrollerProps {
  taskId: string
  followTip?: string
  followMode?: TimelineFollowMode
  onFollowModeChange?: (mode: TimelineFollowMode) => void
  className?: string
  children: ReactNode
  'aria-label'?: string
  'data-runtime-turn'?: string
  'data-turn-status'?: string
  'data-recovery'?: string
  'data-honesty-mode'?: string
}

/**
 * Layer 4 scroller: follow only when the tip identity changes,
 * pin after the user scrolls up, and a "有新内容" pill.
 * Same-bubble growth must not steal the viewport or increment unread.
 */
export function MessageScroller({
  taskId,
  followTip = '',
  followMode: followModeProp = 'follow',
  onFollowModeChange,
  className,
  children,
  'aria-label': ariaLabel,
  ...dataAttrs
}: MessageScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followTipRef = useRef(followTip)
  const [followMode, setFollowMode] = useState<TimelineFollowMode>(followModeProp)
  const followModeRef = useRef(followMode)
  const [localUnread, setLocalUnread] = useState(0)

  const setMode = useCallback(
    (mode: TimelineFollowMode) => {
      followModeRef.current = mode
      setFollowMode(mode)
      if (mode === 'follow') setLocalUnread(0)
      onFollowModeChange?.(mode)
    },
    [onFollowModeChange],
  )

  useLayoutEffect(() => {
    setMode('follow')
    followTipRef.current = followTip
    const scroller = scrollRef.current
    if (scroller) scrollElementToBottom(scroller)
    // Only reset ownership when the Task itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- taskId is the switch signal
  }, [taskId, setMode])

  useEffect(() => {
    if (followModeProp === followModeRef.current) return
    followModeRef.current = followModeProp
    setFollowMode(followModeProp)
    if (followModeProp !== 'follow') return
    setLocalUnread(0)
    const scroller = scrollRef.current
    if (scroller) scrollElementToBottom(scroller)
  }, [followModeProp])

  useLayoutEffect(() => {
    if (followTipRef.current === followTip) return
    followTipRef.current = followTip
    const scroller = scrollRef.current
    if (followModeRef.current === 'follow') {
      if (scroller) scrollElementToBottom(scroller)
      setLocalUnread(0)
      return
    }
    setLocalUnread((count) => count + 1)
  }, [followTip])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (isNearBottom(el)) {
      if (followModeRef.current !== 'follow') setMode('follow')
    } else if (followModeRef.current === 'follow') {
      setMode('user-pinned')
    }
  }, [setMode])

  useEffect(() => {
    const content = contentRef.current
    const scroller = scrollRef.current
    if (!content || !scroller || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (followModeRef.current !== 'follow') return
        if (!isNearBottom(scroller)) return
        scrollElementToBottom(scroller)
      })
    })
    observer.observe(content)
    observer.observe(scroller)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const jumpToBottom = useCallback(() => {
    setMode('follow')
    const scroller = scrollRef.current
    if (scroller) scrollElementToBottom(scroller)
  }, [setMode])

  const showNewContent = followMode === 'user-pinned' && localUnread > 0

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      <div
        ref={scrollRef}
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3',
          showNewContent && 'pb-14',
        )}
        data-slot='task-timeline'
        data-testid='task-timeline'
        data-follow-mode={followMode}
        data-follow-tip={followTip}
        aria-label={ariaLabel}
        onScroll={onScroll}
        {...dataAttrs}
      >
        <div
          ref={contentRef}
          className='mx-auto flex w-full max-w-[var(--tl-column-width,var(--content-max-width))] flex-col gap-[var(--tl-turn-gap)]'
        >
          {children}
          <div data-testid='timeline-bottom-anchor' />
        </div>
      </div>

      {showNewContent ? (
        <div className='pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center'>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            className='pointer-events-auto shadow-md'
            data-testid='timeline-new-content'
            onClick={jumpToBottom}
          >
            有新内容{localUnread > 1 ? `（${localUnread}）` : ''}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
