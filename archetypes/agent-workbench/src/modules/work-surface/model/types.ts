import type { ReactNode } from 'react'

/** Application-level registered work-surface type id (document / browser / test / …). */
export type SurfaceKind = string

/** Resource address used for open resolve when kind is omitted. */
export type OpenResourceRef = {
  resourceKey: string
  mediaType?: string
  path?: string
  url?: string
}

/** Props passed to SurfaceDefinition.render. */
export type SurfaceRenderProps = {
  tabId: string
  kind: SurfaceKind
  resourceKey: string
  title: string
  taskId: string
}

/**
 * Registry entry for one SurfaceKind.
 * Concrete Document/Browser implementations live under surfaces/* — Host never imports them.
 */
export type SurfaceDefinition = {
  kind: SurfaceKind
  displayName: string
  /** Used only when open intent omits kind. */
  match?: (resource: OpenResourceRef) => boolean
  render: (props: SurfaceRenderProps) => ReactNode
  onOpen?: (props: SurfaceRenderProps) => void
  onClose?: (props: SurfaceRenderProps) => void
  onTaskDispose?: (taskId: string) => void
}

/** Tab chrome + identity projected from Session openTabs. */
export type WorkSurfaceHostTab = {
  tabId: string
  kind: SurfaceKind
  resourceKey: string
  title: string
}

export type SurfaceRegistry = {
  register: (def: SurfaceDefinition) => void
  get: (kind: SurfaceKind) => SurfaceDefinition | undefined
  list: () => readonly SurfaceDefinition[]
  /**
   * Explicit kind wins (even if unregistered → undefined).
   * Else first match() in registration order.
   */
  resolve: (
    input: { kind?: SurfaceKind } & OpenResourceRef,
  ) => SurfaceDefinition | undefined
}
