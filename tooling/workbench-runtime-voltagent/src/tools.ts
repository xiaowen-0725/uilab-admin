/**
 * Workspace-scoped DIY tools for Workbench M3 / minimal profile.
 * Writes outside WORKSPACE_ROOT are denied.
 * Office profile uses VoltAgent Workspace FS instead (see create-agent.ts).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { resolveWorkspaceRoot } from './profile.js'

function workspaceRoot(): string {
  return resolveWorkspaceRoot(process.env, 'minimal')
}

function resolveSafePath(relativePath: string): string {
  const root = workspaceRoot()
  const resolved = path.resolve(root, relativePath)
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径越界：仅允许工作区根内文件（${root}）`)
  }
  return resolved
}

export const readFileTool = createTool({
  name: 'read_file',
  description:
    'Read a UTF-8 text file under the configured workspace root. Path is relative to workspace root.',
  parameters: z.object({
    path: z.string().describe('Relative path under workspace root'),
  }),
  execute: async ({ path: rel }) => {
    const abs = resolveSafePath(rel)
    const content = await readFile(abs, 'utf8')
    return {
      path: rel,
      content: content.length > 20_000 ? `${content.slice(0, 20_000)}\n…(truncated)` : content,
      bytes: content.length,
    }
  },
})

export const writeFileTool = createTool({
  name: 'write_file',
  description:
    'Write a UTF-8 text file under the workspace root. Creates parent directories. Path is relative.',
  parameters: z.object({
    path: z.string().describe('Relative path under workspace root'),
    content: z.string().describe('Full file content'),
  }),
  needsApproval: true,
  execute: async ({ path: rel, content }) => {
    const abs = resolveSafePath(rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
    const lines = content.split('\n').length
    return {
      path: rel,
      additions: lines,
      deletions: 0,
      bytes: Buffer.byteLength(content, 'utf8'),
    }
  },
})

export const runCommandTool = createTool({
  name: 'run_command',
  description:
    'Echo-only demo command tool (does not spawn a real shell). Use for Timeline command-row demos.',
  parameters: z.object({
    command: z.string().describe('Command string to acknowledge'),
  }),
  needsApproval: async ({ command }) =>
    /\brm\b|\bsudo\b|\bmkfs\b|\bdd\b/i.test(command),
  execute: async ({ command }) => {
    return {
      command,
      stdout: `[workbench-runtime-voltagent] acknowledged: ${command}`,
      exitCode: 0,
      note: 'Demo tool — no real process was spawned.',
    }
  },
})

export const workbenchTools = [readFileTool, writeFileTool, runCommandTool]
