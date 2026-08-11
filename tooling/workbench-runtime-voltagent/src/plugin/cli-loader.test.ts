import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { BUILTIN_CLI_FEISHU_PLUGIN, BUILTIN_PLUGINS } from './builtins.js'
import {
  assertSafeArgvTemplate,
  buildCliArgv,
  buildCliPassthroughArgv,
  cliToolName,
  closedChildEnv,
  defaultCliRunner,
  formatRegistryCliStatusLine,
  loadCliContributions,
} from './cli-loader.js'
import { filterChildEnv } from './security-policy.js'
import type { PluginManifest } from './manifest.js'
import { createPluginRegistry } from './registry.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function makeFakeCli(
  scriptBody = '#!/bin/sh\necho "{\\"ok\\":true}"\n',
): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wb-cli-bin-'))
  tempRoots.push(dir)
  const bin = path.join(dir, 'fake-cli')
  await writeFile(bin, scriptBody, 'utf8')
  await chmod(bin, 0o755)
  return bin
}

describe('buildCliArgv', () => {
  it('fills placeholders without shell join', () => {
    const argv = buildCliArgv(
      ['docs', 'get', '--id', '{{documentId}}'],
      { documentId: 'doc-1' },
    )
    assert.deepEqual(argv, ['docs', 'get', '--id', 'doc-1'])
  })

  it('rejects missing params', () => {
    assert.throws(
      () => buildCliArgv(['--id', '{{documentId}}'], {}),
      /缺少 CLI 参数/,
    )
  })
})

describe('buildCliPassthroughArgv', () => {
  it('rejects credential-bearing flags and env assignments', () => {
    assert.throws(
      () =>
        buildCliPassthroughArgv('argv', {
          argv: ['auth', 'login', '--access-token', 'secret-value'],
        }),
      /敏感凭证参数/,
    )
    assert.throws(
      () =>
        buildCliPassthroughArgv('argv', {
          argv: ['api', 'call', '--app-secret=secret-value'],
        }),
      /敏感凭证参数/,
    )
    assert.throws(
      () =>
        buildCliPassthroughArgv('argv', {
          argv: ['api', 'call', '--clientSecret=secret-value'],
        }),
      /敏感凭证参数/,
    )
    assert.throws(
      () =>
        buildCliPassthroughArgv('argv', {
          argv: ['ACME_API_TOKEN=secret-value', 'records', 'get'],
        }),
      /敏感凭证参数/,
    )
  })
})

describe('assertSafeArgvTemplate', () => {
  it('rejects shell wrappers and placeholder first segment', () => {
    assert.throws(() => assertSafeArgvTemplate(['bash', '-c', 'rm -rf /']), /shell/)
    assert.throws(
      () => assertSafeArgvTemplate(['{{mode}}', 'x']),
      /首段|占位符/,
    )
  })
})

describe('closedChildEnv / defaultCliRunner', () => {
  it('never merges host process.env secrets into child', async () => {
    const filtered = filterChildEnv(
      {
        PATH: process.env.PATH ?? '/bin',
        HOME: process.env.HOME ?? '/tmp',
        OPENAI_API_KEY: 'sk-should-not-leak',
        DEEPSEEK_API_KEY: 'sk-deep-no',
        FEISHU_APP_ID: 'app',
      },
      ['FEISHU_APP_ID'],
    )
    assert.equal(filtered.OPENAI_API_KEY, undefined)
    assert.equal(filtered.FEISHU_APP_ID, 'app')

    const closed = closedChildEnv(filtered)
    assert.equal(closed.OPENAI_API_KEY, undefined)
    assert.equal(closed.DEEPSEEK_API_KEY, undefined)

    // Real exec: print env keys that look like secrets
    const result = await defaultCliRunner(
      process.execPath,
      [
        '-e',
        'const e=process.env; console.log(JSON.stringify({openai:e.OPENAI_API_KEY||null,deep:e.DEEPSEEK_API_KEY||null,feishu:e.FEISHU_APP_ID||null}))',
      ],
      {
        env: {
          ...filtered,
          // ensure node can run
          PATH: process.env.PATH ?? '/usr/bin:/bin',
        },
      },
    )
    assert.equal(result.exitCode, 0)
    const parsed = JSON.parse(result.stdout.trim()) as {
      openai: string | null
      deep: string | null
      feishu: string | null
    }
    assert.equal(parsed.openai, null)
    assert.equal(parsed.deep, null)
    assert.equal(parsed.feishu, 'app')
  })
})

