/**
 * Credentials must not appear in renderer board code or the job sandbox (#146).
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const sidecarRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(sidecarRoot, '../..')

const FORBIDDEN = [
  'QUERY_FIXTURE_BEARER',
  'fixture-secret-token',
  'createSignedFetch',
  'createMemoryProductIdentity',
  'PRODUCT_IDENTITY_BEARER',
]

const RENDERER_BOARD = path.join(
  repoRoot,
  'archetypes/agent-workbench/src/modules/board',
)
const JOB_SANDBOX = [
  path.join(sidecarRoot, 'src/tools/board-job-runner-source.ts'),
  path.join(sidecarRoot, 'src/tools/board-job-executor.ts'),
  path.join(sidecarRoot, 'src/tools/board-job-store.ts'),
]

function walkSources(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkSources(full))
      continue
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      files.push(full)
    }
  }
  return files
}

function assertNoForbidden(files: string[]) {
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const token of FORBIDDEN) {
      assert.equal(
        text.includes(token),
        false,
        `${path.relative(repoRoot, file)} must not mention ${token}`,
      )
    }
  }
}

describe('query credential boundary', () => {
  it('keeps product credentials out of renderer board paths', () => {
    assertNoForbidden(walkSources(RENDERER_BOARD))
  })

  it('keeps product credentials out of the job execution environment', () => {
    assertNoForbidden(JOB_SANDBOX)
  })
})
