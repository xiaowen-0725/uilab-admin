import { describe, expect, it } from 'vitest'
import {
  createFakeHostPort,
  createMemoryProjectCatalog,
  createProjectLocalRootCommands,
  createUnavailableHostPort,
  HostUnavailableError,
  ProjectCatalogController,
  type FakeHostPort,
  type HostPort,
} from '@/modules/project'

function setup<H extends HostPort>(host: H, selectedId: string | null = null) {
  const catalog = createMemoryProjectCatalog()
  const controller = new ProjectCatalogController(catalog)
  const selected = { id: selectedId }
  const commands = createProjectLocalRootCommands({
    catalog: controller,
    host,
    getSelectedProjectId: () => selected.id,
    selectProject: (projectId) => {
      selected.id = projectId
    },
  })
  return { catalog, controller, host, commands, selected }
}

function fake(options?: Parameters<typeof createFakeHostPort>[0]): FakeHostPort {
  return createFakeHostPort(options)
}

describe('Project local-root command face', () => {
  it('openLocalFolder: cancel has no side effects', async () => {
    const { controller, commands, selected, catalog } = setup(
      fake({ pickResult: { canceled: true } }),
    )
    await controller.hydrate({ seedDefaultProject: false })

    const result = await commands.openLocalFolder()
    expect(result).toEqual({ kind: 'canceled' })
    expect(controller.getView().projects).toHaveLength(0)
    expect(selected.id).toBeNull()
    expect(await catalog.listProjects()).toHaveLength(0)
  })

  it('openLocalFolder: reuses the same normalized root and selects it', async () => {
    const { controller, commands, selected, host } = setup(
      fake({ pickResult: { path: '/Users/me/external-repo/' } }),
    )
    await controller.hydrate({ seedDefaultProject: false })

    const first = await commands.openLocalFolder()
    expect(first.kind).toBe('opened')
    if (first.kind === 'canceled') throw new Error('unreachable')
    expect(first.project.rootSource).toBe('opened')
    expect(first.project.localRoot).toBe('/Users/me/external-repo')
    expect(selected.id).toBe(first.project.id)
    expect(host.calls.some((c) => c.method === 'startRuntime')).toBe(true)

    host.setPickResult({ path: '/Users/me/external-repo' })
    const second = await commands.openLocalFolder()
    expect(second.kind).toBe('reused')
    if (second.kind !== 'reused') throw new Error('expected reuse')
    expect(second.project.id).toBe(first.project.id)
    expect(controller.getView().projects).toHaveLength(1)
  })

  it('openLocalFolder: allows directories outside Projects Home', async () => {
    const { controller, commands } = setup(
      fake({
        projectsHome: '/virtual/AgentWorkbench',
        pickResult: { path: '/tmp/outside' },
      }),
    )
    await controller.hydrate({ seedDefaultProject: false })
    const result = await commands.openLocalFolder()
    expect(result.kind).toBe('opened')
    if (result.kind !== 'opened') throw new Error('expected opened')
    expect(result.project.localRoot).toBe('/tmp/outside')
    expect(result.project.localRoot?.startsWith('/virtual/AgentWorkbench')).toBe(
      false,
    )
  })

  it('createProject: unique Home child, rootSource=created, then selected', async () => {
    const { controller, commands, selected, host } = setup(
      fake({
        existingDirectories: ['/virtual/AgentWorkbench/未命名项目'],
      }),
    )
    await controller.hydrate({ seedDefaultProject: false })

    const project = await commands.createProject()
    expect(project.rootSource).toBe('created')
    expect(project.localRoot).toMatch(/^\/virtual\/AgentWorkbench\/未命名项目-/)
    expect(project.name).toBe(project.localRoot!.split('/').pop())
    expect(selected.id).toBe(project.id)
    expect(host.directories.has(project.localRoot!)).toBe(true)
  })

  it('useUnspecifiedProject reuses the auto project and does not create another', async () => {
    const { controller, commands, selected, host } = setup(fake())
    await controller.hydrate({ seedDefaultProject: false })
    const auto = await commands.ensureProjectForNewChat()
    const specified = await commands.createProject('桌面项目')
    expect(selected.id).toBe(specified.id)

    const unspecified = await commands.useUnspecifiedProject()
    expect(unspecified.id).toBe(auto.id)
    expect(unspecified.rootSource).toBe('auto')
    expect(selected.id).toBe(auto.id)
    expect(
      host.calls.filter((call) => call.method === 'createProjectDirectory'),
    ).toHaveLength(2)
  })

  it('useUnspecifiedProject prefers the Web default fixture', async () => {
    const { controller, commands, selected } = setup(
      createUnavailableHostPort(),
    )
    await controller.hydrate()
    selected.id = (
      await controller.createProject('指定项目', {
        localRoot: '/tmp/specified',
        rootSource: 'created',
      })
    ).id

    const unspecified = await commands.useUnspecifiedProject()
    expect(unspecified.id).toBe('project-default')
    expect(selected.id).toBe('project-default')
  })

  it('ensureProjectForNewChat returns immediately when sidecar start is slow', async () => {
    const host = fake({ startDelayMs: 5_000 })
    const { controller, commands, selected } = setup(host)
    await controller.hydrate({ seedDefaultProject: false })
    const project = await controller.createProject('仓库', {
      localRoot: '/virtual/AgentWorkbench/仓库',
      rootSource: 'created',
    })
    selected.id = project.id
    host.setRuntimeStatus('stopped')

    const startedAt = Date.now()
    const result = await commands.ensureProjectForNewChat()
    expect(result.id).toBe(project.id)
    expect(Date.now() - startedAt).toBeLessThan(400)
  })

  it('ensureProjectForNewChat: unselected → auto project; selected → reuse', async () => {
    const { controller, commands, selected } = setup(fake())
    await controller.hydrate({ seedDefaultProject: false })

    const created = await commands.ensureProjectForNewChat()
    expect(created.rootSource).toBe('auto')
    expect(created.localRoot).toMatch(/^\/virtual\/AgentWorkbench\//)
    expect(selected.id).toBe(created.id)

    const reused = await commands.ensureProjectForNewChat()
    expect(reused.id).toBe(created.id)
    expect(controller.getView().projects).toHaveLength(1)
  })

  it('no Host / no root fail-closed with Chinese errors', async () => {
    const { controller, commands } = setup(createUnavailableHostPort())
    await controller.hydrate({ seedDefaultProject: false })

    await expect(commands.openLocalFolder()).rejects.toBeInstanceOf(
      HostUnavailableError,
    )
    await expect(commands.createProject('x')).rejects.toMatchObject({
      message: expect.stringMatching(/桌面宿主/),
    })
    await expect(commands.ensureProjectForNewChat()).rejects.toBeInstanceOf(
      HostUnavailableError,
    )
    expect(commands.getCurrentRoot()).toBeNull()
  })

  it('assertWritableRuntime blocks while Host runtime is not ready', async () => {
    const host = fake({ pickResult: { path: '/Users/me/repo' } })
    const { controller, commands, selected } = setup(host)
    await controller.hydrate({ seedDefaultProject: false })
    const project = await controller.createProject('仓库', {
      localRoot: '/Users/me/repo',
      rootSource: 'opened',
    })
    selected.id = project.id
    host.setRuntimeStatus('starting')

    const gate = await commands.assertWritableRuntime()
    expect(gate.ok).toBe(false)
    if (gate.ok) throw new Error('expected blocked')
    expect(gate.message).toMatch(/尚未就绪/)

    host.setRuntimeStatus('ready')
    expect(await commands.assertWritableRuntime()).toEqual({ ok: true })
  })

  it('assertWritableRuntime blocks when Host is ready but sidecar root still mismatches', async () => {
    const host = fake()
    let liveRoot = '/Users/me/old-repo'
    const { controller, selected } = setup(host)
    const gated = createProjectLocalRootCommands({
      catalog: controller,
      host,
      getSelectedProjectId: () => selected.id,
      selectProject: (projectId) => {
        selected.id = projectId
      },
      fetchWorkspaceRoot: async () => liveRoot,
    })
    await controller.hydrate({ seedDefaultProject: false })
    const project = await controller.createProject('新仓库', {
      localRoot: '/Users/me/new-repo',
      rootSource: 'opened',
    })
    selected.id = project.id
    host.setRuntimeStatus('ready')

    const blocked = await gated.assertWritableRuntime()
    expect(blocked.ok).toBe(false)
    if (blocked.ok) throw new Error('expected blocked')
    expect(blocked.message).toMatch(/尚未就绪/)

    liveRoot = '/Users/me/new-repo/'
    expect(await gated.assertWritableRuntime()).toEqual({ ok: true })
  })

  it('ensureRuntimeForSelectedProject coalesces concurrent starts on the same root', async () => {
    const host = fake({ startDelayMs: 40 })
    const { controller, commands, selected } = setup(host)
    await controller.hydrate({ seedDefaultProject: false })
    const project = await controller.createProject('仓库', {
      localRoot: '/virtual/AgentWorkbench/仓库',
      rootSource: 'created',
    })
    selected.id = project.id
    host.setRuntimeStatus('stopped')

    await Promise.all([
      commands.ensureRuntimeForSelectedProject(),
      commands.ensureRuntimeForSelectedProject(),
    ])
    expect(
      host.calls.filter((call) => call.method === 'startRuntime'),
    ).toHaveLength(1)
  })

  it('ensureRuntimeForSelectedProject does not restart a ready runtime on the same root', async () => {
    const { controller, commands, host } = setup(fake())
    await controller.hydrate({ seedDefaultProject: false })
    await commands.createProject('仓库')
    const starts = host.calls.filter((call) => call.method === 'startRuntime')
    expect(starts.length).toBe(1)

    await commands.ensureRuntimeForSelectedProject()
    await commands.ensureRuntimeForSelectedProject()
    expect(
      host.calls.filter((call) => call.method === 'startRuntime'),
    ).toHaveLength(1)
  })

  it('waitForWritableRuntime joins an in-flight start instead of failing immediately', async () => {
    const host = fake({ startDelayMs: 80 })
    const { controller, commands, selected } = setup(host)
    await controller.hydrate({ seedDefaultProject: false })
    const project = await controller.createProject('仓库', {
      localRoot: '/virtual/AgentWorkbench/仓库',
      rootSource: 'created',
    })
    selected.id = project.id
    host.setRuntimeStatus('stopped')

    const starting = commands.ensureRuntimeForSelectedProject()
    const immediate = await commands.assertWritableRuntime()
    expect(immediate.ok).toBe(false)

    const waited = await commands.waitForWritableRuntime()
    expect(waited).toEqual({ ok: true })
    await starting
    expect(
      host.calls.filter((call) => call.method === 'startRuntime'),
    ).toHaveLength(1)
  })

  it('waitForWritableRuntime waits for the sidecar root to catch up', async () => {
    const host = fake()
    let liveRoot = '/virtual/old-repo'
    const { controller, selected } = setup(host)
    const gated = createProjectLocalRootCommands({
      catalog: controller,
      host,
      getSelectedProjectId: () => selected.id,
      selectProject: (projectId) => {
        selected.id = projectId
      },
      fetchWorkspaceRoot: async () => liveRoot,
    })
    await controller.hydrate({ seedDefaultProject: false })
    const project = await controller.createProject('新仓库', {
      localRoot: '/virtual/new-repo',
      rootSource: 'opened',
    })
    selected.id = project.id
    host.setRuntimeStatus('ready')
    window.setTimeout(() => {
      liveRoot = '/virtual/new-repo/'
    }, 40)

    const gate = await gated.waitForWritableRuntime({ timeoutMs: 500 })
    expect(gate).toEqual({ ok: true })
  })

  it('assertWritableRuntime allows writes on no-Host web degradation', async () => {
    const { controller, commands } = setup(createUnavailableHostPort())
    await controller.hydrate()
    const gate = await commands.assertWritableRuntime()
    expect(gate).toEqual({ ok: true })
  })

  it('listProjects filters by name', async () => {
    const { controller, commands } = setup(fake())
    await controller.hydrate({ seedDefaultProject: false })
    await commands.createProject('飞书项目')
    await commands.createProject('日历项目')
    const found = await commands.listProjects('飞书')
    expect(found.map((p) => p.name)).toEqual(['飞书项目'])
  })
})
