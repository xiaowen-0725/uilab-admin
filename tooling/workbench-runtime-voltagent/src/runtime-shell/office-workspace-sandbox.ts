import path from 'node:path'
import {
  LocalSandbox,
  type LocalSandboxIsolationOptions,
  type LocalSandboxIsolationProvider,
  type WorkspaceSandbox,
} from '@voltagent/core'
import type { ConnectorDescriptor } from '../plugin/connector-descriptor.js'
import type { PluginManifest } from '../plugin/manifest.js'
import { filterChildEnv } from '../plugin/security-policy.js'
import type { ProfileEnv } from '../plugin/types.js'
import {
  createConnectorAwareSandbox,
  type ConnectorCommandAccess,
  type ConnectorCommandTurnContext,
} from './connector-aware-sandbox.js'

export type CreateOfficeWorkspaceSandboxOptions = {
  workspaceRoot: string
  env: ProfileEnv
  connectors: readonly ConnectorDescriptor[]
  manifests: readonly PluginManifest[]
  resolveConnectorAccess: (
    connectorId: string,
    turnContext: ConnectorCommandTurnContext,
  ) => Promise<ConnectorCommandAccess>
}

/**
 * Compose the generic Office Shell without teaching Host core any Provider
 * business argv. Ordinary commands use an OS-isolated workspace adapter;
 * Provider command scopes use a closed-env credential adapter after gating.
 */
export async function createOfficeWorkspaceSandbox(
  options: CreateOfficeWorkspaceSandboxOptions,
): Promise<WorkspaceSandbox> {
  const isolationProvider = await resolveIsolationProvider(options.env)
  const workspaceIsolation: LocalSandboxIsolationOptions = {
    provider: isolationProvider,
    allowNetwork: options.env.WORKSPACE_SANDBOX_ALLOW_NETWORK !== '0',
    // Keep readOnlyPaths empty intentionally. VoltAgent then mounts/allows the
    // host read-only and grants writes only to rootDir. Its generated macOS
    // system-directory allowlist is too narrow for /usr/bin tools (SIGABRT).
    allowSystemBinaries: false,
  }
  const defaultSandbox = new LocalSandbox({
    rootDir: options.workspaceRoot,
    defaultTimeoutMs: 30_000,
    maxOutputBytes: 1024 * 1024,
    inheritProcessEnv: false,
    isolation: workspaceIsolation,
  })

  const commandRules = options.connectors
    .filter((connector) => connector.commandScopes.length > 0)
    .map((connector) => {
      const trustedBuiltin = connector.pluginRefs.every(
        (pluginId) =>
          options.manifests.find((manifest) => manifest.id === pluginId)
            ?.kind === 'builtin',
      )
      const executables = Object.fromEntries(
        connector.commandScopes.map((command) => [
          command,
          trustedBuiltin
            ? resolveTrustedExecutable(
                connector,
                command,
                options.manifests,
                options.env,
              )
            : command,
        ]),
      )
      const allowedCommands = Object.values(executables).map((executable) =>
        path.basename(executable),
      )
      return {
        connectorId: connector.id,
        commands: connector.commandScopes,
        executables,
        sandbox: new LocalSandbox({
          rootDir: options.workspaceRoot,
          defaultTimeoutMs: 120_000,
          maxOutputBytes: 1024 * 1024,
          inheritProcessEnv: false,
          env: trustedBuiltin
            ? pickProviderProcessEnv(connector, options.manifests, options.env)
            : undefined,
          allowedCommands,
          // Provider-native CLI sessions may use the OS keychain. The outer
          // adapter fixes the executable, strips model env, gates Task/auth,
          // clamps resources, and every execute_command still needs approval.
          isolation: trustedBuiltin ? { provider: 'none' } : workspaceIsolation,
        }),
      }
    })

  return createConnectorAwareSandbox({
    defaultSandbox,
    commandRules,
    resolveConnectorAccess: options.resolveConnectorAccess,
  })
}

async function resolveIsolationProvider(
  env: ProfileEnv,
): Promise<LocalSandboxIsolationProvider> {
  const configured = env.WORKSPACE_SANDBOX_ISOLATION?.trim()
  if (
    configured === 'none' ||
    configured === 'sandbox-exec' ||
    configured === 'bwrap'
  ) {
    return configured
  }
  return LocalSandbox.detectIsolation()
}

/** Resolve a trusted path from the owning auth probe's Provider env aliases. */
function resolveTrustedExecutable(
  connector: ConnectorDescriptor,
  publicCommand: string,
  manifests: readonly PluginManifest[],
  env: ProfileEnv,
): string {
  for (const pluginId of connector.pluginRefs) {
    const manifest = manifests.find((candidate) => candidate.id === pluginId)
    const resource = manifest?.contributes?.auth?.find(
      (candidate) =>
        candidate.resourceId === connector.authSummarySource.resourceId,
    )
    const statusCommand = resource?.statusCommand
    if (statusCommand?.command !== publicCommand) continue
    for (const envName of statusCommand.commandFromEnv ?? []) {
      const executable = env[envName]?.trim()
      if (executable) return executable
    }
  }
  return publicCommand
}

function pickProviderProcessEnv(
  connector: ConnectorDescriptor,
  manifests: readonly PluginManifest[],
  env: ProfileEnv,
): Record<string, string> {
  const allowedNames = new Set<string>()
  for (const pluginId of connector.pluginRefs) {
    const manifest = manifests.find((candidate) => candidate.id === pluginId)
    const resource = manifest?.contributes?.auth?.find(
      (candidate) =>
        candidate.resourceId === connector.authSummarySource.resourceId,
    )
    for (const name of resource?.cliSession?.childEnvKeys ?? []) {
      allowedNames.add(name)
    }
  }
  return filterChildEnv(env, [...allowedNames], { includeBaseKeys: true })
}
