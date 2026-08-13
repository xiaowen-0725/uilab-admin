/**
 * Capability Surface HTTP routes for the local VoltAgent sidecar.
 * Status-safe only — never returns tokens or raw AuthBinding dumps.
 */

import type { Env, Hono, Schema } from 'hono'
import {
  resolveAuthResourceStatus,
  type PluginAuthStatus,
} from '../plugin/auth-status.js'
import type { AuthResourceContribution } from '../plugin/manifest.js'
import type { CliRunner } from '../plugin/cli-loader.js'
import type { ProfileEnv } from '../plugin/types.js'
import {
  getDefaultExpertSnapshotCatalog,
  loadExpertCatalog,
} from './expert-catalog.js'
import {
  getDefaultCapabilitySelectionStore,
  type CapabilitySelectionStore,
} from './selection-store.js'
import { buildCapabilitySnapshot } from './snapshot.js'
import type {
  OfficeConnectorRuntime,
  OfficeConnectorRuntimeSnapshot,
} from './office-connector-runtime.js'
import type {
  CapabilitySnapshot,
  CapabilitySnapshotExpert,
  TaskCapabilitySelection,
} from './types.js'

export type CapabilityHttpContext = {
  connectorRuntime: OfficeConnectorRuntime
  getDiscoverableSkillIds?: () => readonly string[]
  /** Temporary expert file catalog (not Plugin packaging). */
  getExperts?: () => readonly CapabilitySnapshotExpert[]
  selectionStore?: CapabilitySelectionStore
  /** Snapshot version counter (mutated on invalidate). */
  versionRef: { current: number }
}

/** Boot-time expert catalog load (files first, builtin fallback). */
export async function loadExpertsForHttp(): Promise<
  readonly CapabilitySnapshotExpert[]
> {
  const loaded = await loadExpertCatalog()
  if (loaded.errors.length) {
    console.warn(
      '[capability] expert catalog warnings:',
      loaded.errors.join('; '),
    )
  }
  return loaded.experts.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    taskSelected: false,
    skills: [...e.skills],
    connectors: [...e.connectors],
    source: 'static-catalog' as const,
    instruction: e.instruction,
  }))
}

function resolveExperts(
  ctx: CapabilityHttpContext,
): readonly CapabilitySnapshotExpert[] {
  return ctx.getExperts?.() ?? getDefaultExpertSnapshotCatalog()
}

