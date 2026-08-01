import { useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'

/** Minimal local type — avoid global Document pollution. */
interface ViewTransitionLike {
  skipTransition: () => void
  finished: Promise<void>
}

interface DocumentWithViewTransition {
  startViewTransition?: (updateCallback: () => void) => ViewTransitionLike
}

export type PaneMotionSource = 'animated' | 'instant'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Private Shell helper: pointer-driven Work pane transitions via View Transition API.
 * Keyboard / reduced-motion / missing API → same state update, marked instant.
 * flushSync runs only inside startViewTransition's update callback.
 */
export function usePointerViewTransition() {
  const activeRef = useRef<ViewTransitionLike | null>(null)

  const skipActive = useCallback(() => {
    const active = activeRef.current
    if (!active) return
    try {
      active.skipTransition()
    } catch {
      // Transition may already be finished or in an invalid state.
    }
    activeRef.current = null
  }, [])

  const runPointerTransition = useCallback(
    (update: () => void): PaneMotionSource => {
      skipActive()

      const doc = document as Document & DocumentWithViewTransition
      if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
        update()
        return 'instant'
      }

      try {
        const transition = doc.startViewTransition(() => {
          flushSync(() => {
            update()
          })
        })
        activeRef.current = transition
        // skipTransition rejects finished — swallow so tests/runtime stay clean.
        void Promise.resolve(transition.finished)
          .catch(() => {
            // aborted / skipped
          })
          .finally(() => {
            if (activeRef.current === transition) {
              activeRef.current = null
            }
          })
        return 'animated'
      } catch {
        update()
        return 'instant'
      }
    },
    [skipActive]
  )

  return { runPointerTransition }
}
