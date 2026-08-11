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

function extractModuleSpecifiers(source) {
  const specs = new Set()
  const fromRe =
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  const sideRe = /\bimport\s+['"]([^'"]+)['"]/g
  const exportStarRe = /\bexport\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  const reqRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const re of [fromRe, sideRe, exportStarRe, dynRe, reqRe]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(source)) !== null) {
      if (m[1]) specs.add(m[1])
    }
  }
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

function checkForbiddenImports(filePath, specifier, source) {
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

  // Node built-ins — only enforce under src/ (renderer), not vite.config
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

  // asChild usage (prop / string)
  if (/\basChild\b/.test(source)) {
    // only report once per file from the loop; check separately
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
  // also forbid top-level ports under src
  const ports = path.join(workbenchSrc, 'ports')
  if (await exists(ports)) {
    errors.push('forbidden global ports directory: src/ports/')
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

  for (const file of files) {
    const text = await readFile(file, 'utf8')
    if (/\basChild\b/.test(text)) {
      asChildFiles.add(rel(file, workbenchRoot))
    }

    for (const spec of extractModuleSpecifiers(text)) {
      checkForbiddenImports(file, spec, text)
      checkModuleImport(file, spec)

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
}

async function main() {
  console.log('check-workbench')
  console.log(`  platformRoot:  ${platformRoot}`)
  console.log(`  workbenchRoot: ${workbenchRoot}`)

  if (!(await mustExist(workbenchRoot, 'archetypes/agent-workbench'))) {
    console.error(`\ncheck-workbench FAILED (${errors.length} issue(s)):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  await checkPackageContract()
  await checkDumpingGrounds()
  await checkSources()

  if (errors.length > 0) {
    console.error(`\ncheck-workbench FAILED (${errors.length} issue(s)):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log('\ncheck-workbench OK')
  console.log('  Module boundaries: root Interfaces only')
  console.log('  Foundation: button + input + tokens')
  console.log('  Forbidden: radix/asChild, desktop host, node builtins in src')
  console.log('  Work Surface Host: no Document/Browser surface imports')
  process.exit(0)
}

main().catch((error) => {
  console.error(
    `check-workbench crashed: ${error.stack || error.message || error}`
  )
  process.exit(1)
})
