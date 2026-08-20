/**
 * BoardPresetCatalogPort — plugin-contributed preset boards for lazy install.
 * Owned by Board. Identity stays on IdentityScopePort; this port is catalog only.
 */

import type {
  DataSourceResourceParameterDecl,
  WidgetDataSourceTrigger,
  WidgetSpan,
} from '../model/types'

export type BoardPresetCatalogWidget = {
  id: string
  title: string
  html: string
  placement: { x: number; y: number; w: number; h: number }
  span?: { min: WidgetSpan; default: WidgetSpan; max: WidgetSpan }
  queryName: string
  parameters: Record<string, unknown>
  parameterSchema: Record<string, DataSourceResourceParameterDecl>
  requiredPermissions: string[]
  referencableByJob: boolean
  trigger: WidgetDataSourceTrigger
}

export type BoardPresetCatalogEntry = {
  pluginId: string
  presetId: string
  version: number
  title: string
  purpose?: string
  widgets: readonly BoardPresetCatalogWidget[]
}

export interface BoardPresetCatalogPort {
  listPresetBoards(): Promise<readonly BoardPresetCatalogEntry[]>
}
