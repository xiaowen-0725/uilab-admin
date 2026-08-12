import type {
  CapabilityAuthRefreshResult,
  ConnectorAuthTransition,
} from '../ports/capability-snapshot-port'

/** Default poll interval — keep in sync with Composer callers. */
export const CONNECTOR_AUTH_POLL_INTERVAL_MS = 1_500

/**
 * Per-phase attempt budget before giving up when no authorization_required
 * transition resets the counter. 480 × 1.5s ≈ 12 minutes (aligned with
 * Feishu CLI bootstrap / authorization timeouts of 10 minutes).
 */
export const CONNECTOR_AUTH_MAX_ATTEMPTS = 480

/** Hard wall-clock ceiling even when phase transitions keep resetting attempts. */
export const CONNECTOR_AUTH_OVERALL_TIMEOUT_MS = 12 * 60_000

export type WaitForConnectorAuthOutcome =
  | 'connected'
  | 'timeout'
  | 'failed'
  | 'cancelled'

export async function waitForConnectorAuth(options: {
  connectorId: string
  refresh: () => Promise<CapabilityAuthRefreshResult>
  onAuthorizationRequired?: (
    transition: ConnectorAuthTransition
  ) => void | Promise<void>
  maxAttempts?: number
  intervalMs?: number
  overallTimeoutMs?: number
  signal?: AbortSignal
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}): Promise<WaitForConnectorAuthOutcome> {
  const maxAttempts = options.maxAttempts ?? CONNECTOR_AUTH_MAX_ATTEMPTS
  const intervalMs = options.intervalMs ?? CONNECTOR_AUTH_POLL_INTERVAL_MS
  const overallTimeoutMs =
    options.overallTimeoutMs ?? CONNECTOR_AUTH_OVERALL_TIMEOUT_MS
  const sleep = options.sleep ?? defaultSleep
  const handledUrls = new Set<string>()
  const startedAt = Date.now()

  if (options.signal?.aborted) return 'cancelled'

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted) return 'cancelled'
    if (Date.now() - startedAt >= overallTimeoutMs) return 'timeout'

    const result = await options.refresh()
    if (options.signal?.aborted) return 'cancelled'

    let authorizationRequired = false
    let phaseTransition = false
    for (const transition of result.transitions) {
      if (transition.connectorId !== options.connectorId) continue
      if (transition.phase === 'failed') return 'failed'
      if (transition.phase === 'authorization_required') {
        authorizationRequired = true
      }
      if (
        transition.phase === 'authorization_required' &&
        transition.verificationUrl &&
        !handledUrls.has(transition.verificationUrl)
      ) {
        handledUrls.add(transition.verificationUrl)
        phaseTransition = true
        await options.onAuthorizationRequired?.(transition)
      }
    }

    const connected = result.snapshot.connectors.find(
      (connector) => connector.id === options.connectorId
    )?.connected
    if (connected && !authorizationRequired) return 'connected'

    // User is still advancing the CLI flow (configure → authorize, etc.):
    // do not burn the attempt budget against an earlier phase.
    if (phaseTransition) {
      attempt = -1
    }

    if (attempt + 1 < maxAttempts) {
      if (Date.now() - startedAt >= overallTimeoutMs) return 'timeout'
      try {
        await sleep(intervalMs, options.signal)
      } catch (cause) {
        if (isAbortError(cause) || options.signal?.aborted) return 'cancelled'
        throw cause
      }
    }
  }
  return 'timeout'
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function isAbortError(cause: unknown): boolean {
  return (
    cause instanceof DOMException && cause.name === 'AbortError'
  )
}
