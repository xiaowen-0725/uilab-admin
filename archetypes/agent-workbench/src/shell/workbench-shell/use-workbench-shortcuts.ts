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
 */
export function useWorkbenchShortcuts(
  view: WorkbenchSessionView,
  commands: WorkbenchSessionCommands
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

      // Allow shortcuts even from composer for panel toggles, except plain typing.
      const key = event.key.toLowerCase()

      if (key === 'b' && !event.shiftKey) {
        event.preventDefault()
        commands.toggleNavigator()
        return
      }

      if (key === 'i' && !event.shiftKey) {
        event.preventDefault()
        commands.toggleContextPanel()
        return
      }

      if (key === 'w' && event.shiftKey) {
        // Avoid conflicting with browser close when not intentional — we use Ctrl/Cmd+Shift+W.
        event.preventDefault()
        commands.toggleWorkSurface()
        return
      }

      // Ignore other mod combos while typing in editable fields.
      if (isEditableTarget(event.target)) return
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commands, view.layout.workSurfaceMaximized])
}
