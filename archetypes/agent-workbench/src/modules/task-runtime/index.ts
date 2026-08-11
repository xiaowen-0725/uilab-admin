/**
 * Task Runtime Adapter Module — concrete RuntimePort + EventStorePort adapters.
 *
 * Depends on @/modules/task (ports, protocol, model, tool-output-normalize).
 * VoltAgent is the only adapter (ADR-0018 removed the Deterministic Fake Runtime).
 *
 * Interface: factories + options types only. Concrete adapter classes and the
 * fullstream mapper are internal to this module.
 */

// --- VoltAgent RuntimePort adapter ---
export { createVoltAgentRuntimeAdapter } from './voltagent/voltagent-runtime-adapter'
export type { VoltAgentRuntimeAdapterOptions } from './voltagent/voltagent-runtime-adapter'

// --- fullstream mapper (test convenience for projecting VoltAgent chunks) ---
export { mapFullStreamChunks } from './voltagent/fullstream-to-envelope'

// --- EventStorePort adapters ---
export { createMemoryEventStore } from './memory-event-store'
export { createIdbEventStore } from './idb-event-store'
