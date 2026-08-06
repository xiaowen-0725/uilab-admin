/**
 * Office Profile O3 — workspace skills bootstrap (compatibility façade).
 * Implementation: plugin skills-loader + skills.office builtin (#20).
 */

import path from 'node:path'
import {
  BUILTIN_SKILLS_OFFICE_PLUGIN,
  OFFICE_BUILTIN_OUTPUT_DIRS,
  OFFICE_BUILTIN_SKILL_IDS,
} from './plugin/builtins.js'
import {
  listWorkspaceSkillIds,
  resolvePluginPackageRoot,
  seedSkillsContribution,
} from './plugin/skills-loader.js'
import { writeFileIfAbsentWithinRoot } from './workspace-root.js'

/** Skill folder ids (= directory names under skills/). */
export const OFFICE_SKILL_IDS = OFFICE_BUILTIN_SKILL_IDS

export type OfficeSkillId = (typeof OFFICE_SKILL_IDS)[number]

/** Deliverable dirs relative to workspace root (spec O3). */
export const OFFICE_OUTPUT_DIRS = OFFICE_BUILTIN_OUTPUT_DIRS

/** Virtual skills root for VoltAgent Workspace (default /skills). */
export const OFFICE_SKILLS_VIRTUAL_ROOT = '/skills'

/** On-disk skills directory name under workspace root. */
export const OFFICE_SKILLS_DIR_NAME = 'skills'

/** Tool names from Workspace skills toolkit (honesty list for capabilities). */
export const OFFICE_SKILL_TOOL_NAMES = [
  'workspace_list_skills',
  'workspace_search_skills',
  'workspace_read_skill',
  'workspace_activate_skill',
  'workspace_deactivate_skill',
  'workspace_read_skill_reference',
  'workspace_read_skill_script',
  'workspace_read_skill_asset',
] as const

export type EnsureOfficeSkillsResult = {
  skillsRoot: string
  seededSkillIds: OfficeSkillId[]
  skippedSkillIds: OfficeSkillId[]
  outputDirs: string[]
}

/**
 * Resolve bundled-skills directory next to this package
 * (`tooling/workbench-runtime-voltagent/bundled-skills`).
 */
export function resolveBundledSkillsDir(
  options?: { packageRoot?: string },
): string {
  if (options?.packageRoot) {
    return path.join(options.packageRoot, 'bundled-skills')
  }
  const packageRoot = resolvePluginPackageRoot()
  return path.join(packageRoot, 'bundled-skills')
}

/**
 * Ensure office skills + output dirs exist under the workspace root.
 * Copies bundled SKILL.md only when the target skill folder has no SKILL.md.
 * Delegates to skills.office builtin contribution.
 */
export async function ensureOfficeSkills(
  workspaceRoot: string,
  options?: { packageRoot?: string; bundledSkillsDir?: string },
): Promise<EnsureOfficeSkillsResult> {
  const contrib = BUILTIN_SKILLS_OFFICE_PLUGIN.contributes?.skills
  if (!contrib) {
    throw new Error('skills.office builtin missing skills contribution')
  }

  const result = await seedSkillsContribution(
    BUILTIN_SKILLS_OFFICE_PLUGIN.id,
    contrib,
    workspaceRoot,
    {
      packageRoot: options?.packageRoot,
      bundledSkillsDir: options?.bundledSkillsDir,
    },
  )

  if (result.status === 'failed') {
    // Path/symlink confinement errors must surface as-is (workspace safety).
    if (result.reason && /路径越界|符号链接/.test(result.reason)) {
      throw new Error(result.reason)
    }
    if (result.missingTemplateIds.length > 0) {
      const bundled =
        options?.bundledSkillsDir ??
        resolveBundledSkillsDir({ packageRoot: options?.packageRoot })
      throw new Error(
        `缺少内置 Skill 模板：${result.missingTemplateIds
          .map((id) => path.join(bundled, id, 'SKILL.md'))
          .join(', ')}（office profile O3）`,
      )
    }
    throw new Error(result.reason ?? '办公 Skills 初始化失败')
  }

  // Preserve OfficeSkillId typing for callers / tests
  const asOffice = (ids: string[]) =>
    ids.filter((id): id is OfficeSkillId =>
      (OFFICE_SKILL_IDS as readonly string[]).includes(id),
    )

  return {
    skillsRoot: result.skillsRoot,
    seededSkillIds: asOffice(result.seededSkillIds),
    skippedSkillIds: asOffice(result.skippedSkillIds),
    outputDirs: result.outputDirs,
  }
}

/** List skill folder names that contain SKILL.md under workspace skills root. */
export async function listSeededSkillIds(
  workspaceRoot: string,
): Promise<string[]> {
  return listWorkspaceSkillIds(workspaceRoot, OFFICE_SKILLS_DIR_NAME)
}

// re-export for callers that only need write helper via skills path
export { writeFileIfAbsentWithinRoot }
