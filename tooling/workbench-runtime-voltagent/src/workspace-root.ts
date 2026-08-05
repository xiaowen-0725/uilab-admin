/**
 * Workspace root productization (Office Profile O2).
 *
 * - Explicit WORKSPACE_ROOT resolution lives in profile.ts
 * - This module owns path confinement helpers and first-run bootstrap README
 */

import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Filename written once when an office workspace is first created. */
export const OFFICE_WORKSPACE_README_NAME = 'README.md'

export type EnsureOfficeWorkspaceResult = {
  createdRoot: boolean
  wroteReadme: boolean
  readmePath: string
}

/**
 * Resolve a path that must stay under `root`.
 * Accepts relative paths or absolute paths that still land inside the root.
 * Throws a readable Chinese error on escape attempts.
 */
export function resolvePathWithinRoot(root: string, inputPath: string): string {
  const resolvedRoot = path.resolve(root)
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(resolvedRoot, inputPath)
  const rel = path.relative(resolvedRoot, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `路径越界：仅允许工作区根内文件（${resolvedRoot}），收到：${inputPath}`,
    )
  }
  return resolved
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
 * Ensure the office workspace directory exists and place a short first-run
 * README when missing. Never overwrites an existing README.
 */
export async function ensureOfficeWorkspace(
  workspaceRoot: string,
): Promise<EnsureOfficeWorkspaceResult> {
  const root = path.resolve(workspaceRoot)
  const readmePath = path.join(root, OFFICE_WORKSPACE_README_NAME)
  const rootExisted = await pathExists(root)

  await mkdir(root, { recursive: true })

  const readmeExisted = await pathExists(readmePath)
  if (!readmeExisted) {
    await writeFile(readmePath, officeWorkspaceReadmeContent(root), 'utf8')
  }

  return {
    createdRoot: !rootExisted,
    wroteReadme: !readmeExisted,
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
