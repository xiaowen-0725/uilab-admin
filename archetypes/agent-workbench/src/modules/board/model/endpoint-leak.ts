/**
 * Model-visible board surfaces must not carry upstream endpoint URLs or paths
 * (ADR-0024 §6). Used on catalog / status / commit results and contract tests.
 */

const ENDPOINT_LEAK_RE =
  /https?:\/\/|\/\/[a-z0-9.-]+\.[a-z]{2,}|\/[A-Za-z][A-Za-z0-9._-]*\/[A-Za-z0-9._/-]+/i

export function containsEndpointLeak(value: unknown): boolean {
  return ENDPOINT_LEAK_RE.test(JSON.stringify(value) ?? '')
}

export function assertNoEndpointLeak(value: unknown): void {
  if (containsEndpointLeak(value)) {
    throw new Error('board tool result leaked an upstream endpoint')
  }
}
