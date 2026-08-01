import { useEffect } from 'react'
import type { WorkbenchSessionView } from '@/modules/workbench-session'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/** Shell-owned keyboard toggles — motion source stays outside Session. */
export interface WorkbenchShortcutCallbacks {
  onToggleNavigatorKeyboard: () => void
  onToggleContextKeyboard: () => void
  onToggleWorkKeyboard: () => void
  /** Escape exits maximize instantly (no View Transition). */
  onExitMaximizeKeyboard: () => void
}

/**
 * Global keyboard shortcuts for Shell chrome.
 * Escape exits Work Surface maximize before any other action.
 * Navigator / Context / Work keyboard toggles are Shell-owned for motion source.
 */
export function useWorkbenchShortcuts(
  view: WorkbenchSessionView,
  callbacks: WorkbenchShortcutCallbacks
): void {
  const {
    onToggleNavigatorKeyboard,
    onToggleContextKeyboard,
    onToggleWorkKeyboard,
    onExitMaximizeKeyboard,
  } = callbacks

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (view.layout.workSurfaceMaximized) {
          event.preventDefault()
          onExitMaximizeKeyboard()
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
        onToggleContextKeyboard()
        return
      }

      if (key === 'w' && event.shiftKey) {
        event.preventDefault()
        onToggleWorkKeyboard()
        return
      }

      if (isEditableTarget(event.target)) return
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    onToggleNavigatorKeyboard,
    onToggleContextKeyboard,
    onToggleWorkKeyboard,
    onExitMaximizeKeyboard,
    view.layout.workSurfaceMaximized,
  ])
}
