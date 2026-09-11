/**
 * Compile a closed mermaid fence to SVG, then peel mermaid CSS so the
 * existing inline-figure whitelist can accept it. Not the Streamdown mermaid UI.
 */

import {
  createMermaidPlugin,
  type MermaidConfig,
} from '@streamdown/mermaid'
import { INLINE_FIGURE_SOURCE_MAX_BYTES } from './sanitize-inline-svg'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

const GRAPHIC_TAGS = new Set([
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'stop',
])

const KEEP_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'title',
  'desc',
  ...GRAPHIC_TAGS,
])

const DANGEROUS_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'use',
  'image',
  'a',
  'animate',
  'set',
  'animatetransform',
  'animatemotion',
  'handler',
])

const MERMAID_BASE_CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  htmlLabels: false,
  look: 'classic',
  theme: 'base',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  flowchart: { htmlLabels: false, useMaxWidth: true },
  class: { htmlLabels: false },
}

/** Runtime from @streamdown/mermaid. Do not pass as Streamdown plugins.mermaid. */
export const workbenchMermaidRuntime = createMermaidPlugin({
  config: MERMAID_BASE_CONFIG,
})

let renderSeq = 0
let renderQueue: Promise<unknown> = Promise.resolve()

export function compileMermaidFence(source: string): Promise<string | null> {
  return enqueueMermaidRender(() => compileMermaidFenceNow(source))
}

function enqueueMermaidRender(
  task: () => Promise<string | null>,
): Promise<string | null> {
  const run = renderQueue.then(task, task)
  renderQueue = run.then(() => undefined, () => undefined)
  return run
}

async function compileMermaidFenceNow(source: string): Promise<string | null> {
  if (utf8ByteLength(source) > INLINE_FIGURE_SOURCE_MAX_BYTES) return null
  const text = source.replace(/^\uFEFF/, '').trim()
  if (!text) return null

  renderSeq += 1
  const renderId = `ifmm${renderSeq}`
  try {
    const runtime = workbenchMermaidRuntime.getMermaid(
      mermaidConfigForDocument(),
    )
    const { svg } = await runtime.render(renderId, text)
    return prepareMermaidSvg(svg)
  } catch {
    return null
  } finally {
    document.getElementById(renderId)?.remove()
    document.getElementById(`d${renderId}`)?.remove()
  }
}

function mermaidConfigForDocument(): MermaidConfig {
  const foreground = resolveCssColor('var(--foreground)')
  const background = resolveCssColor('var(--background)')
  const border = resolveCssColor('var(--border)', background)
  const prose = resolveCssColor(
    'var(--tl-prose-color, var(--foreground))',
    background,
  )
  const nodeFill = resolveCssColor(
    'color-mix(in srgb, var(--background) 88%, var(--foreground))',
    background,
  )
  const darkMode = document.documentElement.classList.contains('dark')
  return {
    ...MERMAID_BASE_CONFIG,
    darkMode,
    themeVariables: {
      darkMode,
      background,
      primaryColor: nodeFill,
      primaryTextColor: prose,
      primaryBorderColor: border,
      secondaryColor: nodeFill,
      tertiaryColor: background,
      lineColor: foreground,
      textColor: prose,
      mainBkg: nodeFill,
      secondBkg: background,
      nodeBorder: border,
      clusterBkg: background,
      clusterBorder: border,
      titleColor: prose,
      edgeLabelBackground: background,
      tertiaryTextColor: prose,
      nodeTextColor: prose,
      actorBkg: nodeFill,
      actorBorder: border,
      actorTextColor: prose,
      signalColor: foreground,
      labelBoxBkgColor: nodeFill,
      labelBoxBorderColor: border,
      labelTextColor: prose,
      noteBkgColor: nodeFill,
      noteTextColor: prose,
      noteBorderColor: border,
    },
  }
}

function prepareMermaidSvg(svgText: string): string | null {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (parsed.querySelector('parsererror')) return null
  const parsedRoot = parsed.documentElement
  if (!parsedRoot || parsedRoot.localName !== 'svg') return null

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:absolute;left:-99999px;top:0;width:800px;pointer-events:none;'
  host.style.color = resolveCssColor(
    'var(--tl-prose-color, var(--foreground))',
  )
  document.body.append(host)
  try {
    const svg = document.importNode(parsedRoot, true)
    host.append(svg)
    if (isDangerousTree(svg)) return null
    bakePresentation(svg)
    peelMermaidChrome(svg)
    return new XMLSerializer().serializeToString(svg)
  } finally {
    host.remove()
  }
}

