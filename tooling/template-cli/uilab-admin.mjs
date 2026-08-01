#!/usr/bin/env node
/**
 * uilab-admin CLI (canonical implementation)
 * CLI-1: check | add | set-shell
 * CLI-2: init | apply-scenario
 *
 * Layout detection:
 * - platform canonical path: tooling/template-cli/uilab-admin.mjs
 * - derived app path: cli/uilab-admin.mjs (canonical copy, not platform wrapper)
 */
import { spawnSync } from 'node:child_process'
import {
  access,
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLI_VERSION = '0.2.0'

/**
 * @typedef {'platform' | 'derived'} CliLayoutKind
 * @typedef {{
 *   kind: CliLayoutKind,
 *   cliPath: string,
 *   platformRoot: string | null,
 *   adminTemplateRoot: string,
 *   platformAssetsRoot: string,
 * }} CliLayout
 */

/** @returns {CliLayout} */
function detectCliLayout() {
  const parent = path.basename(__dirname)
  const grandparent = path.basename(path.dirname(__dirname))

  // Platform canonical: tooling/template-cli/uilab-admin.mjs
  if (parent === 'template-cli' && grandparent === 'tooling') {
    const platformRoot = path.resolve(__dirname, '../..')
    return {
      kind: 'platform',
      cliPath: __filename,
      platformRoot,
      adminTemplateRoot: path.join(platformRoot, 'archetypes', 'admin'),
      // Batch 1B: docs/ai, scaffolds, skill remain at platform root
      platformAssetsRoot: platformRoot,
    }
  }

  // Derived / compatibility path: cli/uilab-admin.mjs (full implementation copy)
  const appRoot = path.resolve(__dirname, '..')
  return {
    kind: 'derived',
    cliPath: __filename,
    platformRoot: null,
    adminTemplateRoot: appRoot,
    platformAssetsRoot: appRoot,
  }
}

const LAYOUT = detectCliLayout()

function pathsEqual(a, b) {
  return path.resolve(a) === path.resolve(b)
}

const EXIT = {
  OK: 0,
  FAIL: 1,
  USAGE: 2,
  CONFLICT: 3,
  NOT_FOUND: 4,
}

const COPY_IGNORE = new Set([
  'node_modules',
  'dist',
  '.git',
  '.tanstack',
  'coverage',
  '.DS_Store',
  'pnpm-debug.log',
])

function print(msg = '') {
  process.stdout.write(String(msg) + '\n')
}

function printErr(msg = '') {
  process.stderr.write(String(msg) + '\n')
}

function usage(exitCode = EXIT.USAGE) {
  print(`uilab-admin v${CLI_VERSION}

Usage:
  uilab-admin <command> [options]

Commands:
  init <app-name>               Create a new app from this template
  apply-scenario <scenario-id>  Apply a scenario pack to an existing app
  check                         Run AI-contract / template gates
  add <pattern>                 Scaffold a page pattern into the app
  set-shell                     Write project shell defaults
  help                          Show help

Scenarios:
  ops-console | saas-admin | agent-desktop

Patterns for add:
  data-table-list               --domain <id> [--title <text>] [--desc <text>]
  settings-section              --section <id> [--title <text>] [--desc <text>]

Global options:
  --dir <path>                  Target app root / parent dir for init (default: cwd)
  --template <path>             Template root for init (default: this repo)
  --scenario <id>               Scenario for init
  --json                        Machine-readable output where supported
  --dry-run                     Print actions without writing
  --force                       Overwrite existing scaffold files / non-empty init dir
  --no-nav                      Skip sidebar/settings nav registration (add)
  --skip-seed                   Skip scenario module seeds
  -h, --help                    Show help

Examples:
  uilab-admin init my-ops --scenario ops-console --dir ./apps
  uilab-admin apply-scenario agent-desktop --dir .
  uilab-admin check
  uilab-admin add data-table-list --domain orders --title 订单列表
  uilab-admin set-shell --theme system --sidebar inset --layout default --direction ltr
`)
  process.exit(exitCode)
}

function parseArgs(argv) {
  const args = {
    command: null,
    positional: [],
    flags: {},
  }
  const raw = [...argv]
  if (raw.length === 0) return args

  args.command = raw.shift()
  while (raw.length) {
    const token = raw.shift()
    if (token === '-h' || token === '--help') {
      args.flags.help = true
      continue
    }
    if (token.startsWith('--')) {
      const key = token.slice(2)
      if (
        ['json', 'dry-run', 'force', 'no-nav', 'skip-seed'].includes(key)
      ) {
        args.flags[key] = true
        continue
      }
      const next = raw[0]
      if (!next || next.startsWith('-')) {
        args.flags[key] = true
      } else {
        args.flags[key] = raw.shift()
      }
      continue
    }
    args.positional.push(token)
  }
  return args
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function ensureDir(dir, { dryRun }) {
  if (dryRun) return
  await mkdir(dir, { recursive: true })
}

async function writeText(filePath, content, { dryRun, force }) {
  if ((await exists(filePath)) && !force) {
    const err = new Error(`target exists: ${filePath}`)
    err.code = 'CONFLICT'
    throw err
  }
  if (dryRun) {
    print(`[dry-run] write ${filePath}`)
    return
  }
  await ensureDir(path.dirname(filePath), { dryRun: false })
  await writeFile(filePath, content, 'utf8')
}

async function copyTransformed(src, dest, transform, opts) {
  const input = await readFile(src, 'utf8')
  const output = transform(input)
  await writeText(dest, output, opts)
}

function resolvePathMaybe(dirFlag) {
  return path.resolve(process.cwd(), dirFlag || '.')
}

/**
 * Resolve appRoot + assetsRoot for check/add/apply-scenario/set-shell.
 * Platform mode: platform root or archetypes/admin → Admin package + platform assets.
 * Derived mode: app root = `--dir` if set, otherwise `process.cwd()` (never CLI self-root).
 */
function resolveCommandRoots(dirFlag, layout = LAYOUT) {
  if (layout.kind === 'platform') {
    const candidate = resolvePathMaybe(dirFlag)
    if (
      pathsEqual(candidate, layout.platformRoot) ||
      pathsEqual(candidate, layout.adminTemplateRoot)
    ) {
      return {
        appRoot: layout.adminTemplateRoot,
        assetsRoot: layout.platformAssetsRoot,
      }
    }
    return { appRoot: candidate, assetsRoot: candidate }
  }

  // Derived CLI: frozen contract — appRoot = --dir or cwd. No CLI-self fallback.
  const appRoot = resolvePathMaybe(dirFlag)
  return { appRoot, assetsRoot: appRoot }
}

/** App body minimum contract only (not scaffolds/catalog). */
async function assertAppRoot(appRoot) {
  const needed = ['package.json', 'src']
  for (const rel of needed) {
    if (!(await exists(path.join(appRoot, rel)))) {
      const err = new Error(
        `not a uilab-admin app root (missing ${rel}): ${appRoot}`
      )
      err.code = 'NOT_FOUND'
      throw err
    }
  }
}

/** Scaffold/catalog assets live under assetsRoot (may differ from appRoot on platform). */
async function assertAssetsRoot(assetsRoot) {
  const needed = [
    'scaffolds/data-table-list',
    'docs/ai/patterns.catalog.json',
  ]
  for (const rel of needed) {
    if (!(await exists(path.join(assetsRoot, rel)))) {
      const err = new Error(
        `not a uilab-admin assets root (missing ${rel}): ${assetsRoot}`
      )
      err.code = 'NOT_FOUND'
      throw err
    }
  }
}

async function regenerateRouteTree(appRoot, { dryRun, layout = LAYOUT } = {}) {
  if (dryRun) {
    print('[dry-run] regenerate src/routeTree.gen.ts')
    return { regenerated: false, dryRun: true }
  }

  const { createRequire } = await import('node:module')
  // Prefer target app node_modules, then Admin template package (not legacy root layout).
  const pathCandidates = [
    appRoot,
    layout.adminTemplateRoot,
  ].filter((p, i, arr) => p && arr.findIndex((x) => pathsEqual(x, p)) === i)
  let generatorEntry
  let resolvedFrom

  for (const base of pathCandidates) {
    try {
      const requireFromBase = createRequire(path.join(base, 'package.json'))
      try {
        const pluginPkg = requireFromBase.resolve(
          '@tanstack/router-plugin/package.json'
        )
        const requireFromPlugin = createRequire(pluginPkg)
        generatorEntry = requireFromPlugin.resolve('@tanstack/router-generator')
        resolvedFrom = base
        break
      } catch {
        generatorEntry = requireFromBase.resolve('@tanstack/router-generator')
        resolvedFrom = base
        break
      }
    } catch {
      // try next candidate
    }
  }

  if (!generatorEntry) {
    printErr(
      'warning: cannot resolve @tanstack/router-generator; skip routeTree regen. Ensure template/app has node_modules.'
    )
    return { regenerated: false, error: 'router-generator-not-found' }
  }

  const prevCwd = process.cwd()
  try {
    process.chdir(appRoot)
    const mod = await import(generatorEntry)
    const getConfig = mod.getConfig
    const Generator = mod.Generator
    if (!getConfig || !Generator) {
      throw new Error('router-generator exports missing getConfig/Generator')
    }
    // getConfig resolves paths from cwd; we already chdir to appRoot
    const config = getConfig()
    const generator = new Generator({ config, root: appRoot })
    await generator.run()
    print(
      `regenerated src/routeTree.gen.ts (generator from ${path.relative(appRoot, resolvedFrom) || '.'})`
    )
    return {
      regenerated: true,
      path: 'src/routeTree.gen.ts',
      resolvedFrom,
    }
  } catch (error) {
    printErr(`warning: routeTree regeneration failed: ${error.message || error}`)
    return { regenerated: false, error: String(error.message || error) }
  } finally {
    process.chdir(prevCwd)
  }
}

function isIdent(value) {
  return /^[a-z][a-z0-9-]*$/.test(value) && !value.includes('--')
}

function toPascalCase(ident) {
  return ident
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function toPackageName(appName) {
  return appName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function replacePlaceholders(content, map) {
  let out = content
  for (const [key, value] of Object.entries(map)) {
    out = out.split(key).join(value)
  }
  return out
}

async function loadScenarios(assetsRoot) {
  const file = path.join(assetsRoot, 'docs/ai/scenarios.catalog.json')
  if (!(await exists(file))) {
    const err = new Error(`missing scenarios catalog: ${file}`)
    err.code = 'NOT_FOUND'
    throw err
  }
  const data = JSON.parse(await readFile(file, 'utf8'))
  return data
}

function getScenario(catalog, id) {
  const scenario = (catalog.scenarios || []).find((item) => item.id === id)
  if (!scenario) {
    const err = new Error(
      `unknown scenario "${id}". Expected one of ${(catalog.scenarios || [])
        .map((s) => s.id)
        .join(', ')}`
    )
    err.code = 'NOT_FOUND'
    throw err
  }
  return scenario
}

async function cmdCheck(appRoot, flags, layout = LAYOUT) {
  await assertAppRoot(appRoot)

  // Platform Admin → canonical platform quality gate
  // Derived app → local scripts/check-ai.mjs
  let script
  const isPlatformAdmin =
    layout.kind === 'platform' &&
    layout.platformRoot &&
    pathsEqual(appRoot, layout.adminTemplateRoot)

  if (isPlatformAdmin) {
    script = path.join(layout.platformRoot, 'tooling/quality-gates/check-ai.mjs')
  } else {
    script = path.join(appRoot, 'scripts/check-ai.mjs')
  }

  if (!(await exists(script))) {
    printErr(
      isPlatformAdmin
        ? 'tooling/quality-gates/check-ai.mjs not found'
        : 'scripts/check-ai.mjs not found'
    )
    process.exit(EXIT.NOT_FOUND)
  }

  const result = spawnSync(process.execPath, [script], {
    cwd: appRoot,
    encoding: 'utf8',
  })

  const payload = {
    command: 'check',
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  }

  if (flags.json) {
    print(JSON.stringify(payload, null, 2))
  } else {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.status === 0) print('uilab-admin check passed')
    else printErr('uilab-admin check failed')
  }
  process.exit(result.status === 0 ? EXIT.OK : EXIT.FAIL)
}

async function registerSidebarItem(appRoot, { title, url, dryRun }) {
  const file = path.join(
    appRoot,
    'src/components/layout/data/sidebar-data.ts'
  )
  let text = await readFile(file, 'utf8')
  if (text.includes(`url: '${url}'`) || text.includes(`url: "${url}"`)) {
    print(`nav already has ${url}, skip sidebar registration`)
    return { skipped: true }
  }

  const itemSnippet = `        {
          title: '${title}',
          url: '${url}',
          icon: ListTodo,
        },`

  const tasksAnchor = /url:\s*'\/tasks',\n\s*icon:\s*ListTodo,\n\s*},/
  if (tasksAnchor.test(text)) {
    text = text.replace(tasksAnchor, (m) => `${m}\n${itemSnippet}`)
  } else {
    const firstItems = /navGroups:\s*\[[\s\S]*?items:\s*\[/
    if (!firstItems.test(text)) {
      const err = new Error('cannot locate sidebar navGroups items to patch')
      err.code = 'FAIL'
      throw err
    }
    text = text.replace(firstItems, (m) => `${m}\n${itemSnippet}`)
  }

  if (dryRun) {
    print(`[dry-run] patch sidebar-data.ts + ${url}`)
    return { skipped: false }
  }
  await writeFile(file, text, 'utf8')
  return { skipped: false }
}

async function registerSettingsNav(appRoot, { section, title, dryRun }) {
  const file = path.join(appRoot, 'src/features/settings/index.tsx')
  let text = await readFile(file, 'utf8')
  const href = section === 'profile' ? '/settings' : `/settings/${section}`
  if (text.includes(`href: '${href}'`) || text.includes(`href: "${href}"`)) {
    print(`settings nav already has ${href}, skip`)
    return { skipped: true }
  }

  const item = `  {
    title: '${title}',
    href: '${href}',
    icon: <Wrench size={18} />,
  },`

  const anchor = /const sidebarNavItems = \[/
  if (!anchor.test(text)) {
    const err = new Error('cannot locate sidebarNavItems in settings/index.tsx')
    err.code = 'FAIL'
    throw err
  }
  text = text.replace(anchor, (m) => `${m}\n${item}`)

  if (dryRun) {
    print(`[dry-run] patch settings/index.tsx + ${href}`)
    return { skipped: false }
  }
  await writeFile(file, text, 'utf8')
  return { skipped: false }
}

async function addDataTableList(appRoot, assetsRoot, flags) {
  const domain = flags.domain
  if (!domain || !/^[a-z][a-z0-9]*$/.test(domain)) {
    printErr(
      'add data-table-list requires --domain <lower-ident>, e.g. orders'
    )
    process.exit(EXIT.USAGE)
  }
  const title = flags.title || `${domain}列表`
  const desc =
    flags.desc ||
    `基于 data-table-list pattern 的 ${title}，可替换数据源与列定义。`
  const Domain = toPascalCase(domain)
  const DOMAIN = domain.toUpperCase()
  const map = {
    __domain__: domain,
    __Domain__: Domain,
    __DOMAIN_TITLE__: title,
    __DOMAIN_DESC__: desc,
    __DomainItem__: `${Domain}Item`,
    __domainItem__: `${domain}Item`,
    __DOMAIN__: DOMAIN,
  }

  const scaffoldRoot = path.join(assetsRoot, 'scaffolds/data-table-list')
  const created = []
  const opts = {
    dryRun: !!flags['dry-run'],
    force: !!flags.force,
  }

  const featurePairs = [
    ['index.tsx', `src/features/${domain}/index.tsx`],
    [
      'components/__domain__-primary-buttons.tsx',
      `src/features/${domain}/components/${domain}-primary-buttons.tsx`,
    ],
    [
      'components/__domain__-columns.tsx',
      `src/features/${domain}/components/${domain}-columns.tsx`,
    ],
    [
      'components/__domain__-table.tsx',
      `src/features/${domain}/components/${domain}-table.tsx`,
    ],
    ['data/schema.ts', `src/features/${domain}/data/schema.ts`],
    ['data/data.ts', `src/features/${domain}/data/data.ts`],
  ]

  for (const [fromRel, toRel] of featurePairs) {
    await copyTransformed(
      path.join(scaffoldRoot, fromRel),
      path.join(appRoot, toRel),
      (c) => replacePlaceholders(c, map),
      opts
    )
    created.push(toRel)
  }

  await copyTransformed(
    path.join(scaffoldRoot, 'route.tsx'),
    path.join(appRoot, `src/routes/_authenticated/${domain}/index.tsx`),
    (c) => replacePlaceholders(c, map),
    opts
  )
  created.push(`src/routes/_authenticated/${domain}/index.tsx`)

  if (!flags['no-nav']) {
    await registerSidebarItem(appRoot, {
      title,
      url: `/${domain}`,
      dryRun: opts.dryRun,
    })
    created.push('src/components/layout/data/sidebar-data.ts')
  }

  return {
    pattern: 'data-table-list',
    domain,
    title,
    created,
  }
}

async function addSettingsSection(appRoot, assetsRoot, flags) {
  const section = flags.section
  if (!section || !/^[a-z][a-z0-9]*$/.test(section)) {
    printErr(
      'add settings-section requires --section <ident>, e.g. billing'
    )
    process.exit(EXIT.USAGE)
  }
  if (section === 'profile') {
    printErr('section "profile" is reserved by /settings index route')
    process.exit(EXIT.USAGE)
  }
  const title = flags.title || section
  const desc = flags.desc || `管理${title}相关配置。`
  const Section = toPascalCase(section)
  const map = {
    __section__: section,
    __Section__: Section,
    __SECTION_TITLE__: title,
    __SECTION_DESC__: desc,
  }

  const scaffoldRoot = path.join(assetsRoot, 'scaffolds/settings-section')
  const opts = {
    dryRun: !!flags['dry-run'],
    force: !!flags.force,
  }
  const created = []

  const pairs = [
    ['index.tsx', `src/features/settings/${section}/index.tsx`],
    [
      '__section__-form.tsx',
      `src/features/settings/${section}/${section}-form.tsx`,
    ],
    ['route.tsx', `src/routes/_authenticated/settings/${section}.tsx`],
  ]

  for (const [fromRel, toRel] of pairs) {
    await copyTransformed(
      path.join(scaffoldRoot, fromRel),
      path.join(appRoot, toRel),
      (c) => replacePlaceholders(c, map),
      opts
    )
    created.push(toRel)
  }

  if (!flags['no-nav']) {
    await registerSettingsNav(appRoot, {
      section,
      title,
      dryRun: opts.dryRun,
    })
    created.push('src/features/settings/index.tsx')
  }

  return {
    pattern: 'settings-section',
    section,
    title,
    created,
  }
}

async function cmdAdd(appRoot, assetsRoot, positional, flags) {
  await assertAppRoot(appRoot)
  await assertAssetsRoot(assetsRoot)
  const pattern = positional[0]
  if (!pattern) {
    printErr('missing pattern. Use data-table-list or settings-section')
    process.exit(EXIT.USAGE)
  }

  let result
  try {
    if (pattern === 'data-table-list') {
      result = await addDataTableList(appRoot, assetsRoot, flags)
    } else if (pattern === 'settings-section') {
      result = await addSettingsSection(appRoot, assetsRoot, flags)
    } else if (pattern === 'auth-page') {
      printErr('auth-page add is planned; copy from src/features/auth for now')
      process.exit(EXIT.NOT_FOUND)
    } else {
      printErr(`unknown pattern: ${pattern}`)
      process.exit(EXIT.NOT_FOUND)
    }
  } catch (error) {
    if (error.code === 'CONFLICT') {
      printErr(error.message)
      printErr('use --force to overwrite')
      process.exit(EXIT.CONFLICT)
    }
    throw error
  }

  const routeTree = await regenerateRouteTree(appRoot, {
    dryRun: !!flags['dry-run'],
  })
  if (routeTree.regenerated) {
    result.created = [...(result.created || []), 'src/routeTree.gen.ts']
  }

  const payload = {
    command: 'add',
    ok: true,
    dryRun: !!flags['dry-run'],
    ...result,
    routeTree,
    next: [
      'Review generated feature/route files',
      'Replace mock data / form fields as needed',
      flags['dry-run'] ? null : 'pnpm typecheck',
      flags['dry-run'] ? null : 'pnpm uilab-admin check',
    ].filter(Boolean),
  }

  if (flags.json) print(JSON.stringify(payload, null, 2))
  else {
    print(`added ${result.pattern}`)
    for (const file of result.created) print(`- ${file}`)
    if (!flags['dry-run']) {
      print('\nNext:')
      for (const step of payload.next) print(`- ${step}`)
    }
  }
}

function parseShellFlags(flags, { partial = true } = {}) {
  const allowed = {
    theme: ['system', 'light', 'dark'],
    sidebar: ['inset', 'floating', 'sidebar'],
    layout: ['default', 'compact', 'full'],
    direction: ['ltr', 'rtl'],
  }
  const out = {}
  for (const [key, values] of Object.entries(allowed)) {
    const value = flags[key]
    if (value === undefined) continue
    if (!values.includes(value)) {
      printErr(`invalid --${key} ${value}; expected one of ${values.join('|')}`)
      process.exit(EXIT.USAGE)
    }
    out[key] = value
  }
  if (!partial && Object.keys(out).length < 4) {
    printErr('complete shell requires theme/sidebar/layout/direction')
    process.exit(EXIT.USAGE)
  }
  if (Object.keys(out).length === 0) {
    printErr(
      'set-shell requires at least one of --theme --sidebar --layout --direction'
    )
    process.exit(EXIT.USAGE)
  }
  return out
}

async function readShellDefaults(appRoot) {
  const file = path.join(appRoot, 'src/config/admin-preferences.ts')
  const text = await readFile(file, 'utf8')
  const current = {
    theme: (text.match(/theme:\s*'([^']+)'/) || [])[1],
    sidebar: (text.match(/sidebar:\s*'([^']+)'/) || [])[1],
    layout: (text.match(/layout:\s*'([^']+)'/) || [])[1],
    direction: (text.match(/direction:\s*'([^']+)'/) || [])[1],
  }
  for (const [key, value] of Object.entries(current)) {
    if (!value) {
      const err = new Error(`cannot parse current ${key} from admin-preferences.ts`)
      err.code = 'FAIL'
      throw err
    }
  }
  return { file, text, current }
}

async function writeShellDefaults(appRoot, next, { dryRun }) {
  const { file, text, current } = await readShellDefaults(appRoot)
  const merged = { ...current, ...next }
  const updated = text.replace(
    /export const adminPreferenceDefaults: AdminPreferences = \{[\s\S]*?\n\}/,
    `export const adminPreferenceDefaults: AdminPreferences = {
  theme: '${merged.theme}',
  sidebar: '${merged.sidebar}',
  layout: '${merged.layout}',
  direction: '${merged.direction}',
}`
  )
  if (dryRun) {
    print('[dry-run] set-shell -> ' + JSON.stringify(merged))
    return { previous: current, next: merged, file: 'src/config/admin-preferences.ts' }
  }
  await writeFile(file, updated, 'utf8')
  return { previous: current, next: merged, file: 'src/config/admin-preferences.ts' }
}

async function cmdSetShell(appRoot, flags) {
  await assertAppRoot(appRoot)
  const patch = parseShellFlags(flags)
  const result = await writeShellDefaults(appRoot, patch, {
    dryRun: !!flags['dry-run'],
  })
  const payload = {
    command: 'set-shell',
    ok: true,
    dryRun: !!flags['dry-run'],
    ...result,
    note: 'Providers read adminPreferenceDefaults; runtime cookies still override per user.',
  }
  if (flags.json) print(JSON.stringify(payload, null, 2))
  else {
    print('shell defaults updated:')
    print(JSON.stringify(result.next, null, 2))
    print(
      'note: providers consume adminPreferenceDefaults; clear cookies to see project defaults.'
    )
  }
}

function buildAppBrief({ appName, scenario, packageName }) {
  const shell = scenario.shell || {}
  const modules = scenario.modules || {}
  return `# ${appName}

> Generated by \`uilab-admin\` from scenario \`${scenario.id}\`.

## One-liner

${scenario.summary || scenario.title}

## Scenario

- id: \`${scenario.id}\`
- title: ${scenario.title}
- runtime default: ${scenario.runtime?.default || 'web'}
- desktopHostReady: ${Boolean(scenario.runtime?.desktopHostReady)}

## Shell defaults

- theme: \`${shell.theme}\`
- sidebar: \`${shell.sidebar}\`
- layout: \`${shell.layout}\`
- direction: \`${shell.direction}\`
- profileHint: \`${shell.profileHint || ''}\`

## Modules

- required: ${(modules.required || []).join(', ') || '-'}
- recommended: ${(modules.recommended || []).join(', ') || '-'}
- optional: ${(modules.optional || []).join(', ') || '-'}

## Package

- package name: \`${packageName}\`

## Desktop

${
  scenario.runtime?.desktopHostReady
    ? 'This app is **L1+L2 desktop-host-ready**. See `desktop/README.md`. Full Electron/Tauri host is not implemented in phase 1.'
    : 'Web admin app. No desktop host required by this scenario.'
}

## Next

\`\`\`bash
pnpm install
pnpm dev
pnpm uilab-admin check
\`\`\`

Use \`$uilab-admin\` / \`uilab-admin add\` for 1→100 extension.
`
}

async function ensureDesktopReadme(appRoot, { dryRun, force }) {
  const file = path.join(appRoot, 'desktop/README.md')
  if (await exists(file)) return { path: 'desktop/README.md', created: false }
  const content = `# Desktop Host (L2 readiness)

This directory is a **desktop host extension point**, not a full Electron/Tauri implementation.

- \`src/\` = renderer/app UI
- \`desktop/\` = future native host
- Do not import electron/tauri APIs directly from features.

See template docs: docs/ai/bootstrap.md and docs/ai/scenarios/agent-desktop.md.
`
  await writeText(file, content, { dryRun, force: true })
  return { path: 'desktop/README.md', created: true }
}


async function configureAgentDesktopShell(appRoot, { dryRun }) {
  const actions = []

  // Home route -> Workspace
  const homeRoute = path.join(appRoot, 'src/routes/_authenticated/index.tsx')
  const homeContent = `import { createFileRoute } from '@tanstack/react-router'
import { Workspace } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/')({
  component: Workspace,
})
`
  if (dryRun) print('[dry-run] set home route to Workspace')
  else await writeFile(homeRoute, homeContent, 'utf8')
  actions.push({ type: 'home-route', path: 'src/routes/_authenticated/index.tsx' })

  // Sidebar IA: 工作区 / 会话 / 设置
  const sidebarPath = path.join(
    appRoot,
    'src/components/layout/data/sidebar-data.ts'
  )
  let sidebar = await readFile(sidebarPath, 'utf8')

  // Ensure MessageSquare / Bot icons import if missing - use LayoutDashboard and ListTodo already present
  // Replace first nav group titles/urls lightly by rewriting navGroups section carefully is hard;
  // instead patch known dashboard/tasks entries and add workspace/threads if needed.
  if (!sidebar.includes("url: '/workspace'") && !sidebar.includes('url: "/"')) {
    // no-op
  }

  // Change dashboard title to 工作区 and keep url /
  sidebar = sidebar.replace(
    /title:\s*'仪表盘',\n\s*url:\s*'\/',\n\s*icon:\s*LayoutDashboard,/,
    `title: '工作区',\n          url: '/',\n          icon: LayoutDashboard,`
  )
  // If threads exists entry already from seed, rename group later.
  // Ensure a top-level 会话 list entry exists at /threads
  if (!sidebar.includes("url: '/threads'")) {
    const item = `        {
          title: '会话列表',\n          url: '/threads',\n          icon: ListTodo,\n        },`
    sidebar = sidebar.replace(
      /url:\s*'\/',\n\s*icon:\s*LayoutDashboard,\n\s*},/,
      (m) => `${m}\n${item}`
    )
  } else {
    sidebar = sidebar.replace(
      /title:\s*'会话列表',\n\s*url:\s*'\/threads'/,
      `title: '会话列表',\n          url: '/threads'`
    )
  }

  // Rename first group to 工作区 if still 概览
  sidebar = sidebar.replace(/title:\s*'概览'/, "title: '工作区'")

  // Soften demo-heavy auth group title remains ok.
  if (dryRun) print('[dry-run] patch sidebar for agent-desktop IA')
  else await writeFile(sidebarPath, sidebar, 'utf8')
  actions.push({
    type: 'sidebar-ia',
    path: 'src/components/layout/data/sidebar-data.ts',
  })

  return actions
}

async function seedScenarioModules(appRoot, assetsRoot, scenario, flags) {
  const seeded = []
  if (flags['skip-seed']) return seeded

  if (scenario.id === 'ops-console') {
    // Keep tasks as queue reference; seed tickets list as business sample.
    if (!(await exists(path.join(appRoot, 'src/features/tickets')))) {
      const result = await addDataTableList(appRoot, assetsRoot, {
        domain: 'tickets',
        title: '工单列表',
        desc: '运营队列型列表示例，可替换为真实工单数据源。',
        force: !!flags.force,
        'dry-run': !!flags['dry-run'],
      })
      seeded.push(result)
    }
  }

  if (scenario.id === 'saas-admin') {
    if (!(await exists(path.join(appRoot, 'src/features/settings/billing')))) {
      const result = await addSettingsSection(appRoot, assetsRoot, {
        section: 'billing',
        title: '账单',
        desc: '管理账单联系人与发票偏好。',
        force: !!flags.force,
        'dry-run': !!flags['dry-run'],
      })
      seeded.push(result)
    }
  }

  if (scenario.id === 'agent-desktop') {
    if (!(await exists(path.join(appRoot, 'src/features/threads')))) {
      const result = await addDataTableList(appRoot, assetsRoot, {
        domain: 'threads',
        title: '会话列表',
        desc: 'Agent 会话/线程列表示例，可作为工作台侧栏数据源。',
        force: !!flags.force,
        'dry-run': !!flags['dry-run'],
      })
      seeded.push(result)
    }

    // Workspace feature is part of template; configure home + IA.
    if (await exists(path.join(appRoot, 'src/features/workspace/index.tsx'))) {
      const shellActions = await configureAgentDesktopShell(appRoot, {
        dryRun: !!flags['dry-run'],
      })
      seeded.push({
        pattern: 'agent-desktop-shell',
        created: shellActions.map((a) => a.path),
      })
    } else {
      printErr(
        'warning: src/features/workspace missing; agent-desktop home not switched'
      )
    }
  }

  return seeded
}

async function renameAppIdentity(appRoot, { appName, packageName, dryRun }) {
  const changed = []

  // package.json
  const pkgPath = path.join(appRoot, 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  pkg.name = packageName
  if (!dryRun) await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  else print(`[dry-run] package.json name -> ${packageName}`)
  changed.push('package.json')

  // index.html title
  const htmlPath = path.join(appRoot, 'index.html')
  if (await exists(htmlPath)) {
    let html = await readFile(htmlPath, 'utf8')
    if (/<title>.*<\/title>/.test(html)) {
      html = html.replace(/<title>.*<\/title>/, `<title>${appName}</title>`)
      if (!dryRun) await writeFile(htmlPath, html, 'utf8')
      else print(`[dry-run] index.html title -> ${appName}`)
      changed.push('index.html')
    }
  }

  // sidebar team/app name (first team)
  const sidebarPath = path.join(
    appRoot,
    'src/components/layout/data/sidebar-data.ts'
  )
  if (await exists(sidebarPath)) {
    let sidebar = await readFile(sidebarPath, 'utf8')
    sidebar = sidebar.replace(
      /name:\s*'UI Lab Admin'/,
      `name: '${appName.replace(/'/g, "\\'")}'`
    )
    sidebar = sidebar.replace(
      /email:\s*'demo@uilab\.dev'/,
      `email: 'demo@${packageName}.local'`
    )
    if (!dryRun) await writeFile(sidebarPath, sidebar, 'utf8')
    else print(`[dry-run] sidebar app identity -> ${appName}`)
    changed.push('src/components/layout/data/sidebar-data.ts')
  }

  return changed
}

async function applyScenario(
  appRoot,
  assetsRoot,
  scenarioId,
  flags,
  { appName, packageName } = {}
) {
  await assertAppRoot(appRoot)
  await assertAssetsRoot(assetsRoot)
  const catalog = await loadScenarios(assetsRoot)
  const scenario = getScenario(catalog, scenarioId)
  const dryRun = !!flags['dry-run']
  const actions = []

  // shell
  const shellPatch = {
    theme: scenario.shell.theme,
    sidebar: scenario.shell.sidebar,
    layout: scenario.shell.layout,
    direction: scenario.shell.direction,
  }
  const shellResult = await writeShellDefaults(appRoot, shellPatch, { dryRun })
  actions.push({ type: 'set-shell', ...shellResult })

  // identity optional (init supplies names)
  if (appName && packageName) {
    const identity = await renameAppIdentity(appRoot, {
      appName,
      packageName,
      dryRun,
    })
    actions.push({ type: 'rename-identity', files: identity })
  }

  // desktop host readiness
  if (scenario.runtime?.desktopHostReady) {
    const desktop = await ensureDesktopReadme(appRoot, {
      dryRun,
      force: true,
    })
    actions.push({ type: 'desktop-readme', ...desktop })
  }

  // seeds
  const seeded = await seedScenarioModules(appRoot, assetsRoot, scenario, flags)
  for (const seed of seeded) actions.push({ type: 'seed', ...seed })

  // APP_BRIEF
  const briefName = appName || packageName || path.basename(appRoot)
  const briefPkg =
    packageName ||
    JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8')).name
  const brief = buildAppBrief({
    appName: briefName,
    scenario,
    packageName: briefPkg,
  })
  const briefPath = path.join(appRoot, 'APP_BRIEF.md')
  if (dryRun) print('[dry-run] write APP_BRIEF.md')
  else await writeFile(briefPath, brief, 'utf8')
  actions.push({ type: 'app-brief', path: 'APP_BRIEF.md' })

  // scenario marker
  const marker = {
    scenarioId: scenario.id,
    appliedAt: new Date().toISOString(),
    shell: shellPatch,
    desktopHostReady: Boolean(scenario.runtime?.desktopHostReady),
    cliVersion: CLI_VERSION,
  }
  const markerPath = path.join(appRoot, '.uilab-admin-scenario.json')
  if (dryRun) print('[dry-run] write .uilab-admin-scenario.json')
  else await writeFile(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf8')
  actions.push({ type: 'scenario-marker', path: '.uilab-admin-scenario.json' })

  const routeTree = await regenerateRouteTree(appRoot, { dryRun })
  if (routeTree.regenerated || routeTree.dryRun) {
    actions.push({ type: 'route-tree', ...routeTree })
  }

  return {
    scenario,
    actions,
    shell: shellResult.next,
    routeTree,
  }
}

async function cmdApplyScenario(appRoot, assetsRoot, positional, flags) {
  const scenarioId = positional[0] || flags.scenario
  if (!scenarioId) {
    printErr('apply-scenario requires <scenario-id>')
    process.exit(EXIT.USAGE)
  }
  const result = await applyScenario(appRoot, assetsRoot, scenarioId, flags)
  const payload = {
    command: 'apply-scenario',
    ok: true,
    dryRun: !!flags['dry-run'],
    dir: appRoot,
    scenario: result.scenario.id,
    shell: result.shell,
    actions: result.actions,
  }
  if (flags.json) print(JSON.stringify(payload, null, 2))
  else {
    print(`applied scenario: ${result.scenario.id}`)
    print(`shell: ${JSON.stringify(result.shell)}`)
    for (const action of result.actions) {
      if (action.type === 'seed') {
        print(`- seed ${action.pattern}: ${(action.created || []).join(', ')}`)
      } else if (action.path) {
        print(`- ${action.type}: ${action.path}`)
      } else {
        print(`- ${action.type}`)
      }
    }
    print('\nNext: pnpm install && pnpm dev && pnpm uilab-admin check')
  }
}

async function pathIsEmptyish(dir) {
  if (!(await exists(dir))) return true
  const entries = await readdir(dir)
  return entries.length === 0
}

function copyFilter(src, base) {
  const rel = path.relative(base, src)
  if (!rel || rel === '') return true
  const first = rel.split(path.sep)[0]
  if (COPY_IGNORE.has(first)) return false
  if (first.startsWith('node_modules')) return false
  return true
}

async function copyDirFiltered(srcRoot, destRoot) {
  await mkdir(destRoot, { recursive: true })
  await cp(srcRoot, destRoot, {
    recursive: true,
    filter: (src) => copyFilter(src, srcRoot),
  })
}

/**
 * Required support files copied into a derived app from assetsRoot.
 * Shared by validateInitSources + materializeDerivedApp (no list drift).
 * Note: .prettierignore is generated content and is not required from source.
 */
const INIT_REQUIRED_SUPPORT_FILES = [
  'AGENTS.md',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  '.gitignore',
  '.prettierrc',
  'eslint.config.js',
  'knip.config.ts',
  'cz.yaml',
  'netlify.toml',
]

/** Required support directories copied into a derived app from assetsRoot. */
const INIT_REQUIRED_SUPPORT_DIRS = [
  'docs/ai',
  'scaffolds',
  'skill/uilab-admin',
]

/**
 * Fail-fast source validation before any target mkdir/copy/write.
 * Throws Error with code NOT_FOUND on any missing required asset.
 */
async function validateInitSources(sources) {
  const adminPkg = path.join(sources.adminSourceRoot, 'package.json')
  if (!(await exists(adminPkg))) {
    const err = new Error(
      `template admin source invalid (missing package.json): ${sources.adminSourceRoot}`
    )
    err.code = 'NOT_FOUND'
    throw err
  }
  const adminSrc = path.join(sources.adminSourceRoot, 'src')
  if (!(await exists(adminSrc))) {
    const err = new Error(
      `template admin source missing src: ${sources.adminSourceRoot}`
    )
    err.code = 'NOT_FOUND'
    throw err
  }

  for (const rel of INIT_REQUIRED_SUPPORT_FILES) {
    const from = path.join(sources.assetsRoot, rel)
    if (!(await exists(from))) {
      const err = new Error(
        `missing required template support file ${rel} under ${sources.assetsRoot}`
      )
      err.code = 'NOT_FOUND'
      throw err
    }
  }

  for (const rel of INIT_REQUIRED_SUPPORT_DIRS) {
    const from = path.join(sources.assetsRoot, rel)
    if (!(await exists(from))) {
      const err = new Error(
        `missing required template asset ${rel} under ${sources.assetsRoot}`
      )
      err.code = 'NOT_FOUND'
      throw err
    }
  }

  if (!(await exists(sources.canonicalCliPath))) {
    const err = new Error(`canonical CLI not found: ${sources.canonicalCliPath}`)
    err.code = 'NOT_FOUND'
    throw err
  }
  if (!(await exists(sources.canonicalGatePath))) {
    const err = new Error(
      `canonical quality gate not found: ${sources.canonicalGatePath}`
    )
    err.code = 'NOT_FOUND'
    throw err
  }
}

/**
 * Resolve init template sources.
 * Supports:
 * - platform root (contains archetypes/admin + docs/ai + scaffolds)
 * - derived-style self-contained Admin template root
 * Default (no --template): Admin app source = archetypes/admin (platform) or local app (derived).
 */
async function resolveInitSources(flags, layout = LAYOUT) {
  let templateArg = flags.template
    ? path.resolve(process.cwd(), flags.template)
    : null

  // Default: platform Admin package + platform assets; derived CLI uses itself.
  if (!templateArg) {
    if (layout.kind === 'platform') {
      return {
        form: 'platform',
        templateRoot: layout.platformRoot,
        adminSourceRoot: layout.adminTemplateRoot,
        assetsRoot: layout.platformAssetsRoot,
        canonicalCliPath: path.join(
          layout.platformRoot,
          'tooling/template-cli/uilab-admin.mjs'
        ),
        canonicalGatePath: path.join(
          layout.platformRoot,
          'tooling/quality-gates/check-ai.mjs'
        ),
      }
    }
    return {
      form: 'derived',
      templateRoot: layout.adminTemplateRoot,
      adminSourceRoot: layout.adminTemplateRoot,
      assetsRoot: layout.platformAssetsRoot,
      canonicalCliPath: layout.cliPath,
      canonicalGatePath: path.join(
        path.dirname(layout.cliPath),
        '..',
        'scripts',
        'check-ai.mjs'
      ),
    }
  }

  // Explicit --template: platform root form
  if (await exists(path.join(templateArg, 'archetypes/admin/package.json'))) {
    const platformRoot = templateArg
    const adminSourceRoot = path.join(platformRoot, 'archetypes', 'admin')
    const canonicalCli = path.join(
      platformRoot,
      'tooling/template-cli/uilab-admin.mjs'
    )
    const legacyCli = path.join(platformRoot, 'cli/uilab-admin.mjs')
    const canonicalGate = path.join(
      platformRoot,
      'tooling/quality-gates/check-ai.mjs'
    )
    const legacyGate = path.join(platformRoot, 'scripts/check-ai.mjs')
    return {
      form: 'platform',
      templateRoot: platformRoot,
      adminSourceRoot,
      assetsRoot: platformRoot,
      canonicalCliPath: (await exists(canonicalCli)) ? canonicalCli : legacyCli,
      canonicalGatePath: (await exists(canonicalGate))
        ? canonicalGate
        : legacyGate,
    }
  }

  // Derived-style self-contained template
  const derivedNeeded = [
    'package.json',
    'src',
    'docs/ai',
    'scaffolds',
    'cli/uilab-admin.mjs',
    'scripts/check-ai.mjs',
  ]
  for (const rel of derivedNeeded) {
    if (!(await exists(path.join(templateArg, rel)))) {
      const err = new Error(
        `template root invalid (not platform root with archetypes/admin, and missing ${rel} for derived-style template): ${templateArg}`
      )
      err.code = 'NOT_FOUND'
      throw err
    }
  }
  return {
    form: 'derived',
    templateRoot: templateArg,
    adminSourceRoot: templateArg,
    assetsRoot: templateArg,
    canonicalCliPath: path.join(templateArg, 'cli/uilab-admin.mjs'),
    canonicalGatePath: path.join(templateArg, 'scripts/check-ai.mjs'),
  }
}

async function derivePackageJson(targetDir) {
  const pkgPath = path.join(targetDir, 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  pkg.scripts = pkg.scripts || {}
  pkg.scripts['check:ai'] = 'node scripts/check-ai.mjs'
  pkg.scripts['uilab-admin'] = 'node cli/uilab-admin.mjs'
  pkg.scripts['cli:check'] = 'node cli/uilab-admin.mjs check'
  if (pkg.scripts.knip) {
    pkg.scripts.knip = 'knip'
  }
  pkg.bin = { 'uilab-admin': 'cli/uilab-admin.mjs' }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

async function writeDerivedPrettierrc(targetDir, assetsRoot) {
  const src = path.join(assetsRoot, '.prettierrc')
  let config
  if (await exists(src)) {
    config = JSON.parse(await readFile(src, 'utf8'))
  } else {
    config = {}
  }
  config.tailwindStylesheet = './src/styles/index.css'
  await writeFile(
    path.join(targetDir, '.prettierrc'),
    JSON.stringify(config, null, 2) + '\n',
    'utf8'
  )
}

async function writeDerivedPrettierignore(targetDir) {
  const content = `# Single-app prettier ignore (derived from monorepo template)
node_modules/**
dist/**
coverage/**
.vitest-attachments/**
**/__screenshots__/
.playwright-cli/
routeTree.gen.ts
**/routeTree.gen.ts
`
  await writeFile(path.join(targetDir, '.prettierignore'), content, 'utf8')
}

async function writeDerivedKnip(targetDir) {
  const content = `import type { KnipConfig } from 'knip'

/**
 * Single-app knip policy for derived uilab-admin applications.
 */
const config: KnipConfig = {
  ignore: [
    'src/components/ui/**',
    'src/components/layout/app-title.tsx',
    'src/tanstack-table.d.ts',
  ],
}

export default config
`
  await writeFile(path.join(targetDir, 'knip.config.ts'), content, 'utf8')
}

async function writeDerivedNetlify(targetDir) {
  const content = `[build]
  command = "pnpm build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`
  await writeFile(path.join(targetDir, 'netlify.toml'), content, 'utf8')
}

/**
 * Materialize a derived application:
 * 1) copy Admin app source
 * 2) controlled copy of already-validated support/assets (same lists as validateInitSources)
 * 3) derive package scripts + single-app config files
 *
 * Caller must run validateInitSources first — no silent skip of missing support files.
 */
async function materializeDerivedApp(targetDir, sources) {
  // 1. Admin app body
  await copyDirFiltered(sources.adminSourceRoot, targetDir)

  // 2. Support files (validated; copy directly — no if-exists)
  for (const rel of INIT_REQUIRED_SUPPORT_FILES) {
    const from = path.join(sources.assetsRoot, rel)
    await cp(from, path.join(targetDir, rel), { recursive: true })
  }

  // Support dirs
  for (const rel of INIT_REQUIRED_SUPPORT_DIRS) {
    const from = path.join(sources.assetsRoot, rel)
    await cp(from, path.join(targetDir, rel), {
      recursive: true,
      filter: (src) => copyFilter(src, from),
    })
  }

  // Canonical CLI + quality gate implementations (not platform wrappers)
  await mkdir(path.join(targetDir, 'cli'), { recursive: true })
  await mkdir(path.join(targetDir, 'scripts'), { recursive: true })
  await cp(
    sources.canonicalCliPath,
    path.join(targetDir, 'cli/uilab-admin.mjs')
  )
  await cp(
    sources.canonicalGatePath,
    path.join(targetDir, 'scripts/check-ai.mjs')
  )
  try {
    await chmod(path.join(targetDir, 'cli/uilab-admin.mjs'), 0o755)
  } catch {
    // best-effort
  }

  // 3. Derived single-app transforms
  await derivePackageJson(targetDir)
  await writeDerivedPrettierrc(targetDir, sources.assetsRoot)
  await writeDerivedPrettierignore(targetDir)
  await writeDerivedKnip(targetDir)
  await writeDerivedNetlify(targetDir)
}

async function cmdInit(positional, flags, layout = LAYOUT) {
  const appNameRaw = positional[0]
  if (!appNameRaw) {
    printErr('init requires <app-name>')
    process.exit(EXIT.USAGE)
  }
  const scenarioId = flags.scenario
  if (!scenarioId) {
    printErr('init requires --scenario <ops-console|saas-admin|agent-desktop>')
    process.exit(EXIT.USAGE)
  }

  const packageName = toPackageName(appNameRaw)
  if (!packageName) {
    printErr('invalid app name')
    process.exit(EXIT.USAGE)
  }
  const appName = appNameRaw

  // --dir is parent directory for init
  const parentDir = resolvePathMaybe(flags.dir)
  const targetDir = path.join(parentDir, packageName)

  let sources
  try {
    sources = await resolveInitSources(flags, layout)
    // Fail-fast before any target mkdir/copy/write (no partial target)
    await validateInitSources(sources)
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      printErr(error.message)
      process.exit(EXIT.NOT_FOUND)
    }
    throw error
  }

  {
    const catalog = await loadScenarios(sources.assetsRoot)
    getScenario(catalog, scenarioId)
  }

  if (await exists(targetDir)) {
    const empty = await pathIsEmptyish(targetDir)
    if (!empty && !flags.force) {
      printErr(`target exists and is not empty: ${targetDir}`)
      printErr(
        'use --force to allow init into existing directory (destructive overwrite not supported; choose empty dir)'
      )
      process.exit(EXIT.CONFLICT)
    }
    if (!empty && flags.force) {
      printErr(
        `--force does not wipe non-empty directories. Provide an empty path or remove: ${targetDir}`
      )
      process.exit(EXIT.CONFLICT)
    }
  }

  if (flags['dry-run']) {
    print(`[dry-run] init ${packageName}`)
    print(`[dry-run] scenario ${scenarioId}`)
    print(`[dry-run] target ${targetDir}`)
    print(`[dry-run] admin source ${sources.adminSourceRoot}`)
    print(`[dry-run] assets ${sources.assetsRoot}`)
    if (flags.json) {
      print(
        JSON.stringify(
          {
            command: 'init',
            ok: true,
            dryRun: true,
            targetDir,
            scenario: scenarioId,
            packageName,
            adminSourceRoot: sources.adminSourceRoot,
            assetsRoot: sources.assetsRoot,
          },
          null,
          2
        )
      )
    }
    return
  }

  await materializeDerivedApp(targetDir, sources)
  const applyResult = await applyScenario(
    targetDir,
    targetDir,
    scenarioId,
    flags,
    {
      appName,
      packageName,
    }
  )

  const payload = {
    command: 'init',
    ok: true,
    targetDir,
    packageName,
    appName,
    scenario: applyResult.scenario.id,
    shell: applyResult.shell,
    actions: applyResult.actions,
    next: [
      `cd ${targetDir}`,
      'pnpm install',
      'pnpm dev',
      'pnpm uilab-admin check',
    ],
  }

  if (flags.json) print(JSON.stringify(payload, null, 2))
  else {
    print(`initialized ${packageName}`)
    print(`scenario: ${applyResult.scenario.id}`)
    print(`dir: ${targetDir}`)
    print(`shell: ${JSON.stringify(applyResult.shell)}`)
    print('\nNext:')
    for (const step of payload.next) print(`- ${step}`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.command || args.command === 'help' || args.flags.help) {
    usage(EXIT.OK)
  }

  const { appRoot, assetsRoot } = resolveCommandRoots(args.flags.dir)

  try {
    switch (args.command) {
      case 'check':
        await cmdCheck(appRoot, args.flags)
        break
      case 'add':
        await cmdAdd(appRoot, assetsRoot, args.positional, args.flags)
        break
      case 'set-shell':
        await cmdSetShell(appRoot, args.flags)
        break
      case 'apply-scenario':
        await cmdApplyScenario(appRoot, assetsRoot, args.positional, args.flags)
        break
      case 'init':
        // init uses --dir as parent directory
        await cmdInit(args.positional, args.flags)
        break
      default:
        printErr(`unknown command: ${args.command}`)
        usage(EXIT.USAGE)
    }
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      printErr(error.message)
      process.exit(EXIT.NOT_FOUND)
    }
    if (error.code === 'CONFLICT') {
      printErr(error.message)
      process.exit(EXIT.CONFLICT)
    }
    printErr(error.stack || error.message)
    process.exit(EXIT.FAIL)
  }
}

main()
