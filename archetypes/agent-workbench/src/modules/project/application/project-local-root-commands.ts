/**
 * Project local-root command face — the Spec-α main seam.
 * Shell / Composition consume this; HostPort + Catalog are injected.
 */

import type { ProjectCatalogController } from './project-catalog-controller'
import {
  basenameOfRoot,
  normalizeLocalRoot,
} from './local-root-path'
import type { HostPort } from '../ports/host-port'
import { HostUnavailableError } from '../ports/host-port'
import {
  DEFAULT_PROJECT_ID,
  isSpecifiedWorkProject,
  type ProjectId,
  type ProjectRecord,
  type ProjectSummary,
} from '../model/types'

export type OpenFolderResult =
  | { kind: 'canceled' }
  | { kind: 'opened'; project: ProjectRecord }
  | { kind: 'reused'; project: ProjectRecord }

export type WritableRuntimeGate =
  | { ok: true }
  | { ok: false; message: string }

export interface ProjectLocalRootCommands {
  listProjects(query?: string): Promise<readonly ProjectSummary[]>
  openLocalFolder(): Promise<OpenFolderResult>
  createProject(name?: string): Promise<ProjectRecord>
  ensureProjectForNewChat(): Promise<ProjectRecord>
  /** Leave a specified work project; reuse or create the unspecified auto/default. */
  useUnspecifiedProject(): Promise<ProjectRecord>
  getCurrentRoot(): { projectId: string; localRoot: string } | null
  /**
   * Start the sidecar for the selected project if needed.
   * Skips when Host already reports ready on the same root.
   */
  ensureRuntimeForSelectedProject(): Promise<void>
  assertWritableRuntime(): Promise<WritableRuntimeGate>
  /**
   * Join an in-flight start, then poll until the selected root is writable.
   * Use this on send — snapshot assert is too eager during project switch.
   */
  waitForWritableRuntime(options?: {
    timeoutMs?: number
  }): Promise<WritableRuntimeGate>
}

export interface ProjectLocalRootCommandDeps {
  catalog: ProjectCatalogController
  host: HostPort
  getSelectedProjectId: () => ProjectId | null
  selectProject: (projectId: ProjectId) => void
  /**
   * Live sidecar workspace root (GET /workspace/info).
   * Composition injects this so Project Module does not import work-surface internals.
   * Used to close the selectProject → startRuntime IPC race.
   */
  fetchWorkspaceRoot?: () => Promise<string | null>
  /** Background startRuntime failures; must not block catalog selection. */
  onRuntimeError?: (err: unknown) => void
}

const NO_ROOT_WRITE_MESSAGE =
  '当前没有可用的项目根目录，无法写入文件'
const RUNTIME_NOT_READY_MESSAGE =
  '运行时尚未就绪，请等待项目工作根切换完成后再发送'

