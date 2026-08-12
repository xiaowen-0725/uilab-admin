import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import type { ConnectorDescriptor } from '../plugin/connector-descriptor.js'
import type { PluginManifest } from '../plugin/manifest.js'
import {
  createConnectorCliAuthRuntime,
  createDefaultCliAuthProcessRunner,
  type CliAuthProcessRunner,
} from './connector-cli-auth.js'

const descriptor: ConnectorDescriptor = {
  id: 'connector.demo-cli',
  name: 'Demo CLI',
  description: 'Demo CLI connector',
  primaryChannel: 'domain_cli',
  capabilities: [],
  toolScope: [],
  commandScopes: ['demo-cli'],
  authSummarySource: {
    pluginId: 'cli.demo',
    resourceId: 'cli:demo',
    kind: 'cli_session',
  },
  pluginRefs: ['cli.demo'],
  availability: 'sidecar',
}

const manifest = {
  schemaVersion: 1,
  id: 'cli.demo',
  name: 'Demo CLI',
  version: '1.0.0',
  kind: 'builtin',
  enabledByDefault: true,
  contributes: {
    auth: [
      {
        resourceId: 'cli:demo',
        kind: 'cli_session',
        statusCommand: {
          command: 'demo-cli',
          argv: ['auth', 'status', '--json'],
          expectExitCode: 0,
          connectedWhen: {
            jsonPath: ['identities', 'user', 'available'],
            equals: true,
          },
        },
        cliSession: {
          strategy: 'device_flow',
          command: 'demo-cli',
          minimumVersion: '1.2.0',
          versionArgv: ['--version'],
          bootstrap: {
            whenErrorSubtypes: ['not_configured'],
            argv: ['config', 'init', '--new'],
            verificationUrlHosts: ['connect.demo.test'],
            timeoutMs: 600_000,
          },
          authorization: {
            startArgv: ['auth', 'login', '--no-wait', '--json'],
            completeArgv: [
              'auth',
              'login',
              '--device-code',
              '{{deviceCode}}',
              '--json',
            ],
            verificationUrlHosts: ['accounts.demo.test'],
            defaultDomains: ['docs'],
            domainFlag: '--domain',
            timeoutMs: 600_000,
          },
        },
      },
    ],
  },
} as PluginManifest

