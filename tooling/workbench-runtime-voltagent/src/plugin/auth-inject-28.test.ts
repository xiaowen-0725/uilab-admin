/**
 * #28 — inject + revoke consistent with MCP/CLI load.
 * Invariant: connected ⇔ injectable material; clear blocks env leftovers.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  resolveAuthResourceMaterial,
  resolveAuthResourceStatus,
} from './auth-status.js'
import { BUILTIN_MCP_DOCS_PLUGIN } from './builtins.js'
import { buildCliChildEnv } from './cli-loader.js'
import type { AuthResourceContribution, CliContribution } from './manifest.js'
import {
  resolveMcpBearerToken,
  resolveMcpContribution,
  buildMcpChildEnv,
} from './mcp-loader.js'
import { createPluginRegistry } from './registry.js'
import {
  createAuthBindingStore,
  createEnvSecretStore,
  createMemorySecretStore,
  resolveCredentialMaterial,
} from './secret-store.js'
import type { AuthBinding } from './types.js'

const SENTINEL = 'sentinel-token-not-a-real-secret-xyz'

describe('#28 resolveCredentialMaterial', () => {
  it('connected static_bearer yields bearerToken for inject', async () => {
    const store = createEnvSecretStore({ MCP_DOCS_BEARER_TOKEN: SENTINEL })
    const binding: AuthBinding = {
      pluginId: 'mcp.docs',
      resourceId: 'bearer',
      kind: 'static_bearer',
      envNames: ['MCP_DOCS_BEARER_TOKEN', 'MCP_DOCS_TOKEN'],
    }
    const m = await resolveCredentialMaterial(binding, store)
    assert.equal(m.status, 'connected')
    assert.equal(m.bearerToken, SENTINEL)
    assert.equal(m.envValues.MCP_DOCS_BEARER_TOKEN, SENTINEL)
    assert.ok(m.controlledEnvNames.includes('MCP_DOCS_BEARER_TOKEN'))
  })

  it('expiresAt in the past → auth=expired and empty inject', async () => {
    const store = createEnvSecretStore({ PAT: SENTINEL })
    const m = await resolveCredentialMaterial(
      {
        pluginId: 'p',
        resourceId: 'r',
        kind: 'static_bearer',
        envNames: ['PAT'],
        expiresAt: Date.now() - 60_000,
        loginHint: '请重新登录',
      },
      store,
    )
    assert.equal(m.status, 'expired')
    assert.equal(m.bearerToken, undefined)
    assert.deepEqual(m.envValues, {})
    assert.match(m.hint ?? '', /过期|重新/)
  })

  it('memory secretRef connected then usable as bearer', async () => {
    const memory = createMemorySecretStore()
    await memory.set!({ backend: 'memory', key: 'pat' }, SENTINEL)
    const m = await resolveCredentialMaterial(
      {
        pluginId: 'github',
        resourceId: 'api',
        kind: 'static_bearer',
        secretRef: { backend: 'memory', key: 'pat' },
      },
      memory,
    )
    assert.equal(m.status, 'connected')
    assert.equal(m.bearerToken, SENTINEL)
  })
})

describe('#28 binding clear / revoke blocks env leftovers', () => {
  it('after clear, status is missing even when process env still has PAT', async () => {
    const env = { GITHUB_PAT: SENTINEL }
    const store = createEnvSecretStore(env)
    const bindings = createAuthBindingStore()
    const resource: AuthResourceContribution = {
      resourceId: 'api',
      kind: 'env_ref',
      envNames: ['GITHUB_PAT'],
      loginHint: '配置 GITHUB_PAT',
    }

    const before = await resolveAuthResourceStatus('github', resource, true, {
      store,
      bindingStore: bindings,
      env,
    })
    assert.equal(before.status, 'connected')

    bindings.clear('github', 'api')
    assert.equal(bindings.isRevoked('github', 'api'), true)

    const after = await resolveAuthResourceStatus('github', resource, true, {
      store,
      bindingStore: bindings,
      env,
    })
    assert.equal(after.status, 'missing')
    assert.match(after.hint ?? '', /撤销|重新|配置/)

    const material = await resolveAuthResourceMaterial(
      'github',
      resource,
      true,
      { store, bindingStore: bindings, env },
    )
    assert.equal(material.status, 'missing')
    assert.equal(material.bearerToken, undefined)
    assert.deepEqual(material.envValues, {})
  })

  it('upsert after clear re-enables env path', async () => {
    const env = { GITHUB_PAT: SENTINEL }
    const store = createEnvSecretStore(env)
    const bindings = createAuthBindingStore()
    const resource: AuthResourceContribution = {
      resourceId: 'api',
      kind: 'env_ref',
      envNames: ['GITHUB_PAT'],
    }
    bindings.clear('github', 'api')
    bindings.upsert({
      pluginId: 'github',
      resourceId: 'api',
      kind: 'env_ref',
      envNames: ['GITHUB_PAT'],
    })
    assert.equal(bindings.isRevoked('github', 'api'), false)
    const st = await resolveAuthResourceStatus('github', resource, true, {
      store,
      bindingStore: bindings,
      env,
    })
    assert.equal(st.status, 'connected')
  })
})

describe('#28 MCP inject uses material path', () => {
  const contrib = BUILTIN_MCP_DOCS_PLUGIN.contributes!.mcp![0]!

  it('authEnforced + connected injects Authorization bearer', () => {
    const env = {
      MCP_DOCS_URL: 'https://mcp.example/docs',
      MCP_DOCS_BEARER_TOKEN: 'env-leftover-should-not-win',
    }
    const material = {
      status: 'connected' as const,
      bearerToken: SENTINEL,
      envValues: { MCP_DOCS_BEARER_TOKEN: SENTINEL },
      controlledEnvNames: ['MCP_DOCS_BEARER_TOKEN', 'MCP_DOCS_TOKEN', 'MCP_BEARER_TOKEN'],
    }
    const token = resolveMcpBearerToken(contrib, env, {
      authEnforced: true,
      authMaterial: material,
    })
    assert.equal(token, SENTINEL)

    const resolved = resolveMcpContribution('mcp.docs', contrib, env, {
      authEnforced: true,
      authMaterial: material,
    })
    assert.ok(resolved)
    assert.equal(resolved!.transport, 'http')
    const headers = (resolved!.server as { requestInit?: { headers?: Record<string, string> } })
      .requestInit?.headers
    assert.equal(headers?.Authorization, `Bearer ${SENTINEL}`)
  })

  it('authEnforced + missing/revoked does not inject env leftover bearer', () => {
    const env = {
      MCP_DOCS_URL: 'https://mcp.example/docs',
      MCP_DOCS_BEARER_TOKEN: SENTINEL,
    }
    const material = {
      status: 'missing' as const,
      envValues: {},
      controlledEnvNames: ['MCP_DOCS_BEARER_TOKEN'],
    }
    const token = resolveMcpBearerToken(contrib, env, {
      authEnforced: true,
      authMaterial: material,
    })
    assert.equal(token, undefined)

    const resolved = resolveMcpContribution('mcp.docs', contrib, env, {
      authEnforced: true,
      authMaterial: material,
    })
    assert.ok(resolved)
    const init = (resolved!.server as { requestInit?: unknown }).requestInit
    assert.equal(init, undefined)
  })

  it('stdio child env strips controlled secrets when not connected', () => {
    const stdioContrib = {
      ...contrib,
      urlFromEnv: undefined,
      commandFromEnv: ['MCP_DOCS_COMMAND'],
      childEnvKeys: ['FEISHU_APP_SECRET', 'FEISHU_APP_ID', 'OTHER_CFG'],
    }
    const env = {
      MCP_DOCS_COMMAND: '/bin/true',
      FEISHU_APP_SECRET: SENTINEL,
      FEISHU_APP_ID: 'app',
      OTHER_CFG: 'ok',
    }
    const child = buildMcpChildEnv(stdioContrib, env, {
      authEnforced: true,
      authMaterial: {
        status: 'missing',
        envValues: {},
        controlledEnvNames: ['FEISHU_APP_SECRET'],
      },
    })
    assert.equal(child.FEISHU_APP_SECRET, undefined)
    assert.equal(child.FEISHU_APP_ID, 'app')
    assert.equal(child.OTHER_CFG, 'ok')
  })
})

describe('#28 CLI child env follows material', () => {
  const contrib: CliContribution = {
    cliId: 'feishu',
    command: 'lark-cli',
    childEnvKeys: ['FEISHU_APP_SECRET', 'FEISHU_APP_ID'],
    commands: [{ name: 'x', argv: ['auth', 'status'] }],
  }

  it('connected overlays material secrets into closed child env', () => {
    const env = {
      FEISHU_APP_SECRET: 'env-leftover',
      FEISHU_APP_ID: 'id-from-env',
    }
    const child = buildCliChildEnv(contrib, env, {
      authEnforced: true,
      authMaterial: {
        status: 'connected',
        envValues: { FEISHU_APP_SECRET: SENTINEL },
        controlledEnvNames: ['FEISHU_APP_SECRET'],
      },
    })
    assert.equal(child.FEISHU_APP_SECRET, SENTINEL)
    assert.equal(child.FEISHU_APP_ID, 'id-from-env')
  })

  it('missing strips controlled secrets despite env leftovers', () => {
    const env = { FEISHU_APP_SECRET: SENTINEL, FEISHU_APP_ID: 'id' }
    const child = buildCliChildEnv(contrib, env, {
      authEnforced: true,
      authMaterial: {
        status: 'missing',
        envValues: {},
        controlledEnvNames: ['FEISHU_APP_SECRET'],
      },
    })
    assert.equal(child.FEISHU_APP_SECRET, undefined)
    assert.equal(child.FEISHU_APP_ID, 'id')
  })
})

describe('#28 PluginRegistry end-to-end inject', () => {
  it('docs MCP HTTP gets Authorization only when auth connected', async () => {
    let seenAuth: string | undefined
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_DOCS_BEARER_TOKEN: SENTINEL,
      },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      host: {
        getTools: async (servers) => {
          const docs = servers.docs as {
            requestInit?: { headers?: Record<string, string> }
          }
          seenAuth = docs?.requestInit?.headers?.Authorization
          return {
            tools: [
              {
                name: 'docs_read_document',
                description: 'r',
                parameters: {},
                execute: async () => ({}),
              } as any,
            ],
            disconnect: async () => {},
          }
        },
      },
    })
    const result = await reg.load()
    const auth = result.authStatuses.find((a) => a.pluginId === 'mcp.docs')
    assert.equal(auth?.status, 'connected')
    assert.equal(seenAuth, `Bearer ${SENTINEL}`)
    assert.doesNotMatch(result.authDoctorLine, new RegExp(SENTINEL))
    await result.disconnect()
  })

  it('clear binding before load → auth missing and no Authorization despite env', async () => {
    let seenAuth: string | undefined
    const bindings = createAuthBindingStore()
    bindings.clear('mcp.docs', 'bearer')

    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_DOCS_BEARER_TOKEN: SENTINEL,
      },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      authBindingStore: bindings,
      host: {
        getTools: async (servers) => {
          const docs = servers.docs as {
            requestInit?: { headers?: Record<string, string> }
          }
          seenAuth = docs?.requestInit?.headers?.Authorization
          return {
            tools: [
              {
                name: 'docs_read_document',
                description: 'r',
                parameters: {},
                execute: async () => ({}),
              } as any,
            ],
            disconnect: async () => {},
          }
        },
      },
    })
    const result = await reg.load()
    const auth = result.authStatuses.find((a) => a.pluginId === 'mcp.docs')
    assert.equal(auth?.status, 'missing')
    assert.equal(seenAuth, undefined)
    await result.disconnect()
  })

  it('expired binding produces auth=expired in doctor', async () => {
    const bindings = createAuthBindingStore()
    bindings.upsert({
      pluginId: 'mcp.docs',
      resourceId: 'bearer',
      kind: 'static_bearer',
      envNames: ['MCP_DOCS_BEARER_TOKEN'],
      expiresAt: Date.now() - 1,
      loginHint: 'Token 已过期',
    })
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_DOCS_BEARER_TOKEN: SENTINEL,
      },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      authBindingStore: bindings,
      host: {
        getTools: async () => ({
          tools: [
            {
              name: 'docs_read_document',
              description: 'r',
              parameters: {},
              execute: async () => ({}),
            } as any,
          ],
          disconnect: async () => {},
        }),
      },
    })
    const result = await reg.load()
    const auth = result.authStatuses.find((a) => a.pluginId === 'mcp.docs')
    assert.equal(auth?.status, 'expired')
    assert.match(result.authDoctorLine, /auth=expired|expired/)
    assert.doesNotMatch(result.authDoctorLine, new RegExp(SENTINEL))
    await result.disconnect()
  })
})