describe('loadCliContributions', () => {
  it('keeps the current Turn snapshot but rejects the next Turn after deselection', async () => {
    const bin = await makeFakeCli()
    const calls: string[][] = []
    const agg = await loadCliContributions(
      [
        {
          pluginId: 'cli.demo',
          contrib: {
            cliId: 'demo',
            command: bin,
            commands: [{ name: 'ping', argv: ['ping'] }],
          },
        },
      ],
      {
        runner: async (_command, argv) => {
          calls.push(argv)
          return { stdout: 'ok', stderr: '', exitCode: 0 }
        },
        connectorDescriptors: [
          {
            id: 'connector.demo',
            name: 'Demo',
            toolScope: ['cli_demo_'],
          } as any,
        ],
      },
    )
    const tool = agg.tools[0] as {
      execute: (args: unknown, options?: unknown) => Promise<unknown>
    }

    const currentTurn = await tool.execute(
      {},
      {
        conversationId: 'task-a',
        context: new Map([
          ['capabilityConnectorIds', ['connector.demo']],
        ]),
      },
    )
    assert.equal((currentTurn as { exitCode: number }).exitCode, 0)

    const nextTurn = await tool.execute(
      {},
      {
        conversationId: 'task-a',
        context: new Map([['capabilityConnectorIds', []]]),
      },
    )
    assert.equal((nextTurn as { error: string }).error, 'not_task_selected')
    assert.equal(calls.length, 1)
  })

  it('allows trusted Provider argv passthrough with exact argv and forced approval', async () => {
    const bin = await makeFakeCli()
    const calls: Array<{ cmd: string; argv: string[] }> = []
    const agg = await loadCliContributions(
      [
        {
          pluginId: 'cli.acme',
          contrib: {
            cliId: 'acme',
            command: bin,
            commands: [
              {
                name: 'invoke',
                description: 'Invoke a Provider-native CLI contract',
                argv: [],
                passthroughArgvParam: 'argv',
                parameters: [
                  {
                    name: 'argv',
                    type: 'string_array',
                    description: 'Exact Provider CLI argv array',
                  },
                ],
                readOnly: true,
                needsApproval: false,
              },
            ],
          },
        },
      ],
      {
        trustedPluginIds: new Set(['cli.acme']),
        runner: async (cmd, argv) => {
          calls.push({ cmd, argv })
          return { stdout: '{"ok":true}', stderr: '', exitCode: 0 }
        },
      },
    )

    assert.equal(agg.statuses[0]?.status, 'ready')
    const invoke = agg.tools.find(
      (tool) => tool.name === 'cli_acme_invoke',
    ) as {
      needsApproval?: boolean
      execute: (args: unknown) => Promise<unknown>
    }
    assert.ok(invoke)
    assert.equal(invoke.needsApproval, true)

    const execution = (await invoke.execute({
      argv: ['skills', 'read', 'lark-doc', '--json'],
    })) as Record<string, unknown>
    assert.deepEqual(calls[0]?.argv, [
      'skills',
      'read',
      'lark-doc',
      '--json',
    ])
    assert.equal(calls[0]?.cmd, bin)
    assert.equal(execution.argvCount, 4)
    assert.equal('argv' in execution, false)
  })

  it('registers allowlisted tools with approval defaults', async () => {
    const bin = await makeFakeCli()
    const calls: Array<{ cmd: string; argv: string[] }> = []
    const agg = await loadCliContributions(
      [
        {
          pluginId: 'cli.demo',
          contrib: {
            cliId: 'demo',
            command: bin,
            commands: [
              {
                name: 'ping',
                argv: ['ping', '{{target}}'],
                parameters: [{ name: 'target', type: 'string' }],
                readOnly: true,
                needsApproval: false,
              },
              {
                name: 'mutate',
                argv: ['write', '{{payload}}'],
                parameters: [{ name: 'payload', type: 'string' }],
                needsApproval: true,
              },
            ],
          },
        },
      ],
      {
        runner: async (cmd, argv) => {
          calls.push({ cmd, argv })
          return { stdout: 'ok', stderr: '', exitCode: 0 }
        },
      },
    )

    assert.equal(agg.statuses[0]?.status, 'ready')
    assert.deepEqual(agg.toolNames.sort(), [
      'cli_demo_mutate',
      'cli_demo_ping',
    ])
    const ping = agg.tools.find((t) => t.name === 'cli_demo_ping') as {
      needsApproval?: boolean
      execute: (a: unknown) => Promise<unknown>
    }
    const mutate = agg.tools.find((t) => t.name === 'cli_demo_mutate') as {
      needsApproval?: boolean
      execute: (a: unknown) => Promise<unknown>
    }
    assert.notEqual(ping.needsApproval, true)
    assert.equal(mutate.needsApproval, true)

    await ping.execute({ target: 'x' })
    assert.deepEqual(calls[0]?.argv, ['ping', 'x'])
    // runner receives resolved absolute path, never a shell string
    assert.ok(path.isAbsolute(calls[0]!.cmd) || calls[0]!.cmd === bin)
  })

  it('does not create tools for non-allowlisted free-form names', async () => {
    const bin = await makeFakeCli()
    const agg = await loadCliContributions(
      [
        {
          pluginId: 'cli.demo',
          contrib: {
            cliId: 'demo',
            command: bin,
            commands: [
              {
                name: 'only_this',
                argv: ['only'],
                parameters: [],
                readOnly: true,
                needsApproval: false,
              },
            ],
          },
        },
      ],
      { runner: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
    )
    assert.ok(!agg.toolNames.some((n) => n.includes('rm') || n.includes('shell')))
    assert.deepEqual(agg.toolNames, ['cli_demo_only_this'])
  })

  it('rejects argv passthrough when the Provider is not explicitly trusted', async () => {
    const bin = await makeFakeCli()
    const agg = await loadCliContributions(
      [
        {
          pluginId: 'cli.local-untrusted',
          contrib: {
            cliId: 'local-untrusted',
            command: bin,
            commands: [
              {
                name: 'invoke',
                argv: [],
                passthroughArgvParam: 'argv',
                parameters: [{ name: 'argv', type: 'string_array' }],
              },
            ],
          },
        },
      ],
      {
        trustedPluginIds: new Set(),
        runner: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      },
    )

    assert.equal(agg.tools.length, 0)
    assert.equal(agg.statuses[0]?.status, 'failed')
    assert.match(agg.statuses[0]?.reason ?? '', /仅允许受信 builtin Provider/)
  })

  it('reports missing when binary not on PATH', async () => {
    const agg = await loadCliContributions(
      [
        {
          pluginId: 'cli.feishu',
          contrib: {
            cliId: 'feishu',
            command: 'definitely-not-a-real-cli-xyz-999',
            commands: [
              {
                name: 'docs_get',
                argv: ['docs', 'get'],
                parameters: [],
                readOnly: true,
              },
            ],
          },
        },
      ],
      { env: { PATH: '/nonexistent' } },
    )
    assert.equal(agg.tools.length, 0)
    assert.equal(agg.statuses[0]?.status, 'missing')
    assert.match(agg.statuses[0]?.reason ?? '', /未找到/)
  })
})

describe('PluginRegistry + domain CLI', () => {
  it('enables cli.feishu metadata without generating Provider wrapper tools', async () => {
    const bin = await makeFakeCli()
    const reg = createPluginRegistry({
      env: {
        PLUGINS_ENABLED: 'cli.feishu',
        FEISHU_CLI_PATH: bin,
      },
      builtins: BUILTIN_PLUGINS,
      cliRunner: async (_cmd, argv) => ({
        stdout: JSON.stringify({ argv }),
        stderr: '',
        exitCode: 0,
      }),
    })
    assert.ok(reg.resolveEnabledIds().includes('cli.feishu'))
    assert.ok(reg.resolveEnabledIds().includes('skills.office'))
    assert.ok(reg.resolveEnabledIds().includes('mcp.docs'))
    const result = await reg.load()
    assert.deepEqual(result.toolNames, [])
    assert.equal(
      result.toolIdentities.some(
        (identity) => identity.canonical.pluginId === 'cli.feishu',
      ),
      false,
    )
    assert.equal(
      result.cliStatuses.some((status) => status.pluginId === 'cli.feishu'),
      false,
    )
    assert.deepEqual(
      result.connectorDescriptors.find(
        (connector) => connector.id === 'connector.feishu',
      )?.commandScopes,
      ['lark-cli'],
    )
    await result.disconnect()
  })

  it('isolates CLI failure from MCP load', async () => {
    const broken: PluginManifest = {
      schemaVersion: 1,
      id: 'cli.broken',
      name: 'Broken CLI',
      version: '0.0.1',
      kind: 'local',
      enabledByDefault: true,
      contributes: {
        cli: [
          {
            cliId: 'broken',
            command: '/no/such/cli',
            commands: [
              {
                name: 'x',
                argv: ['bash', '-c', 'echo hi'],
                parameters: [],
              },
            ],
          },
        ],
      },
    }
    const reg = createPluginRegistry({
      env: {},
      builtins: [BUILTIN_CLI_FEISHU_PLUGIN],
      extra: [broken],
    })
    const result = await reg.load()
    // binary missing OR template rejects shell — either way no tools, others ok
    assert.equal(result.tools.length, 0)
    const st = result.cliStatuses.find((s) => s.cliId === 'broken')
    assert.ok(st && (st.status === 'missing' || st.status === 'failed'))
    await result.disconnect()
  })
})

describe('formatRegistryCliStatusLine', () => {
  it('formats ready/missing/fail', () => {
    assert.equal(
      formatRegistryCliStatusLine([
        {
          pluginId: 'a',
          cliId: 'acme',
          status: 'ready',
          toolNames: ['cli_acme_get', 'cli_acme_put'],
        },
        {
          pluginId: 'b',
          cliId: 'gh',
          status: 'missing',
          toolNames: [],
        },
      ]),
      'acme=ready(2),gh=missing',
    )
  })
})
