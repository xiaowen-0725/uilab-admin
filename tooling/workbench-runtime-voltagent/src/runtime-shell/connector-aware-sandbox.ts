import path from 'node:path'
import {
  normalizeCommandAndArgs,
  type WorkspaceSandbox,
  type WorkspaceSandboxExecuteOptions,
  type WorkspaceSandboxResult,
} from '@voltagent/core'
import { readCapabilityTurnContext } from '../capability/turn-context.js'

export type ConnectorCommandAccess = {
  pluginEnabled: boolean
  connected: boolean
  taskSelected: boolean
}

export type ConnectorCommandTurnContext = {
  taskId: string | null
  selectedConnectorIds: readonly string[]
}

export type ConnectorCommandRule = {
  connectorId: string
  /** Executable basenames owned by this Connector, for example lark-cli. */
  commands: readonly string[]
  /** Optional trusted executable path per public command basename. */
  executables?: Readonly<Record<string, string>>
  /** Adapter allowed to access this Provider's host credential/session. */
  sandbox: WorkspaceSandbox
}

export type CreateConnectorAwareSandboxOptions = {
  /** Default isolated Adapter for ordinary workspace commands. */
  defaultSandbox: WorkspaceSandbox
  commandRules: readonly ConnectorCommandRule[]
  resolveConnectorAccess: (
    connectorId: string,
    turnContext: ConnectorCommandTurnContext,
  ) => Promise<ConnectorCommandAccess>
  /** Hard ceiling applied even when the model asks for more. */
  maxTimeoutMs?: number
  /** Per-stream hard ceiling applied even when the model asks for more. */
  maxOutputBytes?: number
}

/**
 * Deep WorkspaceSandbox adapter: ordinary commands stay in the default OS
 * sandbox; Provider-owned commands additionally require Connector access and
 * use the Provider credential adapter. No Provider business argv lives here.
 */
export function createConnectorAwareSandbox(
  options: CreateConnectorAwareSandboxOptions,
): WorkspaceSandbox {
  const rules = options.commandRules.map((rule) => ({
    ...rule,
    commands: new Set(rule.commands.map(normalizeCommandKey)),
    executables: new Map(
      Object.entries(rule.executables ?? {}).map(([command, executable]) => [
        normalizeCommandKey(command),
        executable,
      ]),
    ),
  }))
  const maxTimeoutMs = options.maxTimeoutMs ?? 120_000
  const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024

  return {
    name: 'connector-aware-local',
    status: 'ready',
    getInfo: () => ({
      name: 'connector-aware-local',
      defaultSandbox: options.defaultSandbox.name,
      connectorCommands: rules.map((rule) => ({
        connectorId: rule.connectorId,
        commands: [...rule.commands],
      })),
    }),
    getInstructions: () =>
      'Workspace command execution. Provider commands require the matching Connector to be enabled, connected, and selected for the active Task.',
    execute: async (
      executeOptions: WorkspaceSandboxExecuteOptions,
    ): Promise<WorkspaceSandboxResult> => {
      const normalized = normalizeCommandAndArgs(
        executeOptions.command,
        executeOptions.args,
      )
      const commandKey = normalizeCommandKey(normalized.command)
      const rule = rules.find((candidate) =>
        candidate.commands.has(commandKey),
      )

      if (!rule) {
        const indirectRule = rules.find((candidate) =>
          containsScopedCommand(normalized, candidate.commands),
        )
        if (indirectRule) {
          throw new Error(
            `connector_command_indirection_denied:${indirectRule.connectorId}`,
          )
        }
        return options.defaultSandbox.execute({
          ...executeOptions,
          command: normalized.command,
          args: normalized.args,
        })
      }

      const turnContext = readCapabilityTurnContext(
        executeOptions.operationContext,
      )
      const access = await options.resolveConnectorAccess(
        rule.connectorId,
        turnContext,
      )
      if (!access.pluginEnabled) {
        throw new Error(`connector_plugin_not_enabled:${rule.connectorId}`)
      }
      if (!access.connected) {
        throw new Error(`connector_not_connected:${rule.connectorId}`)
      }
      if (!access.taskSelected) {
        throw new Error(`connector_not_selected:${rule.connectorId}`)
      }

      return rule.sandbox.execute({
        ...executeOptions,
        // A Provider credential adapter never accepts model-supplied env and
        // never follows a model-supplied absolute executable path.
        command: rule.executables.get(commandKey) ?? commandKey,
        args: normalized.args,
        env: undefined,
        timeoutMs: clamp(executeOptions.timeoutMs, maxTimeoutMs),
        maxOutputBytes: clamp(
          executeOptions.maxOutputBytes,
          maxOutputBytes,
        ),
      })
    },
  }
}

function normalizeCommandKey(command: string): string {
  return path.basename(command.trim()).toLowerCase()
}

function clamp(requested: number | undefined, ceiling: number): number {
  if (requested == null) return ceiling
  return Math.max(0, Math.min(requested, ceiling))
}

function containsScopedCommand(
  normalized: { command: string; args?: string[] },
  scopedCommands: ReadonlySet<string>,
): boolean {
  const tokens = [normalized.command, ...(normalized.args ?? [])]
    .flatMap((value) => value.split(/[^A-Za-z0-9._/-]+/))
    .map(normalizeCommandKey)
    .filter(Boolean)
  return tokens.some((token) => scopedCommands.has(token))
}
