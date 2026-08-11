/**
 * Skills contribution loader (#20).
 * Seeds SKILL.md missing-only; never overwrites user customizations.
 */

import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SkillsContribution } from './manifest.js'
import {
  assertCanonicalWithinRoot,
  ensureDirWithinRoot,
  pathExists,
  resolvePathWithinRoot,
  writeFileIfAbsentWithinRoot,
} from '../workspace-root.js'
import type { ProfileEnv } from './types.js'

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
  // Test/host override only (trusted)
  if (options?.bundledSkillsDir) {
    return path.resolve(options.bundledSkillsDir)
  }
  if (!contrib.bundledRelativeDir) return null
  // Deny absolute paths from declarative manifests (escape vector)
  if (path.isAbsolute(contrib.bundledRelativeDir)) {
    return null
  }
  if (
    contrib.bundledRelativeDir.includes('..') ||
    contrib.bundledRelativeDir.includes('\\')
  ) {
    return null
  }
  const packageRoot = resolvePluginPackageRoot(options)
  const joined = path.resolve(packageRoot, contrib.bundledRelativeDir)
  const rel = path.relative(packageRoot, joined)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return joined
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
  options?: {
    packageRoot?: string
    bundledSkillsDir?: string
    env?: ProfileEnv
    trustedInstalledSource?: boolean
  },
): Promise<SkillsSeedResult> {
  if (contrib.installedSource) {
    if (!options?.trustedInstalledSource) {
      return failedSeedResult(
        pluginId,
        contrib,
        'installedSource 仅允许受信任内置插件使用',
      )
    }
    return syncInstalledSkillsContribution(
      pluginId,
      contrib,
      workspaceRoot,
      options.env ?? process.env,
    )
  }

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
      // Refuse symlink escape outside bundled root
      try {
        await assertCanonicalWithinRoot(bundledRoot, srcSkill)
      } catch {
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
  items: Array<{
    pluginId: string
    contrib: SkillsContribution
    trustedInstalledSource?: boolean
  }>,
  options?: {
    workspaceRoot?: string
    packageRoot?: string
    bundledSkillsDir?: string
    env?: ProfileEnv
  },
): Promise<SkillsAggregate> {
  const virtualRoots: string[] = []
  const seen = new Set<string>()
  const results: SkillsSeedResult[] = []
  const addVirtualRoot = (virtualRoot: string) => {
    if (seen.has(virtualRoot)) return
    seen.add(virtualRoot)
    virtualRoots.push(virtualRoot)
  }

  for (const { pluginId, contrib, trustedInstalledSource } of items) {
    const virtualRoot = normalizeVirtualSkillRoot(contrib.virtualRoot)
    if (!contrib.installedSource) addVirtualRoot(virtualRoot)

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
      {
        ...options,
        trustedInstalledSource,
      },
    )
    results.push(result)
    if (contrib.installedSource && result.status !== 'failed') {
      addVirtualRoot(virtualRoot)
    }
  }

  return { virtualRoots, results }
}

