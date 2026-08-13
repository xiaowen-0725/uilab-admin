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

export async function configureSidecarApp<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(app: Hono<E, S, BasePath>, input: ConfigureSidecarAppInput): Promise<void> {
  const { workspaceRoot, profile, logger } = input

  app.get('/workspace/info', (c) =>
    c.json({
      workspaceRoot,
      profile,
      note: 'local sidecar workspace — not remote production storage',
    }),
  )

  app.get('/workspace/file', async (c) => {
    const filePath = c.req.query('path') ?? ''
    const maxRaw = c.req.query('maxBytes')
    const maxBytes = maxRaw ? Number(maxRaw) : undefined
    const result = await readWorkspaceFile(workspaceRoot, filePath, {
      maxBytes:
        Number.isFinite(maxBytes) && (maxBytes as number) > 0
          ? (maxBytes as number)
          : undefined,
    })

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

    const mime = guessMimeFromPath(result.relativePath)
    c.header('Content-Type', mime)
    c.header('X-Workspace-Relative-Path', result.relativePath)
    c.header('X-Byte-Length', String(result.byteLength))
    c.header('Cache-Control', 'no-store')
    return c.body(Uint8Array.from(result.bytes))
  })

  let experts: readonly CapabilitySnapshotExpert[]
  try {
    experts = await (input.loadExperts ?? loadExpertsForHttp)()
  } catch (cause) {
    logger.error(
      `capability expert catalog failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
    experts = getDefaultExpertSnapshotCatalog()
  }

  try {
    mountCapabilityRoutes(app, {
      versionRef: input.capabilityVersionRef,
      connectorRuntime: input.connectorRuntime,
      getDiscoverableSkillIds: input.getDiscoverableSkillIds,
      getExperts: () => experts,
    })
  } catch (cause) {
    logger.error(
      `capability routes failed to mount: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
    throw cause
  }
  logger.info(
    `capability routes mounted experts=${experts.map((e) => e.id).join(',') || '(none)'}`,
  )
}
