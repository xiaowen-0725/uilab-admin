/**
 * Spec whitelist sanitizer for inline SVG fences.
 * Policy: docs/plans/workbench-inline-figure-spec.md — not DOMPurify / Streamdown defaults.
 */

export const INLINE_FIGURE_SOURCE_MAX_BYTES = 64 * 1024
export const INLINE_FIGURE_LABEL = '行内图'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const MAX_DEPTH = 32

const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'stop',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
])

const ALLOWED_ATTRS = new Set([
  'viewBox',
  'preserveAspectRatio',
  'xmlns',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'clipPathUnits',
  'clip-path',
  'id',
])

const PAINT_ATTRS = new Set(['fill', 'stroke', 'stop-color'])
const FORBIDDEN_ATTRS = new Set([
  'href',
  'src',
  'xlink:href',
  'style',
  'class',
  'tabindex',
])

const FORBIDDEN_PROTOCOL = /(?:javascript|data|https?):/i
const PROTOCOL_RELATIVE = /(?:^|[\s'"=,(])\/\//
const URL_HASH = /^url\(\s*(['"]?)#([^)'"]+)\1\s*\)$/i
const COLOR_LITERAL =
  /^(?:none|currentColor|transparent|#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,32}|rgba?\([^)]*\)|hsla?\([^)]*\)|hwb\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|color\([^)]*\))$/i

export type SanitizedSvgNode = {
  tag: string
  attrs: Record<string, string>
  children: Array<SanitizedSvgNode | string>
}

export type SanitizeInlineSvgResult =
  | { ok: true; root: SanitizedSvgNode; titleText: string | null }
  | { ok: false }

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

export function sanitizeInlineSvg(source: string): SanitizeInlineSvgResult {
  if (utf8ByteLength(source) > INLINE_FIGURE_SOURCE_MAX_BYTES) return { ok: false }

  const prepared = prepareSvgSource(source)
  if (prepared == null) return { ok: false }

  const doc = new DOMParser().parseFromString(prepared, 'image/svg+xml')
  if (hasParserError(doc)) return { ok: false }

  const root = doc.documentElement
  if (!root || root.localName !== 'svg') return { ok: false }
  if (root.namespaceURI && root.namespaceURI !== SVG_NS) return { ok: false }

  const ids = new Set<string>()
  if (!walkValidate(root, ids, 0)) return { ok: false }

  const tree = convertElement(root, prefixIds(ids, source), 0)
  if (!tree) return { ok: false }

  return {
    ok: true,
    root: tree,
    titleText: findTitleText(tree),
  }
}

function prepareSvgSource(source: string): string | null {
  let text = source.replace(/^\uFEFF/, '').trim()
  if (!text) return null
  text = text.replace(/^<\?xml\b[\s\S]*?\?>\s*/i, '')
  text = text.replace(/^<!DOCTYPE\b[^>]*>\s*/i, '')
  return text || null
}

function hasParserError(doc: Document): boolean {
  if (doc.querySelector('parsererror')) return true
  const root = doc.documentElement
  return !root || root.localName.toLowerCase() === 'parsererror'
}

function walkValidate(el: Element, ids: Set<string>, depth: number): boolean {
  if (depth > MAX_DEPTH) return false
  if (!ALLOWED_TAGS.has(el.localName)) return false
  if (el.namespaceURI && el.namespaceURI !== SVG_NS) return false

  for (const attr of Array.from(el.attributes)) {
    if (isForbiddenAttr(attr)) return false
  }

  const id = el.getAttribute('id')
  if (id) ids.add(id)

  for (const child of el.children) {
    if (!walkValidate(child, ids, depth + 1)) return false
  }
  return true
}

function convertElement(
  el: Element,
  idMap: Map<string, string>,
  depth: number,
): SanitizedSvgNode | null {
  if (depth > MAX_DEPTH) return null
  const attrs = pickAttrs(el, idMap)
  if (!attrs) return null

  if (el.localName === 'title' || el.localName === 'desc') {
    const text = el.textContent ?? ''
    return { tag: el.localName, attrs, children: text ? [text] : [] }
  }

  const children: Array<SanitizedSvgNode | string> = []
  for (const child of Array.from(el.childNodes)) {
    if (child instanceof Text) {
      if (child.data) children.push(child.data)
      continue
    }
    if (!(child instanceof Element)) continue
    const node = convertElement(child, idMap, depth + 1)
    if (!node) return null
    children.push(node)
  }

  return { tag: el.localName, attrs, children }
}

function pickAttrs(
  el: Element,
  idMap: Map<string, string>,
): Record<string, string> | null {
  const attrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (isForbiddenAttr(attr)) return null
    const name = attrName(attr)
    if (!ALLOWED_ATTRS.has(name)) continue
    const value = attr.value
    if (name === 'xmlns') {
      attrs[name] = value
      continue
    }
    if (FORBIDDEN_PROTOCOL.test(value) || PROTOCOL_RELATIVE.test(value)) {
      return null
    }
    if (name === 'id') {
      const next = idMap.get(value)
      if (next) attrs.id = next
      continue
    }
    if (PAINT_ATTRS.has(name)) {
      const paint = rewritePaint(value, idMap)
      if (paint == null) return null
      attrs[name] = paint
      continue
    }
    if (name === 'clip-path') {
      const clip = prefixUrlHash(value.trim(), idMap)
      if (clip == null) return null
      attrs[name] = clip
      continue
    }
    attrs[name] = value
  }
  return attrs
}

function rewritePaint(value: string, idMap: Map<string, string>): string | null {
  const trimmed = value.trim()
  if (parseUrlHash(trimmed) != null) return prefixUrlHash(trimmed, idMap)
  if (COLOR_LITERAL.test(trimmed)) return trimmed
  return null
}

function prefixUrlHash(
  value: string,
  idMap: Map<string, string>,
): string | null {
  const id = parseUrlHash(value)
  if (id == null) return null
  const prefixed = idMap.get(id)
  if (!prefixed) return null
  return `url(#${prefixed})`
}

function parseUrlHash(value: string): string | null {
  const match = URL_HASH.exec(value)
  return match?.[2] ?? null
}

function isForbiddenAttr(attr: Attr): boolean {
  return /^on/i.test(attr.localName) || FORBIDDEN_ATTRS.has(attrName(attr))
}

function attrName(attr: Attr): string {
  if (attr.namespaceURI === XLINK_NS || attr.prefix === 'xlink') {
    return `xlink:${attr.localName}`
  }
  return attr.localName
}

function findTitleText(node: SanitizedSvgNode): string | null {
  if (node.tag === 'title') {
    return joinedText(node) || null
  }
  for (const child of node.children) {
    if (typeof child === 'string') continue
    const found = findTitleText(child)
    if (found) return found
  }
  return null
}

function joinedText(node: SanitizedSvgNode): string {
  let text = ''
  for (const child of node.children) {
    if (typeof child === 'string') text += child
  }
  return text.trim()
}

function prefixIds(ids: Set<string>, source: string): Map<string, string> {
  const hash = fnv1aHex(source)
  const idMap = new Map<string, string>()
  for (const id of ids) {
    const filtered = id.replace(/[^A-Za-z0-9_-]/g, '')
    if (!filtered) continue
    idMap.set(id, `if-${hash}-${filtered}`)
  }
  return idMap
}

function fnv1aHex(source: string): string {
  let hash = 0x811c9dc5
  const bytes = new TextEncoder().encode(source)
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