function isDangerousTree(root: Element): boolean {
  if (isDangerousElement(root)) return true
  for (const el of root.querySelectorAll('*')) {
    if (isDangerousElement(el)) return true
  }
  return false
}

function isDangerousElement(el: Element): boolean {
  if (DANGEROUS_TAGS.has(el.localName.toLowerCase())) return true
  for (const attr of el.attributes) {
    if (/^on/i.test(attr.localName)) return true
    if (attr.localName === 'href' || attr.localName === 'src') return true
    if (attr.namespaceURI === XLINK_NS || attr.prefix === 'xlink') return true
  }
  return false
}

function bakePresentation(svg: Element): void {
  for (const el of svg.querySelectorAll('*')) {
    if (!GRAPHIC_TAGS.has(el.localName)) continue
    bakeGraphic(el)
  }
}

function bakeGraphic(el: Element): void {
  const cs = getComputedStyle(el)
  const fill = normalizePaint(cs.fill)
  if (fill) el.setAttribute('fill', fill)
  bakeStroke(el, cs)
  if (fill && fill !== 'none' && cs.fillOpacity && cs.fillOpacity !== '1') {
    el.setAttribute('fill-opacity', cs.fillOpacity)
  }
  if (el.localName === 'text' || el.localName === 'tspan') bakeType(el, cs)
  if (el.localName === 'stop') {
    const stopColor = normalizePaint(cs.stopColor || cs.color)
    if (stopColor && stopColor !== 'none') {
      el.setAttribute('stop-color', stopColor)
    }
  }
}

function bakeStroke(el: Element, cs: CSSStyleDeclaration): void {
  const stroke = normalizePaint(cs.stroke)
  const strokeWidth = Number.parseFloat(cs.strokeWidth)
  if (!stroke || stroke === 'none' || !(strokeWidth > 0)) {
    if (stroke === 'none') el.setAttribute('stroke', 'none')
    return
  }
  el.setAttribute('stroke', stroke)
  el.setAttribute('stroke-width', stripPx(cs.strokeWidth))
  if (cs.strokeOpacity && cs.strokeOpacity !== '1') {
    el.setAttribute('stroke-opacity', cs.strokeOpacity)
  }
  if (cs.strokeLinecap && cs.strokeLinecap !== 'butt') {
    el.setAttribute('stroke-linecap', cs.strokeLinecap)
  }
  if (cs.strokeLinejoin && cs.strokeLinejoin !== 'miter') {
    el.setAttribute('stroke-linejoin', cs.strokeLinejoin)
  }
  if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
    el.setAttribute('stroke-dasharray', cs.strokeDasharray)
  }
}

function bakeType(el: Element, cs: CSSStyleDeclaration): void {
  if (cs.fontSize) el.setAttribute('font-size', cs.fontSize)
  if (cs.fontFamily) el.setAttribute('font-family', cs.fontFamily)
  if (cs.fontWeight) el.setAttribute('font-weight', cs.fontWeight)
  if (cs.fontStyle && cs.fontStyle !== 'normal') {
    el.setAttribute('font-style', cs.fontStyle)
  }
  if (cs.textAnchor && cs.textAnchor !== 'start') {
    el.setAttribute('text-anchor', cs.textAnchor)
  }
}

function peelMermaidChrome(svg: Element): void {
  for (const el of [...svg.querySelectorAll('*')].reverse()) {
    if (!KEEP_TAGS.has(el.localName)) {
      el.remove()
      continue
    }
    stripPresentationAttrs(el)
  }
  stripPresentationAttrs(svg)
  if (svg.namespaceURI !== SVG_NS) {
    svg.setAttribute('xmlns', SVG_NS)
  }
}

function stripPresentationAttrs(el: Element): void {
  el.removeAttribute('class')
  el.removeAttribute('style')
  el.removeAttribute('tabindex')
}

function normalizePaint(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed === 'none' || trimmed === 'transparent') return 'none'
  if (/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(trimmed)) return 'none'
  return flattenToHex(trimmed)
}

function stripPx(value: string): string {
  return value.endsWith('px') ? value.slice(0, -2) : value
}

function resolveCssColor(expression: string, onto = '#000000'): string {
  const probe = document.createElement('span')
  probe.style.color = expression
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return flattenToHex(color, onto)
}

function flattenToHex(color: string, onto = '#000000'): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return '#000000'
  ctx.fillStyle = onto
  ctx.fillRect(0, 0, 1, 1)
  try {
    ctx.fillStyle = color
  } catch {
    return onto
  }
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}
