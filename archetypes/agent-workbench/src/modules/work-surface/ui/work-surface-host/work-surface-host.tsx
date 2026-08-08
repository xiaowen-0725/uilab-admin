import {
  useCallback,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolbarIconButton } from '@/components/toolbar-icon-button'
import type { WorkSurfaceTab } from '@/modules/workbench-session'
import { cn } from '@/lib/utils'

/** Work Surface Module Implementation copy — Phase 6 surfaces not present. */
const WORK_SURFACE_PLACEHOLDER_NOTICE =
  '占位 Work Surface — 具体 Document / Browser / Review Surface Module 在 Phase 6 交付，当前仅验证 Host（显隐、tabs、调宽、最大化）。'

export interface WorkSurfaceHostView {
  visible: boolean
  maximized: boolean
  width: number
  minWidth: number
  maxWidth: number
  /** Derived from session openTabs; may be empty when nothing is open. */
  tabs: WorkSurfaceTab[]
  activeTabId: string | null
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

/**
 * Work Surface Host — always mounted so the Shell drawer can collapse with live pixels.
 * Drawer slot owns width; Host fills the slot. Hidden: inert + aria-hidden, no compat test id.
 */
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

  const activeTab =
    view.tabs.find((t) => t.id === view.activeTabId) ?? view.tabs[0]

  // Drawer slot owns width; Host fills 100% at scale(1). Split shows left divider.
  const hostClassName =
    view.maximized || fullStage || !view.visible
      ? 'relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-background'
      : 'relative flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col border-l border-border bg-background'

  return (
    <section
      className={hostClassName}
      style={{ width: '100%', minWidth: 0 }}
      data-slot='work-surface-host'
      data-testid={view.visible ? 'work-surface-host' : undefined}
      data-maximized={view.maximized ? 'true' : 'false'}
      data-visible={view.visible ? 'true' : 'false'}
      aria-label='工作面宿主'
      aria-hidden={!view.visible}
      inert={!view.visible}
    >
      {view.visible && !view.maximized && !fullStage ? (
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
          <div
            className='flex shrink-0 items-center'
            data-slot='work-toolbar-leading'
          >
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
              <Button
                key={tab.id}
                type='button'
                variant='ghost'
                size='sm'
                role='tab'
                id={`work-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls='work-surface-panel'
                data-testid={view.visible ? `work-tab-${tab.id}` : undefined}
                className={cn(
                  'h-auto rounded-md px-2.5 py-1.5 text-xs font-medium',
                  selected
                    ? 'bg-muted'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
                onClick={() => callbacks.onActivateTab(tab.id)}
              >
                {tab.label}
              </Button>
            )
          })}
        </div>
        <ToolbarIconButton
          testId={view.visible ? 'work-surface-maximize' : undefined}
          pressed={view.maximized}
          label={view.maximized ? '退出最大化' : '最大化工作面'}
          onClick={callbacks.onToggleMaximize}
        >
          {view.maximized ? (
            <Minimize2 aria-hidden />
          ) : (
            <Maximize2 aria-hidden />
          )}
        </ToolbarIconButton>
        <ToolbarIconButton
          testId={view.visible ? 'work-surface-close' : undefined}
          label='关闭工作面'
          onClick={callbacks.onClose}
        >
          <X aria-hidden />
        </ToolbarIconButton>
      </header>

      <div
        id='work-surface-panel'
        role='tabpanel'
        aria-labelledby={activeTab ? `work-tab-${activeTab.id}` : undefined}
        className='min-h-0 flex-1 overflow-auto p-4'
        data-testid={view.visible ? 'work-surface-panel' : undefined}
      >
        <pre className='font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground'>
          {activeTab
            ? tabPlaceholderBody(activeTab.id, activeTab.label)
            : WORK_SURFACE_PLACEHOLDER_NOTICE}
        </pre>
      </div>
    </section>
  )
}
