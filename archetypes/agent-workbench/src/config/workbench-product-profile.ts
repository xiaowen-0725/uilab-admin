/**
 * Thin Product Profile — brandable defaults that are not Archetype hard rules.
 * Derived apps override this file; Host resolves `~` in the native process.
 */

export interface WorkbenchProductProfile {
  /** Default directory name under the user home. Neutral; not a competitor brand. */
  projectsHomeDirName: string
  /** Optional absolute path (or `~/…`) overriding the home+name default. */
  projectsHomeOverride?: string
}

export const DEFAULT_WORKBENCH_PRODUCT_PROFILE: WorkbenchProductProfile = {
  projectsHomeDirName: 'AgentWorkbench',
}

export function resolveWorkbenchProductProfile(
  override?: Partial<WorkbenchProductProfile>,
): WorkbenchProductProfile {
  const projectsHomeDirName =
    override?.projectsHomeDirName?.trim() ||
    DEFAULT_WORKBENCH_PRODUCT_PROFILE.projectsHomeDirName
  const projectsHomeOverride = override?.projectsHomeOverride?.trim() || undefined
  return {
    projectsHomeDirName,
    ...(projectsHomeOverride ? { projectsHomeOverride } : {}),
  }
}
