/**
 * Skills contribution loader (#20).
 * Seeds SKILL.md missing-only; never overwrites user customizations.
 */

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SkillsContribution } from './manifest.js'
import {
  assertCanonicalWithinRoot,
  ensureDirWithinRoot,
  pathExists,
  writeFileIfAbsentWithinRoot,
} from '../workspace-root.js'

export type SkillsSeedResult = {
  pluginId: string
  virtualRoot: string
  workspaceDir: string
  skillsRoot: string
  seededSkillIds: string[]
  skippedSkillIds: string[]
  missingTemplateIds: string[]
  outputDirs: string[]
  status: 'seeded' | 'skipped' | 'failed'
  reason?: string
}

export type SkillsAggregate = {
  /** Virtual roots for Workspace.skills.rootPaths (deduped, order preserved) */
  virtualRoots: string[]
  results: SkillsSeedResult[]
}

const DEFAULT_VIRTUAL_ROOT = '/skills'
const DEFAULT_WORKSPACE_DIR = 'skills'

/**
 * Package root for this runtime package
 * (`tooling/workbench-runtime-voltagent`).
 */
export function resolvePluginPackageRoot(
  options?: { packageRoot?: string },
): string {
  if (options?.packageRoot) return path.resolve(options.packageRoot)
  const here = path.dirname(fileURLToPath(import.meta.url))
  // src/plugin → package root
  return path.resolve(here, '../..')
}

export function resolveSkillsBundledDir(
  contrib: SkillsContribution,
  options?: { packageRoot?: string; bundledSkillsDir?: string },
): string | null {
  if (options?.bundledSkillsDir) return path.resolve(options.bundledSkillsDir)
  if (!contrib.bundledRelativeDir) return null
  if (path.isAbsolute(contrib.bundledRelativeDir)) {
    return contrib.bundledRelativeDir
  }
  return path.join(
    resolvePluginPackageRoot(options),
    contrib.bundledRelativeDir,
  )
}

export function normalizeVirtualSkillRoot(raw?: string): string {
  const v = (raw ?? DEFAULT_VIRTUAL_ROOT).trim() || DEFAULT_VIRTUAL_ROOT
  return v.startsWith('/') ? v : `/${v}`
}

/**
 * Seed one skills contribution into the workspace (missing-only).
 * Safe when skillIds empty: only ensures dirs / reports virtual root.
 */
export async function seedSkillsContribution(
  pluginId: string,
  contrib: SkillsContribution,
  workspaceRoot: string,
  options?: { packageRoot?: string; bundledSkillsDir?: string },
): Promise<SkillsSeedResult> {
  const virtualRoot = normalizeVirtualSkillRoot(contrib.virtualRoot)
  const workspaceDir = contrib.workspaceDir?.trim() || DEFAULT_WORKSPACE_DIR
  const skillIds = contrib.skillIds ?? []
  const outputRel = contrib.outputDirs ?? []

  try {
    const root = path.resolve(workspaceRoot)
    const skillsRoot = await ensureDirWithinRoot(root, workspaceDir)
    const bundledRoot = resolveSkillsBundledDir(contrib, options)

    const seededSkillIds: string[] = []
    const skippedSkillIds: string[] = []
    const missingTemplateIds: string[] = []

    for (const id of skillIds) {
      if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
        missingTemplateIds.push(id)
        continue
      }
      await ensureDirWithinRoot(root, path.join(workspaceDir, id))
      const relSkill = path.join(workspaceDir, id, 'SKILL.md')

      if (!bundledRoot) {
        // No template source: do not invent content; leave existing or empty.
        const absSkill = path.join(root, relSkill)
        if (await pathExists(absSkill)) skippedSkillIds.push(id)
        else missingTemplateIds.push(id)
        continue
      }

      const srcSkill = path.join(bundledRoot, id, 'SKILL.md')
      if (!(await pathExists(srcSkill))) {
        missingTemplateIds.push(id)
        continue
      }

      const content = await readFile(srcSkill, 'utf8')
      const { wrote } = await writeFileIfAbsentWithinRoot(root, relSkill, content)
      if (wrote) seededSkillIds.push(id)
      else skippedSkillIds.push(id)
    }

    const outputDirs: string[] = []
    for (const rel of outputRel) {
      if (!rel || rel.includes('..')) continue
      const abs = await ensureDirWithinRoot(root, rel)
      outputDirs.push(abs)
    }

    const status: SkillsSeedResult['status'] =
      missingTemplateIds.length > 0 && seededSkillIds.length === 0 && skillIds.length > 0
        ? 'failed'
        : 'seeded'

    return {
      pluginId,
      virtualRoot,
      workspaceDir,
      skillsRoot,
      seededSkillIds,
      skippedSkillIds,
      missingTemplateIds,
      outputDirs,
      status,
      reason:
        status === 'failed'
          ? `缺少 Skill 模板：${missingTemplateIds.join(',')}`
          : undefined,
    }
  } catch (err) {
    return {
      pluginId,
      virtualRoot,
      workspaceDir,
      skillsRoot: '',
      seededSkillIds: [],
      skippedSkillIds: [],
      // Path/symlink failures are not "missing templates"
      missingTemplateIds: [],
      outputDirs: [],
      status: 'failed',
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Apply skills from enabled plugins. Isolates per-plugin failures.
 */
export async function loadSkillsContributions(
  items: Array<{ pluginId: string; contrib: SkillsContribution }>,
  options?: {
    workspaceRoot?: string
    packageRoot?: string
    bundledSkillsDir?: string
  },
): Promise<SkillsAggregate> {
  const virtualRoots: string[] = []
  const seen = new Set<string>()
  const results: SkillsSeedResult[] = []

  for (const { pluginId, contrib } of items) {
    const virtualRoot = normalizeVirtualSkillRoot(contrib.virtualRoot)
    if (!seen.has(virtualRoot)) {
      seen.add(virtualRoot)
      virtualRoots.push(virtualRoot)
    }

    if (!options?.workspaceRoot) {
      results.push({
        pluginId,
        virtualRoot,
        workspaceDir: contrib.workspaceDir?.trim() || DEFAULT_WORKSPACE_DIR,
        skillsRoot: '',
        seededSkillIds: [],
        skippedSkillIds: [],
        missingTemplateIds: [],
        outputDirs: [],
        status: 'skipped',
        reason: '未提供 workspaceRoot，跳过 seed',
      })
      continue
    }

    const result = await seedSkillsContribution(
      pluginId,
      contrib,
      options.workspaceRoot,
      options,
    )
    results.push(result)
  }

  return { virtualRoots, results }
}

/** List skill folder names that contain SKILL.md under workspace skills dir. */
export async function listWorkspaceSkillIds(
  workspaceRoot: string,
  workspaceDir = DEFAULT_WORKSPACE_DIR,
): Promise<string[]> {
  const root = path.resolve(workspaceRoot)
  const skillsRoot = path.join(root, workspaceDir)
  if (!(await pathExists(skillsRoot))) return []
  await assertCanonicalWithinRoot(root, skillsRoot)
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  const ids: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const skillMd = path.join(skillsRoot, entry.name, 'SKILL.md')
    if (await pathExists(skillMd)) {
      try {
        await assertCanonicalWithinRoot(root, skillMd)
        ids.push(entry.name)
      } catch {
        // skip escaped entries
      }
    }
  }
  return ids.sort()
}
