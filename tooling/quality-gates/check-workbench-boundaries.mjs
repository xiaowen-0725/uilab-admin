#!/usr/bin/env node
/**
 * Agent Workbench boundary gate (fail-closed).
 *
 * Checks:
 * - package presence + Foundation workspace dependency
 * - Foundation token import + Button/Input public subpath consumption
 * - forbidden @radix-ui/* and asChild
 * - forbidden Electron/Tauri and Node built-ins in renderer sources
 * - forbidden cross-Module internal imports (only @/modules/<name> roots)
 * - no shared / common / global ports dumping-ground directories
 * - leaf layers (model/ports/adapters/…) must not import React or UI
 * - src/ runtime import graph has no cycles
 * - Desktop Host only imports host-wire + local-root-path from src/
 * - renderer must not import desktop/
 */
import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const platformRoot = path.resolve(scriptDir, '../..')
const workbenchRoot = path.join(platformRoot, 'archetypes', 'agent-workbench')
const workbenchSrc = path.join(workbenchRoot, 'src')

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'])
const WALK_SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.vitest-attachments',
  '__screenshots__',
  '.playwright-cli',
])

const FORBIDDEN_NODE_BUILTINS = new Set([
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'path',
  'node:path',
  'child_process',
  'node:child_process',
  'os',
  'node:os',
  'net',
  'node:net',
  'http',
  'node:http',
  'https',
  'node:https',
  'crypto',
  'node:crypto',
  'worker_threads',
  'node:worker_threads',
  'module',
  'node:module',
  'vm',
  'node:vm',
  'cluster',
  'node:cluster',
  'dgram',
  'node:dgram',
  'dns',
  'node:dns',
  'tls',
  'node:tls',
  'readline',
  'node:readline',
  'stream',
  'node:stream',
  'zlib',
  'node:zlib',
])

const DUMPING_GROUND_DIRS = ['shared', 'common', 'ports']

const errors = []

function rel(filePath, base = platformRoot) {
  return path.relative(base, filePath) || '.'
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function mustExist(filePath, label) {
  if (!(await exists(filePath))) {
    errors.push(`missing ${label ?? rel(filePath)}`)
    return false
  }
  return true
}

async function walkSources(dir, acc = []) {
  if (!(await exists(dir))) return acc
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (WALK_SKIP_DIRS.has(entry.name)) continue
      await walkSources(full, acc)
      continue
    }
    if (!entry.isFile()) continue
    if (SOURCE_EXTS.has(path.extname(entry.name))) acc.push(full)
  }
  return acc
}

function addCaptured(source, regex, specs) {
  regex.lastIndex = 0
  let match
  while ((match = regex.exec(source)) !== null) {
    if (match[1]) specs.add(match[1])
  }
}

function extractModuleSpecifiers(source) {
  const specs = new Set()
  addCaptured(
    source,
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    specs,
  )
  addCaptured(source, /\bimport\s+['"]([^'"]+)['"]/g, specs)
  addCaptured(
    source,
    /\bexport\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g,
    specs,
  )
  addCaptured(source, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, specs)
  addCaptured(source, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, specs)
  return [...specs]
}

/**
 * Detect cross-module internal imports.
 * Allowed: @/modules/<name> and @/modules/<name>/index
 * Forbidden: @/modules/<name>/anything/else
 * Also forbid relative imports that escape into another module's internals.
 */
