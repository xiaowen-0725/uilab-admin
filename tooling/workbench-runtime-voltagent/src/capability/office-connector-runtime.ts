/**
 * Deep Module for Office Connector auth, live tools, and transport lifecycle.
 * Callers see only commands, per-Turn tools, and aggregate disposal.
 */

import type { Tool } from '@voltagent/core'
import {
  authResourceToBinding,
  defaultCliRunner,
  isConnectorEffective,
  type CliLoadStatus,
  type CliRunner,
  type ConnectorDescriptor,
  type McpServerLoadStatus,
  type PluginAuthStatus,
  type PluginManifest,
  type PluginRegistry,
  type PluginRegistryLoadResult,
  type ProfileEnv,
} from '../plugin/index.js'
import { revokeAuthResource } from '../plugin/revoke-auth-resource.js'
import {
  createConnectorCliAuthRuntime,
  createDefaultCliAuthProcessRunner,
  type CliAuthProcessRunner,
  type ConnectorCliAuthRuntime,
} from './connector-cli-auth.js'
import {
  createConnectorOAuthRuntime,
  type ConnectorOAuthFetch,
  type ConnectorOAuthRuntime,
} from './connector-oauth.js'
import { findConnectorForTool } from './tool-gate.js'
import { startConnectorAuth } from './start-auth.js'
import type {
  ConnectorAuthTransition,
  StartAuthResult,
} from './types.js'

export type OfficeConnectorRuntimeSnapshot = {
  descriptors: readonly ConnectorDescriptor[]
  authStatuses: readonly PluginAuthStatus[]
  enabledPluginIds: readonly string[]
  packagedToolNames: readonly string[]
  mcpStatuses: readonly McpServerLoadStatus[]
  cliStatuses: readonly CliLoadStatus[]
  activeCliSessions: ReadonlyArray<{ connectorId: string; stage: string }>
}

export type OfficeConnectorRuntimeCommand =
  | { kind: 'inspect'; refreshAuth?: boolean }
  | {
      kind: 'check-command-access'
      connectorId: string
      turnContext: {
        taskId: string | null
        selectedConnectorIds: readonly string[]
      }
    }
  | { kind: 'start-auth'; connectorId: string; domains?: string[] }
  | { kind: 'reconcile-auth'; connectorId?: string }
  | { kind: 'revoke-auth'; connectorId: string }

export type OfficeConnectorRuntimeResult =
  | {
      kind: 'inspection'
      snapshot: OfficeConnectorRuntimeSnapshot
    }
  | {
      kind: 'auth-started'
      auth: StartAuthResult
      snapshot: OfficeConnectorRuntimeSnapshot
    }
  | {
      kind: 'command-access-checked'
      access:
        | { allowed: true }
        | { allowed: false; reason: string }
      snapshot: OfficeConnectorRuntimeSnapshot
    }
  | {
      kind: 'auth-reconciled'
      transitions: ConnectorAuthTransition[]
      snapshot: OfficeConnectorRuntimeSnapshot
    }
  | {
      kind: 'auth-revoked'
      connectorId: string
      message: string
      needsSidecarRestart: boolean
      hotReclaimApplied?: boolean
      snapshot: OfficeConnectorRuntimeSnapshot
    }

export type OfficeConnectorRuntime = {
  execute(
    command: OfficeConnectorRuntimeCommand,
  ): Promise<OfficeConnectorRuntimeResult>
  toolsFor(turnContext: {
    taskId: string | null
    selectedConnectorIds: readonly string[]
  }): Tool<any, any>[]
  dispose(): Promise<void>
}