export function mountCapabilityRoutes<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(app: Hono<E, S, BasePath>, ctx: CapabilityHttpContext): void {
  const store = ctx.selectionStore ?? getDefaultCapabilitySelectionStore()

  app.get('/capability/snapshot', async (c) => {
    const taskId = c.req.query('taskId')?.trim() || null
    if (taskId) store.setActiveTaskId(taskId)

    const runtime = await inspectRuntime(ctx)
    const snapshot = buildHttpSnapshot(ctx, store, taskId, runtime)
    return c.json(snapshot)
  })

  app.post('/capability/selection', async (c) => {
    let body: {
      taskId?: string
      selection?: Partial<TaskCapabilitySelection>
      active?: boolean
    }
    try {
      body = (await c.req.json()) as typeof body
    } catch {
      return c.json({ ok: false, error: 'invalid_json' }, 400)
    }
    const taskId = body.taskId?.trim()
    if (!taskId) {
      return c.json({ ok: false, error: 'missing_taskId' }, 400)
    }
    const prev = store.get(taskId)
    const next: TaskCapabilitySelection = {
      connectorIds:
        body.selection?.connectorIds !== undefined
          ? [...body.selection.connectorIds]
          : prev.connectorIds,
      skillIds:
        body.selection?.skillIds !== undefined
          ? [...body.selection.skillIds]
          : prev.skillIds,
      expertId:
        body.selection && 'expertId' in body.selection
          ? (body.selection.expertId ?? null)
          : prev.expertId,
    }
    store.set(taskId, next)
    if (body.active !== false) store.setActiveTaskId(taskId)
    ctx.versionRef.current += 1

    const runtime = await inspectRuntime(ctx)
    const snapshot = buildHttpSnapshot(ctx, store, taskId, runtime, next)
    return c.json({ ok: true, snapshot })
  })

  app.post('/capability/auth/start', async (c) => {
    let body: { connectorId?: string; domains?: string[] }
    try {
      body = (await c.req.json()) as typeof body
    } catch {
      return c.json({ ok: false, error: 'invalid_json' }, 400)
    }
    const connectorId = body.connectorId?.trim()
    if (!connectorId) {
      return c.json({ ok: false, error: 'missing_connectorId' }, 400)
    }

    const executed = await ctx.connectorRuntime.execute({
      kind: 'start-auth',
      connectorId,
      domains: body.domains,
    })
    if (executed.kind !== 'auth-started') {
      throw new Error('OfficeConnectorRuntime start-auth result mismatch')
    }
    ctx.versionRef.current += 1
    const result = executed.auth
    return c.json(result, result.ok ? 200 : 400)
  })

  app.post('/capability/active-task', async (c) => {
    let body: { taskId?: string | null }
    try {
      body = (await c.req.json()) as typeof body
    } catch {
      return c.json({ ok: false, error: 'invalid_json' }, 400)
    }
    const taskId = body.taskId?.trim() || null
    store.setActiveTaskId(taskId)
    return c.json({ ok: true, taskId })
  })

  app.post('/capability/auth/refresh', async (c) => {
    let body: { connectorId?: string; taskId?: string }
    try {
      body = (await c.req.json()) as typeof body
    } catch {
      body = {}
    }
    const taskId = body.taskId?.trim() || store.getActiveTaskId()
    if (taskId) store.setActiveTaskId(taskId)
    ctx.versionRef.current += 1

    const executed = await ctx.connectorRuntime.execute({
      kind: 'reconcile-auth',
      connectorId: body.connectorId?.trim(),
    })
    if (executed.kind !== 'auth-reconciled') {
      throw new Error('OfficeConnectorRuntime reconcile-auth result mismatch')
    }
    const snapshot = buildHttpSnapshot(ctx, store, taskId, executed.snapshot)
    return c.json({ ok: true, snapshot, transitions: executed.transitions })
  })

  app.post('/capability/auth/revoke', async (c) => {
    let body: { connectorId?: string; taskId?: string | null }
    try {
      body = (await c.req.json()) as typeof body
    } catch {
      return c.json({ ok: false, error: 'invalid_json' }, 400)
    }
    const connectorId = body.connectorId?.trim()
    if (!connectorId) {
      return c.json({ ok: false, error: 'missing_connectorId' }, 400)
    }
    const inspection = await inspectRuntime(ctx)
    if (!inspection.descriptors.some((row) => row.id === connectorId)) {
      return c.json({ ok: false, error: 'connector_not_found' }, 404)
    }

    const taskId = body.taskId?.trim() || store.getActiveTaskId()
    if (taskId) store.setActiveTaskId(taskId)

    try {
      const result = await ctx.connectorRuntime.execute({
        kind: 'revoke-auth',
        connectorId,
      })
      if (result.kind !== 'auth-revoked') {
        throw new Error('OfficeConnectorRuntime revoke-auth result mismatch')
      }
      ctx.versionRef.current += 1
      const snapshot = buildHttpSnapshot(ctx, store, taskId, result.snapshot)
      return c.json({
        ok: true,
        connectorId,
        message: result.message,
        needsSidecarRestart: result.needsSidecarRestart,
        hotReclaimApplied: result.hotReclaimApplied,
        snapshot,
      })
    } catch (cause) {
      return c.json(
        {
          ok: false,
          error: 'revoke_failed',
          message:
            cause instanceof Error ? cause.message : '撤销连接失败，请重试',
        },
        500,
      )
    }
  })
}

async function inspectRuntime(
  ctx: CapabilityHttpContext,
): Promise<OfficeConnectorRuntimeSnapshot> {
  const result = await ctx.connectorRuntime.execute({ kind: 'inspect' })
  if (result.kind !== 'inspection') {
    throw new Error('OfficeConnectorRuntime inspect result mismatch')
  }
  return result.snapshot
}

function buildHttpSnapshot(
  ctx: CapabilityHttpContext,
  store: CapabilitySelectionStore,
  taskId: string | null,
  runtime: OfficeConnectorRuntimeSnapshot,
  selection?: TaskCapabilitySelection,
): CapabilitySnapshot {
  return buildCapabilitySnapshot({
    version: ctx.versionRef.current,
    taskId,
    selection,
    selectionStore: store,
    authStatuses: runtime.authStatuses,
    activeCliSessions: runtime.activeCliSessions,
    enabledPluginIds: runtime.enabledPluginIds,
    packagedToolNames: runtime.packagedToolNames,
    cliStatuses: runtime.cliStatuses,
    descriptors: runtime.descriptors,
    discoverableSkillIds: ctx.getDiscoverableSkillIds?.() ?? [],
    experts: resolveExperts(ctx),
  })
}

/** Generic helper for tests/operators: probe one declared auth resource. */
export async function probePluginAuthResource(input: {
  pluginId: string
  resource: AuthResourceContribution
  pluginEnabled: boolean
  env?: ProfileEnv
  runner?: CliRunner
}): Promise<PluginAuthStatus> {
  return resolveAuthResourceStatus(
    input.pluginId,
    input.resource,
    input.pluginEnabled,
    {
      env: input.env,
      runner: input.runner,
    },
  )
}
