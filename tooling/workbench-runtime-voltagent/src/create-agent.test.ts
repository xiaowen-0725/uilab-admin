import assert from 'node:assert/strict'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import {
  createWorkbenchAgent,
  officeFilesystemToolConfig,
} from './create-agent.js'
import { updatePlanTool } from './update-plan-tool.js'
import {
  CONNECTOR_FEISHU_ID,
  CONNECTOR_GITHUB_ID,
  OFFICE_BUILTIN_OUTPUT_DIRS,
  OFFICE_BUILTIN_SKILL_IDS,
  listWorkspaceSkillIds,
} from './plugin/index.js'
import { OFFICE_WORKSPACE_README_NAME } from './workspace-root.js'
import { setDefaultCapabilitySelectionStore } from './capability/index.js'

/** Stub model — never called; only needed to construct Agent. */
const stubModel = {
  modelId: 'stub',
  provider: 'stub',
  specificationVersion: 'v2',
  supportedUrls: {},
  doGenerate: async () => {
    throw new Error('stub model must not be called')
  },
  doStream: async () => {
    throw new Error('stub model must not be called')
  },
} as any

const tempRoots: string[] = []

after(async () => {
  setDefaultCapabilitySelectionStore(null)
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('officeFilesystemToolConfig', () => {
  it('requires approval for writes and every generic Shell invocation', () => {
    const cfg = officeFilesystemToolConfig()
    assert.equal(cfg.filesystem.defaults.needsApproval, false)
    assert.equal(cfg.filesystem.tools.write_file.needsApproval, true)
    assert.equal(cfg.filesystem.tools.edit_file.needsApproval, true)
    assert.equal(cfg.filesystem.tools.delete_file.needsApproval, true)
    assert.equal(cfg.filesystem.tools.rmdir.needsApproval, true)
    assert.equal(cfg.filesystem.tools.mkdir.needsApproval, true)
    assert.equal(cfg.sandbox.defaults.needsApproval, true)
    assert.equal(cfg.sandbox.tools.execute_command.needsApproval, true)
  })
})

describe('createWorkbenchAgent', () => {
  it('one-click GitHub authorization claims through the platform broker and hot-loads MCP tools', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-office-github-'))
    tempRoots.push(root)
    let claimed = false
    const disconnected: string[] = []
    const bundle = await createWorkbenchAgent({
      profile: 'office',
      model: stubModel,
      workspaceRoot: root,
      env: {
        PLUGINS_ENABLED: 'mcp.github',
        UILAB_CONNECTOR_BROKER_URL: 'https://connectors.uilab.test',
        UILAB_KEYCHAIN_MODE: 'fake',
        UILAB_PERSIST_AUTH: '0',
        VOLTAGENT_MEMORY: 'in-memory',
        MCP_DOCS_URL: 'https://docs-mcp.uilab.test',
        MCP_DOCS_BEARER_TOKEN: 'docs-boot-token',
      },
      oauthFetch: async (input, init) => {
        if (input === 'https://connectors.uilab.test/v1/oauth/sessions') {
          return jsonResponse(201, {
            session_id: 'session-1',
            authorization_url:
              'https://github.com/login/oauth/authorize?client_id=uilab-connector',
            claim_token: 'claim-token-for-sidecar-only',
            token_endpoint: 'https://connectors.uilab.test/v1/oauth/token',
            client_id: 'uilab-agent-workbench',
            expires_in: 900,
            poll_interval: 1,
          })
        }
        assert.equal(
          new Headers(init?.headers).get('authorization'),
          'Bearer claim-token-for-sidecar-only',
        )
        claimed = true
        return jsonResponse(200, {
          status: 'authorized',
          access_token: 'github-user-token',
          refresh_token: 'broker-refresh-handle',
          expires_in: 28_800,
        })
      },
      mcpHost: {
        getTools: async (servers) => {
          if (servers.docs) {
            return {
              tools: [
                createTool({
                  name: 'search_docs',
                  description: 'Search docs',
                  parameters: z.object({}),
                  execute: async () => ({ ok: true }),
                }),
              ] as any[],
              disconnect: async () => {
                disconnected.push('docs')
              },
            }
          }
          const headers = (
            servers.github as {
              requestInit?: { headers?: Record<string, string> }
            }
          ).requestInit?.headers
          assert.equal(headers?.Authorization, 'Bearer github-user-token')
          return {
            tools: [
              createTool({
                name: 'search_repositories',
                description: 'Search repositories',
                parameters: z.object({}),
                execute: async () => ({ ok: true }),
              }),
            ] as any[],
            disconnect: async () => {
              disconnected.push('github')
            },
          }
        },
      },
    })

    const before = await bundle.connectorRuntime.execute({ kind: 'inspect' })
    assert.equal(before.kind, 'inspection')
    assert.ok(
      !before.snapshot.packagedToolNames.includes(
        'github__search_repositories',
      ),
    )
    const started = await bundle.connectorRuntime.execute({
      kind: 'start-auth',
      connectorId: CONNECTOR_GITHUB_ID,
    })
    assert.equal(started.kind, 'auth-started')
    assert.match(
      started.auth.ok ? (started.auth.verificationUrl ?? '') : '',
      /github\.com\/login\/oauth/,
    )
    const reconciled = await bundle.connectorRuntime.execute({
      kind: 'reconcile-auth',
    })
    assert.equal(reconciled.kind, 'auth-reconciled')
    assert.equal(claimed, true)
    assert.ok(
      reconciled.snapshot.packagedToolNames.includes(
        'github__search_repositories',
      ),
    )
    assert.equal(
      reconciled.snapshot.authStatuses.find(
        (row) =>
          row.pluginId === 'mcp.github' && row.resourceId === 'mcp:github',
      )?.status,
      'connected',
    )
    assert.ok(
      bundle.connectorRuntime
        .toolsFor({
          taskId: 'task-github',
          selectedConnectorIds: [CONNECTOR_GITHUB_ID],
        })
        .some((tool) => tool.name === 'github__search_repositories'),
    )
    assert.equal(
      bundle.connectorRuntime
        .toolsFor({
          taskId: 'task-without-github',
          selectedConnectorIds: [],
        })
        .some((tool) => tool.name === 'github__search_repositories'),
      false,
    )
    assert.equal(
      bundle.connectorRuntime
        .toolsFor({
          taskId: null,
          selectedConnectorIds: [CONNECTOR_GITHUB_ID],
        })
        .some((tool) => tool.name === 'github__search_repositories'),
      false,
      'a selected Connector must stay fail-closed without Turn Task context',
    )
    await Promise.all([
      bundle.connectorRuntime.dispose(),
      bundle.connectorRuntime.dispose(),
    ])
    assert.deepEqual(disconnected.sort(), ['docs', 'github'])
    assert.deepEqual(
      bundle.connectorRuntime.toolsFor({
        taskId: 'task-github',
        selectedConnectorIds: [CONNECTOR_GITHUB_ID],
      }),
      [],
    )
    await assert.rejects(
      bundle.connectorRuntime.execute({ kind: 'inspect' }),
      /disposed/,
    )
  })

  it('revokes GitHub auth and hot-reclaims the MCP transport in-process (#33)', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-office-revoke-'))
    tempRoots.push(root)

    // Capture EVERY Authorization header the host sees so we can prove the
    // pre-revoke bearer never survives past the revoke boundary.
    const seenTokens: string[] = []
    let disconnectCalls = 0
    // Each OAuth completion yields a distinct token so that re-login after
    // revoke produces a visibly different bearer.
    let loginCount = 0
    const tokenForLogin = (n: number) => `Bearer github-token-${n}`

    const bundle = await createWorkbenchAgent({
      profile: 'office',
      model: stubModel,
      workspaceRoot: root,
      env: {
        PLUGINS_ENABLED: 'mcp.github',
        UILAB_CONNECTOR_BROKER_URL: 'https://connectors.uilab.test',
        UILAB_KEYCHAIN_MODE: 'fake',
        UILAB_PERSIST_AUTH: '0',
        VOLTAGENT_MEMORY: 'in-memory',
      },
      oauthFetch: async (input, init) => {
        if (input === 'https://connectors.uilab.test/v1/oauth/sessions') {
          loginCount += 1
          return jsonResponse(201, {
            session_id: `session-revoke-${loginCount}`,
            authorization_url:
              'https://github.com/login/oauth/authorize?client_id=uilab-connector',
            claim_token: `claim-token-revoke-${loginCount}`,
            token_endpoint: 'https://connectors.uilab.test/v1/oauth/token',
            client_id: 'uilab-agent-workbench',
            expires_in: 900,
            poll_interval: 1,
          })
        }
        assert.equal(
          new Headers(init?.headers).get('authorization'),
          `Bearer claim-token-revoke-${loginCount}`,
        )
        return jsonResponse(200, {
          status: 'authorized',
          access_token: `github-token-${loginCount}`,
          refresh_token: `broker-refresh-${loginCount}`,
          expires_in: 28_800,
        })
      },
      mcpHost: {
        getTools: async (servers) => {
          const headers = (
            servers.github as {
              requestInit?: { headers?: Record<string, string> }
            }
          ).requestInit?.headers
          // Unconditionally record the bearer handed to the transport. The
          // post-revoke assertions below scan this array.
          seenTokens.push(headers?.Authorization ?? '(none)')
          return {
            tools: [
              createTool({
                name: 'search_repositories',
                description: 'Search repositories',
                parameters: z.object({}),
                execute: async () => ({ ok: true }),
              }),
            ] as any[],
            disconnect: async () => {
              disconnectCalls += 1
            },
          }
        },
      },
    })

    // --- Phase 1: initial login hot-loads MCP tools with token-1. ---
    await bundle.connectorRuntime.execute({
      kind: 'start-auth',
      connectorId: CONNECTOR_GITHUB_ID,
    })
    const firstLogin = await bundle.connectorRuntime.execute({
      kind: 'reconcile-auth',
    })
    assert.equal(firstLogin.kind, 'auth-reconciled')
    assert.ok(
      firstLogin.snapshot.packagedToolNames.includes(
        'github__search_repositories',
      ),
    )
    assert.equal(disconnectCalls, 0)
    const firstLoginCount = seenTokens.length
    assert.ok(
      seenTokens.includes(tokenForLogin(1)),
      'first login must inject the first bearer',
    )

    // --- Phase 2: revoke in-process — transport torn down immediately. ---
    const result = await bundle.connectorRuntime.execute({
      kind: 'revoke-auth',
      connectorId: CONNECTOR_GITHUB_ID,
    })
    assert.equal(result.kind, 'auth-revoked')
    assert.equal(
      result.needsSidecarRestart,
      false,
      'hot-reclaim should clear the restart requirement',
    )
    assert.equal(result.hotReclaimApplied, true)
    assert.equal(disconnectCalls, 1, 'live MCP transport must be disconnected')
    assert.ok(
      !result.snapshot.packagedToolNames.includes(
        'github__search_repositories',
      ),
      'tool must be removed from the live registry after revoke',
    )

    // Auth status must reflect the revocation.
    const githubStatus = result.snapshot.authStatuses.find(
      (row) =>
        row.pluginId === 'mcp.github' && row.resourceId === 'mcp:github',
    )
    assert.notEqual(githubStatus?.status, 'connected')

    // --- Phase 3 (adversarial): re-login must use a fresh bearer, and the
    // pre-revoke token-1 must NEVER reappear in any subsequent getTools call. ---
    const tokensBeforeRelogin = seenTokens.length
    await bundle.connectorRuntime.execute({
      kind: 'start-auth',
      connectorId: CONNECTOR_GITHUB_ID,
    })
    const relogin = await bundle.connectorRuntime.execute({
      kind: 'reconcile-auth',
    })
    assert.equal(relogin.kind, 'auth-reconciled')
    assert.ok(
      relogin.snapshot.packagedToolNames.includes(
        'github__search_repositories',
      ),
      're-login must hot-load tools again',
    )

    const reloginTokens = seenTokens.slice(tokensBeforeRelogin)
    assert.ok(
      reloginTokens.length > 0,
      're-login must produce at least one getTools call',
    )
    assert.ok(
      reloginTokens.every((t) => t === tokenForLogin(2)),
      `re-login must use token-2 exclusively, got: ${JSON.stringify(reloginTokens)}`,
    )
    // The decisive adversarial check: across the ENTIRE lifecycle, token-1
    // appears only in the first-login window and never again after revoke.
    const token1AfterRevoke = seenTokens
      .slice(firstLoginCount)
      .filter((t) => t === tokenForLogin(1))
    assert.equal(
      token1AfterRevoke.length,
      0,
      'pre-revoke bearer must never be handed to a transport after revoke',
    )

    await bundle.connectorRuntime.dispose()
  })

  it('uses official lark-* Skills plus generic execute_command, never Provider-specific wrappers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-office-feishu-'))
    const source = await mkdtemp(path.join(os.tmpdir(), 'wb-feishu-source-'))
    const binDir = await mkdtemp(path.join(os.tmpdir(), 'wb-feishu-bin-'))
    tempRoots.push(root, source, binDir)
    await mkdir(path.join(source, 'lark-doc', 'references'), {
      recursive: true,
    })
    await writeFile(
      path.join(source, 'lark-doc', 'SKILL.md'),
      '---\nname: lark-doc\n---\nRun native lark-cli.\n',
      'utf8',
    )
    await writeFile(
      path.join(source, 'lark-doc', 'references', 'fetch.md'),
      'lark-cli docs +fetch\n',
      'utf8',
    )
    const fakeCli = path.join(binDir, 'lark-cli')
    await writeFile(
      fakeCli,
      "#!/bin/sh\nprintf 'lark-doc\\nlark-base\\n'\n",
      'utf8',
    )
    await chmod(fakeCli, 0o755)

    const bundle = await createWorkbenchAgent({
      profile: 'office',
      model: stubModel,
      workspaceRoot: root,
      env: {
        PLUGINS_ENABLED: 'cli.feishu',
        FEISHU_CLI_PATH: fakeCli,
        FEISHU_SKILLS_ROOT: source,
        VOLTAGENT_MEMORY: 'in-memory',
        UILAB_PERSIST_AUTH: '0',
      },
      cliRunner: async (_command, argv) => ({
        stdout:
          argv[0] === 'auth' && argv[1] === 'status'
            ? JSON.stringify({
                identity: 'user',
                verified: true,
                identities: {
                  bot: { status: 'ready', available: true },
                  user: { status: 'ready', available: true },
                },
              })
            : '',
        stderr: '',
        exitCode: 0,
      }),
    })

    assert.ok(bundle.skillRoots.includes('/.runtime-skills/feishu'))
    assert.ok(bundle.discoverableSkillIds.includes('lark-doc'))
    assert.ok(bundle.tools.includes('execute_command'))
    const connectorInspection = await bundle.connectorRuntime.execute({
      kind: 'inspect',
    })
    assert.deepEqual(
      connectorInspection.snapshot.descriptors.find(
        (connector) => connector.id === CONNECTOR_FEISHU_ID,
      )?.toolScope,
      [],
    )
    const result = await bundle.workspace?.sandbox?.execute({
      command: 'lark-cli',
      args: ['skills', 'list'],
      operationContext: {
        conversationId: 'task-feishu',
        context: new Map([
          ['capabilityConnectorIds', [CONNECTOR_FEISHU_ID]],
        ]),
      } as any,
    })
    assert.equal(result?.exitCode, 0)
    assert.match(result?.stdout ?? '', /lark-doc/)

    await bundle.connectorRuntime.dispose()
    setDefaultCapabilitySelectionStore(null)
  })

  it('office profile mounts Workspace FS and does not use DIY run_command', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-office-'))
    tempRoots.push(root)

    const bundle = await createWorkbenchAgent({
      profile: 'office',
      model: stubModel,
      workspaceRoot: root,
      maxSteps: 20,
      env: {
        VOLTAGENT_MEMORY: 'in-memory',
      } as NodeJS.ProcessEnv,
    })

    assert.equal(bundle.profile, 'office')
    assert.equal(bundle.workspaceRoot, root)
    assert.equal(bundle.maxSteps, 20)
    assert.equal(bundle.summarizationEnabled, true)
    assert.equal(bundle.memoryKind, 'in-memory')
    assert.ok(bundle.workspace, 'workspace instance present')
    assert.ok(bundle.tools.includes('ls'))
    assert.ok(bundle.tools.includes('write_file'))
    assert.ok(bundle.tools.includes('execute_command'))
    assert.ok(bundle.tools.includes('update_plan'))
    assert.ok(!bundle.tools.includes('run_command'))

    // O2 first-run bootstrap
    const readmePath = path.join(root, OFFICE_WORKSPACE_README_NAME)
    await access(readmePath)
    const readme = await readFile(readmePath, 'utf8')
    assert.match(readme, /WORKSPACE_ROOT/)

    // O3 skills seed via PluginRegistry skills.office
    const skillIds = await listWorkspaceSkillIds(root)
    assert.deepEqual(skillIds, [...OFFICE_BUILTIN_SKILL_IDS].sort())
    for (const rel of OFFICE_BUILTIN_OUTPUT_DIRS) {
      await access(path.join(root, rel))
    }
    assert.ok(bundle.skillRoots.includes('/skills'))
    const connectorInspection = await bundle.connectorRuntime.execute({
      kind: 'inspect',
    })
    assert.ok(
      connectorInspection.snapshot.descriptors.some(
        (connector) => connector.id === CONNECTOR_FEISHU_ID,
      ),
    )

    // Agent carries workspace identity; tool names come from Workspace toolkit.
    assert.equal(bundle.agent.id, 'workbench')
    const fullState = await bundle.agent.getFullState()
    const toolNames = (fullState.tools ?? []).map(
      (t: { name?: string }) => t.name,
    )
    assert.ok(
      toolNames.includes('read_file') || toolNames.includes('ls'),
      `expected Workspace FS tools, got: ${toolNames.join(',')}`,
    )
    assert.ok(
      toolNames.includes('workspace_list_skills') ||
        toolNames.includes('workspace_activate_skill'),
      `expected skills toolkit tools, got: ${toolNames.join(',')}`,
    )
    assert.ok(
      !toolNames.includes('run_command'),
      'DIY run_command must not be primary tools in office profile',
    )
    assert.ok(
      toolNames.includes('execute_command'),
      `expected generic Workspace Shell, got: ${toolNames.join(',')}`,
    )
    assertRegisteredUpdatePlan(fullState)

    // Discover skills via Workspace API (no LLM).
    assert.ok(bundle.workspace?.skills, 'workspace.skills present')
    const discovered = await bundle.workspace!.skills!.discoverSkills({
      refresh: true,
    })
    const discoveredNames = discovered.map((s) => s.name).sort()
    for (const id of OFFICE_BUILTIN_SKILL_IDS) {
      assert.ok(
        discoveredNames.includes(id) ||
          discovered.some((s) => s.id.includes(id) || s.path.includes(id)),
        `expected skill ${id} in ${JSON.stringify(discovered)}`,
      )
    }

    // Activate + read → write deliverable path (simulates skill E2E without LLM).
    const meta = await bundle.workspace!.skills!.activateSkill('meeting-notes')
    assert.ok(meta, 'activate meeting-notes')
    const loaded = await bundle.workspace!.skills!.loadSkill('meeting-notes')
    assert.ok(loaded?.instructions.includes('output/meeting-notes'))

    const deliverable = path.join(root, 'output/meeting-notes', 'test-notes.md')
    await writeFile(
      deliverable,
      '# 测试纪要\n\n- 决议：O3 skills 可用\n',
      'utf8',
    )
    await access(deliverable)
    await bundle.connectorRuntime.dispose()
  })

  it('office O5 defaults: maxSteps ≥ 50, summarization on, memory available', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-office-o5-'))
    tempRoots.push(root)

    const bundle = await createWorkbenchAgent({
      profile: 'office',
      model: stubModel,
      workspaceRoot: root,
      env: {
        VOLTAGENT_MEMORY: 'in-memory',
      } as NodeJS.ProcessEnv,
    })

    assert.ok(bundle.maxSteps >= 50)
    assert.ok(bundle.maxSteps >= 80)
    assert.equal(bundle.summarizationEnabled, true)
    assert.equal(bundle.memoryKind, 'in-memory')
    // O4: no MCP env → both disabled; FS tools still present
    assert.match(bundle.mcpStatusLine, /docs=off/)
    assert.match(bundle.mcpStatusLine, /calendar=off/)
    assert.ok(bundle.tools.includes('ls'))
    await bundle.connectorRuntime.dispose()
  })

  it('minimal profile keeps DIY tools without Workspace', async () => {
    const bundle = await createWorkbenchAgent({
      profile: 'minimal',
      model: stubModel,
      workspaceRoot: '/tmp/unused-minimal-root',
      maxSteps: 8,
    })

    assert.equal(bundle.profile, 'minimal')
    assert.equal(bundle.workspace, undefined)
    assert.equal(bundle.maxSteps, 8)
    assert.equal(bundle.summarizationEnabled, false)
    const connectorInspection = await bundle.connectorRuntime.execute({
      kind: 'inspect',
    })
    assert.deepEqual(connectorInspection.snapshot.descriptors, [])
    assert.deepEqual(
      [...bundle.tools],
      ['read_file', 'write_file', 'run_command', 'update_plan'],
    )

    const fullState = await bundle.agent.getFullState()
    const toolNames = (fullState.tools ?? []).map(
      (t: { name?: string }) => t.name,
    )
    assert.ok(toolNames.includes('read_file'))
    assert.ok(toolNames.includes('write_file'))
    assert.ok(toolNames.includes('run_command'))
    assertRegisteredUpdatePlan(fullState)
  })
})

function assertRegisteredUpdatePlan(fullState: {
  instructions?: string
  tools: Array<{ name?: string; description?: string; needsApproval?: unknown }>
}) {
  const planTool = fullState.tools.find((tool) => tool.name === 'update_plan')
  assert.ok(planTool, 'update_plan must be registered')
  assert.equal(planTool.description, updatePlanTool.description)
  assert.equal(planTool.needsApproval, false)
  assertPlanGuidance(fullState.instructions)
}

function assertPlanGuidance(instructions: string | undefined) {
  assert.equal(typeof instructions, 'string')
  const patterns = [
    /non-trivial, multi-stage/,
    /one-sentence phrase/,
    /single-step plan/,
    /exactly one step in_progress/,
    /completed immediately/,
    /If blocked/,
    /Before finishing/,
    /include an explanation/,
    /proactively and often/,
    /user's language/,
    /Chinese first/,
  ]
  for (const pattern of patterns) {
    assert.match(instructions as string, pattern)
  }
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}
