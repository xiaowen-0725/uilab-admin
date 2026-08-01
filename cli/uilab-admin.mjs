#!/usr/bin/env node
/**
 * uilab-admin CLI (phase 1)
 * Commands: check | add | set-shell | help
 * Planned later: init | apply-scenario
 */
import { spawnSync } from 'node:child_process'
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLI_VERSION = '0.1.0'

const EXIT = {
  OK: 0,
  FAIL: 1,
  USAGE: 2,
  CONFLICT: 3,
  NOT_FOUND: 4,
}

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
  check                         Run AI-contract / template gates
  add <pattern>                 Scaffold a page pattern into the app
  set-shell                     Write project shell defaults
  help                          Show help

  init                          [planned] create app from template
  apply-scenario                [planned] apply scenario pack

Patterns for add:
  data-table-list               --domain <id> [--title <text>] [--desc <text>]
  settings-section              --section <id> [--title <text>] [--desc <text>]

Global options:
  --dir <path>                  App root (default: cwd)
  --json                        Machine-readable output where supported
  --dry-run                     Print actions without writing
  --force                       Overwrite existing scaffold files
  --no-nav                      Skip sidebar/settings nav registration (add)
  -h, --help                    Show help

Examples:
  uilab-admin check
  uilab-admin add data-table-list --domain orders --title 订单列表
  uilab-admin add settings-section --section billing --title 账单
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
      if (['json', 'dry-run', 'force', 'no-nav'].includes(key)) {
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
  if (await exists(filePath)) {
    if (!force) {
      const err = new Error(`target exists: ${filePath}`)
      err.code = 'CONFLICT'
      throw err
    }
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

function resolveAppRoot(dirFlag) {
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

function isIdent(value) {
  return /^[a-z][a-z0-9]*$/.test(value)
}

function toPascalCase(ident) {
  return ident.charAt(0).toUpperCase() + ident.slice(1)
}

function toScreaming(ident) {
  return ident.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()
}

function replacePlaceholders(content, map) {
  let out = content
  for (const [key, value] of Object.entries(map)) {
    out = out.split(key).join(value)
  }
  return out
}

async function walkFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walkFiles(full)))
    else if (entry.isFile()) out.push(full)
  }
  return out.sort()
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