describe('Connector CLI auth runtime', () => {
  it('starts Provider-declared bootstrap when the CLI session is not configured', async () => {
    let stopped = false
    const processRunner: CliAuthProcessRunner = (_command, argv, options) => {
      assert.deepEqual(argv, ['config', 'init', '--new'])
      queueMicrotask(() => {
        options.onOutput(
          '打开以下链接配置应用:\nhttps://connect.demo.test/page/cli?user_code=ABCD-EFGH\n',
        )
      })
      return {
        completion: new Promise(() => {}),
        async stop() {
          stopped = true
        },
      }
    }
    const runtime = createConnectorCliAuthRuntime({
      descriptors: [descriptor],
      manifests: [manifest],
      enabledPluginIds: ['cli.demo'],
      runner: async (_command, argv) => {
        if (argv[0] === '--version') {
          return {
            stdout: 'demo-cli version 1.2.0',
            stderr: '',
            exitCode: 0,
          }
        }
        return {
          stdout: JSON.stringify({
            ok: false,
            error: { subtype: 'not_configured' },
          }),
          stderr: '',
          exitCode: 3,
        }
      },
      processRunner,
    })

    const started = await runtime.begin('connector.demo-cli')

    assert.equal(started.kind, 'cli_session')
    assert.equal(started.phase, 'authorization_required')
    assert.equal(started.step, 'configure')
    assert.equal(
      started.authorizationUrl,
      'https://connect.demo.test/page/cli?user_code=ABCD-EFGH',
    )
    assert.doesNotMatch(JSON.stringify(started), /device.?code/i)

    await runtime.dispose()
    assert.equal(stopped, true)
  })

  it('continues bootstrap into authorization and completes the Provider device flow', async () => {
    let resolveBootstrap!: (result: {
      stdout: string
      stderr: string
      exitCode: number
    }) => void
    let resolveAuthorization!: (result: {
      stdout: string
      stderr: string
      exitCode: number
    }) => void
    let configured = false
    let userAvailable = false
    let processCount = 0
    const processRunner: CliAuthProcessRunner = (_command, argv, options) => {
      processCount += 1
      if (processCount === 1) {
        assert.deepEqual(argv, ['config', 'init', '--new'])
        queueMicrotask(() => {
          options.onOutput(
            'https://connect.demo.test/page/cli?user_code=CONFIG-CODE\n',
          )
        })
        return {
          completion: new Promise((resolve) => {
            resolveBootstrap = resolve
          }),
          async stop() {},
        }
      }
      assert.deepEqual(argv, [
        'auth',
        'login',
        '--device-code',
        'sidecar-only-device-code',
        '--json',
      ])
      return {
        completion: new Promise((resolve) => {
          resolveAuthorization = resolve
        }),
        async stop() {},
      }
    }
    const runtime = createConnectorCliAuthRuntime({
      descriptors: [descriptor],
      manifests: [manifest],
      enabledPluginIds: ['cli.demo'],
      runner: async (_command, argv) => {
        if (argv[0] === '--version') {
          return {
            stdout: 'demo-cli version 1.2.0',
            stderr: '',
            exitCode: 0,
          }
        }
        if (argv[0] === 'auth' && argv[1] === 'status') {
          return configured
            ? {
                stdout: JSON.stringify({
                  identity: userAvailable ? 'user' : 'bot',
                  identities: {
                    bot: { status: 'ready', available: true },
                    user: {
                      status: userAvailable ? 'ready' : 'missing',
                      available: userAvailable,
                    },
                  },
                }),
                stderr: '',
                exitCode: 0,
              }
            : {
                stdout: JSON.stringify({
                  ok: false,
                  error: { subtype: 'not_configured' },
                }),
                stderr: '',
                exitCode: 3,
              }
        }
        assert.deepEqual(argv, [
          'auth',
          'login',
          '--no-wait',
          '--json',
          '--domain',
          'docs',
        ])
        return {
          stdout: JSON.stringify({
            verification_url:
              'https://accounts.demo.test/oauth/device/authorize',
            device_code: 'sidecar-only-device-code',
            expires_in: 600,
          }),
          stderr: '',
          exitCode: 0,
        }
      },
      processRunner,
    })

    await runtime.begin('connector.demo-cli')
    configured = true
    resolveBootstrap({ stdout: '', stderr: '', exitCode: 0 })
    await Promise.resolve()

    const authorize = await runtime.reconcile('connector.demo-cli')
    assert.equal(authorize[0]?.phase, 'authorization_required')
    assert.equal(authorize[0]?.step, 'authorize')
    assert.equal(
      authorize[0]?.authorizationUrl,
      'https://accounts.demo.test/oauth/device/authorize',
    )
    assert.doesNotMatch(JSON.stringify(authorize), /sidecar-only-device-code/)

    assert.deepEqual(await runtime.reconcile('connector.demo-cli'), [])
    assert.equal(processCount, 2)
    resolveAuthorization({ stdout: '{"ok":true}', stderr: '', exitCode: 0 })
    await Promise.resolve()

    assert.deepEqual(
      await runtime.reconcile('connector.demo-cli'),
      [],
      'bot-only status must keep the user authorization session pending',
    )
    userAvailable = true
    const connected = await runtime.reconcile('connector.demo-cli')
    assert.equal(connected[0]?.phase, 'connected')
    assert.equal(connected[0]?.step, 'connected')
    assert.doesNotMatch(JSON.stringify(connected), /sidecar-only-device-code/)

    await runtime.dispose()
  })

  it('skips bootstrap when the CLI app is configured but the user is not authenticated', async () => {
    let processStarted = false
    const runtime = createConnectorCliAuthRuntime({
      descriptors: [descriptor],
      manifests: [manifest],
      enabledPluginIds: ['cli.demo'],
      runner: async (_command, argv) => {
        if (argv[0] === '--version') {
          return {
            stdout: 'demo-cli version 1.2.0',
            stderr: '',
            exitCode: 0,
          }
        }
        if (argv[0] === 'auth' && argv[1] === 'status') {
          return {
            stdout: JSON.stringify({
              ok: false,
              error: { subtype: 'not_authenticated' },
            }),
            stderr: '',
            exitCode: 4,
          }
        }
        return {
          stdout: JSON.stringify({
            verification_url:
              'https://accounts.demo.test/oauth/device/authorize',
            device_code: 'configured-device-code',
            expires_in: 600,
          }),
          stderr: '',
          exitCode: 0,
        }
      },
      processRunner: () => {
        processStarted = true
        return {
          completion: new Promise(() => {}),
          async stop() {},
        }
      },
    })

    const started = await runtime.begin('connector.demo-cli')

    assert.equal(started.phase, 'authorization_required')
    assert.equal(started.step, 'authorize')
    assert.equal(
      started.authorizationUrl,
      'https://accounts.demo.test/oauth/device/authorize',
    )
    assert.equal(processStarted, false)
    assert.doesNotMatch(JSON.stringify(started), /configured-device-code/)
    await runtime.dispose()
  })
})

