/**
 * Task Runtime Adapter Module — concrete RuntimePort + EventStorePort adapters.
 *
 * Depends on @/modules/task (ports, protocol, model, tool-output-normalize).
 * VoltAgent is the only adapter (ADR-0018 removed the Deterministic Fake Runtime).
 *
 * Interface: factories + options types. The fullstream mapper is re-exported
 * for cross-module projection tests that project VoltAgent chunks.
 */

// --- VoltAgent RuntimePort adapter ---
export { createVoltAgentRuntimeAdapter } from './voltagent/voltagent-runtime-adapter'
export type { VoltAgentRuntimeAdapterOptions } from './voltagent/voltagent-runtime-adapter'

// --- fullstream mapper (cross-module test convenience) ---
export { mapFullStreamChunks } from './voltagent/fullstream-to-envelope'

// --- EventStorePort adapters ---
export { createMemoryEventStore } from './memory-event-store'
export { createIdbEventStore } from './idb-event-store'