async function registerSidebarItem(appRoot, { title, url, dryRun, force }) {
  const file = path.join(
    appRoot,
    'src/components/layout/data/sidebar-data.ts'
  )
  let text = await readFile(file, 'utf8')
  if (text.includes(`url: '${url}'`) || text.includes(`url: "${url}"`)) {
    print(`nav already has ${url}, skip sidebar registration`)
    return { skipped: true }
  }

  // Ensure ListTodo import exists (already in template). Insert item into first nav group items array after dashboard/tasks if possible.
  const itemSnippet = `        {
          title: '${title}',
          url: '${url}',
          icon: ListTodo,
        },`

  // Prefer inserting after tasks item
  const tasksAnchor = /url:\s*'\/tasks',\n\s*icon:\s*ListTodo,\n\s*},/
  if (tasksAnchor.test(text)) {
    text = text.replace(tasksAnchor, (m) => `${m}\n${itemSnippet}`)
  } else {
    // insert into first items array after `[`
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

async function registerSettingsNav(
  appRoot,
  { section, title, dryRun }
) {
  const file = path.join(appRoot, 'src/features/settings/index.tsx')
  let text = await readFile(file, 'utf8')
  const href = section === 'profile' ? '/settings' : `/settings/${section}`
  if (text.includes(`href: '${href}'`) || text.includes(`href: "${href}"`)) {
    print(`settings nav already has ${href}, skip`)
    return { skipped: true }
  }

  // ensure Wrench import (already there). Add item before closing of sidebarNavItems
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
  if (!domain || !isIdent(domain)) {
    printErr('add data-table-list requires --domain <camel-or-lower-ident>, e.g. orders')
    process.exit(EXIT.USAGE)
  }
  const title = flags.title || `${domain}列表`
  const desc =
    flags.desc || `基于 data-table-list pattern 的 ${title}，可替换数据源与列定义。`
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

  // feature files
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
    const from = path.join(scaffoldRoot, fromRel)
    const to = path.join(appRoot, toRel)
    await copyTransformed(
      from,
      to,
      (c) => replacePlaceholders(c, map),
      opts
    )
    created.push(toRel)
  }

  // route
  const routeFrom = path.join(scaffoldRoot, 'route.tsx')
  const routeTo = path.join(
    appRoot,
    `src/routes/_authenticated/${domain}/index.tsx`
  )
  await copyTransformed(
    routeFrom,
    routeTo,
    (c) => replacePlaceholders(c, map),
    opts
  )
  created.push(`src/routes/_authenticated/${domain}/index.tsx`)

  if (!flags['no-nav']) {
    await registerSidebarItem(appRoot, {
      title,
      url: `/${domain}`,
      dryRun: opts.dryRun,
      force: opts.force,
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
  if (!section || !isIdent(section)) {
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

  const payload = {
    command: 'add',
    ok: true,
    dryRun: !!flags['dry-run'],
    ...result,
    next: [
      'Review generated feature/route files',
      'Replace mock data / form fields as needed',
      flags['dry-run'] ? null : 'pnpm typecheck',
      flags['dry-run'] ? null : 'pnpm check:ai',
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

function parseShellFlags(flags) {
  const theme = flags.theme
  const sidebar = flags.sidebar
  const layout = flags.layout
  const direction = flags.direction
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
  if (Object.keys(out).length === 0) {
    printErr(
      'set-shell requires at least one of --theme --sidebar --layout --direction'
    )
    process.exit(EXIT.USAGE)
  }
  return out
}

async function cmdSetShell(appRoot, flags) {
  await assertAppRoot(appRoot)
  const patch = parseShellFlags(flags)
  const file = path.join(appRoot, 'src/config/admin-preferences.ts')
  let text = await readFile(file, 'utf8')

  const current = {
    theme: (text.match(/theme:\s*'([^']+)'/) || [])[1],
    sidebar: (text.match(/sidebar:\s*'([^']+)'/) || [])[1],
    layout: (text.match(/layout:\s*'([^']+)'/) || [])[1],
    direction: (text.match(/direction:\s*'([^']+)'/) || [])[1],
  }

  const next = { ...current, ...patch }
  for (const key of Object.keys(next)) {
    if (!next[key]) {
      printErr(`cannot parse current ${key} from admin-preferences.ts`)
      process.exit(EXIT.FAIL)
    }
  }

  // Replace only inside adminPreferenceDefaults block values carefully
  text = text.replace(
    /export const adminPreferenceDefaults: AdminPreferences = \{[\s\S]*?\n\}/,
    `export const adminPreferenceDefaults: AdminPreferences = {
  theme: '${next.theme}',
  sidebar: '${next.sidebar}',
  layout: '${next.layout}',
  direction: '${next.direction}',
}`
  )

  if (flags['dry-run']) {
    print('[dry-run] set-shell ->')
    print(JSON.stringify(next, null, 2))
  } else {
    await writeFile(file, text, 'utf8')
  }

  const payload = {
    command: 'set-shell',
    ok: true,
    dryRun: !!flags['dry-run'],
    previous: current,
    next,
    file: 'src/config/admin-preferences.ts',
    note: 'Providers read adminPreferenceDefaults; runtime cookies still override per user.',
  }

  if (flags.json) print(JSON.stringify(payload, null, 2))
  else {
    print('shell defaults updated:')
    print(JSON.stringify(next, null, 2))
    print(
      'note: providers consume adminPreferenceDefaults; clear cookies to see project defaults.'
    )
  }
}

async function cmdPlanned(name) {
  printErr(
    `command "${name}" is planned (CLI-2). See docs/ai/cli.md. Available now: check, add, set-shell.`
  )
  process.exit(EXIT.NOT_FOUND)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.command || args.command === 'help' || args.flags.help) {
    usage(EXIT.OK)
  }

  const appRoot = resolveAppRoot(args.flags.dir)

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
      case 'init':
      case 'apply-scenario':
        await cmdPlanned(args.command)
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
