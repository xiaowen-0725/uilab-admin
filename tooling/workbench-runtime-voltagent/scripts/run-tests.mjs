#!/usr/bin/env node

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

function collectTests(directory, suffix) {
  const tests = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      tests.push(...collectTests(absolutePath, suffix))
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      tests.push(path.relative(packageRoot, absolutePath))
    }
  }

  return tests
}

const testFiles = [
  ...collectTests(path.join(packageRoot, 'src'), '.test.ts'),
  ...collectTests(path.join(packageRoot, 'scripts'), '.test.mjs'),
].sort()

if (testFiles.length === 0) {
  console.error('No sidecar test files were found.')
  process.exit(1)
}

console.log(`Running ${testFiles.length} sidecar test file(s).`)

const tsxCommand = process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
const result = spawnSync(tsxCommand, ['--test', ...testFiles], {
  cwd: packageRoot,
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error.message)
}

process.exit(result.status ?? 1)
