#!/usr/bin/env node
/**
 * Foundation boundary / Interface gate for uilab-admin (canonical implementation).
 *
 * Layout-aware:
 * - Platform: tooling/quality-gates/check-foundation-boundaries.mjs
 *   Foundation = <repo>/packages/foundation, Admin = <repo>/archetypes/admin
 * - Derived: scripts/check-foundation.mjs (canonical copy, not platform wrapper)
 *   Foundation = <app>/packages/foundation, Admin = app root
 *
 * Fails closed on reverse deps, unapproved exports, missing Admin consumption contract.
 */
import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @typedef {'platform' | 'derived'} GateLayoutKind
 * @typedef {{
 *   kind: GateLayoutKind,
 *   platformRoot: string,
 *   foundationRoot: string,
 *   adminRoot: string,
 *   workbenchRoot: string | null,
 * }} GateLayout
 */

/** Exact public Interface: export key → package-relative target (Phase 2A). */
const APPROVED_EXPORT_MAP = Object.freeze({
  './ui/button': './src/ui/button.tsx',
  './ui/input': './src/ui/input.tsx',
  './styles/tokens.css': './src/styles/tokens.css',
})

const APPROVED_EXPORT_KEYS = Object.keys(APPROVED_EXPORT_MAP)

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'])

/** Directories skipped while walking Foundation package sources. */
const WALK_SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.vitest-attachments',
  '__screenshots__',
  '.playwright-cli',
])

/** @returns {GateLayout} */
function detectGateLayout() {
  const scriptPath = fileURLToPath(import.meta.url)
  const scriptDir = path.dirname(scriptPath)
  const parent = path.basename(scriptDir)
  const grandparent = path.basename(path.dirname(scriptDir))

  // Platform canonical: tooling/quality-gates/check-foundation-boundaries.mjs
  if (parent === 'quality-gates' && grandparent === 'tooling') {
    const platformRoot = path.resolve(scriptDir, '../..')
    return {
      kind: 'platform',
      platformRoot,
      foundationRoot: path.join(platformRoot, 'packages', 'foundation'),
      adminRoot: path.join(platformRoot, 'archetypes', 'admin'),
      workbenchRoot: path.join(platformRoot, 'archetypes', 'agent-workbench'),
    }
  }

  // Derived app: scripts/check-foundation.mjs (canonical copy)
  const projectRoot = path.resolve(scriptDir, '..')
  return {
    kind: 'derived',
    platformRoot: projectRoot,
    foundationRoot: path.join(projectRoot, 'packages', 'foundation'),
    adminRoot: projectRoot,
    // Derived Admin apps do not include Workbench Archetype
    workbenchRoot: null,
  }
}

const LAYOUT = detectGateLayout()
const { platformRoot, foundationRoot, adminRoot, workbenchRoot } = LAYOUT
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

/**
 * Whether a path resolves inside foundationRoot (no escape, no absolute relative).
 * @param {string} candidate
 */
function isInsideFoundation(candidate) {
  const foundationResolved = path.resolve(foundationRoot)
  const resolved = path.resolve(candidate)
  const relative = path.relative(foundationResolved, resolved)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Collect Foundation package source-like files under the package root
 * (not only src/), excluding generated/dependency directories.
 * @param {string} dir
 * @param {string[]} acc
 */
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
    const ext = path.extname(entry.name)
    if (SOURCE_EXTS.has(ext)) acc.push(full)
  }
  return acc
}

/**
 * Extract static and dynamic import/export module specifiers.
 * @param {string} source
 * @returns {string[]}
 */
