/**
 * Wrap a visual-fence HTML fragment as an opaque srcdoc island.
 * Author scripts are stripped; only the host height reporter gets a nonce.
 */

export const INLINE_VISUAL_LABEL = '行内视觉'
export const INLINE_VISUAL_SOURCE_MAX_BYTES = 48 * 1024
export const INLINE_VISUAL_MAX_HEIGHT = 560
export const INLINE_VISUAL_RESIZE_TYPE = 'uilab-inline-visual-resize'

const HEIGHT_REPORTER = [
  '(function(){',
  `var TYPE=${JSON.stringify(INLINE_VISUAL_RESIZE_TYPE)};`,
  'function send(){',
  'var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);',
  'parent.postMessage({type:TYPE,height:h},"*");',
  '}',
  'if(typeof ResizeObserver==="function"){new ResizeObserver(send).observe(document.body);}',
  'addEventListener("load",send);',
  'send();',
  '})();',
].join('')

export function isInlineVisualSourceTooLarge(source: string): boolean {
  return new TextEncoder().encode(source).length > INLINE_VISUAL_SOURCE_MAX_BYTES
}

export function peelVisualFragment(source: string): string {
  const trimmed = source.trim()
  const body = trimmed.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)
  const raw = body ? body[1] : trimmed
  return stripActiveTags(raw).trim()
}

export function extractInlineVisualTitle(
  source: string,
  meta?: string,
): string {
  const fromMeta = meta?.trim().replace(/^title\s*=\s*/i, '').replace(/^["']|["']$/g, '')
  if (fromMeta) return fromMeta
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (title?.[1]?.trim()) return stripTags(title[1]).trim()
  const heading = source.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)
  if (heading?.[1]) {
    const text = stripTags(heading[1]).trim()
    if (text) return text
  }
  return INLINE_VISUAL_LABEL
}

export function buildInlineVisualDocument(input: {
  html: string
  nonce: string
}): string {
  const fragment = peelVisualFragment(input.html)
  const nonce = escapeAttr(input.nonce)
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<style>',
    'html,body{margin:0;padding:0;background:transparent;}',
    'body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;color:inherit;}',
    '*,*::before,*::after{box-sizing:border-box;}',
    'img,svg{max-width:100%;height:auto;}',
    '</style>',
    '</head>',
    `<body>${fragment}`,
    `<script nonce="${nonce}">${HEIGHT_REPORTER}</script>`,
    '</body>',
    '</html>',
  ].join('')
}

function stripActiveTags(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe\b[^>]*\/?>/gi, '')
    .replace(/<(object|embed|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(object|embed|base)\b[^>]*\/?>/gi, '')
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