export function createOfficeConnectorRuntime(options: {
  env: ProfileEnv
  registry: PluginRegistry
  plugins: PluginRegistryLoadResult
  manifests: readonly PluginManifest[]
  baseToolNames: readonly string[]
  oauthFetch?: ConnectorOAuthFetch
  cliRunner?: CliRunner
  cliAuthProcessRunner?: CliAuthProcessRunner
}): OfficeConnectorRuntime {
  const authStores = options.registry.getAuthRuntimeStores()
  const bindingStore = authStores.bindingStore
  if (!bindingStore) {
    throw new Error('Office OAuth Runtime 缺少 AuthBindingStore')
  }

  const descriptors = [...options.plugins.connectorDescriptors]
  const enabledPluginIds = options.plugins.plugins
    .filter((plugin) => plugin.enabled && plugin.loadStatus === 'loaded')
    .map((plugin) => plugin.id)
  const oauth = createConnectorOAuthRuntime({
    env: options.env,
    descriptors,
    manifests: options.manifests,
    secretStore: authStores.secretStore,
    bindingStore,
    fetchImpl: options.oauthFetch,
  })
  const cli = createConnectorCliAuthRuntime({
    env: options.env,
    descriptors,
    manifests: options.manifests,
    enabledPluginIds,
    runner: options.cliRunner ?? defaultCliRunner,
    processRunner:
      options.cliAuthProcessRunner ?? createDefaultCliAuthProcessRunner(),
  })
  const liveTools = [...options.plugins.tools] as Tool<any, any>[]
  const packagedToolNames = [
    ...new Set([...options.baseToolNames, ...options.plugins.toolNames]),
  ]
  const mcpStatuses = [...options.plugins.mcpStatuses]
  let authStatuses = [...options.plugins.authStatuses]
  const pendingOAuthHotLoads = new Map<
    string,
    { connectorId: string; pluginId: string }
  >()
  const dynamicMcpDisconnectors = new Map<
    string,
    Array<() => Promise<void>>
  >()
  let disposed = false
  let disposePromise: Promise<void> | undefined
  let commandTail: Promise<void> = Promise.resolve()

  const snapshot = (): OfficeConnectorRuntimeSnapshot => ({
    descriptors: [...descriptors],
    authStatuses: [...authStatuses],
    enabledPluginIds: [...enabledPluginIds],
    packagedToolNames: [...packagedToolNames],
    mcpStatuses: [...mcpStatuses],
    cliStatuses: [...options.plugins.cliStatuses],
    activeCliSessions: cli.getActiveSessions(),
  })

  const refreshAuth = async () => {
    authStatuses = await options.registry.refreshAuthStatuses()
  }

  const acknowledgeCliSessionConnected = (connectorId: string) => {
    const descriptor = descriptors.find(
      (candidate) => candidate.id === connectorId,
    )
    if (!descriptor || descriptor.authSummarySource.kind !== 'cli_session') {
      return
    }
    const pluginId = descriptor.authSummarySource.pluginId
    const resourceId = descriptor.authSummarySource.resourceId
    const resource = options.manifests
      .find((manifest) => manifest.id === pluginId)
      ?.contributes?.auth?.find(
        (candidate) => candidate.resourceId === resourceId,
      )
    if (resource?.kind === 'cli_session') {
      bindingStore.upsert(
        authResourceToBinding(pluginId, resource, options.env),
      )
    }
  }

  const hotLoadOAuthConnector = async (completed: {
    connectorId: string
    pluginId: string
  }) => {
    const descriptor = descriptors.find(
      (candidate) => candidate.id === completed.connectorId,
    )
    if (!descriptor) {
      throw new Error('平台 OAuth 完成后找不到 Connector descriptor')
    }
    const hot = await options.registry.loadMcpPlugin(completed.pluginId)
    const staleNames = toolNamesOwnedByPlugin(
      completed.pluginId,
      packagedToolNames,
      options.plugins,
    )
    replaceArray(
      liveTools,
      liveTools.filter((tool) => !staleNames.has(tool.name)),
    )
    liveTools.push(...hot.tools)
    replaceArray(
      packagedToolNames,
      [...new Set([
        ...packagedToolNames.filter((name) => !staleNames.has(name)),
        ...hot.toolNames,
      ])],
    )
    replaceArray(
      mcpStatuses,
      mcpStatuses.filter((status) => status.pluginId !== completed.pluginId),
    )
    mcpStatuses.push(...hot.statuses)

    for (const disconnect of
      dynamicMcpDisconnectors.get(completed.pluginId) ?? []) {
      try {
        await disconnect()
      } catch (cause) {
        console.warn(
          `[workbench] stale MCP disconnect failed during re-auth for ${completed.pluginId}:`,
          safeError(cause),
        )
      }
    }
    dynamicMcpDisconnectors.set(completed.pluginId, [hot.disconnect])
    if (!hot.statuses.some((status) => status.status === 'connected')) {
      throw new Error(`「${descriptor.name}」已授权，但 MCP 工具热加载失败`)
    }
  }

  const disconnectDynamicMcpPlugin = async (
    pluginId: string,
  ): Promise<boolean> => {
    const disconnectors = dynamicMcpDisconnectors.get(pluginId)
    if (!disconnectors?.length) return false
    for (const disconnect of disconnectors) await disconnect()
    dynamicMcpDisconnectors.delete(pluginId)
    const staleNames = toolNamesOwnedByPlugin(
      pluginId,
      packagedToolNames,
      options.plugins,
    )
    replaceArray(
      liveTools,
      liveTools.filter((tool) => !staleNames.has(tool.name)),
    )
    replaceArray(
      packagedToolNames,
      packagedToolNames.filter((name) => !staleNames.has(name)),
    )
    replaceArray(
      mcpStatuses,
      mcpStatuses.filter((status) => status.pluginId !== pluginId),
    )
    return true
  }

  const perform = async (
    command: OfficeConnectorRuntimeCommand,
  ): Promise<OfficeConnectorRuntimeResult> => {
    if (command.kind === 'inspect') {
      if (command.refreshAuth) await refreshAuth()
      return { kind: 'inspection', snapshot: snapshot() }
    }

    if (command.kind === 'check-command-access') {
      await refreshAuth()
      const descriptor = descriptors.find(
        (candidate) => candidate.id === command.connectorId,
      )
      if (!descriptor) {
        return {
          kind: 'command-access-checked',
          access: { allowed: false, reason: 'connector_not_found' },
          snapshot: snapshot(),
        }
      }
      const auth = authStatuses.find(
        (status) =>
          status.pluginId === descriptor.authSummarySource.pluginId &&
          status.resourceId === descriptor.authSummarySource.resourceId,
      )
      const decision = isConnectorEffective({
        connectorId: descriptor.id,
        pluginGloballyEnabled: descriptor.pluginRefs.some((pluginId) =>
          enabledPluginIds.includes(pluginId),
        ),
        authStatus: auth?.status ?? 'missing',
        taskSelected:
          command.turnContext.taskId !== null &&
          command.turnContext.selectedConnectorIds.includes(descriptor.id),
      })
      return {
        kind: 'command-access-checked',
        access:
          descriptor.commandScopes.length > 0 &&
          decision.capabilityEntersNextTurn
            ? { allowed: true }
            : {
                allowed: false,
                reason: decision.reasons[0] ?? 'command_out_of_scope',
              },
        snapshot: snapshot(),
      }
    }

    if (command.kind === 'start-auth') {
      const auth = await startConnectorAuth(command, {
        descriptors,
        beginOAuth: ({ connectorId }) => oauth.begin(connectorId),
        beginCliSession: async ({ connectorId, domains }) => {
          const started = await cli.begin(connectorId, domains)
          if (started.phase === 'already_connected') {
            acknowledgeCliSessionConnected(connectorId)
          }
          return started
        },
      })
      await refreshAuth()
      return { kind: 'auth-started', auth, snapshot: snapshot() }
    }

    if (command.kind === 'reconcile-auth') {
      for (const completed of await oauth.reconcile()) {
        pendingOAuthHotLoads.set(completed.pluginId, completed)
      }
      for (const [pluginId, completed] of pendingOAuthHotLoads) {
        await hotLoadOAuthConnector(completed)
        pendingOAuthHotLoads.delete(pluginId)
      }
      const cliTransitions = await cli.reconcile(command.connectorId)
      for (const transition of cliTransitions) {
        if (transition.phase === 'connected') {
          acknowledgeCliSessionConnected(transition.connectorId)
        }
      }
      await refreshAuth()
      return {
        kind: 'auth-reconciled',
        transitions: cliTransitions.map(({ authorizationUrl, ...transition }) => ({
          ...transition,
          verificationUrl: authorizationUrl,
        })),
        snapshot: snapshot(),
      }
    }

    const descriptor = descriptors.find(
      (candidate) => candidate.id === command.connectorId,
    )
    if (!descriptor) throw new Error(`未找到连接器：${command.connectorId}`)
    const pluginId = descriptor.authSummarySource.pluginId
    const resource = options.manifests
      .find((manifest) => manifest.id === pluginId)
      ?.contributes?.auth?.find(
        (candidate) =>
          candidate.resourceId === descriptor.authSummarySource.resourceId,
      )
    if (!resource) {
      throw new Error(
        `连接器未声明可撤销的账号资源：${command.connectorId}`,
      )
    }

    const revoked = await revokeAuthResource({
      pluginId,
      resource,
      bindingStore,
      secretStore: authStores.secretStore,
    })
    if (resource.kind === 'cli_session') {
      try {
        await cli.logout(command.connectorId)
      } catch (cause) {
        console.warn(
          `[workbench] CLI session logout failed for ${command.connectorId}:`,
          safeError(cause),
        )
        throw new Error(
          `已标记撤销，但清除「${descriptor.name}」CLI 登录失败：${safeError(cause)}`,
        )
      }
    }

    let hotReclaimApplied = false
    try {
      hotReclaimApplied = await disconnectDynamicMcpPlugin(pluginId)
    } catch (cause) {
      console.warn(
        `[workbench] live MCP disconnect failed for ${pluginId}:`,
        safeError(cause),
      )
    }
    await refreshAuth()
    return {
      kind: 'auth-revoked',
      connectorId: command.connectorId,
      message: `已撤销「${descriptor.name}」账号连接`,
      needsSidecarRestart: hotReclaimApplied
        ? false
        : revoked.needsSidecarRestart,
      hotReclaimApplied,
      snapshot: snapshot(),
    }
  }

  return {
    execute(command) {
      if (disposed) {
        return Promise.reject(new Error('OfficeConnectorRuntime disposed'))
      }
      const result = commandTail.then(() => perform(command))
      commandTail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },

    toolsFor(turnContext) {
      if (disposed) return []
      return liveTools.filter((tool) => {
        const descriptor = findConnectorForTool(tool.name, descriptors)
        if (!descriptor) return true
        const auth = authStatuses.find(
          (status) =>
            status.pluginId === descriptor.authSummarySource.pluginId &&
            status.resourceId === descriptor.authSummarySource.resourceId,
        )
        return isConnectorEffective({
          connectorId: descriptor.id,
          pluginGloballyEnabled: descriptor.pluginRefs.some((pluginId) =>
            enabledPluginIds.includes(pluginId),
          ),
          authStatus: auth?.status ?? 'missing',
          taskSelected:
            turnContext.taskId !== null &&
            turnContext.selectedConnectorIds.includes(descriptor.id),
        }).capabilityEntersNextTurn
      })
    },

    dispose() {
      if (disposePromise) return disposePromise
      disposed = true
      disposePromise = (async () => {
        await commandTail
        const cleanup = [
          cli.dispose(),
          ...[...dynamicMcpDisconnectors.values()]
            .flat()
            .map((disconnect) => disconnect()),
          options.plugins.disconnect(),
        ]
        dynamicMcpDisconnectors.clear()
        pendingOAuthHotLoads.clear()
        const outcomes = await Promise.allSettled(cleanup)
        const failures = outcomes
          .filter(
            (outcome): outcome is PromiseRejectedResult =>
              outcome.status === 'rejected',
          )
          .map((outcome) => outcome.reason)
        if (failures.length) {
          throw new AggregateError(
            failures,
            'OfficeConnectorRuntime dispose failed',
          )
        }
      })()
      return disposePromise
    },
  }
}