function extractModuleSpecifiers(source) {
  const specs = new Set()
  // import/export ... from 'x' ; side-effect import 'x' ; export * from 'x'
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
 * @param {string} specifier
 * @returns {boolean}
 */
function isApprovedFoundationSelfImport(specifier) {
  return (
    specifier === '@uilab/foundation' ||
    specifier.startsWith('@uilab/foundation/')
  )
}

/**
 * @param {string} filePath
 * @param {string} specifier
 */
function checkSpecifier(filePath, specifier) {
  const fileRel = rel(filePath, foundationRoot)

  if (specifier.includes('archetypes/') || specifier.startsWith('archetypes')) {
    errors.push(
      `forbidden Archetype path import in ${fileRel}: ${specifier}`
    )
    return
  }

  // Fail closed: any @uilab/* except self-reference to @uilab/foundation
  if (specifier === '@uilab' || specifier.startsWith('@uilab/')) {
    if (!isApprovedFoundationSelfImport(specifier)) {
      errors.push(
        `forbidden @uilab/* dependency in ${fileRel}: ${specifier} (only @uilab/foundation self-reference allowed)`
      )
    }
    return
  }

  // Admin alias @/* (not scoped packages like @uilab/..., @base-ui/...)
  if (specifier === '@' || specifier.startsWith('@/')) {
    errors.push(
      `forbidden Admin alias @/* in ${fileRel}: ${specifier}`
    )
    return
  }

  if (specifier.startsWith('.')) {
    const resolved = path.resolve(path.dirname(filePath), specifier)
    const foundationResolved = path.resolve(foundationRoot)
    const relative = path.relative(foundationResolved, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push(
        `relative import escapes Foundation package in ${fileRel}: ${specifier} -> ${rel(resolved)}`
      )
    }
  }
}

async function checkFoundationSourceImports() {
  if (!(await mustExist(foundationRoot, `Foundation package root (${rel(foundationRoot)})`))) {
    return
  }

  const files = await walkSources(foundationRoot)
  if (files.length === 0) {
    errors.push('Foundation package has no JS/TS source files to inspect')
    return
  }

  for (const file of files) {
    const text = await readFile(file, 'utf8')
    for (const spec of extractModuleSpecifiers(text)) {
      checkSpecifier(file, spec)
    }
  }
}

/**
 * Collect string path targets from a package.json exports entry value.
 * @param {unknown} value
 * @returns {string[]}
 */
function collectExportTargets(value) {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  /** @type {string[]} */
  const out = []
  for (const v of Object.values(value)) {
    if (typeof v === 'string') out.push(v)
    else if (v && typeof v === 'object') out.push(...collectExportTargets(v))
  }
  return out
}

/**
 * Validate a single export target path stays inside Foundation and exists.
 * @param {string} exportKey
 * @param {string} target
 * @param {string} expected
 */
async function assertExportTarget(exportKey, target, expected) {
  if (target !== expected) {
    errors.push(
      `Foundation export ${exportKey} must target exactly ${expected} (got ${JSON.stringify(target)})`
    )
    return
  }

  if (path.isAbsolute(target)) {
    errors.push(
      `Foundation export ${exportKey} target must be package-relative, not absolute: ${target}`
    )
    return
  }

  if (!target.startsWith('./')) {
    errors.push(
      `Foundation export ${exportKey} target must be a relative ./ path (got ${JSON.stringify(target)})`
    )
    return
  }

  const resolved = path.resolve(foundationRoot, target)
  if (!isInsideFoundation(resolved)) {
    errors.push(
      `Foundation export ${exportKey} target escapes package: ${target} -> ${rel(resolved)}`
    )
    return
  }

  if (!(await exists(resolved))) {
    errors.push(
      `Foundation export ${exportKey} target missing: ${target}`
    )
  }
}

async function checkFoundationPackageJson() {
  const pkgPath = path.join(foundationRoot, 'package.json')
  if (!(await mustExist(pkgPath, `Foundation package.json (${rel(pkgPath)})`))) {
    return null
  }

  let pkg
  try {
    pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  } catch (error) {
    errors.push(`Foundation package.json is not valid JSON: ${error.message}`)
    return null
  }

  if (pkg.name !== '@uilab/foundation') {
    errors.push(
      `Foundation package name must be @uilab/foundation (got ${JSON.stringify(pkg.name)})`
    )
  }

  if (pkg.private !== true) {
    errors.push('Foundation package must be private: true (Phase 2A source-consumed)')
  }

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  }
  for (const [name, version] of Object.entries(deps)) {
    // Fail closed: no sibling/application @uilab/* packages as dependencies
    if (name === '@uilab' || name.startsWith('@uilab/')) {
      if (name !== '@uilab/foundation') {
        errors.push(
          `Foundation package.json must not depend on ${name} (${version}); only @uilab/foundation self-reference is allowed`
        )
      }
    }
  }

  const exportsField = pkg.exports
  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    errors.push('Foundation package.json must declare an exports map')
    return pkg
  }

  if (Object.prototype.hasOwnProperty.call(exportsField, '.')) {
    errors.push(
      'Foundation must not export a root barrel ("."); use approved subpaths only'
    )
  }

  const keys = Object.keys(exportsField).sort()
  const approved = [...APPROVED_EXPORT_KEYS].sort()
  if (keys.length !== approved.length || keys.some((k, i) => k !== approved[i])) {
    errors.push(
      `Foundation exports must be exactly [${APPROVED_EXPORT_KEYS.join(', ')}] (got [${keys.join(', ')}])`
    )
  }

  // cn / internal must not be public exports
  for (const key of keys) {
    if (key.includes('cn') || key.includes('internal')) {
      errors.push(`Foundation must not public-export internal helper path: ${key}`)
    }
  }

  // Exact key → target map + existence + stay inside package
  for (const key of APPROVED_EXPORT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(exportsField, key)) continue
    const expected = APPROVED_EXPORT_MAP[key]
    const targets = collectExportTargets(exportsField[key])
    if (targets.length === 0) {
      errors.push(
        `Foundation export ${key} must resolve to string path ${expected} (got ${JSON.stringify(exportsField[key])})`
      )
      continue
    }
    for (const target of targets) {
      await assertExportTarget(key, target, expected)
    }
  }

  return pkg
}

