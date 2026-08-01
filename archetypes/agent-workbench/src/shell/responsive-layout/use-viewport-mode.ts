import { useEffect, useState } from 'react'

export type ViewportMode = 'wide' | 'medium' | 'narrow'

/** Breakpoints aligned with work order targets (1440 / 1024 / ≤760). */
const NARROW_MAX = 760
const MEDIUM_MAX = 1024

function readMode(width: number): ViewportMode {
  if (width <= NARROW_MAX) return 'narrow'
  if (width <= MEDIUM_MAX) return 'medium'
  return 'wide'
}

/**
 * Viewport-level shell mode (Navigator reserved vs overlay, Work Surface serial).
 * Context reserved/overlay follows Task container queries, not only this hook.
 */
export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(() =>
    typeof window === 'undefined' ? 'wide' : readMode(window.innerWidth)
  )

  useEffect(() => {
    const onResize = () => setMode(readMode(window.innerWidth))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return mode
}
