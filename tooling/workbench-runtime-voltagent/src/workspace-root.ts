/**
 * Workspace root productization (Office Profile O2).
 *
 * - Explicit WORKSPACE_ROOT resolution lives in profile.ts
 * - This module owns path confinement helpers and first-run bootstrap README
 * - Bootstrap writes refuse symlink escape (Codex P1)
 */

import {
  access,
  lstat,
  mkdir,
  realpath,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

/** Filename written once when an office workspace is first created. */
export const OFFICE_WORKSPACE_README_NAME = 'README.md'

export type EnsureOfficeWorkspaceResult = {
  createdRoot: boolean
  wroteReadme: boolean
  readmePath: string
}

/**
 * Resolve a path that must stay under `root` (lexical only).
 * Accepts relative paths or absolute paths that still land inside the root.
 * Throws a readable Chinese error on escape attempts.
 */
export function resolvePathWithinRoot(root: string, inputPath: string): string {
  const resolvedRoot = path.resolve(root)
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(resolvedRoot, inputPath)
  if (!isLexicallyWithinRoot(resolvedRoot, resolved)) {
    throw new Error(
      `路径越界：仅允许工作区根内文件（${resolvedRoot}），收到：${inputPath}`,
    )
  }
  return resolved
}

/** Lexical containment (no realpath). */
export function isLexicallyWithinRoot(root: string, candidate: string): boolean {
  const r = path.resolve(root)
  const c = path.resolve(candidate)
  const rel = path.relative(r, c)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function isSymlink(target: string): Promise<boolean> {
  try {
    const st = await lstat(target)
    return st.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * After realpath, ensure target still lies under the workspace root.
 * Throws 路径越界 on symlink escape or missing path that is a dangling link.
 */
export async function assertCanonicalWithinRoot(
  root: string,
  target: string,
): Promise<string> {
  const resolvedRoot = path.resolve(root)
  let rootReal: string
  try {
    rootReal = await realpath(resolvedRoot)
  } catch {
    rootReal = resolvedRoot
  }

  if (await isSymlink(target)) {
    let real: string
    try {
      real = await realpath(target)
    } catch {
      throw new Error(
        `路径越界：工作区内符号链接无效或指向根外（${target}）`,
      )
    }
    if (!isLexicallyWithinRoot(rootReal, real)) {
      throw new Error(
        `路径越界：工作区内符号链接指向根外（${target} → ${real}）`,
      )
    }
    return real
  }

  if (await pathExists(target)) {
    const real = await realpath(target)
    if (!isLexicallyWithinRoot(rootReal, real)) {
      throw new Error(
        `路径越界：解析后的路径在工作区外（${target} → ${real}）`,
      )
    }
    return real
  }

  // Target does not exist — validate parent chain.
  const parent = path.dirname(target)
  if (parent !== target && (await pathExists(parent) || await isSymlink(parent))) {
    await assertCanonicalWithinRoot(rootReal, parent)
  }
  return target
}

/**
 * Create a directory under root, refusing symlink components that escape.
 * Creates intermediate segments one-by-one so a pre-existing symlink is detected.
 */
export async function ensureDirWithinRoot(
  root: string,
  relativeOrAbs: string,
): Promise<string> {
  const resolvedRoot = path.resolve(root)
  const target = resolvePathWithinRoot(resolvedRoot, relativeOrAbs)

  if (!(await pathExists(resolvedRoot))) {
    await mkdir(resolvedRoot, { recursive: true })
  }
  await assertCanonicalWithinRoot(resolvedRoot, resolvedRoot)

  const rel = path.relative(path.resolve(resolvedRoot), target)
  if (rel === '') return path.resolve(resolvedRoot)

  const parts = rel.split(path.sep).filter(Boolean)
  let current = path.resolve(resolvedRoot)

  for (const part of parts) {
    const next = path.join(current, part)
    if (await isSymlink(next)) {
      await assertCanonicalWithinRoot(resolvedRoot, next)
      current = await realpath(next)
      continue
    }
    if (!(await pathExists(next))) {
      await mkdir(next)
    }
    current = next
  }

  await assertCanonicalWithinRoot(resolvedRoot, target)
  return target
}

/**
 * Write a new file under root only if the path is not a symlink and stays inside root.
 * Does not overwrite existing files (including existing symlinks — throws if symlink).
 */
export async function writeFileIfAbsentWithinRoot(
  root: string,
  relativeOrAbs: string,
  content: string,
): Promise<{ wrote: boolean; path: string }> {
  const resolvedRoot = path.resolve(root)
  const target = resolvePathWithinRoot(resolvedRoot, relativeOrAbs)
  await ensureDirWithinRoot(resolvedRoot, path.dirname(target))

  if (await isSymlink(target)) {
    throw new Error(
      `路径越界：拒绝写入指向工作区外的符号链接（${target}）`,
    )
  }
  if (await pathExists(target)) {
    await assertCanonicalWithinRoot(resolvedRoot, target)
    return { wrote: false, path: target }
  }

  await writeFile(target, content, { encoding: 'utf8', flag: 'wx' })
  return { wrote: true, path: target }
}

/**
 * Ensure the office workspace directory exists and place a short first-run
 * README when missing. Never overwrites an existing README.
 * Refuses symlink escape for root and README path.
 */
export async function ensureOfficeWorkspace(
  workspaceRoot: string,
): Promise<EnsureOfficeWorkspaceResult> {
  const root = path.resolve(workspaceRoot)
  const rootExisted = await pathExists(root)

  if (await isSymlink(root)) {
    await assertCanonicalWithinRoot(path.dirname(root), root)
  }

  await ensureDirWithinRoot(root, root)

  const readmePath = path.join(root, OFFICE_WORKSPACE_README_NAME)
  let wroteReadme = false
  try {
    const result = await writeFileIfAbsentWithinRoot(
      root,
      OFFICE_WORKSPACE_README_NAME,
      officeWorkspaceReadmeContent(root),
    )
    wroteReadme = result.wrote
  } catch (err) {
    // Surface symlink escape; other errors rethrow
    throw err
  }

  return {
    createdRoot: !rootExisted,
    wroteReadme,
    readmePath,
  }
}

function officeWorkspaceReadmeContent(workspaceRoot: string): string {
  return [
    '# VoltAgent Office 工作区',
    '',
    '这是 **本机办公 Agent Runtime** 的默认授权目录（不是远程生产集群）。',
    '',
    '## 你在哪里',
    '',
    `- 当前工作区根：\`${workspaceRoot}\``,
    '- Agent 只能读写本目录内的文件；越界路径会被拒绝。',
    '',
    '## 配置',
    '',
    '- 用环境变量 `WORKSPACE_ROOT` 指向你自己的资料夹（绝对路径）。',
    '- 未设置时，Office Profile 默认使用 `~/VoltAgent-Office/workspace`。',
    '- 不会默认整个用户主目录或 monorepo 仓库根。',
    '',
    '## 约定路径（可后续 Skills 使用）',
    '',
    '- `output/meeting-notes/` — 会议纪要',
    '- `output/weekly-report/` — 周报',
    '- `output/research-brief/` — 调研简报',
    '',
    '## 安全提示',
    '',
    '- 写文件 / 删除默认需要你在 Workbench 中审批。',
    '- API 密钥只放在侧车 `.env`，不要写进本工作区。',
    '',
    '删除本文件后，侧车下次启动会在空根上重新生成默认说明（若文件不存在）。',
    '',
  ].join('\n')
}
