/**
 * Temporary Expert file catalog (honest: not Plugin packaging truth).
 *
 * Spec: tooling/workbench-runtime-voltagent/experts/*.json
 * Migration target: PluginManifest contributes.experts (post-slice).
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CapabilitySnapshotExpert } from './types.js'

export type ExpertDefinition = {
  schemaVersion: number
  id: string
  name: string
  description: string
  /** Instruction overlay for next Turn assembly (no secrets). */
  instruction?: string
  skills: string[]
  connectors: string[]
  source: 'static-catalog'
}

export type ExpertCatalogLoadResult = {
  experts: ExpertDefinition[]
  /** Absolute directory scanned */
  root: string
  errors: string[]
}

const DEFAULT_EXPERTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../experts',
)

/** Built-in fallback if experts/ is missing (keeps unit tests offline-safe). */
export const BUILTIN_EXPERT_FALLBACK: readonly ExpertDefinition[] = [
  {
    schemaVersion: 1,
    id: 'expert.office-meeting',
    name: '会议纪要专家',
    description:
      '会议纪要配置包：默认 meeting-notes 技能；建议配合飞书文档连接器（不自动选用）。',
    instruction:
      '你当前以「会议纪要专家」配置包工作：优先结构化会议纪要（议题、决议、待办、负责人与时间）。若任务已选用飞书连接器且工具面有效，可用领域 CLI 文档工具读取云文档；未连接或未选用时不得假装已读取飞书内容。输出中文。',
    skills: ['meeting-notes'],
    connectors: ['connector.feishu'],
    source: 'static-catalog',
  },
  {
    schemaVersion: 1,
    id: 'expert.xhs-cover',
    name: '小红书封面专家',
    description: '辅助 UX 样例专家配置包（非架构证明必需路径）。',
    instruction:
      '你当前以「小红书封面专家」配置包工作：关注封面标题、视觉卖点与合规表述；不调用未选用的连接器，不编造外呼结果。输出中文。',
    skills: [],
    connectors: [],
    source: 'static-catalog',
  },
]

export function expertDefinitionToSnapshot(
  def: ExpertDefinition,
  taskSelected = false,
): CapabilitySnapshotExpert {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    taskSelected,
    skills: [...def.skills],
    connectors: [...def.connectors],
    source: 'static-catalog',
    instruction: def.instruction,
  }
}

export function parseExpertJson(raw: unknown, fileLabel: string): ExpertDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${fileLabel}: expert JSON 必须是对象`)
  }
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (!id || !name) {
    throw new Error(`${fileLabel}: 缺少 id/name`)
  }
  if (o.schemaVersion !== 1 && o.schemaVersion !== undefined) {
    throw new Error(`${fileLabel}: 不支持的 schemaVersion`)
  }
  const skills = Array.isArray(o.skills)
    ? o.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : []
  const connectors = Array.isArray(o.connectors)
    ? o.connectors.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : []
  // Forbid multi-agent packaging fields if present
  for (const banned of ['subAgents', 'delegate_task', 'shell', 'agents']) {
    if (banned in o) {
      throw new Error(`${fileLabel}: 禁止字段 ${banned}（Expert 不是 supervisor）`)
    }
  }
  return {
    schemaVersion: 1,
    id,
    name,
    description:
      typeof o.description === 'string' ? o.description : name,
    instruction: typeof o.instruction === 'string' ? o.instruction : undefined,
    skills,
    connectors,
    source: 'static-catalog',
  }
}

/**
 * Load experts from directory (*.json). On empty/missing dir, use builtin fallback.
 * Duplicate ids → error entry and skip later files.
 */
export async function loadExpertCatalog(
  root: string = DEFAULT_EXPERTS_DIR,
): Promise<ExpertCatalogLoadResult> {
  const errors: string[] = []
  const byId = new Map<string, ExpertDefinition>()

  try {
    const entries = await readdir(root, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name)
      .sort()

    for (const file of files) {
      const full = path.join(root, file)
      try {
        const text = await readFile(full, 'utf8')
        const parsed = parseExpertJson(JSON.parse(text) as unknown, file)
        if (byId.has(parsed.id)) {
          errors.push(`${file}: 重复 expert id ${parsed.id}`)
          continue
        }
        byId.set(parsed.id, parsed)
      } catch (e) {
        errors.push(
          `${file}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  } catch (e) {
    errors.push(
      `experts dir unreadable: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  if (byId.size === 0) {
    for (const def of BUILTIN_EXPERT_FALLBACK) {
      byId.set(def.id, def)
    }
  }

  return {
    experts: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    root,
    errors,
  }
}

/** Sync snapshot-shaped catalog (fallback builtins; prefer loadExpertCatalog at boot). */
export function getDefaultExpertSnapshotCatalog(): CapabilitySnapshotExpert[] {
  return BUILTIN_EXPERT_FALLBACK.map((d) => expertDefinitionToSnapshot(d))
}

export function getExpertInstruction(
  expertId: string | null | undefined,
  catalog: readonly ExpertDefinition[] | readonly CapabilitySnapshotExpert[] =
    BUILTIN_EXPERT_FALLBACK,
): string | undefined {
  if (!expertId) return undefined
  const hit = catalog.find((e) => e.id === expertId)
  return hit && 'instruction' in hit ? hit.instruction : undefined
}