function checkModuleImport(filePath, specifier) {
  const fileRel = rel(filePath, workbenchRoot)

  const aliasMatch = specifier.match(/^@\/modules\/([^/]+)(?:\/(.+))?$/)
  if (aliasMatch) {
    const rest = aliasMatch[2]
    if (rest && rest !== 'index' && rest !== 'index.ts' && rest !== 'index.tsx') {
      errors.push(
        `cross-Module internal import in ${fileRel}: ${specifier} (import only @/modules/<module> root Interface)`
      )
    }
    return
  }

  if (specifier.startsWith('.') && filePath.includes(`${path.sep}modules${path.sep}`)) {
    const resolved = path.resolve(path.dirname(filePath), specifier)
    const modulesRoot = path.join(workbenchSrc, 'modules')
    const relToModules = path.relative(modulesRoot, resolved)
    if (relToModules.startsWith('..') || path.isAbsolute(relToModules)) {
      return
    }
    const fromRel = path.relative(modulesRoot, filePath)
    const fromModule = fromRel.split(path.sep)[0]
    const toModule = relToModules.split(path.sep)[0]
    if (fromModule && toModule && fromModule !== toModule) {
      // Allow only if target is exactly the other module's index
      const toRest = relToModules.split(path.sep).slice(1).join('/')
      const isRootIndex =
        toRest === '' ||
        toRest === 'index' ||
        toRest === 'index.ts' ||
        toRest === 'index.tsx'
      if (!isRootIndex) {
        errors.push(
          `cross-Module internal relative import in ${fileRel}: ${specifier} -> modules/${relToModules}`
        )
      }
    }
  }
}

function checkForbiddenImports(filePath, specifier) {
  const fileRel = rel(filePath, workbenchRoot)

  if (specifier === '@radix-ui' || specifier.startsWith('@radix-ui/')) {
    errors.push(`forbidden @radix-ui/* in ${fileRel}: ${specifier}`)
  }

  if (
    specifier === 'electron' ||
    specifier.startsWith('electron/') ||
    specifier === '@tauri-apps' ||
    specifier.startsWith('@tauri-apps/') ||
    specifier === '@electron' ||
    specifier.startsWith('@electron/')
  ) {
    errors.push(`forbidden desktop host import in ${fileRel}: ${specifier}`)
  }

  if (filePath.startsWith(workbenchSrc + path.sep) || filePath === workbenchSrc) {
    const bare = specifier.replace(/^node:/, '')
    if (
      FORBIDDEN_NODE_BUILTINS.has(specifier) ||
      FORBIDDEN_NODE_BUILTINS.has(bare) ||
      FORBIDDEN_NODE_BUILTINS.has(`node:${bare}`)
    ) {
      errors.push(`forbidden Node built-in in renderer source ${fileRel}: ${specifier}`)
    }
  }
}

async function checkPackageContract() {
  const pkgPath = path.join(workbenchRoot, 'package.json')
  if (!(await mustExist(pkgPath, 'Workbench package.json'))) return null

  let pkg
  try {
    pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  } catch (error) {
    errors.push(`Workbench package.json is not valid JSON: ${error.message}`)
    return null
  }

  if (pkg.name !== '@uilab/agent-workbench') {
    errors.push(
      `Workbench package name must be @uilab/agent-workbench (got ${JSON.stringify(pkg.name)})`
    )
  }

  const dep =
    pkg.dependencies?.['@uilab/foundation'] ??
    pkg.devDependencies?.['@uilab/foundation']
  if (dep !== 'workspace:*') {
    errors.push(
      `Workbench must depend on @uilab/foundation as "workspace:*" (got ${JSON.stringify(dep)})`
    )
  }

  return pkg
}

const LEAF_DIR_SEGMENTS = new Set([
  'model',
  'ports',
  'adapters',
  'protocol',
  'projection',
  'runtime',
])

const LEAF_PATH_PREFIXES = [
  'src/modules/task-runtime/',
  'src/app/persistence/',
  'src/config/',
  'src/lib/',
]

const LEAF_FILES = new Set([
  'src/modules/project/application/local-root-path.ts',
  'src/modules/project/application/sidecar-workspace-ready.ts',
])

const DESKTOP_ALLOWED_SRC = new Set([
  'src/modules/project/ports/host-wire.ts',
  ...LEAF_FILES,
])

const UI_DIR_SEGMENTS = new Set(['components', 'shell', 'ui'])

