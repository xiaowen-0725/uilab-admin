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

export type {
  OpenResourceRef,
  SurfaceDefinition,
  SurfaceKind,
  SurfaceRegistry,
  SurfaceRenderProps,
  WorkSurfaceHostTab,
} from './model/types'
