import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { createOfficeWorkspaceSandbox } from './office-workspace-sandbox.js'

describe('createOfficeWorkspaceSandbox', () => {
  it(
    'runs an ordinary macOS system command inside the default workspace isolation',
    { skip: process.platform !== 'darwin' },
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'wb-shell-macos-'))
      try {
        const sandbox = await createOfficeWorkspaceSandbox({
          workspaceRoot: root,
          env: {
            ...process.env,
            WORKSPACE_SANDBOX_ISOLATION: 'sandbox-exec',
          },
          connectors: [],
          manifests: [],
          resolveConnectorAccess: async () => ({
            pluginEnabled: false,
            connected: false,
            taskSelected: false,
          }),
        })

        const result = await sandbox.execute({
          command: 'git',
          args: ['--version'],
        })

        assert.equal(
          result.exitCode,
          0,
          `signal=${result.signal ?? 'none'} stderr=${result.stderr}`,
        )
        assert.match(result.stdout, /git version/)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )
})
