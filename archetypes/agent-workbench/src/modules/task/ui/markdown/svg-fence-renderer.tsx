/**
 * Inline SVG fence renderer — shallow frame, SVG-namespace React nodes.
 * Incomplete / sanitize failure fall back to Streamdown CodeBlock.
 */

import { createElement, useMemo, type ReactNode } from 'react'
import {
  CodeBlock,
  useIsCodeFenceIncomplete,
  type CustomRendererProps,
} from 'streamdown'
import {
  INLINE_FIGURE_LABEL,
  sanitizeInlineSvg,
  type SanitizeInlineSvgResult,
  type SanitizedSvgNode,
} from '@/lib/inline-figure/sanitize-inline-svg'

const REACT_ATTR: Record<string, string> = {
  'clip-path': 'clipPath',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'stroke-width': 'strokeWidth',
  'stroke-opacity': 'strokeOpacity',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'font-size': 'fontSize',
  'font-family': 'fontFamily',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'text-anchor': 'textAnchor',
  'dominant-baseline': 'dominantBaseline',
  'alignment-baseline': 'alignmentBaseline',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
}

export function SvgFenceRenderer({
  code,
  isIncomplete,
  language,
}: CustomRendererProps): ReactNode {
  const fenceIncomplete = useIsCodeFenceIncomplete()
  const incomplete = isIncomplete || fenceIncomplete
  const result = useMemo((): SanitizeInlineSvgResult => {
    if (incomplete) return { ok: false }
    return sanitizeInlineSvg(code)
  }, [code, incomplete])

  if (incomplete || !result.ok) {
    return (
      <CodeBlock
        code={code}
        language={language || 'svg'}
        isIncomplete={incomplete}
        lineNumbers={false}
      />
    )
  }

  return (
    <div
      role='img'
      aria-label={result.titleText ?? INLINE_FIGURE_LABEL}
      data-testid='inline-figure'
      className='mt-2 mb-5 w-full rounded-xl border border-border bg-card p-4 text-inherit'
    >
      {renderSanitizedSvg(result.root, 'svg')}
    </div>
  )
}

function svgDomProps(node: SanitizedSvgNode): Record<string, string | boolean> {
  const props: Record<string, string | boolean> = {}
  for (const [name, value] of Object.entries(node.attrs)) {
    props[REACT_ATTR[name] ?? name] = value
  }
  if (node.tag !== 'svg') return props
  props.xmlns = 'http://www.w3.org/2000/svg'
  props.className = 'block h-auto w-full'
  props['aria-hidden'] = true
  return props
}

function renderSanitizedSvg(node: SanitizedSvgNode, key: string): ReactNode {
  const children: ReactNode[] = []
  for (const [index, child] of node.children.entries()) {
    if (typeof child === 'string') {
      children.push(child)
      continue
    }
    children.push(renderSanitizedSvg(child, `${key}-${index}`))
  }
  return createElement(node.tag, { key, ...svgDomProps(node) }, ...children)
}
