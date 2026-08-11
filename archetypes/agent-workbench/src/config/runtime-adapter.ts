/**
 * Runtime adapter selection (Composition Root).
 * VoltAgent is the only runtime (ADR-0018 removed the Deterministic Fake Runtime).
 *
 * VITE_RUNTIME_ADAPTER=voltagent
 * VITE_VOLTAGENT_BASE_URL=http://127.0.0.1:3141 (sidecar)
 */

export type RuntimeAdapterMode = 'voltagent'

export function resolveRuntimeAdapterMode(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): RuntimeAdapterMode {
  void env
  return 'voltagent'
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
