/**
 * Shared shallow-frame figure for sanitized inline SVG / mermaid output.
 */

import { createElement, type ReactNode } from 'react'
import { CodeBlock } from 'streamdown'
import {
  INLINE_FIGURE_LABEL,
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

type InlineFigureFallbackProps = {
  code: string
  language: string
  incomplete: boolean
}

type InlineFigureViewProps = {
  root: SanitizedSvgNode
  titleText: string | null
}

export function InlineFigureFallback({
  code,
  language,
  incomplete,
}: InlineFigureFallbackProps): ReactNode {
  return (
    <CodeBlock
      code={code}
      language={language}
      isIncomplete={incomplete}
      lineNumbers={false}
    />
  )
}

export function InlineFigureView({
  root,
  titleText,
}: InlineFigureViewProps): ReactNode {
  return (
    <div
      role='img'
      aria-label={titleText ?? INLINE_FIGURE_LABEL}
      data-testid='inline-figure'
      className='mt-2 mb-5 w-full rounded-xl border border-border bg-card p-4 text-inherit'
    >
      {renderSanitizedSvg(root, 'svg')}
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
  const children = node.children.map((child, index) =>
    typeof child === 'string'
      ? child
      : renderSanitizedSvg(child, `${key}-${index}`),
  )
  return createElement(node.tag, { key, ...svgDomProps(node) }, ...children)
}
