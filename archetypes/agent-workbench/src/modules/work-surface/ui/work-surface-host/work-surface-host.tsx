import {
  useCallback,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import type { WorkSurfaceTab } from '@/modules/workbench-session'

/** Work Surface Module Implementation copy — Phase 6 surfaces not present. */
const WORK_SURFACE_PLACEHOLDER_NOTICE =
  '占位 Work Surface — 具体 Document / Browser / Review Surface Module 在 Phase 6 交付，当前仅验证 Host（显隐、tabs、调宽、最大化）。'

const TOOLBAR_CONTROL_CLASS =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted'

export interface WorkSurfaceHostView {
  visible: boolean
  maximized: boolean
  width: number
  minWidth: number
  maxWidth: number
  tabs: WorkSurfaceTab[]
  activeTabId: string
}

export interface WorkSurfaceHostCallbacks {
  onClose: () => void
  onActivateTab: (tabId: string) => void
  onResize: (width: number) => void
  onToggleMaximize: () => void
  onExitMaximize: () => void
}

export interface WorkSurfaceHostProps {
  view: WorkSurfaceHostView
  callbacks: WorkSurfaceHostCallbacks
  /** When true, host occupies full stage (narrow serial / maximize). */
  fullStage?: boolean
  /**
   * Optional Shell-owned chrome inserted at the leading edge of the Work toolbar.
   * Composition only — Host does not own Navigator state or callbacks.
   */
  toolbarLeading?: ReactNode
}

function tabPlaceholderBody(tabId: string, label: string): string {
  return [
    `占位标签：${label}`,
    '',
    WORK_SURFACE_PLACEHOLDER_NOTICE,
    '',
    `tabId=${tabId}`,
    '这不是 Document / Browser / Review 实现，也不是 Surface Registry。',
  ].join('\n')
}

export function WorkSurfaceHost({
  view,
  callbacks,
  fullStage = false,
  toolbarLeading,
}: WorkSurfaceHostProps) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const target = event.currentTarget
      // Focus before capture so keyboard resize continues after pointer interaction
      // even when preventDefault would otherwise suppress the browser focus step.
      target.focus()
      target.setPointerCapture(event.pointerId)
      dragRef.current = {
        startX: event.clientX,
        startWidth: view.width,
      }
    },
    [view.width]
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return
      // Dragging the left-edge handle: moving left increases Work Surface width.
      const delta = dragRef.current.startX - event.clientX
      callbacks.onResize(dragRef.current.startWidth + delta)
    },
    [callbacks]
  )

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore if already released
    }
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 32 : 16
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        callbacks.onResize(view.width + step)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        callbacks.onResize(view.width - step)
      } else if (event.key === 'Home') {
        event.preventDefault()
        callbacks.onResize(view.maxWidth)
      } else if (event.key === 'End') {
        event.preventDefault()
        callbacks.onResize(view.minWidth)
      }
    },
    [callbacks, view.maxWidth, view.minWidth, view.width]
  )

  if (!view.visible) {
    return null
  }

  const activeTab =
    view.tabs.find((t) => t.id === view.activeTabId) ?? view.tabs[0]

  const styleWidth =
    view.maximized || fullStage
      ? undefined
      : { width: view.width, minWidth: view.minWidth }

  // Split only: left divider between Task and Work. Full-stage has no internal left edge.
  const hostClassName =
    view.maximized || fullStage
      ? 'relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-background'
      : 'relative flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-background'

  return (
    <section
      className={hostClassName}
      style={styleWidth}
      data-slot='work-surface-host'
      data-testid='work-surface-host'
      data-maximized={view.maximized ? 'true' : 'false'}
      aria-label='工作面宿主'
    >
      {!view.maximized && !fullStage ? (
        <div
          role='separator'
          aria-orientation='vertical'
          aria-label='调整工作面宽度'
          aria-valuemin={view.minWidth}
          aria-valuemax={view.maxWidth}
          aria-valuenow={view.width}
          tabIndex={0}
          data-testid='work-surface-resize'
          className='absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none outline-none focus-visible:bg-ring/40'
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
      ) : null}

      <header
        className='flex h-11 shrink-0 items-center gap-2 border-b border-border px-2'
        data-slot='work-surface-toolbar'
      >
        {toolbarLeading != null ? (
          <div className='flex shrink-0 items-center' data-slot='work-toolbar-leading'>
            {toolbarLeading}
          </div>
        ) : null}
        <div
          className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto'
          role='tablist'
          aria-label='工作面标签'
        >
          {view.tabs.map((tab) => {
            const selected = tab.id === view.activeTabId
            return (
              <button
                key={tab.id}
                type='button'
                role='tab'
                id={`work-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls='work-surface-panel'
                data-testid={`work-tab-${tab.id}`}
                className={
                  selected
                    ? 'rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium focus-visible:ring-3 focus-visible:ring-ring/50'
                    : 'rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50'
                }
                onClick={() => callbacks.onActivateTab(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <button
          type='button'
          data-testid='work-surface-maximize'
          className={TOOLBAR_CONTROL_CLASS}
          aria-pressed={view.maximized}
          aria-label={view.maximized ? '退出最大化' : '最大化工作面'}
          title={view.maximized ? '退出最大化' : '最大化工作面'}
          onClick={callbacks.onToggleMaximize}
        >
          {view.maximized ? (
            <Minimize2 className='size-4' aria-hidden />
          ) : (
            <Maximize2 className='size-4' aria-hidden />
          )}
        </button>
        <button
          type='button'
          data-testid='work-surface-close'
          className={TOOLBAR_CONTROL_CLASS}
          aria-label='关闭工作面'
          title='关闭工作面'
          onClick={callbacks.onClose}
        >
          <X className='size-4' aria-hidden />
        </button>
      </header>

      <div
        id='work-surface-panel'
        role='tabpanel'
        aria-labelledby={
          activeTab ? `work-tab-${activeTab.id}` : undefined
        }
        className='min-h-0 flex-1 overflow-auto p-4'
        data-testid='work-surface-panel'
      >
        <pre className='whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground'>
          {activeTab
            ? tabPlaceholderBody(activeTab.id, activeTab.label)
            : WORK_SURFACE_PLACEHOLDER_NOTICE}
        </pre>
      </div>
    </section>
  )
}
