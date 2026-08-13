import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Hono } from 'hono'
import type { OfficeConnectorRuntime } from './capability/office-connector-runtime.js'
import {
  configureSidecarApp,
  type ConfigureSidecarAppInput,
} from './configure-sidecar-app.js'

function createLogger() {
  const info: string[] = []
  const error: string[] = []
  return {
    info: (message: string) => {
      info.push(message)
    },
    error: (message: string) => {
      error.push(message)
    },
    messages: { info, error },
  }
}

function emptyRuntime(): OfficeConnectorRuntime {
  const snapshot = {
    descriptors: [],
    authStatuses: [],
    enabledPluginIds: [],
    packagedToolNames: ['read_file'],
    mcpStatuses: [],
    cliStatuses: [],
    activeCliSessions: [],
  }
  return {
    async execute(command) {
      if (command.kind === 'inspect') {
        return { kind: 'inspection', snapshot }
      }
      throw new Error(`unexpected command ${command.kind}`)
    },
    toolsFor: () => [],
    async dispose() {},
  }
}

function createInput(
  logger: ReturnType<typeof createLogger>,
  loadExperts?: ConfigureSidecarAppInput['loadExperts'],
): ConfigureSidecarAppInput {
  return {
    workspaceRoot: '/tmp/workbench-sidecar-test',
    profile: 'minimal' as const,
    capabilityVersionRef: { current: 1 },
    connectorRuntime: emptyRuntime(),
    getDiscoverableSkillIds: () => [] as const,
    logger,
    loadExperts,
  }
}

describe('configureSidecarApp', () => {
  it('serves capability snapshot after configure completes', async () => {
    const app = new Hono()
    const logger = createLogger()
    await configureSidecarApp(app, createInput(logger))

    const info = await app.request('/workspace/info')
    assert.equal(info.status, 200)
    const infoBody = (await info.json()) as { profile: string }
    assert.equal(infoBody.profile, 'minimal')

    const snapshot = await app.request('/capability/snapshot')
    assert.equal(snapshot.status, 200)
    const raw = await snapshot.text()
    assert.equal(raw.includes('access_token'), false)
    assert.equal(raw.includes('client_secret'), false)
    const body = JSON.parse(raw) as {
      experts: Array<{ id: string }>
      connectors: unknown[]
    }
    assert.ok(Array.isArray(body.connectors))
    assert.ok(body.experts.some((expert) => expert.id === 'expert.xhs-cover'))

    const selection = await app.request('/capability/selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(selection.status, 400)
    assert.ok(
      logger.messages.info.some((message) =>
        message.includes('capability routes mounted'),
      ),
    )
  })

  it('logs catalog load failure, still serves snapshot, and does not reject', async () => {
    const app = new Hono()
    const logger = createLogger()
    const rejections: unknown[] = []
    const onReject = (reason: unknown) => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onReject)
    try {
      await configureSidecarApp(
        app,
        createInput(logger, async () => {
          throw new Error('catalog unreadable')
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 20))
      assert.equal(rejections.length, 0)
    } finally {
      process.off('unhandledRejection', onReject)
    }

    const snapshot = await app.request('/capability/snapshot')
    assert.equal(snapshot.status, 200)
    assert.ok(
      logger.messages.error.some((message) =>
        message.includes('catalog unreadable'),
      ),
    )
  })
})
