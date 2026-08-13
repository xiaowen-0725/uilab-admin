import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Hono } from 'hono'
import type { PluginAuthStatus } from '../plugin/auth-status.js'
import {
  BUILTIN_CONNECTOR_DESCRIPTORS,
  CONNECTOR_GITHUB_AUTH_RESOURCE_ID,
  CONNECTOR_FEISHU_ID,
  CONNECTOR_GITHUB_ID,
} from '../plugin/builtins.js'
import { createCapabilitySelectionStore } from './selection-store.js'
import { mountCapabilityRoutes } from './http-routes.js'
import type {
  OfficeConnectorRuntime,
  OfficeConnectorRuntimeSnapshot,
} from './office-connector-runtime.js'

function createTestApp(input?: {
  authStatuses?: PluginAuthStatus[]
  enabledPluginIds?: string[]
  onReconcile?: () => Promise<
    Array<{
      connectorId: string
      kind: 'cli_session'
      phase: 'authorization_required'
      step: 'authorize'
      verificationUrl: string
      message: string
    }>
  >
  onRevoke?: (connectorId: string) => Promise<{
    message: string
    needsSidecarRestart: boolean
    hotReclaimApplied?: boolean
  }>
}) {
  const app = new Hono()
  const versionRef = { current: 1 }
  const statuses = input?.authStatuses ?? []
  const snapshot = (): OfficeConnectorRuntimeSnapshot => ({
    descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
    authStatuses: [...statuses],
    enabledPluginIds: input?.enabledPluginIds ?? ['mcp.github'],
    packagedToolNames: [],
    cliStatuses: [],
    mcpStatuses: [],
    activeCliSessions: [],
  })
  const connectorRuntime: OfficeConnectorRuntime = {
    async execute(command) {
      if (command.kind === 'inspect') {
        return { kind: 'inspection', snapshot: snapshot() }
      }
      if (command.kind === 'start-auth') {
        if (command.connectorId === CONNECTOR_GITHUB_ID) {
          return {
            kind: 'auth-started',
            auth: {
              ok: true,
              connectorId: command.connectorId,
              kind: 'oauth2',
              phase: 'login_started',
              step: 'authorize',
              verificationUrl:
                'https://github.com/login/oauth/authorize?client_id=uilab-connector&state=broker-state',
              expiresIn: 900,
              loginHint: '通过浏览器完成 GitHub 账号授权。',
              message: '已启动 GitHub 一键授权，请在浏览器中确认。',
            },
            snapshot: snapshot(),
          }
        }
        return {
          kind: 'auth-started',
          auth: {
            ok: true,
            connectorId: command.connectorId,
            kind: 'cli_session',
            phase: 'login_started',
            step: 'configure',
            verificationUrl:
              'https://open.feishu.cn/page/cli?user_code=bootstrap-code',
            loginHint: '通过浏览器完成飞书 CLI session 授权。',
            message: '请先完成 CLI 应用配置。',
          },
          snapshot: snapshot(),
        }
      }
      if (command.kind === 'reconcile-auth') {
        const transitions = (await input?.onReconcile?.()) ?? []
        return {
          kind: 'auth-reconciled',
          transitions,
          snapshot: snapshot(),
        }
      }
      const revoked = input?.onRevoke
        ? await input.onRevoke(command.connectorId)
        : {
            message: '连接已撤销',
            needsSidecarRestart: false,
            hotReclaimApplied: true,
          }
      return {
        kind: 'auth-revoked',
        connectorId: command.connectorId,
        ...revoked,
        snapshot: snapshot(),
      }
    },
    toolsFor: () => [],
    async dispose() {},
  }
  mountCapabilityRoutes(app, {
    versionRef,
    selectionStore: createCapabilitySelectionStore(),
    connectorRuntime,
  })
  return { app, versionRef }
}

