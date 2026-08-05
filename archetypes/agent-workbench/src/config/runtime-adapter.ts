/**
 * Runtime adapter selection (Composition Root).
 * Fake remains default — VoltAgent is opt-in via env.
 *
 * VITE_RUNTIME_ADAPTER=fake|voltagent
 * VITE_VOLTAGENT_BASE_URL=http://127.0.0.1:3141 (sidecar)
 */

export type RuntimeAdapterMode = 'fake' | 'voltagent'

export function resolveRuntimeAdapterMode(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): RuntimeAdapterMode {
  const raw = String(env.VITE_RUNTIME_ADAPTER ?? env.RUNTIME_ADAPTER ?? 'fake')
    .trim()
    .toLowerCase()
  if (raw === 'voltagent' || raw === 'volt') return 'voltagent'
  return 'fake'
}

/**
 * Base URL for the VoltAgent sidecar.
 * Default empty → same-origin Vite proxy `/voltagent-runtime` (avoids CORS in dev).
 * Set VITE_VOLTAGENT_BASE_URL=http://127.0.0.1:3141 to talk to the sidecar directly.
 */
export function resolveVoltAgentBaseUrl(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): string {
  const raw = String(
    env.VITE_VOLTAGENT_BASE_URL ?? env.VOLTAGENT_BASE_URL ?? '/voltagent-runtime',
  ).trim()
  return raw.replace(/\/$/, '')
}

/** Agent id registered on the local VoltAgent sidecar. */
export function resolveVoltAgentId(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): string {
  const raw = String(env.VITE_VOLTAGENT_AGENT_ID ?? env.VOLTAGENT_AGENT_ID ?? 'workbench')
    .trim()
  return raw || 'workbench'
}
