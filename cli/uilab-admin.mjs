#!/usr/bin/env node
/**
 * uilab-admin CLI
 * CLI-1: check | add | set-shell
 * CLI-2: init | apply-scenario
 */
import { spawnSync } from 'node:child_process'
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TEMPLATE_ROOT = path.resolve(__dirname, '..')
const CLI_VERSION = '0.2.0'

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

async function assertAppRoot(appRoot) {
  const needed = [
    'package.json',
    'src',
    'scaffolds/data-table-list',
    'docs/ai/patterns.catalog.json',
  ]
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


async function regenerateRouteTree(appRoot, { dryRun } = {}) {
  if (dryRun) {
    print('[dry-run] regenerate src/routeTree.gen.ts')
    return { regenerated: false, dryRun: true }
  }

  const { createRequire } = await import('node:module')
  const pathCandidates = [appRoot, TEMPLATE_ROOT]
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

async function loadScenarios(appRoot) {
  const file = path.join(appRoot, 'docs/ai/scenarios.catalog.json')
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

async function cmdCheck(appRoot, flags) {
  await assertAppRoot(appRoot)
  const script = path.join(appRoot, 'scripts/check-ai.mjs')
  if (!(await exists(script))) {
    printErr('scripts/check-ai.mjs not found')
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

async function addDataTableList(appRoot, flags) {
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

  const scaffoldRoot = path.join(appRoot, 'scaffolds/data-table-list')
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

async function addSettingsSection(appRoot, flags) {
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

  const scaffoldRoot = path.join(appRoot, 'scaffolds/settings-section')
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

async function cmdAdd(appRoot, positional, flags) {
  await assertAppRoot(appRoot)
  const pattern = positional[0]
  if (!pattern) {
    printErr('missing pattern. Use data-table-list or settings-section')
    process.exit(EXIT.USAGE)
  }

  let result
  try {
    if (pattern === 'data-table-list') {
      result = await addDataTableList(appRoot, flags)
    } else if (pattern === 'settings-section') {
      result = await addSettingsSection(appRoot, flags)
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

async function seedScenarioModules(appRoot, scenario, flags) {
  const seeded = []
  if (flags['skip-seed']) return seeded

  if (scenario.id === 'ops-console') {
    // Keep tasks as queue reference; seed tickets list as business sample.
    if (!(await exists(path.join(appRoot, 'src/features/tickets')))) {
      const result = await addDataTableList(appRoot, {
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
      const result = await addSettingsSection(appRoot, {
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
      const result = await addDataTableList(appRoot, {
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

async function applyScenario(appRoot, scenarioId, flags, { appName, packageName } = {}) {
  await assertAppRoot(appRoot)
  const catalog = await loadScenarios(appRoot)
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
  const seeded = await seedScenarioModules(appRoot, scenario, flags)
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

async function cmdApplyScenario(appRoot, positional, flags) {
  const scenarioId = positional[0] || flags.scenario
  if (!scenarioId) {
    printErr('apply-scenario requires <scenario-id>')
    process.exit(EXIT.USAGE)
  }
  const result = await applyScenario(appRoot, scenarioId, flags)
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

async function copyTemplate(templateRoot, targetDir, { dryRun }) {
  if (dryRun) {
    print(`[dry-run] copy template ${templateRoot} -> ${targetDir}`)
    return
  }
  await mkdir(targetDir, { recursive: true })
  await cp(templateRoot, targetDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(templateRoot, src)
      if (!rel || rel === '') return true
      const first = rel.split(path.sep)[0]
      if (COPY_IGNORE.has(first)) return false
      if (first.startsWith('node_modules')) return false
      return true
    },
  })
}

async function cmdInit(positional, flags) {
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

  const parentDir = resolvePathMaybe(flags.dir)
  const targetDir = path.join(parentDir, packageName)
  const templateRoot = flags.template
    ? path.resolve(process.cwd(), flags.template)
    : TEMPLATE_ROOT

  if (!(await exists(path.join(templateRoot, 'cli/uilab-admin.mjs')))) {
    printErr(`template root invalid: ${templateRoot}`)
    process.exit(EXIT.NOT_FOUND)
  }

  // Validate scenario before copying template
  {
    const catalog = await loadScenarios(templateRoot)
    getScenario(catalog, scenarioId)
  }

  if (await exists(targetDir)) {
    const empty = await pathIsEmptyish(targetDir)
    if (!empty && !flags.force) {
      printErr(`target exists and is not empty: ${targetDir}`)
      printErr('use --force to allow init into existing directory (destructive overwrite not supported; choose empty dir)')
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
    // still validate scenario exists in template
    const catalog = await loadScenarios(templateRoot)
    getScenario(catalog, scenarioId)
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
          },
          null,
          2
        )
      )
    }
    return
  }

  await copyTemplate(templateRoot, targetDir, { dryRun: false })
  const applyResult = await applyScenario(targetDir, scenarioId, flags, {
    appName,
    packageName,
  })

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

  const appRoot = resolvePathMaybe(args.flags.dir)

  try {
    switch (args.command) {
      case 'check':
        await cmdCheck(appRoot, args.flags)
        break
      case 'add':
        await cmdAdd(appRoot, args.positional, args.flags)
        break
      case 'set-shell':
        await cmdSetShell(appRoot, args.flags)
        break
      case 'apply-scenario':
        await cmdApplyScenario(appRoot, args.positional, args.flags)
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
