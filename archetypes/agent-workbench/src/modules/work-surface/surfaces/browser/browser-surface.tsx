import type { BrowserHostPort } from '../../ports/browser-host-port'
import type { SurfaceDefinition } from '../../model/types'
import { BrowserPanel } from './browser-panel'
import { normalizeBrowserUrl } from './url-utils'

export function createBrowserSurfaceDefinition(options: {
  host: BrowserHostPort
}): SurfaceDefinition {
  const { host } = options
  return {
    kind: 'browser',
    displayName: '浏览器',
    match: (resource) => {
      const key = resource.resourceKey || resource.url || ''
      if (!key) return false
      const n = normalizeBrowserUrl(key)
      return n.ok
    },
    render: (props) => (
      <BrowserPanel
        resourceKey={props.resourceKey}
        title={props.title}
        host={host}
      />
    ),
  }
}
