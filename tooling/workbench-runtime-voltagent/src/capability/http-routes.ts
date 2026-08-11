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
import type { CliLoadStatus } from '../plugin/cli-loader.js'
import type { CliRunner } from '../plugin/cli-loader.js'
import type { ConnectorDescriptor } from '../plugin/connector-descriptor.js'
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
import { startConnectorAuth } from './start-auth.js'
import type {
  CapabilitySnapshotExpert,
  ConnectorAuthTransition,
  TaskCapabilitySelection,
} from './types.js'

export type CapabilityHttpContext = {
  getAuthStatuses: () => Promise<readonly PluginAuthStatus[]>
  getEnabledPluginIds: () => readonly string[]
  getPackagedToolNames: () => readonly string[]
  getCliStatuses: () => readonly CliLoadStatus[]
  getConnectorDescriptors: () => readonly ConnectorDescriptor[]
  getDiscoverableSkillIds?: () => readonly string[]
  /** Temporary expert file catalog (not Plugin packaging). */
  getExperts?: () => readonly CapabilitySnapshotExpert[]
  /** Live re-probe for every enabled Provider auth contribution. */
  refreshAuthStatuses?: () => Promise<readonly PluginAuthStatus[]>
  selectionStore?: CapabilitySelectionStore
  /** Snapshot version counter (mutated on invalidate). */
  versionRef: { current: number }
  beginConnectorOAuth?: (connectorId: string) => Promise<{
    authorizationUrl: string
    expiresIn?: number
  }>
  beginConnectorCliSession?: (
    connectorId: string,
    domains?: string[],
  ) => Promise<{
    phase: 'authorization_required' | 'already_connected'
    step: 'configure' | 'authorize' | 'connected'
    authorizationUrl?: string
    expiresIn?: number
    message: string
  }>
  /** Poll every auth driver and hot-load newly connected capabilities. */
  reconcileConnectorAuth?: (connectorId?: string) => Promise<
    Array<{
      connectorId: string
      kind: 'cli_session' | 'oauth2'
      phase: 'authorization_required' | 'connected' | 'failed'
      step: 'configure' | 'authorize' | 'connected'
      authorizationUrl?: string
      message: string
    }>
  >
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

    const authStatuses = await ctx.getAuthStatuses()
    const snapshot = buildCapabilitySnapshot({
      version: ctx.versionRef.current,
      taskId,
      selectionStore: store,
      authStatuses,
      enabledPluginIds: ctx.getEnabledPluginIds(),
      packagedToolNames: ctx.getPackagedToolNames(),
      cliStatuses: ctx.getCliStatuses(),
      descriptors: ctx.getConnectorDescriptors(),
      discoverableSkillIds: ctx.getDiscoverableSkillIds?.() ?? [],
      experts: resolveExperts(ctx),
    })
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

    const authStatuses = await ctx.getAuthStatuses()
    const snapshot = buildCapabilitySnapshot({
      version: ctx.versionRef.current,
      taskId,
      selection: next,
      authStatuses,
      enabledPluginIds: ctx.getEnabledPluginIds(),
      packagedToolNames: ctx.getPackagedToolNames(),
      cliStatuses: ctx.getCliStatuses(),
      descriptors: ctx.getConnectorDescriptors(),
      discoverableSkillIds: ctx.getDiscoverableSkillIds?.() ?? [],
      experts: resolveExperts(ctx),
    })
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

    const result = await startConnectorAuth(
      { connectorId, domains: body.domains },
      {
        descriptors: ctx.getConnectorDescriptors(),
        beginOAuth: ctx.beginConnectorOAuth
          ? ({ connectorId: target }) => ctx.beginConnectorOAuth!(target)
          : undefined,
        beginCliSession: ctx.beginConnectorCliSession
          ? ({ connectorId: target, domains }) =>
              ctx.beginConnectorCliSession!(target, domains)
          : undefined,
      },
    )
    ctx.versionRef.current += 1
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

    const transitions: ConnectorAuthTransition[] =
      (await ctx.reconcileConnectorAuth?.(body.connectorId?.trim()))?.map(
        ({ authorizationUrl, ...transition }) => ({
          ...transition,
          verificationUrl: authorizationUrl,
        }),
      ) ?? []
    const authStatuses = ctx.refreshAuthStatuses
      ? await ctx.refreshAuthStatuses()
      : await ctx.getAuthStatuses()
    const snapshot = buildCapabilitySnapshot({
      version: ctx.versionRef.current,
      taskId,
      selectionStore: store,
      authStatuses,
      enabledPluginIds: ctx.getEnabledPluginIds(),
      packagedToolNames: ctx.getPackagedToolNames(),
      cliStatuses: ctx.getCliStatuses(),
      descriptors: ctx.getConnectorDescriptors(),
      discoverableSkillIds: ctx.getDiscoverableSkillIds?.() ?? [],
      experts: resolveExperts(ctx),
    })
    return c.json({ ok: true, snapshot, transitions })
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
