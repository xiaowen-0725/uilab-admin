#!/usr/bin/env node
/**
 * Minimal AI-contract gate for uilab-admin.
 * Validates skill frontmatter, required docs/patterns/scaffolds, and relative links.
 */
import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const warnings = []

function rel(filePath) {
  return path.relative(projectRoot, filePath) || '.'
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function mustExist(filePath, label = filePath) {
  if (!(await exists(filePath))) {
    errors.push(`missing ${rel(label)}`)
    return false
  }
  return true
}

function decodeYamlScalar(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed.replaceAll("'", '"'))
    } catch {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) {
    return null
  }
  const end = markdown.indexOf('\n---', 3)
  if (end === -1) return null
  const body = markdown.slice(4, end)
  const data = {}
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    data[match[1]] = decodeYamlScalar(match[2] ?? '')
  }
  return data
}

async function collectMarkdownFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath)
    }
  }
  return files.sort()
}

function extractMarkdownLinks(source) {
  const links = []
  const pattern = /\[[^\]]*]\(([^)]+)\)/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const target = match[1].trim().replace(/^<|>$/g, '').split(/\s+/)[0]
    if (!target || target.startsWith('http') || target.startsWith('#')) continue
    links.push(target.split('#')[0])
  }
  return links
}

async function main() {
  const requiredFiles = [
    'AGENTS.md',
    'AGENT_BRIEF.md',
    'README.md',
    'docs/ai/map.md',
    'docs/ai/do-not.md',
    'docs/ai/acceptance.md',
    'docs/ai/patterns.catalog.json',
    'docs/ai/patterns/data-table-list.md',
    'docs/ai/patterns/settings-section.md',
    'docs/ai/patterns/auth-page.md',
    'docs/ai/bootstrap.md',
    'docs/ai/cli.md',
    'docs/ai/scenarios.catalog.json',
    'docs/ai/scenarios/ops-console.md',
    'docs/ai/scenarios/saas-admin.md',
    'docs/ai/scenarios/agent-desktop.md',
    'desktop/README.md',
    'skill/uilab-admin/SKILL.md',
    'skill/uilab-admin/references/bootstrap.md',
    'skill/uilab-admin/references/extend.md',
    'skill/uilab-admin/agents/openai.yaml',
    'skill/uilab-admin/references/discover.md',
    'skill/uilab-admin/references/scaffold.md',
    'skill/uilab-admin/references/shell.md',
    'skill/uilab-admin/references/review.md',
    'scaffolds/data-table-list/README.md',
    'scaffolds/data-table-list/index.tsx',
    'scaffolds/data-table-list/route.tsx',
    'scaffolds/data-table-list/components/__domain__-table.tsx',
    'scaffolds/data-table-list/components/__domain__-columns.tsx',
    'scaffolds/data-table-list/data/schema.ts',
    'scaffolds/data-table-list/data/data.ts',
    'scaffolds/settings-section/README.md',
    'scaffolds/settings-section/index.tsx',
    'scaffolds/settings-section/__section__-form.tsx',
    'scaffolds/settings-section/route.tsx',
    'src/config/admin-preferences.ts',
    'src/components/layout/data/sidebar-data.ts',
    'src/features/tasks/index.tsx',
    'src/features/settings/index.tsx',
  ]

  for (const file of requiredFiles) {
    await mustExist(path.join(projectRoot, file), file)
  }

  const skillFile = path.join(projectRoot, 'skill/uilab-admin/SKILL.md')
  if (await exists(skillFile)) {
    const markdown = await readFile(skillFile, 'utf8')
    const fm = parseFrontmatter(markdown)
    if (!fm) {
      errors.push('skill/uilab-admin/SKILL.md: missing YAML frontmatter')
    } else {
      if (fm.name !== 'uilab-admin') {
        errors.push(
          `skill/uilab-admin/SKILL.md: frontmatter name must be "uilab-admin" (got "${fm.name ?? ''}")`
        )
      }
      if (!fm.description || !String(fm.description).trim()) {
        errors.push('skill/uilab-admin/SKILL.md: frontmatter description is required')
      } else if (String(fm.description).length > 1024) {
        errors.push('skill/uilab-admin/SKILL.md: description exceeds 1024 characters')
      }
      for (const route of ['bootstrap', 'discover', 'scaffold', 'shell', 'review']) {
        if (!markdown.includes(`\`${route}\``) && !markdown.includes(`| \`${route}\``)) {
          // softer: ensure route token exists
          if (!markdown.includes(route)) {
            errors.push(`skill/uilab-admin/SKILL.md: missing route "${route}"`)
          }
        }
      }
    }
  }

  const catalogPath = path.join(projectRoot, 'docs/ai/patterns.catalog.json')
  if (await exists(catalogPath)) {
    let catalog
    try {
      catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    } catch (error) {
      errors.push(`docs/ai/patterns.catalog.json: invalid JSON (${error.message})`)
      catalog = null
    }
    if (catalog) {
      if (!Array.isArray(catalog.patterns) || catalog.patterns.length === 0) {
        errors.push('docs/ai/patterns.catalog.json: patterns must be a non-empty array')
      } else {
        const requiredIds = ['data-table-list', 'settings-section', 'auth-page']
        const ids = new Set(catalog.patterns.map((p) => p.id))
        for (const id of requiredIds) {
          if (!ids.has(id)) errors.push(`patterns.catalog.json: missing pattern id "${id}"`)
        }
        for (const pattern of catalog.patterns) {
          if (pattern.doc) {
            await mustExist(path.join(projectRoot, pattern.doc), pattern.doc)
          }
          if (pattern.scaffoldTemplate) {
            await mustExist(
              path.join(projectRoot, pattern.scaffoldTemplate),
              pattern.scaffoldTemplate
            )
          }
          for (const ref of pattern.references ?? []) {
            const refPath = path.join(projectRoot, ref)
            if (!(await exists(refPath))) {
              errors.push(`pattern ${pattern.id}: missing reference ${ref}`)
            }
          }
        }
      }
      if (!catalog.skill?.path) {
        errors.push('patterns.catalog.json: skill.path is required')
      } else {
        await mustExist(path.join(projectRoot, catalog.skill.path), catalog.skill.path)
      }
    }
  }


  // Scenario catalog
  const scenariosPath = path.join(projectRoot, 'docs/ai/scenarios.catalog.json')
  if (await exists(scenariosPath)) {
    let scenarios
    try {
      scenarios = JSON.parse(await readFile(scenariosPath, 'utf8'))
    } catch (error) {
      errors.push(`docs/ai/scenarios.catalog.json: invalid JSON (${error.message})`)
      scenarios = null
    }
    if (scenarios) {
      if (scenarios.cli !== 'uilab-admin') {
        errors.push('scenarios.catalog.json: cli must be "uilab-admin"')
      }
      if (!Array.isArray(scenarios.scenarios) || scenarios.scenarios.length === 0) {
        errors.push('scenarios.catalog.json: scenarios must be a non-empty array')
      } else {
        const requiredScenarioIds = ['ops-console', 'saas-admin', 'agent-desktop']
        const ids = new Set(scenarios.scenarios.map((s) => s.id))
        for (const id of requiredScenarioIds) {
          if (!ids.has(id)) errors.push(`scenarios.catalog.json: missing scenario id "${id}"`)
        }
        for (const scenario of scenarios.scenarios) {
          if (scenario.doc) {
            await mustExist(path.join(projectRoot, scenario.doc), scenario.doc)
          }
          if (!scenario.shell) {
            errors.push(`scenario ${scenario.id}: shell defaults required`)
          }
          if (!scenario.modules?.required) {
            errors.push(`scenario ${scenario.id}: modules.required required`)
          }
        }
      }
    }
  }

  // Relative markdown links under docs/ai and skill/uilab-admin
  for (const root of ['docs/ai', 'skill/uilab-admin']) {
    const abs = path.join(projectRoot, root)
    if (!(await exists(abs))) continue
    const files = await collectMarkdownFiles(abs)
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      for (const target of extractMarkdownLinks(content)) {
        if (target.startsWith('mailto:')) continue
        const resolved = path.resolve(path.dirname(file), target)
        if (!(await exists(resolved))) {
          errors.push(`${rel(file)}: broken link -> ${target}`)
        }
      }
    }
  }

  // Soft checks: radix / asChild regressions in src (warn only for now except package.json deps)
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, 'package.json'), 'utf8')
  )
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }
  for (const name of Object.keys(allDeps)) {
    if (name.startsWith('@radix-ui/')) {
      errors.push(`package.json depends on forbidden ${name}`)
    }
  }

  if (!packageJson.scripts?.['check:ai']) {
    warnings.push('package.json scripts.check:ai missing (should be wired)')
  }

  // Ensure components.json points to base-nova-ish base ui
  if (await exists(path.join(projectRoot, 'components.json'))) {
    const components = JSON.parse(
      await readFile(path.join(projectRoot, 'components.json'), 'utf8')
    )
    const style = String(components.style ?? '')
    if (!style.toLowerCase().includes('base')) {
      warnings.push(
        `components.json style="${style}" does not look like Base UI (expected base-nova / base-*)`
      )
    }
  }

  // Print report
  if (warnings.length) {
    console.log('Warnings:')
    for (const warning of warnings) console.log(`- ${warning}`)
    console.log()
  }

  if (errors.length) {
    console.error(`check:ai failed with ${errors.length} error(s):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
  }

  console.log('check:ai passed')
  console.log(
    [
      '- required AI docs/skill/scaffolds present',
      '- pattern catalog resolves',
      '- skill frontmatter valid',
      '- relative markdown links ok',
      '- no @radix-ui/* package dependency',
    ].join('\n')
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
