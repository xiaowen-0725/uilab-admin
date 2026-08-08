import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  deleteTaskCascade,
  getSessionPointer,
  openWorkbenchIdb,
  putSessionPointer,
  SESSION_ROW_ID,
  type SessionPointerRecord,
} from '@/app/persistence/workbench-idb'
import { launchActions } from '@/config/fixtures'
import {
  resolveRuntimeAdapterMode,
  resolveVoltAgentBaseUrl,
  resolveVoltAgentId,
} from '@/config/runtime-adapter'
import {
  createIdbProjectCatalog,
  createMemoryProjectCatalog,
  DEFAULT_PROJECT_ID,
  NEW_TASK_TITLE,
  ProjectCatalogController,
  useProjectCatalog,
  type ProjectSummary,
  type TaskSummary,
} from '@/modules/project'
import type {
  EventStorePort,
  LaunchAction,
  RuntimePort,
  TaskSurfaceView,
} from '@/modules/task'
import {
  createDeterministicFakeRuntime,
  createIdbEventStore,
  createMemoryEventStore,
  createRunStatusIndex,
  createVoltAgentRuntimeAdapter,
  isNavigatorBusyStatus,
  runtimeHonestyCopy,
  TaskRuntimeController,
  useTaskRuntime,
  VirtualClock,
} from '@/modules/task'
import {
  useWorkbenchSession,
  type WorkbenchSessionSeed,
} from '@/modules/workbench-session'
import {
  createSurfaceRegistry,
  createTestSurfaceDefinition,
  type SurfaceRegistry,
} from '@/modules/work-surface'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'

/**
 * Composition Root — Project catalog + session pointers + Runtime Task path.
 *
 * Product default:
 * - IndexedDB (or Memory in tests) catalog + EventStore
 * - Cold start: project-default /「默认项目」+ zero tasks
 * - New chat → catalog「新对话」→ Runtime empty hub
 * - Capture/local-sim is NOT product default (harness/dev only)
 */

const RUNTIME_ADAPTER_MODE = resolveRuntimeAdapterMode()

const INSTANT_DEMO =
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITEST === true ||
  import.meta.env.VITEST === 'true'

export type WorkbenchPersistence = 'idb' | 'memory'

export interface WorkbenchAppProps {
  /**
   * Durable store backend.
   * Tests default to memory for isolation; product default is idb.
   */
  persistence?: WorkbenchPersistence
  /** Optional unique IDB name for parallel browser tests. */
  idbName?: string
}

const DEFAULT_SESSION_SEED: WorkbenchSessionSeed = {
  selectedProjectId: DEFAULT_PROJECT_ID,
  selectedTaskId: null,
}

/**
 * Composition-only Surface Registry assembly.
 * Host must never register; add Document/Browser registrations here later.
 */
function createWorkbenchSurfaceRegistry(): SurfaceRegistry {
  const registry = createSurfaceRegistry()
  registry.register(createTestSurfaceDefinition())
  return registry
}

function resolveDefaultPersistence(): WorkbenchPersistence {
  if (INSTANT_DEMO) return 'memory'
  return 'idb'
}

