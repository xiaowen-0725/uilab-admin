import type { OperationContext, ToolExecuteOptions } from '@voltagent/core'

export const CAPABILITY_CONNECTOR_IDS_CONTEXT_KEY =
  'capabilityConnectorIds' as const

export const CAPABILITY_FEATURE_IDS_CONTEXT_KEY = 'capabilityFeatureIds' as const

export type CapabilityTurnContext = {
  taskId: string | null
  selectedConnectorIds: string[]
  selectedFeatureIds: string[]
}

/**
 * Read the immutable capability selection captured by Workbench at Turn submit.
 * Missing or malformed context intentionally projects to an empty selection.
 */
export function readCapabilityTurnContext(
  context:
    | Pick<ToolExecuteOptions, 'conversationId' | 'context'>
    | Pick<OperationContext, 'conversationId' | 'context'>
    | undefined,
): CapabilityTurnContext {
  const taskId = context?.conversationId?.trim() || null
  return {
    taskId,
    selectedConnectorIds: readStringList(
      context?.context?.get(CAPABILITY_CONNECTOR_IDS_CONTEXT_KEY),
    ),
    selectedFeatureIds: readStringList(
      context?.context?.get(CAPABILITY_FEATURE_IDS_CONTEXT_KEY),
    ),
  }
}

function readStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [
    ...new Set(
      raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
}