export function createEmptyOfficeConnectorRuntime(
  baseToolNames: readonly string[],
): OfficeConnectorRuntime {
  let disposed = false
  const emptySnapshot = (): OfficeConnectorRuntimeSnapshot => ({
    descriptors: [],
    authStatuses: [],
    enabledPluginIds: [],
    packagedToolNames: [...baseToolNames],
    mcpStatuses: [],
    cliStatuses: [],
    activeCliSessions: [],
  })
  return {
    async execute(command) {
      if (disposed) throw new Error('OfficeConnectorRuntime disposed')
      if (command.kind === 'inspect') {
        return { kind: 'inspection', snapshot: emptySnapshot() }
      }
      if (command.kind === 'check-command-access') {
        return {
          kind: 'command-access-checked',
          access: { allowed: false, reason: 'connector_not_found' },
          snapshot: emptySnapshot(),
        }
      }
      if (command.kind === 'start-auth') {
        return {
          kind: 'auth-started',
          auth: await startConnectorAuth(command),
          snapshot: emptySnapshot(),
        }
      }
      if (command.kind === 'reconcile-auth') {
        return {
          kind: 'auth-reconciled',
          transitions: [],
          snapshot: emptySnapshot(),
        }
      }
      throw new Error(`未找到连接器：${command.connectorId}`)
    },
    toolsFor() {
      return []
    },
    async dispose() {
      disposed = true
    },
  }
}

function replaceArray<T>(target: T[], next: readonly T[]): void {
  target.splice(0, target.length, ...next)
}

function safeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function toolNamesOwnedByPlugin(
  pluginId: string,
  publicNames: readonly string[],
  plugins: PluginRegistryLoadResult,
): Set<string> {
  return new Set(
    publicNames.filter(
      (publicName) =>
        plugins.resolveToolIdentity(publicName)?.canonical.pluginId ===
        pluginId,
    ),
  )
}