export function createProjectLocalRootCommands(
  deps: ProjectLocalRootCommandDeps,
): ProjectLocalRootCommands {
  function findByRoot(localRoot: string): ProjectRecord | null {
    const view = deps.catalog.getView()
    for (const summary of view.projects) {
      const record = deps.catalog.getProjectRecord(summary.id)
      if (record?.localRoot === localRoot) return record
    }
    return null
  }

  function currentRoot(): { projectId: string; localRoot: string } | null {
    const selectedId = deps.getSelectedProjectId()
    if (!selectedId) return null
    const record = deps.catalog.getProjectRecord(selectedId)
    if (!record?.localRoot) return null
    return { projectId: record.id, localRoot: record.localRoot }
  }

  let runtimeStart: Promise<void> | null = null
  let runtimeStartRoot: string | null = null

  async function isLiveRoot(root: string): Promise<'match' | 'mismatch' | 'unknown'> {
    if (!deps.fetchWorkspaceRoot) return 'unknown'
    const live = await deps.fetchWorkspaceRoot()
    if (!live) return 'unknown'
    try {
      return normalizeLocalRoot(live) === root ? 'match' : 'mismatch'
    } catch {
      return 'unknown'
    }
  }

  async function ensureRuntime(
    localRoot: string | null | undefined,
  ): Promise<void> {
    if (!deps.host.isAvailable() || !localRoot) return
    const root = normalizeLocalRoot(localRoot)
    if (runtimeStart && runtimeStartRoot === root) {
      return runtimeStart
    }

    // Assign in-flight before any await so overlapping callers join
    // instead of issuing a second startRuntime (which kills the sidecar).
    const work = (async () => {
      const status = await deps.host.getRuntimeStatus()
      if (status === 'ready') {
        const live = await isLiveRoot(root)
        if (live === 'match' || live === 'unknown') return
      }
      await deps.host.startRuntime(root)
    })()
    runtimeStartRoot = root
    runtimeStart = work.finally(() => {
      if (runtimeStartRoot === root) {
        runtimeStart = null
        runtimeStartRoot = null
      }
    })
    return runtimeStart
  }

  function startRuntimeInBackground(localRoot: string | null | undefined): void {
    void ensureRuntime(localRoot).catch((err) => {
      deps.onRuntimeError?.(err)
    })
  }

  async function activate(project: ProjectRecord): Promise<void> {
    deps.catalog.setFocusedProject(project.id)
    deps.selectProject(project.id)
    startRuntimeInBackground(project.localRoot)
  }

  function findUnspecifiedProject(): ProjectRecord | null {
    const records = deps.catalog
      .getView()
      .projects
      .map((summary) => deps.catalog.getProjectRecord(summary.id))
      .filter(
        (row): row is ProjectRecord =>
          row != null && !isSpecifiedWorkProject(row),
      )
    return (
      records.find((row) => row.id === DEFAULT_PROJECT_ID) ??
      records.find((row) => row.rootSource === 'auto') ??
      records[0] ??
      null
    )
  }

  async function createAutoProject(): Promise<ProjectRecord> {
    if (!deps.host.isAvailable()) {
      throw new HostUnavailableError()
    }
    await deps.host.ensureProjectsHome()
    const localRoot = await deps.host.createProjectDirectory('项目')
    const project = await deps.catalog.createProject(
      basenameOfRoot(localRoot),
      {
        localRoot,
        rootSource: 'auto',
      },
    )
    await activate(project)
    return project
  }

  return {
    async listProjects(query?: string) {
      const projects = deps.catalog.getView().projects
      const q = query?.trim().toLowerCase()
      if (!q) return projects
      return projects.filter((project) =>
        project.name.toLowerCase().includes(q),
      )
    },

    async openLocalFolder() {
      if (!deps.host.isAvailable()) {
        throw new HostUnavailableError()
      }
      const picked = await deps.host.pickDirectory()
      if ('canceled' in picked) {
        return { kind: 'canceled' }
      }
      const localRoot = normalizeLocalRoot(picked.path)
      const existing = findByRoot(localRoot)
      if (existing) {
        await activate(existing)
        return { kind: 'reused', project: existing }
      }
      const project = await deps.catalog.createProject(basenameOfRoot(localRoot), {
        localRoot,
        rootSource: 'opened',
      })
      await activate(project)
      return { kind: 'opened', project }
    },

    async createProject(name?: string) {
      if (!deps.host.isAvailable()) {
        throw new HostUnavailableError()
      }
      await deps.host.ensureProjectsHome()
      const preferred = name?.trim() || '未命名项目'
      const localRoot = await deps.host.createProjectDirectory(preferred)
      const project = await deps.catalog.createProject(
        basenameOfRoot(localRoot),
        {
          localRoot,
          rootSource: 'created',
        },
      )
      await activate(project)
      return project
    },

    async ensureProjectForNewChat() {
      const selectedId = deps.getSelectedProjectId()
      if (selectedId) {
        const existing = deps.catalog.getProjectRecord(selectedId)
        if (existing) {
          startRuntimeInBackground(existing.localRoot)
          return existing
        }
      }
      const unspecified = findUnspecifiedProject()
      if (unspecified) {
        await activate(unspecified)
        return unspecified
      }
      return createAutoProject()
    },

    async useUnspecifiedProject() {
      const unspecified = findUnspecifiedProject()
      if (unspecified) {
        await activate(unspecified)
        return unspecified
      }
      return createAutoProject()
    },

    getCurrentRoot() {
      return currentRoot()
    },

    async ensureRuntimeForSelectedProject() {
      await ensureRuntime(currentRoot()?.localRoot)
    },

    async assertWritableRuntime() {
      return snapshotWritableRuntime()
    },

    async waitForWritableRuntime(options?: { timeoutMs?: number }) {
      if (!deps.host.isAvailable()) {
        return { ok: true }
      }
      const root = currentRoot()
      if (!root) {
        return { ok: false, message: NO_ROOT_WRITE_MESSAGE }
      }
      try {
        await ensureRuntime(root.localRoot)
      } catch {
        return { ok: false, message: RUNTIME_NOT_READY_MESSAGE }
      }

      const timeoutMs = options?.timeoutMs ?? 8_000
      const startedAt = Date.now()
      let snapshot = await snapshotWritableRuntime()
      while (!snapshot.ok && Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        snapshot = await snapshotWritableRuntime()
      }
      return snapshot
    },
  }

  async function snapshotWritableRuntime(): Promise<WritableRuntimeGate> {
    if (!deps.host.isAvailable()) {
      // Web / test 降级：侧车由开发者独立启动，不由 Host 管生命周期。
      return { ok: true }
    }
    const root = currentRoot()
    if (!root) {
      return { ok: false, message: NO_ROOT_WRITE_MESSAGE }
    }
    const status = await deps.host.getRuntimeStatus()
    if (status !== 'ready') {
      return { ok: false, message: RUNTIME_NOT_READY_MESSAGE }
    }
    if (deps.fetchWorkspaceRoot) {
      const live = await deps.fetchWorkspaceRoot()
      if (!live) {
        return { ok: false, message: RUNTIME_NOT_READY_MESSAGE }
      }
      try {
        if (normalizeLocalRoot(live) !== normalizeLocalRoot(root.localRoot)) {
          return { ok: false, message: RUNTIME_NOT_READY_MESSAGE }
        }
      } catch {
        return { ok: false, message: RUNTIME_NOT_READY_MESSAGE }
      }
    }
    return { ok: true }
  }
}
