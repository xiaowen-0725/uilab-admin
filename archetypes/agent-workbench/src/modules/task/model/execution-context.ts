/**
 * Immutable input snapshot for create/recover Run (design §6).
 * Contains no IDs, user message body, or credentials.
 */

export interface TaskExecutionContext {
  workspace: string
  environment: string
  branch: string
  changesSummary: string
  deliveryState: string
  enabledSources: readonly string[]
  capabilities: unknown
}

/** Default empty-ish context for Fake / tests (not a production workspace probe). */
export function emptyTaskExecutionContext(
  overrides?: Partial<TaskExecutionContext>,
): TaskExecutionContext {
  return {
    workspace: overrides?.workspace ?? '',
    environment: overrides?.environment ?? 'local-fake',
    branch: overrides?.branch ?? '',
    changesSummary: overrides?.changesSummary ?? '',
    deliveryState: overrides?.deliveryState ?? 'idle',
    enabledSources: overrides?.enabledSources ?? [],
    capabilities: overrides?.capabilities ?? {},
  }
}
