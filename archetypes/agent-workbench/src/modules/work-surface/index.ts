/**
 * Work Surface Module — public Interface.
 * Host chrome + Surface Registry + Document/Browser surfaces.
 * Concrete Document/Browser register from Composition Root; Host never imports them.
 * Workspace Document content source (Port + bind UI) lives in this module.
 */

export { WorkSurfaceHost } from './ui/work-surface-host/work-surface-host'
export type {
  WorkSurfaceHostCallbacks,
  WorkSurfaceHostProps,
  WorkSurfaceHostView,
} from './ui/work-surface-host/work-surface-host'

export { WorkspaceDocumentEmptyExtra } from './ui/workspace-document-empty-extra'
export type { WorkspaceDocumentEmptyExtraProps } from './ui/workspace-document-empty-extra'

export { createSurfaceRegistry } from './application/surface-registry'
export { resolveOpenWorkSurfaceIntent } from './application/open-work-surface-intent'
export type {
  OpenWorkSurfaceIntentInput,
  OpenWorkSurfaceIntentResult,
} from './application/open-work-surface-intent'

export {
  createWorkspaceDocumentSourceController,
  useWorkspaceDocumentSource,
  isFsAccessDirectoryPickerSupported,
} from './application/workspace-document-source'
export type {
  UseWorkspaceDocumentSourceOptions,
  WorkspaceDocumentRuntimeMode,
  WorkspaceDocumentSource,
  WorkspaceDocumentSourceController,
  WorkspaceDocumentSourceDeps,
  WorkspaceDocumentSourceState,
} from './application/workspace-document-source'

export { createTestSurfaceDefinition } from './surfaces/test/test-surface'
export { createDocumentSurfaceDefinition } from './surfaces/document/document-surface'
export { createBrowserSurfaceDefinition } from './surfaces/browser/browser-surface'
export {
  createMemoryDocumentContent,
  DEFAULT_DOCUMENT_FIXTURES,
  DEFAULT_BINARY_FIXTURES,
} from './adapters/memory-document-content'
export {
  createHttpWorkspaceDocumentContent,
  fetchWorkspaceHint,
} from './adapters/http-workspace-document-content'
export type {
  HttpWorkspaceDocumentContentOptions,
  WorkspaceInfoResponse,
} from './adapters/http-workspace-document-content'
export {
  createFsAccessDocumentContent,
  fsAccessWorkspaceHint,
  pickWorkspaceDirectory,
  resolveFsAccessFileHandle,
} from './adapters/fs-access-document-content'
export type {
  FsAccessDocumentContentOptions,
  PickWorkspaceDirectoryResult,
} from './adapters/fs-access-document-content'
export {
  createWebBrowserHostPort,
  type BrowserHostPort,
} from './ports/browser-host-port'

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
  DocumentBinaryReadResult,
  DocumentTextReadResult,
} from './ports/document-content-port'

export type { DocumentViewState } from './surfaces/document/document-panel'
export {
  normalizeWorkspaceResourceKey,
  coerceWorkspaceResourceKey,
  toWorkspaceResourceKey,
  DOCUMENT_TEXT_MAX_BYTES,
  DOCUMENT_IMAGE_MAX_BYTES,
  DOCUMENT_OFFICE_MAX_BYTES,
} from './surfaces/document/path-utils'
export { normalizeBrowserUrl } from './surfaces/browser/url-utils'
