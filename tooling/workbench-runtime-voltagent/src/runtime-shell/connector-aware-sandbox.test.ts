import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  WorkspaceSandbox,
  WorkspaceSandboxExecuteOptions,
  WorkspaceSandboxResult,
} from '@voltagent/core'
import { createConnectorAwareSandbox } from './connector-aware-sandbox.js'

function recordingSandbox(
  calls: WorkspaceSandboxExecuteOptions[],
): WorkspaceSandbox {
  return {
    name: 'recording',
    status: 'ready',
    async execute(options): Promise<WorkspaceSandboxResult> {
      calls.push(options)
      return {
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
        durationMs: 1,
        timedOut: false,
        aborted: false,
        stdoutTruncated: false,
        stderrTruncated: false,
      }
    },
  }
}

describe('createConnectorAwareSandbox', () => {
  it('denies a Provider command when the active Task did not select its Connector', async () => {
    const defaultCalls: WorkspaceSandboxExecuteOptions[] = []
    const providerCalls: WorkspaceSandboxExecuteOptions[] = []
    const sandbox = createConnectorAwareSandbox({
      defaultSandbox: recordingSandbox(defaultCalls),
      commandRules: [
        {
          connectorId: 'connector.feishu',
          commands: ['lark-cli'],
          sandbox: recordingSandbox(providerCalls),
        },
      ],
      resolveConnectorAccess: async () => ({
        pluginEnabled: true,
        connected: true,
        taskSelected: false,
      }),
    })

    await assert.rejects(
      () =>
        sandbox.execute({
          command: 'lark-cli',
          args: ['skills', 'list'],
        }),
      /connector_not_selected/,
    )
    assert.equal(providerCalls.length, 0)
    assert.equal(defaultCalls.length, 0)
  })

  it('routes an authorized Provider command to its credential adapter with exact argv', async () => {
    const defaultCalls: WorkspaceSandboxExecuteOptions[] = []
    const providerCalls: WorkspaceSandboxExecuteOptions[] = []
    const sandbox = createConnectorAwareSandbox({
      defaultSandbox: recordingSandbox(defaultCalls),
      commandRules: [
        {
          connectorId: 'connector.feishu',
          commands: ['lark-cli'],
          executables: {
            'lark-cli': '/opt/provider/bin/lark-cli',
          },
          sandbox: recordingSandbox(providerCalls),
        },
      ],
      resolveConnectorAccess: async () => ({
        pluginEnabled: true,
        connected: true,
        taskSelected: true,
      }),
    })

    const result = await sandbox.execute({
      command: 'lark-cli',
      args: ['docs', '+fetch', '--doc', 'abc'],
      env: { SHOULD_NOT_REACH_PROVIDER: 'secret' },
      timeoutMs: 999_999,
      maxOutputBytes: 999_999_999,
    })

    assert.equal(result.exitCode, 0)
    assert.equal(defaultCalls.length, 0)
    assert.deepEqual(providerCalls, [
      {
        command: '/opt/provider/bin/lark-cli',
        args: ['docs', '+fetch', '--doc', 'abc'],
        env: undefined,
        timeoutMs: 120_000,
        maxOutputBytes: 1024 * 1024,
      },
    ])
  })

  it('keeps ordinary commands on the default sandbox', async () => {
    const defaultCalls: WorkspaceSandboxExecuteOptions[] = []
    const providerCalls: WorkspaceSandboxExecuteOptions[] = []
    const sandbox = createConnectorAwareSandbox({
      defaultSandbox: recordingSandbox(defaultCalls),
      commandRules: [
        {
          connectorId: 'connector.feishu',
          commands: ['lark-cli'],
          sandbox: recordingSandbox(providerCalls),
        },
      ],
      resolveConnectorAccess: async () => ({
        pluginEnabled: true,
        connected: true,
        taskSelected: true,
      }),
    })

    await sandbox.execute({ command: 'git', args: ['status', '--short'] })

    assert.deepEqual(defaultCalls, [
      { command: 'git', args: ['status', '--short'] },
    ])
    assert.equal(providerCalls.length, 0)
  })

  it('denies disconnected and indirect Provider command execution', async () => {
    const sandbox = createConnectorAwareSandbox({
      defaultSandbox: recordingSandbox([]),
      commandRules: [
        {
          connectorId: 'connector.feishu',
          commands: ['lark-cli'],
          sandbox: recordingSandbox([]),
        },
      ],
      resolveConnectorAccess: async () => ({
        pluginEnabled: true,
        connected: false,
        taskSelected: true,
      }),
    })

    await assert.rejects(
      () => sandbox.execute({ command: 'lark-cli', args: ['auth', 'status'] }),
      /connector_not_connected/,
    )
    await assert.rejects(
      () =>
        sandbox.execute({
          command: 'sh',
          args: ['-c', 'lark-cli skills list'],
        }),
      /connector_command_indirection_denied/,
    )
  })
})
