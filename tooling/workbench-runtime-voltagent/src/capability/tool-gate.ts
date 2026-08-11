/**
 * Runtime tool gate for connector tools (effective algorithm at invoke time).
 *
 * Packaging may still load CLI tools when plugin is enabled; invoke requires:
 *   pluginGloballyEnabled (implied by tool presence) ∧ connected (auth material)
 *   ∧ taskSelected for active task
 *
 * Task id and connector selection come from the immutable Turn execution context.
 */

import {
  expandConnectorToolScope,
  type ConnectorDescriptor,
} from '../plugin/connector-descriptor.js'
import {
  isConnectorEffective,
  type ConnectorEffectiveInput,
} from '../plugin/effective-capabilities.js'
import type { AuthStatus } from '../plugin/types.js'
import {
  getDefaultCapabilitySelectionStore,
  type CapabilitySelectionStore,
} from './selection-store.js'

export type ToolGateResult =
  | { allowed: true }
  | { allowed: false; reason: string; hint: string }

export type ConnectorAuthLookup = (connectorId: string) => {
  pluginGloballyEnabled: boolean
  authStatus: AuthStatus
}

export type ConnectorToolGateOptions = {
  store?: CapabilitySelectionStore
  /** Operation-scoped Task id. Null means the caller has no Task context. */
  taskId: string | null
  /** Immutable connector selection captured when the current Turn started. */
  selectedConnectorIds?: readonly string[]
  descriptors: readonly ConnectorDescriptor[]
  authLookup: ConnectorAuthLookup
}

/**
 * Map a tool name to its product connector via toolScope prefixes.
 */
export function findConnectorForTool(
  toolName: string,
  descriptors: readonly ConnectorDescriptor[],
): ConnectorDescriptor | undefined {
  return descriptors.find((d) =>
    d.toolScope.some((scope) =>
      scope.endsWith('.') || scope.endsWith('_')
        ? toolName.startsWith(scope)
        : toolName === scope,
    ),
  )
}

/** Remove unselected connector tools before the model receives its Turn tool set. */
export function filterToolsForTaskSelection<T extends { name: string }>(
  tools: readonly T[],
  descriptors: readonly ConnectorDescriptor[],
  selectedConnectorIds: readonly string[],
): T[] {
  return tools.filter((tool) => {
    const connector = findConnectorForTool(tool.name, descriptors)
    return !connector || selectedConnectorIds.includes(connector.id)
  })
}

/**
 * Gate one tool invoke for the Turn's Task selection + live auth.
 * Non-connector tools always allowed here (other policies apply elsewhere).
 */
export function gateConnectorToolInvoke(
  toolName: string,
  options: ConnectorToolGateOptions,
): ToolGateResult {
  const descriptors = options.descriptors
  const connector = findConnectorForTool(toolName, descriptors)
  if (!connector) return { allowed: true }

  const store = options.store ?? getDefaultCapabilitySelectionStore()
  const taskId = options.taskId
  if (!taskId) {
    return {
      allowed: false,
      reason: 'missing_task_context',
      hint: '连接器工具缺少当前 Turn 的 Task 上下文，已拒绝执行',
    }
  }

  const connectorIds =
    options.selectedConnectorIds !== undefined
      ? options.selectedConnectorIds
      : store.get(taskId).connectorIds
  const auth = options.authLookup(connector.id)
  const input: ConnectorEffectiveInput = {
    connectorId: connector.id,
    pluginGloballyEnabled: auth.pluginGloballyEnabled,
    authStatus: auth.authStatus,
    taskSelected: connectorIds.includes(connector.id),
  }
  const decision = isConnectorEffective(input)
  if (decision.capabilityEntersNextTurn) {
    // Double-check tool is in expanded scope (defense in depth)
    const names = expandConnectorToolScope(connector, [toolName])
    if (names.includes(toolName)) return { allowed: true }
    return {
      allowed: false,
      reason: 'tool_out_of_scope',
      hint: `工具 ${toolName} 不在连接器 ${connector.id} 声明范围内`,
    }
  }

  const hintParts = [
    `连接器「${connector.name}」工具面未进入本 Task`,
    ...decision.reasons.map((r) => reasonToZh(r)),
  ]
  return {
    allowed: false,
    reason: decision.reasons[0] ?? 'not_effective',
    hint: hintParts.join('；'),
  }
}

function reasonToZh(reason: string): string {
  switch (reason) {
    case 'plugin_not_enabled':
      return '插件未全局启用'
    case 'not_connected':
      return '连接器未连接'
    case 'not_task_selected':
      return '本 Task 未选用该连接器'
    case 'task_muted':
      return '本 Task 已静音该连接器'
    case 'auth_expired':
      return '授权已过期'
    case 'auth_error':
      return '授权状态错误'
    case 'auth_missing':
      return '未连接'
    default:
      return reason
  }
}
