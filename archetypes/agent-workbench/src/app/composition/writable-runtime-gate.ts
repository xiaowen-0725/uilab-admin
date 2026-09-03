import type { WritableRuntimeGate } from '@/modules/project'

export type WaitForWritableRuntime = (options?: {
  timeoutMs?: number
}) => Promise<WritableRuntimeGate>

/**
 * Shared fail-closed read of the send/launch writable-runtime gate.
 * Missing local-root (tests / no Host) is treated as writable, same as today.
 */
export async function readWritableRuntimeGate(
  wait?: WaitForWritableRuntime | null,
): Promise<WritableRuntimeGate> {
  const gate = await wait?.()
  if (gate && !gate.ok) return gate
  return { ok: true }
}