/**
 * Admin UI wrappers must re-export Foundation, not hold parallel implementations.
 * @param {string} filePath
 * @param {string} foundationSubpath
 */
async function assertCompatibilityReexport(filePath, foundationSubpath) {
  const label = rel(filePath, adminRoot)
  if (!(await mustExist(filePath, `Admin UI wrapper ${label}`))) return

  const text = await readFile(filePath, 'utf8')
  const hasExportFrom =
    text.includes(`from '${foundationSubpath}'`) ||
    text.includes(`from "${foundationSubpath}"`)

  if (!hasExportFrom) {
    errors.push(
      `Admin ${label} must re-export from ${foundationSubpath}`
    )
  }

  // Parallel implementation smell: local cva / Base UI primitive wiring
  if (/\bfrom\s+['"]@base-ui\//.test(text)) {
    errors.push(
      `Admin ${label} must not import @base-ui/* (implementation belongs in Foundation)`
    )
  }
  if (/\bfrom\s+['"]class-variance-authority['"]/.test(text)) {
    errors.push(
      `Admin ${label} must not import class-variance-authority (implementation belongs in Foundation)`
    )
  }
  const localFn = text.match(/\bfunction\s+(Button|Input)\b/)
  if (localFn) {
    errors.push(
      `Admin ${label} must not define a local ${localFn[1]} implementation`
    )
  }
  // Non-trivial line count with JSX implementation (heuristic backup)
  const codeLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
  if (codeLines.length > 8 && /return\s*\(/.test(text)) {
    errors.push(
      `Admin ${label} looks like a parallel implementation (keep a thin re-export only)`
    )
  }
}

async function checkAdminConsumption() {
  const adminPkgPath = path.join(adminRoot, 'package.json')
  if (!(await mustExist(adminPkgPath, `Admin package.json (${rel(adminPkgPath)})`))) {
    return
  }

  let adminPkg
  try {
    adminPkg = JSON.parse(await readFile(adminPkgPath, 'utf8'))
  } catch (error) {
    errors.push(`Admin package.json is not valid JSON: ${error.message}`)
    return
  }

  const dep =
    adminPkg.dependencies?.['@uilab/foundation'] ??
    adminPkg.devDependencies?.['@uilab/foundation']
  if (dep !== 'workspace:*') {
    errors.push(
      `Admin must depend on @uilab/foundation as "workspace:*" (got ${JSON.stringify(dep)})`
    )
  }

  await assertCompatibilityReexport(
    path.join(adminRoot, 'src/components/ui/button.tsx'),
    '@uilab/foundation/ui/button'
  )
  await assertCompatibilityReexport(
    path.join(adminRoot, 'src/components/ui/input.tsx'),
    '@uilab/foundation/ui/input'
  )

  const themePath = path.join(adminRoot, 'src/styles/theme.css')
  if (await mustExist(themePath, `Admin theme.css (${rel(themePath, adminRoot)})`)) {
    const theme = await readFile(themePath, 'utf8')
    if (
      !theme.includes('@uilab/foundation/styles/tokens.css') &&
      !theme.includes("@uilab/foundation/styles/tokens.css")
    ) {
      errors.push(
        'Admin src/styles/theme.css must import @uilab/foundation/styles/tokens.css'
      )
    }
    // No duplicate token blocks
    if (/:root\s*\{/.test(theme) || /@theme\s+inline\s*\{/.test(theme)) {
      errors.push(
        'Admin src/styles/theme.css must not retain a duplicate :root / @theme token block'
      )
    }
  }

  const indexCssPath = path.join(adminRoot, 'src/styles/index.css')
  if (await mustExist(indexCssPath, `Admin index.css (${rel(indexCssPath, adminRoot)})`)) {
    const indexCss = await readFile(indexCssPath, 'utf8')
    const expectedFoundationSource =
      '@source "../../node_modules/@uilab/foundation/src/ui";'
    const expectedFoundationSourceSingle =
      "@source '../../node_modules/@uilab/foundation/src/ui';"
    if (
      !indexCss.includes(expectedFoundationSource) &&
      !indexCss.includes(expectedFoundationSourceSingle)
    ) {
      errors.push(
        'Admin src/styles/index.css must register only Foundation UI source with Tailwind @source (node_modules/@uilab/foundation/src/ui)'
      )
    }
  }
}

/**
 * Workbench is the second consumer of Phase 2A Button/Input/tokens.
 * Same pattern as Admin: @/components/ui/* re-exports public Foundation subpaths
 * (or direct subpath imports). Does not expand Foundation exports.
 */
async function checkWorkbenchConsumption() {
  if (!workbenchRoot) {
    return
  }

  if (!(await exists(workbenchRoot))) {
    errors.push(
      `Workbench package root missing (${rel(workbenchRoot)}); platform expects archetypes/agent-workbench as second Foundation consumer`
    )
    return
  }

  const wbPkgPath = path.join(workbenchRoot, 'package.json')
  if (!(await mustExist(wbPkgPath, `Workbench package.json (${rel(wbPkgPath)})`))) {
    return
  }

  let wbPkg
  try {
    wbPkg = JSON.parse(await readFile(wbPkgPath, 'utf8'))
  } catch (error) {
    errors.push(`Workbench package.json is not valid JSON: ${error.message}`)
    return
  }

  if (wbPkg.name !== '@uilab/agent-workbench') {
    errors.push(
      `Workbench package name must be @uilab/agent-workbench (got ${JSON.stringify(wbPkg.name)})`
    )
  }

  const dep =
    wbPkg.dependencies?.['@uilab/foundation'] ??
    wbPkg.devDependencies?.['@uilab/foundation']
  if (dep !== 'workspace:*') {
    errors.push(
      `Workbench must depend on @uilab/foundation as "workspace:*" (got ${JSON.stringify(dep)})`
    )
  }

  // Scan Workbench sources for approved public Interface consumption
  const srcRoot = path.join(workbenchRoot, 'src')
  const files = await walkSources(srcRoot)
  let hasButton = false
  let hasInput = false
  let hasTokens = false

  for (const file of files) {
    const text = await readFile(file, 'utf8')
    if (
      text.includes("@uilab/foundation/ui/button") ||
      text.includes("'@uilab/foundation/ui/button'")
    ) {
      hasButton = true
    }
    if (
      text.includes("@uilab/foundation/ui/input") ||
      text.includes("'@uilab/foundation/ui/input'")
    ) {
      hasInput = true
    }
    if (text.includes('@uilab/foundation/styles/tokens.css')) {
      hasTokens = true
    }
  }

  // tokens may only appear in CSS
  if (!hasTokens) {
    const cssCandidates = [
      path.join(workbenchRoot, 'src/styles/tokens.css'),
      path.join(workbenchRoot, 'src/styles/index.css'),
    ]
    for (const cssPath of cssCandidates) {
      if (await exists(cssPath)) {
        const css = await readFile(cssPath, 'utf8')
        if (css.includes('@uilab/foundation/styles/tokens.css')) {
          hasTokens = true
          break
        }
      }
    }
  }

  if (!hasButton) {
    errors.push(
      'Workbench must consume @uilab/foundation/ui/button (second Foundation consumer)'
    )
  }
  if (!hasInput) {
    errors.push(
      'Workbench must consume @uilab/foundation/ui/input (second Foundation consumer)'
    )
  }
  if (!hasTokens) {
    errors.push(
      'Workbench must import @uilab/foundation/styles/tokens.css (second Foundation consumer)'
    )
  }

  const indexCssPath = path.join(workbenchRoot, 'src/styles/index.css')
  if (await mustExist(indexCssPath, `Workbench index.css (${rel(indexCssPath, workbenchRoot)})`)) {
    const indexCss = await readFile(indexCssPath, 'utf8')
    if (!indexCss.includes('@uilab/foundation/src/ui')) {
      errors.push(
        'Workbench src/styles/index.css must register Foundation UI with Tailwind @source (node_modules/@uilab/foundation/src/ui)'
      )
    }
  }
}

async function main() {
  console.log(`check-foundation (${LAYOUT.kind})`)
  console.log(`  platformRoot:   ${platformRoot}`)
  console.log(`  foundationRoot: ${foundationRoot}`)
  console.log(`  adminRoot:      ${adminRoot}`)
  if (workbenchRoot) {
    console.log(`  workbenchRoot:  ${workbenchRoot}`)
  }

  if (!(await mustExist(foundationRoot, `Foundation package root (${rel(foundationRoot)})`))) {
    // still try admin checks for better diagnostics? fail closed early messages only
  } else {
    const st = await stat(foundationRoot)
    if (!st.isDirectory()) {
      errors.push(`Foundation root is not a directory: ${rel(foundationRoot)}`)
    } else {
      await checkFoundationPackageJson()
      await checkFoundationSourceImports()
    }
  }

  await checkAdminConsumption()
  await checkWorkbenchConsumption()

  if (errors.length > 0) {
    console.error(`\ncheck-foundation FAILED (${errors.length} issue(s)):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log('\ncheck-foundation OK')
  console.log(`  exports: ${APPROVED_EXPORT_KEYS.join(', ')}`)
  console.log(
    workbenchRoot
      ? '  dependency direction: Admin + Workbench → Foundation only'
      : '  dependency direction: Admin → Foundation only'
  )
  process.exit(0)
}

main().catch((error) => {
  console.error(`check-foundation crashed: ${error.stack || error.message || error}`)
  process.exit(1)
})
