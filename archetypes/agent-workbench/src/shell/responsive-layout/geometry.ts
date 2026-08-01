/**
 * Shell-owned geometry constants for Stage split (not Session Interface).
 * Aligns with work order medium desktop mins.
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
