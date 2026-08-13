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
import { cn } from '@/lib/utils'
import type { SurfaceRegistry, WorkSurfaceHostTab } from '../../model/types'
import { UnknownSurfaceFallback } from './unknown-surface-fallback'

const WORK_SURFACE_EMPTY_NOTICE =
  '工作区暂无打开的标签。打开文档或预览后将显示在此。'

export interface WorkSurfaceHostView {
  visible: boolean
  maximized: boolean
  width: number
  minWidth: number
  maxWidth: number
  /** Task-scoped open tabs from Session (truth projected into chrome). */
  tabs: WorkSurfaceHostTab[]
  activeTabId: string | null
}

export interface WorkSurfaceHostCallbacks {
  /** Close the whole Work pane (retains openTabs in Session). */
  onClose: () => void
  /** Close one tab (Session closeWorkSurfaceTab). */
  onCloseTab: (tabId: string) => void
  onActivateTab: (tabId: string) => void
  onResize: (width: number) => void
  onToggleMaximize: () => void
  onExitMaximize: () => void
}

export interface WorkSurfaceHostProps {
  view: WorkSurfaceHostView
  callbacks: WorkSurfaceHostCallbacks
  /** Injected by Composition Root — Host never registers or imports concrete surfaces. */
  registry: SurfaceRegistry
  /** Selected Task id for SurfaceRenderProps; empty string when none. */
  taskId: string | null
  /** When true, host occupies full stage (narrow serial / maximize). */
  fullStage?: boolean
  /**
   * Optional Shell-owned chrome inserted at the leading edge of the Work toolbar.
   * Composition only — Host does not own Navigator state or callbacks.
   */
  toolbarLeading?: ReactNode
  /**
   * Optional trailing toolbar chrome (before maximize/close), e.g. clear local folder.
   * Composition-owned; Host only places the node.
   */
  toolbarTrailing?: ReactNode
  /**
   * Optional empty-state actions (e.g. bind local folder). Composition-owned;
   * Host only renders the node when no tabs are open.
   */
  emptyExtra?: ReactNode
}

/**
 * Work Surface Host — always mounted so the Shell drawer can collapse with live pixels.
 * Renders active tab body via Surface Registry only (no Document/Browser imports).
 */
export function WorkSurfaceHost({
  view,
  callbacks,
  registry,
  taskId,
  fullStage = false,
  toolbarLeading,
  toolbarTrailing,
  emptyExtra,
}: WorkSurfaceHostProps) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const target = event.currentTarget
      target.focus()
      target.setPointerCapture(event.pointerId)
      dragRef.current = {
        startX: event.clientX,
        startWidth: view.width,
      }
    },
    [view.width],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - event.clientX
      callbacks.onResize(dragRef.current.startWidth + delta)
    },
    [callbacks],
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
    [callbacks, view.maxWidth, view.minWidth, view.width],
  )

  const activeTab =
    view.tabs.find((t) => t.tabId === view.activeTabId) ?? view.tabs[0] ?? null

  const activeDefinition = activeTab
    ? registry.get(activeTab.kind)
    : undefined

  // Drawer slot owns width; Host fills 100% at scale(1). Split shows left divider.
  const hostClassName =
    view.maximized || fullStage || !view.visible
      ? 'relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-background'
      : 'relative flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col border-l border-border bg-background'

  let panelBody: ReactNode
  if (!activeTab) {
    panelBody = (
      <div
        className='flex flex-col gap-3'
        data-testid='work-surface-empty'
      >
        <p className='text-sm leading-relaxed text-muted-foreground'>
          {WORK_SURFACE_EMPTY_NOTICE}
        </p>
        {emptyExtra != null ? (
          <div data-testid='work-surface-empty-extra'>{emptyExtra}</div>
        ) : null}
      </div>
    )
  } else if (activeDefinition) {
    panelBody = activeDefinition.render({
      tabId: activeTab.tabId,
      kind: activeTab.kind,
      resourceKey: activeTab.resourceKey,
      title: activeTab.title,
      taskId: taskId ?? '',
    }) as ReactNode
  } else {
    panelBody = (
      <UnknownSurfaceFallback
        kind={activeTab.kind}
        title={activeTab.title}
        resourceKey={activeTab.resourceKey}
        tabId={activeTab.tabId}
        onCloseTab={callbacks.onCloseTab}
      />
    )
  }

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
            const selected = tab.tabId === view.activeTabId
            return (
              <div
                key={tab.tabId}
                className={cn(
                  'flex shrink-0 items-center gap-0.5 rounded-md',
                  selected ? 'bg-muted' : '',
                )}
              >
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  role='tab'
                  id={`work-tab-${tab.tabId}`}
                  aria-selected={selected}
                  aria-controls='work-surface-panel'
                  data-testid={
                    view.visible ? `work-tab-${tab.tabId}` : undefined
                  }
                  className={cn(
                    'h-auto rounded-md px-2.5 py-1.5 text-xs font-medium',
                    selected
                      ? 'bg-transparent'
                      : 'text-muted-foreground hover:bg-muted/60',
                  )}
                  onClick={() => callbacks.onActivateTab(tab.tabId)}
                >
                  {tab.title}
                </Button>
                <ToolbarIconButton
                  testId={
                    view.visible
                      ? `work-tab-close-${tab.tabId}`
                      : undefined
                  }
                  label={`关闭 ${tab.title}`}
                  onClick={() => callbacks.onCloseTab(tab.tabId)}
                >
                  <X className='size-3' aria-hidden />
                </ToolbarIconButton>
              </div>
            )
          })}
        </div>
        {toolbarTrailing != null ? (
          <div
            className='flex shrink-0 items-center gap-1'
            data-slot='work-toolbar-trailing'
          >
            {toolbarTrailing}
          </div>
        ) : null}
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
        aria-labelledby={
          activeTab ? `work-tab-${activeTab.tabId}` : undefined
        }
        className='min-h-0 flex-1 overflow-auto p-4'
        data-testid={view.visible ? 'work-surface-panel' : undefined}
        // Force remount on task/tab change so Browser/Document release iframe/blob (A8).
        key={`${taskId ?? 'none'}:${activeTab?.tabId ?? 'empty'}`}
      >
        {panelBody}
      </div>
    </section>
  )
}
