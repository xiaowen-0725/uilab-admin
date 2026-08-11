/**
 * Shared helpers for Capability Surface visual/keyboard tests (#56).
 *
 * Keeps test files focused on assertions by extracting the fixed-snapshot
 * controller wiring (no live sidecar) into a single reusable factory.
 */
import { vi } from 'vitest'
import {
  createCapabilityController,
  type CapabilitySnapshot,
  type CapabilitySnapshotPort,
} from '@/modules/capabilities'

/** Create a controller backed by a fixed snapshot (no live sidecar). */
export function controllerFor(snapshot: CapabilitySnapshot) {
  const port: CapabilitySnapshotPort = {
    getSnapshot: vi.fn(async () => snapshot),
    setSelection: vi.fn(async () => snapshot),
    startAuth: vi.fn(),
    refreshAuth: vi.fn(async () => ({ snapshot, transitions: [] })),
    revokeAuth: vi.fn(async () => ({
      snapshot,
      connectorId: '',
      message: '',
      needsSidecarRestart: false,
    })),
    subscribe: () => () => {},
  }
  return createCapabilityController(port)
}