describe('default CLI auth process adapter', () => {
  it('streams verification output from a Provider executable', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'connector-auth-process-'),
    )
    const executable = path.join(root, 'demo-cli')
    await writeFile(
      executable,
      '#!/bin/sh\nprintf "https://connect.demo.test/page/cli?user_code=STREAMED\\n" >&2\n',
      'utf8',
    )
    await chmod(executable, 0o755)
    let output = ''
    const runner = createDefaultCliAuthProcessRunner()

    try {
      const handle = runner(executable, [], {
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        timeoutMs: 5_000,
        onOutput(chunk) {
          output += chunk
        },
      })
      const result = await handle.completion
      assert.equal(result.exitCode, 0)
      assert.match(output, /user_code=STREAMED/)
      assert.match(result.stderr, /user_code=STREAMED/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stop escalates to SIGKILL when child ignores SIGTERM (#6/#7)', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'connector-auth-stop-'),
    )
    const executable = path.join(root, 'ignore-term')
    await writeFile(
      executable,
      [
        '#!/bin/sh',
        "trap '' TERM",
        'printf "ready\\n"',
        'while true; do sleep 1; done',
        '',
      ].join('\n'),
      'utf8',
    )
    await chmod(executable, 0o755)
    let output = ''
    const runner = createDefaultCliAuthProcessRunner({ stopGraceMs: 50 })

    try {
      const handle = runner(executable, [], {
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        timeoutMs: 60_000,
        onOutput(chunk) {
          output += chunk
        },
      })
      await new Promise<void>((resolve, reject) => {
        const started = Date.now()
        const tick = () => {
          if (output.includes('ready')) {
            resolve()
            return
          }
          if (Date.now() - started > 5_000) {
            reject(new Error('child never became ready'))
            return
          }
          setTimeout(tick, 20)
        }
        tick()
      })

      const started = Date.now()
      await handle.stop()
      const elapsed = Date.now() - started
      assert.ok(
        elapsed < 2_000,
        `stop() should settle via SIGKILL; took ${elapsed}ms`,
      )

      const result = await handle.completion
      assert.notEqual(result.exitCode, 0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})



describe('#45 auth restart recovery', () => {
  it('getActiveSessions returns empty array when no sessions are pending', () => {
    const runtime = createConnectorCliAuthRuntime({
      descriptors: [descriptor],
      manifests: [manifest],
      enabledPluginIds: ['cli.demo'],
      runner: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      processRunner: () => ({
        completion: new Promise(() => {}),
        async stop() {},
      }),
    })
    assert.deepEqual(runtime.getActiveSessions(), [])
  })

  it('dispose is safe with no active sessions and clears state', async () => {
    const runtime = createConnectorCliAuthRuntime({
      descriptors: [descriptor],
      manifests: [manifest],
      enabledPluginIds: ['cli.demo'],
      runner: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      processRunner: () => ({
        completion: new Promise(() => {}),
        async stop() {},
      }),
    })
    await runtime.dispose()
    assert.deepEqual(runtime.getActiveSessions(), [])
  })

  it('logout runs Provider CLI logout against the session env', async () => {
    const calls: string[][] = []
    const runtime = createConnectorCliAuthRuntime({
      descriptors: [descriptor],
      manifests: [manifest],
      enabledPluginIds: ['cli.demo'],
      runner: async (_command, argv) => {
        calls.push([...argv])
        if (argv[0] === 'auth' && argv[1] === 'logout') {
          return { stdout: '{"ok":true}', stderr: '', exitCode: 0 }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      },
      processRunner: () => ({
        completion: new Promise(() => {}),
        async stop() {},
      }),
    })

    await runtime.logout('connector.demo-cli')
    assert.deepEqual(calls, [['auth', 'logout', '--json']])
    assert.deepEqual(runtime.getActiveSessions(), [])
  })

  it('logout fails closed when the Provider CLI logout command errors', async () => {
    const runtime = createConnectorCliAuthRuntime({
      descriptors: [descriptor],
      manifests: [manifest],
      enabledPluginIds: ['cli.demo'],
      runner: async (_command, argv) => {
        if (argv[0] === 'auth' && argv[1] === 'logout') {
          return { stdout: '', stderr: 'logout denied', exitCode: 2 }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      },
      processRunner: () => ({
        completion: new Promise(() => {}),
        async stop() {},
      }),
    })

    await assert.rejects(
      () => runtime.logout('connector.demo-cli'),
      /CLI logout 失败/,
    )
  })
})
