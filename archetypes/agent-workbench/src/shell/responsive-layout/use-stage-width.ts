import { useEffect, useState, type RefObject } from 'react'

/**
 * Observe Workbench Stage content width via ResizeObserver.
 * Owned by Shell responsive-layout Implementation.
 */
export function useStageWidth(
  stageRef: RefObject<HTMLElement | null>
): number {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      if (el) setWidth(el.clientWidth)
      return
    }

    const update = () => setWidth(el.clientWidth)
    update()

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [stageRef])

  return width
}
