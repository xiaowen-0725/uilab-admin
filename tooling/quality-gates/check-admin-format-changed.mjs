#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '../..')
const adminRoot = path.join(repositoryRoot, 'archetypes/admin')
const revisions = process.argv.slice(2)

if (revisions[0] === '--') {
  revisions.shift()
}

const [baseRevision = 'main', headRevision] = revisions

const diffArguments = [
  'diff',
  '--name-only',
  '--diff-filter=ACMRT',
  '-z',
  baseRevision,
]

if (headRevision) {
  diffArguments.push(headRevision)
}

diffArguments.push('--', 'archetypes/admin')

const diff = spawnSync('git', diffArguments, {
  cwd: repositoryRoot,
  encoding: 'utf8',
})

if (diff.status !== 0) {
  process.stderr.write(diff.stderr)
  process.exit(diff.status ?? 1)
}

const prettierExtensions =
  /\.(?:[cm]?[jt]sx?|json5?|mdx?|css|scss|less|html|ya?ml)$/u
const changedFiles = diff.stdout
  .split('\0')
  .filter(Boolean)
  .filter((file) => prettierExtensions.test(file))
  .map((file) => path.relative(adminRoot, path.join(repositoryRoot, file)))

if (changedFiles.length === 0) {
  console.log('No changed Admin files require a Prettier check.')
  process.exit(0)
}

console.log(`Checking ${changedFiles.length} changed Admin file(s) with Prettier.`)

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const prettier = spawnSync(
  pnpmCommand,
  [
    'exec',
    'prettier',
    '--check',
    '--ignore-path',
    '../../.prettierignore',
    ...changedFiles,
  ],
  {
    cwd: adminRoot,
    stdio: 'inherit',
  }
)

process.exit(prettier.status ?? 1)