describe('Capability OAuth HTTP routes', () => {
  it('restores Task selection without changing the connected account state', async () => {
    const { app } = createTestApp({
      enabledPluginIds: ['cli.feishu'],
      authStatuses: [
        {
          pluginId: 'cli.feishu',
          resourceId: 'cli:feishu',
          kind: 'cli_session',
          pluginEnabled: true,
          status: 'connected',
        },
      ],
    })

    const selectForTaskA = await app.request('/capability/selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: 'task-a',
        selection: { connectorIds: [CONNECTOR_FEISHU_ID] },
      }),
    })
    assert.equal(selectForTaskA.status, 200)

    await app.request('/capability/selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: 'task-b',
        selection: { connectorIds: [] },
      }),
    })

    const restoredA = await app.request(
      '/capability/snapshot?taskId=task-a',
    )
    const snapshotA = await restoredA.json()
    const feishuA = snapshotA.connectors.find(
      (connector: { id: string }) => connector.id === CONNECTOR_FEISHU_ID,
    )
    assert.equal(feishuA.connected, true)
    assert.equal(feishuA.taskSelected, true)
    assert.equal(feishuA.capabilityEffective, true)
    assert.deepEqual(feishuA.effectiveCommandScopes, ['lark-cli'])

    const restoredB = await app.request(
      '/capability/snapshot?taskId=task-b',
    )
    const snapshotB = await restoredB.json()
    const feishuB = snapshotB.connectors.find(
      (connector: { id: string }) => connector.id === CONNECTOR_FEISHU_ID,
    )
    assert.equal(feishuB.connected, true)
    assert.equal(feishuB.taskSelected, false)
    assert.equal(feishuB.capabilityEffective, false)
    assert.deepEqual(feishuB.effectiveCommandScopes, [])

    await app.request('/capability/selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: 'task-a',
        selection: { connectorIds: [] },
      }),
    })
    const deselectedA = await app.request(
      '/capability/snapshot?taskId=task-a',
    )
    const deselectedSnapshot = await deselectedA.json()
    const deselectedFeishu = deselectedSnapshot.connectors.find(
      (connector: { id: string }) => connector.id === CONNECTOR_FEISHU_ID,
    )
    assert.equal(deselectedFeishu.connected, true)
    assert.equal(deselectedFeishu.taskSelected, false)
    assert.equal(deselectedFeishu.capabilityEffective, false)
    assert.deepEqual(deselectedFeishu.effectiveCommandScopes, [])
  })

  it('starts GitHub OAuth with a browser URL and no credential material', async () => {
    const { app, versionRef } = createTestApp()
    const response = await app.request('/capability/auth/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectorId: CONNECTOR_GITHUB_ID }),
    })

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.ok, true)
    assert.equal(body.kind, 'oauth2')
    assert.match(
      body.verificationUrl,
      /^https:\/\/github\.com\/login\/oauth\/authorize/,
    )
    assert.equal(JSON.stringify(body).includes('access_token'), false)
    assert.equal(JSON.stringify(body).includes('client_secret'), false)
    assert.equal(versionRef.current, 2)
  })

  it('reconciles the platform authorization session during status refresh', async () => {
    let reconciled = 0
    const { app, versionRef } = createTestApp({
      onReconcile: async () => {
        reconciled += 1
        return []
      },
    })

    const response = await app.request('/capability/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectorId: CONNECTOR_GITHUB_ID }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(reconciled, 1)
    assert.equal(versionRef.current, 2)
  })

  it('revokes account auth by generic connector id and returns a refreshed snapshot', async () => {
    const statuses: PluginAuthStatus[] = [
      {
        pluginId: 'mcp.github',
        resourceId: CONNECTOR_GITHUB_AUTH_RESOURCE_ID,
        kind: 'oauth2',
        pluginEnabled: true,
        status: 'connected',
      },
    ]
    const revoked: string[] = []
    const { app } = createTestApp({
      authStatuses: statuses,
      onRevoke: async (connectorId) => {
        revoked.push(connectorId)
        statuses[0] = { ...statuses[0]!, status: 'missing' }
        return {
          message: '连接已撤销',
          needsSidecarRestart: false,
          hotReclaimApplied: true,
        }
      },
    })

    const response = await app.request('/capability/auth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connectorId: CONNECTOR_GITHUB_ID,
        taskId: 'task-a',
      }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(revoked, [CONNECTOR_GITHUB_ID])
    assert.equal(body.ok, true)
    assert.equal(body.needsSidecarRestart, false)
    assert.equal(body.hotReclaimApplied, true)
    assert.equal(
      body.snapshot.connectors.find(
        (connector: { id: string }) => connector.id === CONNECTOR_GITHUB_ID,
      ).connected,
      false,
    )
  })

  it('propagates needsSidecarRestart fallback when hot-reclaim is not applied', async () => {
    const statuses: PluginAuthStatus[] = [
      {
        pluginId: 'mcp.github',
        resourceId: CONNECTOR_GITHUB_AUTH_RESOURCE_ID,
        kind: 'oauth2',
        pluginEnabled: true,
        status: 'connected',
      },
    ]
    const { app } = createTestApp({
      authStatuses: statuses,
      onRevoke: async () => {
        statuses[0] = { ...statuses[0]!, status: 'missing' }
        return {
          message: '连接已撤销',
          needsSidecarRestart: true,
          hotReclaimApplied: false,
        }
      },
    })

    const response = await app.request('/capability/auth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connectorId: CONNECTOR_GITHUB_ID,
        taskId: 'task-a',
      }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.needsSidecarRestart, true)
    assert.equal(body.hotReclaimApplied, false)
  })

  it('starts and continues a CLI flow without exposing a device code', async () => {
    const { app } = createTestApp({
      onReconcile: async () => [
        {
          connectorId: CONNECTOR_FEISHU_ID,
          kind: 'cli_session',
          phase: 'authorization_required',
          step: 'authorize',
          verificationUrl:
            'https://accounts.feishu.cn/open-apis/authen/v1/authorize?flow_id=next',
          message: '请授权账号。',
        },
      ],
    })

    const started = await app.request('/capability/auth/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectorId: CONNECTOR_FEISHU_ID }),
    })
    const startBody = await started.json()
    assert.equal(startBody.step, 'configure')
    assert.match(startBody.verificationUrl, /open\.feishu\.cn\/page\/cli/)
    assert.equal(JSON.stringify(startBody).includes('device_code'), false)
    assert.equal(JSON.stringify(startBody).includes('deviceCode'), false)

    const refreshed = await app.request('/capability/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectorId: CONNECTOR_FEISHU_ID }),
    })
    const refreshBody = await refreshed.json()
    assert.equal(refreshBody.transitions[0].step, 'authorize')
    assert.match(
      refreshBody.transitions[0].verificationUrl,
      /accounts\.feishu\.cn/,
    )
    assert.equal(
      JSON.stringify(refreshBody.transitions).includes('authorizationUrl'),
      false,
    )
  })

  it('does not expose a local Provider OAuth callback route', async () => {
    const { app } = createTestApp()
    const response = await app.request(
      `/capability/auth/callback/${CONNECTOR_GITHUB_ID}?code=github-code&state=state-1`,
    )

    assert.equal(response.status, 404)
  })
})
