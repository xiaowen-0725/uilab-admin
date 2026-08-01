/**
 * Shell-owned Stage split constraints (not Session Interface).
 * Visual inset geometry and motion tokens live in styles/index.css.
 */

export const TASK_SURFACE_MIN_WIDTH = 420
export const WORK_SURFACE_MIN_WIDTH = 320

/**
 * Effective Work Surface max for the current Stage:
 * max(workMin, min(sessionMax, stageWidth - taskMin))
 */
export function computeEffectiveWorkMax(
  stageWidth: number,
  sessionMax: number,
  taskMin: number = TASK_SURFACE_MIN_WIDTH,
  workMin: number = WORK_SURFACE_MIN_WIDTH
): number {
  if (!Number.isFinite(stageWidth) || stageWidth <= 0) {
    return Math.max(workMin, Math.min(sessionMax, workMin))
  }
  return Math.max(workMin, Math.min(sessionMax, stageWidth - taskMin))
}