export function WorkbenchApp({
  persistence: persistenceProp,
  idbName,
}: WorkbenchAppProps = {}) {
  const persistence = persistenceProp ?? resolveDefaultPersistence()
  const session = useWorkbenchSession(DEFAULT_SESSION_SEED)
  const surfaceRegistry = useMemo(() => createWorkbenchSurfaceRegistry(), [])

  const [bootReady, setBootReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [db, setDb] = useState<IDBDatabase | null>(null)

  const catalogControllerRef = useRef<ProjectCatalogController | null>(null)
  const eventStoreRef = useRef<EventStorePort | null>(null)
  const runStatusIndexRef = useRef(createRunStatusIndex())
  const newTaskCounterRef = useRef(0)
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(
    null,
  )

  // --- Boot: open store + hydrate catalog ---
  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        if (persistence === 'memory') {
          const catalog = createMemoryProjectCatalog()
          const controller = new ProjectCatalogController(catalog)
          eventStoreRef.current = createMemoryEventStore()
          catalogControllerRef.current = controller
          await controller.hydrate()
          if (cancelled) return
          session.commands.hydratePointers({
            selectedProjectId: DEFAULT_PROJECT_ID,
            selectedTaskId: null,
          })
          setBootReady(true)
          return
        }

        const database = await openWorkbenchIdb(
          idbName ? { name: idbName } : undefined,
        )
        if (cancelled) {
          database.close()
          return
        }
        setDb(database)

        const catalog = createIdbProjectCatalog(database)
        const controller = new ProjectCatalogController(catalog)
        eventStoreRef.current = createIdbEventStore(database)
        catalogControllerRef.current = controller
        await controller.hydrate()
        if (cancelled) return

        const pointer = await getSessionPointer(database)
        const projects = controller.getView().projects
        const projectId =
          pointer?.selectedProjectId &&
          projects.some((p) => p.id === pointer.selectedProjectId)
            ? pointer.selectedProjectId
            : DEFAULT_PROJECT_ID

        controller.setFocusedProject(projectId)
        let selectedTaskId = pointer?.selectedTaskId ?? null
        if (selectedTaskId && !controller.getTaskRow(selectedTaskId)) {
          selectedTaskId = null
        }
        if (
          selectedTaskId &&
          controller.getTaskRow(selectedTaskId)?.projectId !== projectId
        ) {
          selectedTaskId = null
        }

        session.commands.hydratePointers({
          selectedProjectId: projectId,
          selectedTaskId,
          lastTaskByProject: pointer?.lastTaskByProject,
          navigatorOpen: pointer?.navigatorOpen,
        })
        setBootReady(true)
      } catch (err) {
        if (cancelled) return
        setBootError(
          err instanceof Error ? err.message : '无法初始化本地存储',
        )
        // Degrade to memory so the shell still opens (D14 honesty).
        const catalog = createMemoryProjectCatalog()
        const controller = new ProjectCatalogController(catalog)
        eventStoreRef.current = createMemoryEventStore()
        catalogControllerRef.current = controller
        await controller.hydrate()
        session.commands.hydratePointers({
          selectedProjectId: DEFAULT_PROJECT_ID,
          selectedTaskId: null,
        })
        setBootReady(true)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
    // Intentionally once on mount for boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistence, idbName])

  // Re-bind catalog hook after async boot assigns the controller.
  const [catalogController, setCatalogController] =
    useState<ProjectCatalogController | null>(null)
  useEffect(() => {
    if (bootReady) {
      setCatalogController(catalogControllerRef.current)
    }
  }, [bootReady])

  const catalogView = useProjectCatalog(catalogController)
  const projectId = session.view.selectedProjectId

  // Keep catalog focused on selected project.
  useEffect(() => {
    catalogControllerRef.current?.setFocusedProject(projectId)
  }, [projectId, catalogView.ready])

  const currentProject: ProjectSummary | null =
    catalogView.projects.find((p) => p.id === projectId) ??
    catalogView.projects[0] ??
    null

  const tasks: TaskSummary[] = catalogView.tasks

  const taskId = session.view.selectedTaskId
  const selectedTaskRow = taskId
    ? (catalogControllerRef.current?.getTaskRow(taskId) ?? null)
    : null

  const fakeRuntimeRef = useRef(
    createDeterministicFakeRuntime({
      seed: 'workbench',
      clock: new VirtualClock({ startMs: Date.now() }),
      stepMs: INSTANT_DEMO ? 0 : 48,
      keywordScenarios: true,
      buildOutputDeltas: (inputText) => {
        const prompt = inputText.trim() || '（空输入）'
        const short =
          prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt
        return [
          `已收到你的消息：\n\n`,
          `> ${short}\n\n`,
          `## 本轮说明\n\n`,
          `这是 **Deterministic Fake Runtime** 的本地**流式**投影（非远程 Agent）。\n\n`,
          `### 已接通链路\n\n`,
          `1. Composer → \`submitTurn\`\n`,
          `2. Fake 按 stepMs 发出事件\n`,
          `3. 纯函数投影 → Timeline\n\n`,
          `试关键词：「工具」「审批」「澄清」「长文」「失败」。\n`,
        ]
      },
    }),
  )
  const voltRuntimeRef = useRef(
    createVoltAgentRuntimeAdapter({
      baseUrl: resolveVoltAgentBaseUrl(),
      agentId: resolveVoltAgentId(),
      projectId: DEFAULT_PROJECT_ID,
    }),
  )
  const runtimePort: RuntimePort =
    RUNTIME_ADAPTER_MODE === 'voltagent'
      ? voltRuntimeRef.current
      : fakeRuntimeRef.current

  const honestyMode: 'fake' | 'voltagent' =
    RUNTIME_ADAPTER_MODE === 'voltagent' ? 'voltagent' : 'fake'

  const controllerRef = useRef<TaskRuntimeController | null>(null)
  if (controllerRef.current == null && eventStoreRef.current) {
    controllerRef.current = new TaskRuntimeController({
      runtime: runtimePort,
      projectId,
      eventStore: eventStoreRef.current,
      seed: 'workbench',
      honestyMode,
      eventStoreKind: persistence === 'idb' ? 'idb' : 'memory',
      autoFlush: INSTANT_DEMO && RUNTIME_ADAPTER_MODE === 'fake',
    })
    controllerRef.current.setRunStatusListener((id, status) => {
      runStatusIndexRef.current.set(id, status)
    })
  }

  // Ensure controller exists after boot when store was async.
  useEffect(() => {
    if (!bootReady || !eventStoreRef.current) return
    if (controllerRef.current == null) {
      controllerRef.current = new TaskRuntimeController({
        runtime: runtimePort,
        projectId,
        eventStore: eventStoreRef.current,
        seed: 'workbench',
        honestyMode,
        eventStoreKind: persistence === 'idb' ? 'idb' : 'memory',
        autoFlush: INSTANT_DEMO && RUNTIME_ADAPTER_MODE === 'fake',
      })
      controllerRef.current.setRunStatusListener((id, status) => {
        runStatusIndexRef.current.set(id, status)
      })
    }
  }, [bootReady, honestyMode, persistence, projectId, runtimePort])

  useEffect(() => {
    controllerRef.current?.setProjectId(projectId)
  }, [projectId])

  const isRuntimePath = Boolean(taskId)
  const runtime = useTaskRuntime(
    controllerRef.current,
    taskId ?? '',
    {
      enabled: isRuntimePath && bootReady && Boolean(controllerRef.current),
      title: selectedTaskRow?.title ?? NEW_TASK_TITLE,
    },
  )

  // Wall-clock drive for Fake streaming (interactive demo only).
  useEffect(() => {
    if (RUNTIME_ADAPTER_MODE !== 'fake') return
    if (INSTANT_DEMO || !isRuntimePath) {
      fakeRuntimeRef.current.clock.stopRealtime()
      return
    }
    fakeRuntimeRef.current.clock.startRealtime({ intervalMs: 32, scale: 1 })
    return () => {
      fakeRuntimeRef.current.clock.stopRealtime()
    }
  }, [isRuntimePath])

  // Persist session pointers when they change (IDB product path).
  useEffect(() => {
    if (!bootReady || persistence !== 'idb' || !db) return
    const record: SessionPointerRecord = {
      id: SESSION_ROW_ID,
      selectedProjectId: session.view.selectedProjectId,
      selectedTaskId: session.view.selectedTaskId,
      lastTaskByProject: session.view.lastTaskByProject,
      navigatorOpen: session.view.navigatorOpen,
      updatedAt: new Date().toISOString(),
    }
    void putSessionPointer(db, record).catch(() => {
      // Non-fatal; catalog is still durable.
    })
  }, [
    bootReady,
    db,
    persistence,
    session.view.selectedProjectId,
    session.view.selectedTaskId,
    session.view.lastTaskByProject,
    session.view.navigatorOpen,
  ])

  // Title write-back from Runtime → catalog.
  useEffect(() => {
    if (!isRuntimePath || !taskId) return
    const title = runtime.readModel.title.trim()
    if (!title || title === selectedTaskRow?.title) return
    void catalogControllerRef.current?.renameTask(taskId, title, 'runtime')
  }, [
    isRuntimePath,
    runtime.readModel.title,
    selectedTaskRow?.title,
    taskId,
  ])

  const runStatusIndex = runStatusIndexRef.current
  const busyRevision = useSyncExternalStore(
    (cb) => runStatusIndex.subscribe(cb),
    () => runStatusIndex.getRevision(),
    () => runStatusIndex.getRevision(),
  )
  const busyTaskIds = useMemo(() => {
    const base = runStatusIndex.getBusyTaskIds()
    if (taskId && isNavigatorBusyStatus(runtime.runStatus)) {
      if (base.has(taskId)) return base
      const set = new Set(base)
      set.add(taskId)
      return set
    }
    return base
    // busyRevision invalidates when index mutates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busyRevision, runtime.runStatus, taskId, runStatusIndex])

  const hasRuntimeTimeline = runtime.readModel.timeline.length > 0
  const mode =
    isRuntimePath && hasRuntimeTimeline
      ? ('runtime' as const)
      : ('empty' as const)

  const displayTitle =
    isRuntimePath && runtime.readModel.title
      ? runtime.readModel.title
      : (selectedTaskRow?.title ?? '还没有对话')

  const taskView: TaskSurfaceView | null = useMemo(() => {
    if (!taskId) return null
    return {
      taskId,
      title: displayTitle,
      projectName: currentProject?.name ?? '默认项目',
      mode,
      stream: null,
      streamPlaying: false,
      readModel: isRuntimePath ? runtime.readModel : null,
      launchActions,
      contextSections: runtimeContext(honestyMode),
      contextPanelOpen: session.view.layout.contextPanelOpen,
    }
  }, [
    taskId,
    displayTitle,
    currentProject?.name,
    mode,
    isRuntimePath,
    runtime.readModel,
    honestyMode,
    session.view.layout.contextPanelOpen,
  ])

  const composerRuntime = useMemo(
    () =>
      isRuntimePath
        ? {
            mode: 'runtime' as const,
            honestyMode,
            modelLabel:
              honestyMode === 'voltagent' ? '本地侧车模型' : 'Fake Runtime',
            runStatus: runtime.runStatus,
            onSubmitText: runtime.submitText,
            onCancelRun: runtime.cancelActiveRun,
            runtimeNotice:
              bootError && persistence === 'idb'
                ? `${runtime.notice ?? ''} · 本地存储降级：${bootError}`.trim()
                : runtime.notice,
            onApprove: (requestId: string) =>
              runtime.respondToApproval(requestId, 'approved'),
            onReject: (requestId: string) =>
              runtime.respondToApproval(requestId, 'rejected'),
            onProvideInput: (requestId: string, text: string) =>
              runtime.provideRunInput(text, requestId),
            onRetryTurn: () => runtime.retryTurn(),
            onFollowModeChange: runtime.setFollowMode,
          }
        : undefined,
    [
      isRuntimePath,
      honestyMode,
      runtime.runStatus,
      runtime.submitText,
      runtime.cancelActiveRun,
      runtime.notice,
      runtime.respondToApproval,
      runtime.provideRunInput,
      runtime.retryTurn,
      runtime.setFollowMode,
      bootError,
      persistence,
    ],
  )

  /** Launch cards → Runtime prompt (product path; no force capture). */
  const onLaunchAction = useCallback(
    (action: LaunchAction) => {
      if (!taskId || !action.promptStub) return
      void runtime.submitText(action.promptStub)
    },
    [runtime, taskId],
  )

  const onNewChat = useCallback(async () => {
    const controller = catalogControllerRef.current
    if (!controller) return
    newTaskCounterRef.current += 1
    const newTaskId = `task-${Date.now().toString(36)}-${newTaskCounterRef.current}`
    const row = await controller.createTask({
      projectId: session.view.selectedProjectId,
      taskId: newTaskId,
      title: NEW_TASK_TITLE,
    })
    session.commands.ensureTaskLayout(row.id)
    session.commands.selectTask(row.id)
  }, [session.commands, session.view.selectedProjectId])

  const onSelectProject = useCallback(
    (nextProjectId: string) => {
      catalogControllerRef.current?.setFocusedProject(nextProjectId)
      session.commands.selectProject(nextProjectId)
    },
    [session.commands],
  )

  const performDeleteTask = useCallback(
    async (deleteTaskId: string) => {
      const controller = catalogControllerRef.current
      if (!controller) return

      // Best-effort cancel if active (2–5s timeout per spec §6).
      const status = runStatusIndexRef.current.get(deleteTaskId)
      if (
        taskId === deleteTaskId &&
        controllerRef.current &&
        isNavigatorBusyStatus(status ?? runtime.runStatus)
      ) {
        try {
          await Promise.race([
            controllerRef.current.cancelActiveRun(),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ])
        } catch {
          // continue hard delete
        }
      }

      if (taskId === deleteTaskId) {
        controllerRef.current?.detach()
      }

      const projectTasks = controller.listTasksInProject(
        session.view.selectedProjectId,
      )
      const remaining = projectTasks.filter((t) => t.id !== deleteTaskId)
      const nextSelected =
        remaining.length > 0
          ? remaining.sort((a, b) =>
              a.updatedAt < b.updatedAt ? 1 : -1,
            )[0]!.id
          : null

      const lastTaskByProject = {
        ...session.view.lastTaskByProject,
        [session.view.selectedProjectId]: nextSelected,
      }

      if (persistence === 'idb' && db) {
        try {
          await deleteTaskCascade(db, {
            taskId: deleteTaskId,
            nextSelectedTaskId:
              session.view.selectedTaskId === deleteTaskId
                ? nextSelected
                : session.view.selectedTaskId,
            selectedProjectId: session.view.selectedProjectId,
            lastTaskByProject,
            navigatorOpen: session.view.navigatorOpen,
          })
          // Event data already removed in cascade TX; forget catalog row locally.
          controller.forgetTaskLocally(deleteTaskId)
        } catch {
          // Fallback: sequential best-effort
          await eventStoreRef.current?.deleteTaskData(deleteTaskId)
          await controller.deleteTaskRow(deleteTaskId)
        }
      } else {
        await eventStoreRef.current?.deleteTaskData(deleteTaskId)
        await controller.deleteTaskRow(deleteTaskId)
      }

      runStatusIndexRef.current.clear(deleteTaskId)
      session.commands.removeTaskLayout(deleteTaskId)

      if (session.view.selectedTaskId === deleteTaskId) {
        session.commands.selectTask(nextSelected)
      }
      setDeleteConfirmTaskId(null)
    },
    [
      db,
      persistence,
      runtime.runStatus,
      session.commands,
      session.view.lastTaskByProject,
      session.view.navigatorOpen,
      session.view.selectedProjectId,
      session.view.selectedTaskId,
      taskId,
    ],
  )

  const onDeleteTask = useCallback((id: string) => {
    setDeleteConfirmTaskId(id)
  }, [])

  if (!bootReady) {
    return (
      <ThemeProvider>
        <div
          className='flex h-svh items-center justify-center text-sm text-muted-foreground'
          data-testid='workbench-booting'
        >
          正在加载工作台…
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <TooltipProvider delay={400}>
        <WorkbenchShell
          view={session.view}
          commands={session.commands}
          taskView={taskView}
          project={currentProject}
          projects={catalogView.projects}
          tasks={tasks}
          busyTaskIds={busyTaskIds}
          onLaunchAction={onLaunchAction}
          onNewChat={() => void onNewChat()}
          onDeleteTask={onDeleteTask}
          onSelectProject={onSelectProject}
          composerRuntime={composerRuntime}
          surfaceRegistry={surfaceRegistry}
        />
        {deleteConfirmTaskId ? (
          <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
            data-testid='delete-task-dialog'
            role='dialog'
            aria-modal='true'
            aria-labelledby='delete-task-title'
          >
            <div className='w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-lg'>
              <h2
                id='delete-task-title'
                className='text-sm font-semibold'
              >
                删除对话？
              </h2>
              <p className='mt-2 text-sm text-muted-foreground'>
                将永久删除此对话及其本地事件记录，无法恢复。
              </p>
              <div className='mt-4 flex justify-end gap-2'>
                <button
                  type='button'
                  className='rounded-md px-3 py-1.5 text-sm hover:bg-muted'
                  data-testid='delete-task-cancel'
                  onClick={() => setDeleteConfirmTaskId(null)}
                >
                  取消
                </button>
                <button
                  type='button'
                  className='rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:opacity-90'
                  data-testid='delete-task-confirm'
                  onClick={() => void performDeleteTask(deleteConfirmTaskId)}
                >
                  永久删除
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </TooltipProvider>
    </ThemeProvider>
  )
}

function runtimeContext(mode: 'fake' | 'voltagent') {
  const honesty = runtimeHonestyCopy(mode)
  return [
    {
      id: 'env',
      title: '环境',
      items: honesty.contextItems,
    },
  ]
}
