import { useEffect } from 'react'
import type { WorkbenchSessionCommands, WorkbenchSessionView } from '@/modules/workbench-session'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/**
 * Global keyboard shortcuts for Shell chrome.
 * Escape exits Work Surface maximize before any other action.
 * Navigator keyboard toggle stays Shell-owned for motion source.
 */
export function useWorkbenchShortcuts(
  view: WorkbenchSessionView,
  commands: WorkbenchSessionCommands,
  onToggleNavigatorKeyboard: () => void
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (view.layout.workSurfaceMaximized) {
          event.preventDefault()
          commands.exitMaximize()
        }
        return
      }

      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      const key = event.key.toLowerCase()

      if (key === 'b' && !event.shiftKey) {
        event.preventDefault()
        onToggleNavigatorKeyboard()
        return
      }

      if (key === 'i' && !event.shiftKey) {
        event.preventDefault()
        commands.toggleContextPanel()
        return
      }

      if (key === 'w' && event.shiftKey) {
        event.preventDefault()
        commands.toggleWorkSurface()
        return
      }

      if (isEditableTarget(event.target)) return
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    commands,
    onToggleNavigatorKeyboard,
    view.layout.workSurfaceMaximized,
  ])
}
