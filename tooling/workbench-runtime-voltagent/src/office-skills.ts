/**
 * Office Profile O3 — bundled workspace skills bootstrap.
 *
 * Seeds three SKILL.md folders under workspace `/skills` (virtual) /
 * `skills/` on disk, plus conventional output directories.
 * Does not overwrite existing SKILL.md (user may customize).
 */

import { access, copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Skill folder ids (= directory names under skills/). */
export const OFFICE_SKILL_IDS = [
  'meeting-notes',
  'weekly-report',
  'research-brief',
] as const

export type OfficeSkillId = (typeof OFFICE_SKILL_IDS)[number]

/** Deliverable dirs relative to workspace root (spec O3). */
export const OFFICE_OUTPUT_DIRS = [
  'output/meeting-notes',
  'output/weekly-report',
  'output/research-brief',
] as const

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

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
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
  // src/office-skills.ts → package root
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../bundled-skills')
}

/**
 * Ensure office skills + output dirs exist under the workspace root.
 * Copies bundled SKILL.md only when the target skill folder has no SKILL.md.
 */
export async function ensureOfficeSkills(
  workspaceRoot: string,
  options?: { packageRoot?: string; bundledSkillsDir?: string },
): Promise<EnsureOfficeSkillsResult> {
  const root = path.resolve(workspaceRoot)
  const skillsRoot = path.join(root, OFFICE_SKILLS_DIR_NAME)
  const bundledRoot =
    options?.bundledSkillsDir ?? resolveBundledSkillsDir(options)

  await mkdir(skillsRoot, { recursive: true })

  const seededSkillIds: OfficeSkillId[] = []
  const skippedSkillIds: OfficeSkillId[] = []

  for (const id of OFFICE_SKILL_IDS) {
    const destDir = path.join(skillsRoot, id)
    const destSkill = path.join(destDir, 'SKILL.md')
    await mkdir(destDir, { recursive: true })

    if (await pathExists(destSkill)) {
      skippedSkillIds.push(id)
      continue
    }

    const srcSkill = path.join(bundledRoot, id, 'SKILL.md')
    if (!(await pathExists(srcSkill))) {
      throw new Error(
        `缺少内置 Skill 模板：${srcSkill}（office profile O3）`,
      )
    }
    await copyFile(srcSkill, destSkill)
    seededSkillIds.push(id)
  }

  const outputDirs: string[] = []
  for (const rel of OFFICE_OUTPUT_DIRS) {
    const abs = path.join(root, rel)
    await mkdir(abs, { recursive: true })
    outputDirs.push(abs)
  }

  return { skillsRoot, seededSkillIds, skippedSkillIds, outputDirs }
}

/** List skill folder names that contain SKILL.md under workspace skills root. */
export async function listSeededSkillIds(
  workspaceRoot: string,
): Promise<string[]> {
  const skillsRoot = path.join(path.resolve(workspaceRoot), OFFICE_SKILLS_DIR_NAME)
  if (!(await pathExists(skillsRoot))) return []
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  const ids: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (await pathExists(path.join(skillsRoot, entry.name, 'SKILL.md'))) {
      ids.push(entry.name)
    }
  }
  return ids.sort()
}
