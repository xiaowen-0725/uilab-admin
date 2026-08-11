import type { DocumentContentPort } from '../../ports/document-content-port'
import type { SurfaceDefinition } from '../../model/types'
import { DocumentPanel } from './document-panel'
import { looksLikeWorkspacePath } from './path-utils'

export type CreateDocumentSurfaceOptions = {
  content: DocumentContentPort
  /**
   * Optional workspace root label (e.g. from sidecar GET /workspace/info).
   * Fake/Memory path leaves this unset.
   */
  workspaceHint?: string | null
}

/**
 * Document Surface definition (kind: document).
 * Composition injects DocumentContentPort; Host never imports this file.
 */
export function createDocumentSurfaceDefinition(
  options: CreateDocumentSurfaceOptions,
): SurfaceDefinition {
  const { content, workspaceHint = null } = options
  return {
    kind: 'document',
    displayName: '文档',
    match: (resource) => {
      const key = resource.resourceKey || resource.path || ''
      if (!key || key.startsWith('test:')) return false
      // URLs belong to Browser Surface (ticket 06).
      if (/^https?:\/\//i.test(key)) return false
      return looksLikeWorkspacePath(key)
    },
    render: (props) => (
      <DocumentPanel
        resourceKey={props.resourceKey}
        title={props.title}
        content={content}
        workspaceHint={workspaceHint}
      />
    ),
  }
}
