/**
 * Streamdown plugin / renderer config shared by Timeline and Document.
 * One sanitizer whitelist for mermaid SVG; visual fences use the HTML island.
 * Mermaid uses a custom renderer — do not pass plugins.mermaid (official UI).
 */

import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import type { PluginConfig } from 'streamdown'
import { MermaidFenceRenderer } from './mermaid-fence-renderer'
import { VisualFenceRenderer } from './visual-fence-renderer'

export const workbenchMarkdownPlugins: PluginConfig = {
  cjk,
  code: code as PluginConfig['code'],
  renderers: [
    {
      language: ['mermaid', 'Mermaid'],
      component: MermaidFenceRenderer,
    },
    {
      language: ['visual', 'Visual'],
      component: VisualFenceRenderer,
    },
  ],
}
