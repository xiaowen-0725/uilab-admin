/**
 * BoardQueryCatalogPort — plugin-declared query list for the agent surface.
 * Owned by Board. Identity stays on IdentityScopePort; this port is catalog only.
 */

export type BoardQueryParameterDecl =
  | {
      type: 'resource'
      resourceType: string
      requiredPermissions?: string[]
    }
  | {
      type: 'string' | 'number' | 'boolean' | 'string_array'
      required?: boolean
    }

export type BoardQueryCatalogEntry = {
  name: string
  title: string
  parameters: Record<string, BoardQueryParameterDecl>
  requiredPermissions: string[]
  referencableByJob: boolean
}

export interface BoardQueryCatalogPort {
  listQueries(): Promise<readonly BoardQueryCatalogEntry[]>
}
