/**
 * Sidecar custom HTTP routes (workspace + Capability Surface).
 * Must finish mounting before Hono's matcher is built.
 */

import type { Env, Hono, Schema } from 'hono'
import {
  getDefaultExpertSnapshotCatalog,
} from './capability/expert-catalog.js'
import {
  loadExpertsForHttp,
  mountCapabilityRoutes,
} from './capability/http-routes.js'
import type { OfficeConnectorRuntime } from './capability/office-connector-runtime.js'
import type { CapabilitySnapshotExpert } from './capability/types.js'
import type { AgentProfile } from './profile.js'
import {
  guessMimeFromPath,
  httpStatusForWorkspaceRead,
  readWorkspaceFile,
} from './workspace-file-api.js'

export type SidecarHttpLogger = {
  info: (message: string) => void
  error: (message: string) => void
}

export type ConfigureSidecarAppInput = {
  workspaceRoot: string
  profile: AgentProfile
  capabilityVersionRef: { current: number }
  connectorRuntime: OfficeConnectorRuntime
  getDiscoverableSkillIds: () => readonly string[]
  logger: SidecarHttpLogger
  loadExperts?: () => Promise<readonly CapabilitySnapshotExpert[]>
}

function safeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function parsePositiveMaxBytes(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

function mountWorkspaceRoutes<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(
  app: Hono<E, S, BasePath>,
  workspaceRoot: string,
  profile: AgentProfile,
): void {
  app.get('/workspace/info', (c) =>
    c.json({
      workspaceRoot,
      profile,
      note: 'local sidecar workspace — not remote production storage',
    }),
  )

  app.get('/workspace/file', async (c) => {
    const result = await readWorkspaceFile(
      workspaceRoot,
      c.req.query('path') ?? '',
      { maxBytes: parsePositiveMaxBytes(c.req.query('maxBytes')) },
    )

    if (!result.ok) {
      return c.json(
        {
          ok: false,
          reason: result.reason,
          message: result.message,
        },
        httpStatusForWorkspaceRead(result.reason) as
          | 400
          | 403
          | 404
          | 413
          | 500,
      )
    }

    c.header('Content-Type', guessMimeFromPath(result.relativePath))
    c.header('X-Workspace-Relative-Path', result.relativePath)
    c.header('X-Byte-Length', String(result.byteLength))
    c.header('Cache-Control', 'no-store')
    return c.body(Uint8Array.from(result.bytes))
  })
}

async function loadExpertsOrDefault(
  loadExperts: ConfigureSidecarAppInput['loadExperts'],
  logger: SidecarHttpLogger,
): Promise<readonly CapabilitySnapshotExpert[]> {
  try {
    return await (loadExperts ?? loadExpertsForHttp)()
  } catch (cause) {
    logger.error(`capability expert catalog failed: ${safeError(cause)}`)
    return getDefaultExpertSnapshotCatalog()
  }
}

export async function configureSidecarApp<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(app: Hono<E, S, BasePath>, input: ConfigureSidecarAppInput): Promise<void> {
  const { workspaceRoot, profile, logger } = input
  mountWorkspaceRoutes(app, workspaceRoot, profile)

  const experts = await loadExpertsOrDefault(input.loadExperts, logger)
  try {
    mountCapabilityRoutes(app, {
      versionRef: input.capabilityVersionRef,
      connectorRuntime: input.connectorRuntime,
      getDiscoverableSkillIds: input.getDiscoverableSkillIds,
      getExperts: () => experts,
    })
  } catch (cause) {
    logger.error(`capability routes failed to mount: ${safeError(cause)}`)
    throw cause
  }

  logger.info(
    `capability routes mounted experts=${experts.map((e) => e.id).join(',') || '(none)'}`,
  )
}
