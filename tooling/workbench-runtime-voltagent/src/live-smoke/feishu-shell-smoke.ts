import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createCapabilitySelectionStore,
  setDefaultCapabilitySelectionStore,
} from '../capability/index.js'
import { createWorkbenchAgent } from '../create-agent.js'
import { CONNECTOR_FEISHU_ID } from '../plugin/builtins.js'

const stubModel = {
  modelId: 'feishu-shell-smoke',
  provider: 'local-smoke',
  specificationVersion: 'v2',
  supportedUrls: {},
  doGenerate: async () => {
    throw new Error('Feishu Shell smoke does not call a model')
  },
  doStream: async () => {
    throw new Error('Feishu Shell smoke does not call a model')
  },
} as any

export type FeishuShellSmokeReport = {
  cliVersion: string
  officialSkillCount: number
  hasLarkDoc: boolean
  commandScopes: string[]
  executeCommandAvailable: boolean
  genericShellAvailable: boolean
}

/** Real local smoke: official installed Skills + CLI session + Task gate + native command. */
export async function runFeishuShellSmoke(
  sourceEnv: NodeJS.ProcessEnv = process.env,
): Promise<FeishuShellSmokeReport> {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), 'uilab-feishu-shell-smoke-'),
  )
  const store = createCapabilitySelectionStore()
  const taskId = 'feishu-shell-smoke'
  store.set(taskId, {
    connectorIds: [CONNECTOR_FEISHU_ID],
    skillIds: [],
    expertId: null,
  })
  store.setActiveTaskId(taskId)
  setDefaultCapabilitySelectionStore(store)

  const enabled = new Set(
    String(sourceEnv.PLUGINS_ENABLED ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  enabled.add('cli.feishu')
  const disabled = String(sourceEnv.PLUGINS_DISABLED ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value && value !== 'cli.feishu')

  let bundle: Awaited<ReturnType<typeof createWorkbenchAgent>> | undefined
  try {
    bundle = await createWorkbenchAgent({
      profile: 'office',
      model: stubModel,
      workspaceRoot,
      env: {
        ...sourceEnv,
        PLUGINS_ENABLED: [...enabled].join(','),
        PLUGINS_DISABLED: disabled.join(','),
        VOLTAGENT_MEMORY: 'in-memory',
        UILAB_PERSIST_AUTH: '0',
      },
    })

    const auth = bundle.authStatuses.find(
      (status) =>
        status.pluginId === 'cli.feishu' &&
        status.resourceId === 'cli:feishu',
    )
    if (auth?.status !== 'connected') {
      throw new Error(auth?.hint ?? 'lark-cli session is not connected')
    }
    const connector = bundle.connectorDescriptors.find(
      (candidate) => candidate.id === CONNECTOR_FEISHU_ID,
    )
    if (!connector) throw new Error('connector.feishu is missing')
    if (!bundle.workspace?.sandbox) {
      throw new Error('Office Workspace sandbox is missing')
    }

    const genericShell = await bundle.workspace.sandbox.execute({
      command: 'git',
      args: ['--version'],
    })
    if (genericShell.exitCode !== 0) {
      throw new Error(`generic Workspace Shell failed: ${genericShell.stderr.trim()}`)
    }

    const version = await bundle.workspace.sandbox.execute({
      command: 'lark-cli',
      args: ['--version'],
    })
    if (version.exitCode !== 0) {
      throw new Error(`lark-cli --version failed: ${version.stderr.trim()}`)
    }
    const skills = await bundle.workspace.sandbox.execute({
      command: 'lark-cli',
      args: ['skills', 'list'],
    })
    if (skills.exitCode !== 0) {
      throw new Error(`lark-cli skills list failed: ${skills.stderr.trim()}`)
    }

    const officialSkillIds = bundle.discoverableSkillIds.filter((id) =>
      id.startsWith('lark-'),
    )
    if (!officialSkillIds.includes('lark-doc')) {
      throw new Error('official lark-doc Skill was not mounted')
    }
    if (!skills.stdout.includes('lark-doc')) {
      throw new Error('native lark-cli output does not include lark-doc')
    }

    return {
      cliVersion: version.stdout.trim() || version.stderr.trim(),
      officialSkillCount: officialSkillIds.length,
      hasLarkDoc: true,
      commandScopes: [...connector.commandScopes],
      executeCommandAvailable: bundle.tools.includes('execute_command'),
      genericShellAvailable: true,
    }
  } finally {
    try {
      await bundle?.disconnectMcp()
      await bundle?.workspace?.destroy()
    } finally {
      setDefaultCapabilitySelectionStore(null)
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  }
}

async function main() {
  const report = await runFeishuShellSmoke()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

const invokedPath = process.argv[1]
if (
  invokedPath &&
  pathToFileURL(path.resolve(invokedPath)).href === import.meta.url
) {
  main().catch((error) => {
    process.stderr.write(
      `Feishu Shell smoke failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  })
}
