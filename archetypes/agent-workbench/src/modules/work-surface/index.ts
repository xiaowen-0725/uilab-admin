/**
 * Work Surface Module — public Interface.
 * Host chrome + Surface Registry. Concrete Document/Browser surfaces
 * register from Composition Root; Host never imports them.
 */

export { WorkSurfaceHost } from './ui/work-surface-host/work-surface-host'
export type {
  WorkSurfaceHostCallbacks,
  WorkSurfaceHostProps,
  WorkSurfaceHostView,
} from './ui/work-surface-host/work-surface-host'

export { createSurfaceRegistry } from './application/surface-registry'
export { createTestSurfaceDefinition } from './surfaces/test/test-surface'
export { createDocumentSurfaceDefinition } from './surfaces/document/document-surface'
export {
  createMemoryDocumentContent,
  DEFAULT_DOCUMENT_FIXTURES,
} from './adapters/memory-document-content'

export type {
  OpenResourceRef,
  SurfaceDefinition,
  SurfaceKind,
  SurfaceRegistry,
  SurfaceRenderProps,
  WorkSurfaceHostTab,
} from './model/types'

export type {
  DocumentContentPort,
  DocumentReadResult,
  DocumentReadFailureReason,
} from './ports/document-content-port'

export type { DocumentViewState } from './surfaces/document/document-panel'
export {
  normalizeWorkspaceResourceKey,
  DOCUMENT_TEXT_MAX_BYTES,
} from './surfaces/document/path-utils'