async function syncInstalledSkillsContribution(
  pluginId: string,
  contrib: SkillsContribution,
  workspaceRoot: string,
  env: ProfileEnv,
): Promise<SkillsSeedResult> {
  const installed = contrib.installedSource!
  const virtualRoot = normalizeVirtualSkillRoot(contrib.virtualRoot)
  const workspaceDir = contrib.workspaceDir?.trim() || DEFAULT_WORKSPACE_DIR
  const root = path.resolve(workspaceRoot)
  const skillsRoot = resolvePathWithinRoot(root, workspaceDir)
  const sourceRoot = resolveInstalledSkillsRoot(installed, env)

  try {
    if (!sourceRoot || !(await pathExists(sourceRoot))) {
      throw new Error(
        '未找到已安装的官方 Skills；请安装到 ~/.agents/skills 或设置 FEISHU_SKILLS_ROOT',
      )
    }
    const sourceStat = await lstat(sourceRoot)
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
      throw new Error(`Skills 来源必须是真实目录：${sourceRoot}`)
    }

    const entries = await readdir(sourceRoot, { withFileTypes: true })
    const skillIds = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          installed.includePrefixes.some((prefix) =>
            entry.name.startsWith(prefix),
          ),
      )
      .map((entry) => entry.name)
      .sort()
    const validSkillIds: string[] = []
    for (const skillId of skillIds) {
      const skillMd = path.join(sourceRoot, skillId, 'SKILL.md')
      if (!(await pathExists(skillMd))) continue
      const stat = await lstat(skillMd)
      if (stat.isFile() && !stat.isSymbolicLink()) validSkillIds.push(skillId)
    }
    if (validSkillIds.length === 0) {
      throw new Error(
        `Skills 来源中未找到 ${installed.includePrefixes.join(',')}* 包：${sourceRoot}`,
      )
    }

    await ensureDirWithinRoot(root, path.dirname(skillsRoot))
    const suffix = `${process.pid}-${Date.now()}`
    const staging = resolvePathWithinRoot(
      root,
      `${workspaceDir}.staging-${suffix}`,
    )
    const backup = resolvePathWithinRoot(
      root,
      `${workspaceDir}.previous-${suffix}`,
    )
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging)

    try {
      for (const skillId of validSkillIds) {
        await copyTreeWithoutSymlinks(
          path.join(sourceRoot, skillId),
          path.join(staging, skillId),
        )
      }

      let movedPrevious = false
      if (await pathExists(skillsRoot)) {
        await assertCanonicalWithinRoot(root, skillsRoot)
        await rename(skillsRoot, backup)
        movedPrevious = true
      }
      try {
        await rename(staging, skillsRoot)
      } catch (error) {
        if (movedPrevious && (await pathExists(backup))) {
          await rename(backup, skillsRoot)
        }
        throw error
      }
      await rm(backup, { recursive: true, force: true })
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      throw error
    }

    return {
      pluginId,
      virtualRoot,
      workspaceDir,
      skillsRoot,
      seededSkillIds: validSkillIds,
      skippedSkillIds: [],
      missingTemplateIds: [],
      outputDirs: [],
      status: 'seeded',
    }
  } catch (error) {
    return failedSeedResult(
      pluginId,
      contrib,
      error instanceof Error ? error.message : String(error),
      skillsRoot,
    )
  }
}

function resolveInstalledSkillsRoot(
  installed: NonNullable<SkillsContribution['installedSource']>,
  env: ProfileEnv,
): string | null {
  for (const envName of installed.rootFromEnv ?? []) {
    const value = env[envName]?.trim()
    if (value) return path.resolve(value)
  }
  const relative = installed.defaultUserRelativeDir?.trim()
  if (!relative || path.isAbsolute(relative) || relative.includes('..')) {
    return null
  }
  return path.resolve(os.homedir(), relative)
}

async function copyTreeWithoutSymlinks(
  source: string,
  destination: string,
): Promise<void> {
  const stat = await lstat(source)
  if (stat.isSymbolicLink()) {
    throw new Error(`Skills 来源禁止符号链接：${source}`)
  }
  if (stat.isDirectory()) {
    await mkdir(destination)
    const entries = await readdir(source)
    for (const entry of entries) {
      await copyTreeWithoutSymlinks(
        path.join(source, entry),
        path.join(destination, entry),
      )
    }
    return
  }
  if (!stat.isFile()) {
    throw new Error(`Skills 来源包含不支持的文件类型：${source}`)
  }
  await copyFile(source, destination)
}

function failedSeedResult(
  pluginId: string,
  contrib: SkillsContribution,
  reason: string,
  skillsRoot = '',
): SkillsSeedResult {
  return {
    pluginId,
    virtualRoot: normalizeVirtualSkillRoot(contrib.virtualRoot),
    workspaceDir: contrib.workspaceDir?.trim() || DEFAULT_WORKSPACE_DIR,
    skillsRoot,
    seededSkillIds: [],
    skippedSkillIds: [],
    missingTemplateIds: [],
    outputDirs: [],
    status: 'failed',
    reason,
  }
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
