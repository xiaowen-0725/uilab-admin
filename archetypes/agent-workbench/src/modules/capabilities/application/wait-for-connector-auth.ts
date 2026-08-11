import type {
  CapabilityAuthRefreshResult,
  ConnectorAuthTransition,
} from '../ports/capability-snapshot-port'

export async function waitForConnectorAuth(options: {
  connectorId: string
  refresh: () => Promise<CapabilityAuthRefreshResult>
  onAuthorizationRequired?: (
    transition: ConnectorAuthTransition
  ) => void | Promise<void>
  maxAttempts?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
}): Promise<boolean> {
  const maxAttempts = options.maxAttempts ?? 80
  const intervalMs = options.intervalMs ?? 1_500
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const handledUrls = new Set<string>()

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await options.refresh()
    let authorizationRequired = false
    for (const transition of result.transitions) {
      if (transition.connectorId !== options.connectorId) continue
      if (transition.phase === 'failed') return false
      if (transition.phase === 'authorization_required') {
        authorizationRequired = true
      }
      if (
        transition.phase === 'authorization_required' &&
        transition.verificationUrl &&
        !handledUrls.has(transition.verificationUrl)
      ) {
        handledUrls.add(transition.verificationUrl)
        await options.onAuthorizationRequired?.(transition)
      }
    }
    const connected = result.snapshot.connectors.find(
      (connector) => connector.id === options.connectorId
    )?.connected
    if (connected && !authorizationRequired) return true
    if (attempt + 1 < maxAttempts) await sleep(intervalMs)
  }
  return false
}