function toPosixRel(filePath, base = workbenchRoot) {
  return rel(filePath, base).split(path.sep).join('/')
}

function isTestSource(filePath) {
  const posix = toPosixRel(filePath)
  return (
    posix.startsWith('tests/') ||
    /\.test\.(ts|tsx|js|jsx|mts|cts)$/.test(posix)
  )
}

function isLeafSource(filePath) {
  const posix = toPosixRel(filePath)
  if (LEAF_FILES.has(posix)) return true
  if (LEAF_PATH_PREFIXES.some((prefix) => posix.startsWith(prefix))) return true
  const parts = posix.split('/')
  const modulesIdx = parts.indexOf('modules')
  return modulesIdx >= 0 && LEAF_DIR_SEGMENTS.has(parts[modulesIdx + 2])
}

function isReactSpecifier(spec) {
  return (
    spec === 'react' ||
    spec === 'react-dom' ||
    spec.startsWith('react/') ||
    spec.startsWith('react-dom/')
  )
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function extractRuntimeSpecifiers(source) {
  const text = stripComments(source)
  const specs = new Set()
  const fromRe =
    /\b(?:import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
  let match
  while ((match = fromRe.exec(text)) !== null) {
    const head = match[1].trim()
    if (head === 'type' || head.startsWith('type ')) continue
    specs.add(match[2])
  }
  addCaptured(text, /\bimport\s+['"]([^'"]+)['"]/g, specs)
  addCaptured(
    text,
    /\bexport\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g,
    specs,
  )
  addCaptured(text, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, specs)
  return [...specs]
}

const resolvedImportCache = new Map()

async function resolveImport(fromFile, specifier) {
  const cacheKey = `${fromFile}::${specifier}`
  if (resolvedImportCache.has(cacheKey)) {
    return resolvedImportCache.get(cacheKey)
  }

  const spec = specifier.replace(/[?#].*$/, '')
  let base = null
  if (spec.startsWith('@/')) {
    base = path.join(workbenchSrc, spec.slice(2))
  } else if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec)
  }

  let resolved = null
  if (base) {
    const ext = path.extname(base)
    const candidates =
      ext && SOURCE_EXTS.has(ext)
        ? [base]
        : [
            base,
            `${base}.ts`,
            `${base}.tsx`,
            `${base}.js`,
            `${base}.mjs`,
            path.join(base, 'index.ts'),
            path.join(base, 'index.tsx'),
          ]
    for (const candidate of candidates) {
      if (await exists(candidate)) {
        resolved = candidate
        break
      }
    }
  }

  resolvedImportCache.set(cacheKey, resolved)
  return resolved
}

function pathHasUiSegment(posixRel) {
  const parts = posixRel.split('/')
  return parts.some((part) => UI_DIR_SEGMENTS.has(part))
}

async function checkLeafLayer(filePath, specifiers) {
  const fileRel = toPosixRel(filePath)
  if (path.extname(filePath) === '.tsx') {
    errors.push(`leaf layer must not be .tsx: ${fileRel}`)
  }

  for (const spec of specifiers) {
    if (isReactSpecifier(spec)) {
      errors.push(`leaf layer must not import React in ${fileRel}: ${spec}`)
    }
    if (spec.startsWith('@/components') || spec.startsWith('@/shell')) {
      errors.push(`leaf layer must not import UI in ${fileRel}: ${spec}`)
    }

    const resolved = await resolveImport(filePath, spec)
    if (!resolved) continue
    const resolvedRel = toPosixRel(resolved)
    if (path.extname(resolved) === '.tsx') {
      errors.push(
        `leaf layer must not import .tsx in ${fileRel}: ${spec} -> ${resolvedRel}`,
      )
    }
    if (pathHasUiSegment(resolvedRel)) {
      errors.push(
        `leaf layer must not import UI path in ${fileRel}: ${spec} -> ${resolvedRel}`,
      )
    }
  }
}

function findCycles(graph) {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map()
  const cycles = []

  function dfs(u, stack) {
    color.set(u, GRAY)
    stack.push(u)
    for (const v of graph.get(u) ?? []) {
      if (!graph.has(v)) continue
      const c = color.get(v) ?? WHITE
      if (c === GRAY) {
        const idx = stack.indexOf(v)
        if (idx >= 0) cycles.push([...stack.slice(idx), v])
      } else if (c === WHITE) {
        dfs(v, stack)
      }
    }
    stack.pop()
    color.set(u, BLACK)
  }

  for (const u of graph.keys()) {
    if ((color.get(u) ?? WHITE) === WHITE) dfs(u, [])
  }
  return cycles
}

async function checkDumpingGrounds() {
  for (const name of DUMPING_GROUND_DIRS) {
    const candidate = path.join(workbenchSrc, name)
    if (await exists(candidate)) {
      const st = await stat(candidate)
      if (st.isDirectory()) {
        errors.push(
          `forbidden dumping-ground directory: src/${name}/ (use Module-owned paths instead)`
        )
      }
    }
  }
}

async function checkSources() {
  if (!(await mustExist(workbenchSrc, 'Workbench src/'))) return

  const files = await walkSources(workbenchSrc)
  // include tests under package
  const testRoot = path.join(workbenchRoot, 'tests')
  if (await exists(testRoot)) {
    await walkSources(testRoot, files)
  }

  if (files.length === 0) {
    errors.push('Workbench has no source files to inspect')
    return
  }

  let hasButton = false
  let hasInput = false
  let hasTokens = false
  const asChildFiles = new Set()
  const cycleGraph = new Map()

  for (const file of files) {
    const text = await readFile(file, 'utf8')
    if (/\basChild\b/.test(text)) {
      asChildFiles.add(rel(file, workbenchRoot))
    }

    const specifiers = extractModuleSpecifiers(text)
    const fileRel = toPosixRel(file)
    const inSrc = file.startsWith(workbenchSrc + path.sep)
    const testFile = isTestSource(file)

    if (inSrc && !testFile && isLeafSource(file)) {
      await checkLeafLayer(file, specifiers)
    }

    if (inSrc && !testFile) {
      if (!cycleGraph.has(fileRel)) cycleGraph.set(fileRel, new Set())
      for (const spec of extractRuntimeSpecifiers(text)) {
        const resolved = await resolveImport(file, spec)
        if (!resolved) continue
        const toRel = toPosixRel(resolved)
        if (!toRel.startsWith('src/')) continue
        cycleGraph.get(fileRel).add(toRel)
      }
    }

    for (const spec of specifiers) {
      checkForbiddenImports(file, spec)
      checkModuleImport(file, spec)

      if (!fileRel.startsWith('desktop/')) {
        const resolved = await resolveImport(file, spec)
        if (resolved && toPosixRel(resolved).startsWith('desktop/')) {
          errors.push(
            `renderer must not import desktop/ in ${fileRel}: ${spec}`,
          )
        }
      }

      if (
        spec === '@uilab/foundation/ui/button' ||
        spec.endsWith('/ui/button')
      ) {
        hasButton = true
      }
      if (spec === '@uilab/foundation/ui/input' || spec.endsWith('/ui/input')) {
        hasInput = true
      }
      if (
        spec === '@uilab/foundation/styles/tokens.css' ||
        spec.includes('@uilab/foundation/styles/tokens.css')
      ) {
        hasTokens = true
      }
    }
  }

  for (const f of asChildFiles) {
    errors.push(`forbidden asChild usage in ${f}`)
  }

  if (!hasButton) {
    errors.push(
      'Workbench must import Foundation Button via @uilab/foundation/ui/button'
    )
  }
  if (!hasInput) {
    errors.push(
      'Workbench must import Foundation Input via @uilab/foundation/ui/input'
    )
  }
  if (!hasTokens) {
    // CSS @import is the normal tokens entry (not JS module specifier)
    const styleDir = path.join(workbenchSrc, 'styles')
    let tokenInCss = false
    if (await exists(styleDir)) {
      const styleEntries = await readdir(styleDir)
      for (const name of styleEntries) {
        if (!name.endsWith('.css')) continue
        const css = await readFile(path.join(styleDir, name), 'utf8')
        if (css.includes('@uilab/foundation/styles/tokens.css')) {
          tokenInCss = true
          break
        }
      }
    }
    if (!tokenInCss) {
      errors.push(
        'Workbench must import @uilab/foundation/styles/tokens.css'
      )
    }
  }

  // Required structural paths
  const required = [
    'src/app/composition',
    'src/shell/workbench-shell',
    'src/shell/navigator',
    'src/modules/workbench-session/index.ts',
    'src/modules/task/index.ts',
    'src/modules/task-runtime/index.ts',
    'src/modules/work-surface/index.ts',
    'src/modules/capabilities/index.ts',
    'src/modules/project/index.ts',
    'src/modules/project/ports/host-wire.ts',
    'src/modules/board/index.ts',
  ]
  for (const p of required) {
    await mustExist(path.join(workbenchRoot, p), p)
  }

  // Work Surface Host must not import concrete Document/Browser surfaces
  // (ticket 02 — Host only depends on Registry Interface).
  const hostDir = path.join(workbenchSrc, 'modules', 'work-surface', 'ui', 'work-surface-host')
  if (await exists(hostDir)) {
    const hostFiles = await walkSources(hostDir)
    for (const file of hostFiles) {
      const source = await readFile(file, 'utf8')
      if (
        /surfaces\/document|surfaces\/browser|@\/modules\/work-surface\/surfaces\/(?:document|browser)/.test(
          source,
        )
      ) {
        errors.push(
          `Work Surface Host must not import Document/Browser surfaces: ${rel(file)}`,
        )
      }
    }
  }

  const cycles = findCycles(cycleGraph)
  const seenCycle = new Set()
  for (const cycle of cycles) {
    const key = cycle.join(' -> ')
    if (seenCycle.has(key)) continue
    seenCycle.add(key)
    errors.push(`circular import: ${key}`)
    if (seenCycle.size >= 8) break
  }

  await checkDesktopHostImports()
  await checkBoardCspAndSandbox()
  await checkBoardToolReturnTypes()
}

async function checkDesktopHostImports() {
  const desktopDir = path.join(workbenchRoot, 'desktop', 'electron')
  if (!(await exists(desktopDir))) return
  const desktopFiles = await walkSources(desktopDir)
  for (const file of desktopFiles) {
    const text = await readFile(file, 'utf8')
    const fileRel = toPosixRel(file)
    for (const spec of extractModuleSpecifiers(text)) {
      if (
        spec === 'electron' ||
        spec.startsWith('electron/') ||
        spec.startsWith('node:') ||
        FORBIDDEN_NODE_BUILTINS.has(spec)
      ) {
        continue
      }
      const resolved = await resolveImport(file, spec)
      if (!resolved) continue
      const resolvedRel = toPosixRel(resolved)
      if (resolvedRel.startsWith('desktop/electron/')) continue
      if (
        resolvedRel.startsWith('src/') &&
        !DESKTOP_ALLOWED_SRC.has(resolvedRel)
      ) {
        errors.push(
          `Desktop Host may only import host-wire, local-root-path, or sidecar-workspace-ready from src/ (${fileRel}: ${spec} -> ${resolvedRel})`,
        )
      }
    }
  }
}

function parseCspPolicy(policy) {
  const directives = new Map()
  for (const raw of policy.split(';')) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    directives.set(tokens[0].toLowerCase(), tokens.slice(1))
  }
  return directives
}

function isNoneOnly(sources) {
  return sources.length === 1 && sources[0] === "'none'"
}

function isNonceSource(source) {
  return /^'nonce-.+'$/.test(source)
}

function coversSource(hostSources, widgetSource) {
  return (
    hostSources.includes('*') ||
    hostSources.includes(widgetSource) ||
    (isNonceSource(widgetSource) && hostSources.some(isNonceSource))
  )
}

function hostCspCoversWidgetCsp(hostPolicy, widgetPolicy) {
  const host = parseCspPolicy(hostPolicy)
  const widget = parseCspPolicy(widgetPolicy)
  const missing = []
  for (const [directive, widgetSources] of widget) {
    if (isNoneOnly(widgetSources)) continue
    const hostSources = host.get(directive) ?? host.get('default-src') ?? []
    for (const source of widgetSources) {
      if (source === "'none'") continue
      if (coversSource(hostSources, source)) continue
      missing.push(`${directive} ${source}`)
    }
  }
  return missing
}

function extractQuotedString(source, name) {
  const match = source.match(
    new RegExp(`export const ${name}\\s*=\\s*(['"\`])([\\s\\S]*?)\\1`),
  )
  return match?.[2] ?? null
}

function extractHostCspFromIndexHtml(html) {
  const block = html.match(
    /<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i,
  )
  if (!block) return null
  const content = block[0].match(/\bcontent=(["'])([\s\S]*?)\1/)
  return content?.[2] ?? null
}

function findBoardWidgetIframes(source) {
  const frames = []
  const iframeRe = /<iframe\b([\s\S]*?)\/?>/g
  let match
  while ((match = iframeRe.exec(source)) !== null) {
    frames.push(match[1])
  }
  return frames
}

async function checkBoardCspAndSandbox() {
  const indexHtmlPath = path.join(workbenchRoot, 'index.html')
  if (!(await mustExist(indexHtmlPath, 'archetypes/agent-workbench/index.html'))) {
    return
  }
  const indexHtml = await readFile(indexHtmlPath, 'utf8')
  const hostCsp = extractHostCspFromIndexHtml(indexHtml)
  if (!hostCsp) {
    errors.push(
      'index.html must include a Content-Security-Policy meta (Board widget srcdoc clones the host policy)',
    )
    return
  }
  if (!/\bframe-src\b/.test(hostCsp)) {
    errors.push('host CSP must include frame-src')
  }
  if (!/\bimg-src\b/.test(hostCsp)) {
    errors.push('host CSP must include img-src')
  }
  if (hostCsp.includes("'unsafe-eval'")) {
    errors.push("host CSP must not include 'unsafe-eval'")
  }

  const boardDir = path.join(workbenchSrc, 'modules', 'board')
  if (!(await exists(boardDir))) {
    errors.push('missing src/modules/board (needed for widget iframe policy checks)')
    return
  }
  const boardFiles = (await walkSources(boardDir)).filter((file) => !isTestSource(file))
  let widgetIframeCount = 0
  let widgetCsp = null
  for (const file of boardFiles) {
    const source = await readFile(file, 'utf8')
    const fileRel = toPosixRel(file)
    if (
      /\bsandboxForTrust\b/.test(source) ||
      /surfaces\/browser\/url-utils/.test(source)
    ) {
      errors.push(
        `board module must not reuse sandboxForTrust() / browser url-utils (${fileRel})`,
      )
    }
    for (const attrs of findBoardWidgetIframes(source)) {
      widgetIframeCount += 1
      const hasSandbox = /\bsandbox\s*=/.test(attrs)
      const hasCsp = /\bcsp\s*=/.test(attrs)
      if (!hasSandbox || !hasCsp) {
        errors.push(
          `Board widget iframe in ${fileRel} must set both sandbox and csp attributes`,
        )
      }
      if (/allow-same-origin/.test(attrs)) {
        errors.push(
          `Board widget iframe sandbox in ${fileRel} must not include allow-same-origin`,
        )
      }
    }
    const template = extractQuotedString(source, 'WIDGET_IFRAME_CSP_TEMPLATE')
    if (template) widgetCsp = template
    const sandboxConst = extractQuotedString(source, 'WIDGET_IFRAME_SANDBOX')
    if (sandboxConst?.includes('allow-same-origin')) {
      errors.push(
        'WIDGET_IFRAME_SANDBOX must not include allow-same-origin',
      )
    }
  }
  if (widgetIframeCount === 0) {
    errors.push(
      'Board widget rendering point must include an iframe with sandbox and csp attributes',
    )
  }
  if (!widgetCsp) {
    errors.push('missing WIDGET_IFRAME_CSP_TEMPLATE for host/widget CSP pair check')
    return
  }

  const hostForPair = hostCsp
    .replaceAll('WORKBENCH_CSP_NONCE', 'gate-nonce')
    .replaceAll('WORKBENCH_DEV_CONNECT', 'ws://localhost:5174')
  const widgetForPair = widgetCsp.replaceAll('__NONCE__', 'gate-nonce')
  const missing = hostCspCoversWidgetCsp(hostForPair, widgetForPair)
  if (missing.length > 0) {
    errors.push(
      `host CSP does not cover widget csp= (child can only tighten): ${missing.join(', ')}`,
    )
  }
}

const FORBIDDEN_BOARD_RETURN_FIELDS = new Set(['html', 'code', 'data'])

async function checkBoardToolReturnTypes() {
  const sidecarToolsDir = path.join(
    platformRoot,
    'tooling',
    'workbench-runtime-voltagent',
    'src',
    'tools',
  )
  if (!(await exists(sidecarToolsDir))) {
    errors.push(
      'missing tooling/workbench-runtime-voltagent/src/tools (board tool return-type gate)',
    )
    return
  }
  const files = (await walkSources(sidecarToolsDir)).filter((file) => {
    const base = path.basename(file)
    return base === 'board-types.ts' || base === 'board-tools.ts'
  })
  if (files.length === 0) {
    errors.push('board tool return-type files (board-types.ts / board-tools.ts) are missing')
    return
  }
  const propertyRe = /^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const fileRel = toPosixRel(file)
    let match
    propertyRe.lastIndex = 0
    while ((match = propertyRe.exec(source)) !== null) {
      if (FORBIDDEN_BOARD_RETURN_FIELDS.has(match[1])) {
        errors.push(
          `board tool return types must not include field "${match[1]}" (${fileRel})`,
        )
      }
    }
  }
}

function exitWithErrors() {
  console.error(`\ncheck-workbench FAILED (${errors.length} issue(s)):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

async function main() {
  console.log('check-workbench')
  console.log(`  platformRoot:  ${platformRoot}`)
  console.log(`  workbenchRoot: ${workbenchRoot}`)

  if (!(await mustExist(workbenchRoot, 'archetypes/agent-workbench'))) {
    exitWithErrors()
  }

  await checkPackageContract()
  await checkDumpingGrounds()
  await checkSources()

  if (errors.length > 0) {
    exitWithErrors()
  }

  console.log('\ncheck-workbench OK')
  console.log('  Module boundaries: root Interfaces only')
  console.log('  Foundation: button + input + tokens')
  console.log('  Forbidden: radix/asChild, desktop host, node builtins in src')
  console.log('  Work Surface Host: no Document/Browser surface imports')
  console.log('  Leaf layer: no React / UI')
  console.log('  Runtime imports: no cycles')
  console.log('  Host wire: desktop ↔ renderer shared leaf')
  console.log('  Board CSP: host meta + widget sandbox/csp pair')
  console.log('  Board tools: return types omit html/code/data')
  process.exit(0)
}

main().catch((error) => {
  console.error(
    `check-workbench crashed: ${error.stack || error.message || error}`
  )
  process.exit(1)
})
