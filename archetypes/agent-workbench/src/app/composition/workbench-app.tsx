/**
 * Composition Root — product wiring only.
 *
 * Boot / Runtime / Task lifecycle / Surface open channels live in sibling units.
 * This file assembles them into Shell + thin chrome (boot screen, delete dialog).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type BoardContentPort,
  type BoardJobRuntimePort,
  type BoardStorePort,
} from '@/modules/board'
import {
  putSessionPointer,
  SESSION_ROW_ID,
  type SessionPointerRecord,
} from '@/app/persistence/workbench-idb'
import { launchActions } from '@/config/fixtures'
import { resolveVoltAgentBaseUrl } from '@/config/runtime-adapter'
import {
  buildNavigatorTaskRail,
  createProjectLocalRootCommands,
  createWorkbenchHostPort,
  DEFAULT_PROJECT_ID,
  isBlankDraftTask,
  isSpecifiedWorkProject,
  NEW_TASK_TITLE,
  type HostPort,
  type ProjectSummary,
  useProjectCatalog,
} from '@/modules/project'
import type { LaunchAction, TaskSurfaceView } from '@/modules/task'
import { useTaskRuntime } from '@/modules/task'
import { useWorkspaceDocumentSource, fetchWorkspaceHint } from '@/modules/work-surface'
import {
  useWorkbenchSession,
  type WorkbenchSessionSeed,
} from '@/modules/workbench-session'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useWorkbenchBoardWiring } from './board-wiring'
import { DeleteProjectConfirmDialog } from './delete-project-confirm-dialog'
import { DeleteTaskConfirmDialog } from './delete-task-confirm-dialog'
import { useBusyTaskIds, useWorkbenchRuntimeWiring } from './runtime-wiring'
import {
  openWorkSurfaceFromRuntimePayload,
  useWorkbenchSurfaceAssembly,
} from './surface-assembly'
import {
  createNewChatTask,
  decideNewChat,
  hardDeleteTask,
  removeProjectFromList,
} from './task-lifecycle-commands'
import { useWorkbenchBoot, type WorkbenchPersistence } from './workbench-boot'

const INSTANT_DEMO =
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITEST === true ||
  import.meta.env.VITEST === 'true'

export type { WorkbenchPersistence }

export interface WorkbenchAppProps {
  /**
   * Durable store backend.
   * Tests default to memory for isolation; product default is idb.
   */
  persistence?: WorkbenchPersistence
  /** Optional unique IDB name for parallel browser tests. */
  idbName?: string
  /** Optional HostPort injection (tests). Product path uses Electron 桥 or unavailable. */
  hostPort?: HostPort
  /** Optional Board store injection (tests). */
  boardStore?: BoardStorePort
  /** Optional staging content port (tests). */
  boardContent?: BoardContentPort
  /** Optional job runtime (tests inject a first-run fake). */
  boardJobRuntime?: BoardJobRuntimePort
}

const DEFAULT_SESSION_SEED: WorkbenchSessionSeed = {
  selectedProjectId: null,
  selectedTaskId: null,
}

function resolveDefaultPersistence(): WorkbenchPersistence {
  if (INSTANT_DEMO) return 'memory'
  return 'idb'
}

/** Runtime context chips are empty in product chrome (data-honesty-mode / a11y only). */
function runtimeContext(): [] {
  return []
}

function actionErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : ''
  const nested = raw
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
    .trim()
  const text = nested || raw
  if (/侧车启动超时|工作根尚未就绪|startRuntime/i.test(text)) {
    return '项目工作根切换超时，请稍后重试'
  }
  return text || fallback
}

export function WorkbenchApp({
  persistence: persistenceProp,
  idbName,
  hostPort: hostPortProp,
  boardStore: boardStoreProp,
  boardContent: boardContentProp,
  boardJobRuntime: boardJobRuntimeProp,
}: WorkbenchAppProps = {}) {
  const persistence = persistenceProp ?? resolveDefaultPersistence()
  const session = useWorkbenchSession(DEFAULT_SESSION_SEED)
  const hostPort = useMemo(
    () => hostPortProp ?? createWorkbenchHostPort(),
    [hostPortProp],
  )
  const hostAvailable = hostPort.isAvailable()
  const localRootRef = useRef<ReturnType<
    typeof createProjectLocalRootCommands
  > | null>(null)
  const [projectActionError, setProjectActionError] = useState<string | null>(
    null
  )
  const setProjectActionErrorRef = useRef(setProjectActionError)
  setProjectActionErrorRef.current = setProjectActionError

  // --- Boot ---
  const boot = useWorkbenchBoot({
    persistence,
    idbName,
    hostAvailable,
    onHydratePointers: session.commands.hydratePointers,
  })
  const {
    ready: bootReady,
    error: bootError,
    db,
    catalogController,
    eventStore,
  } = boot

  const board = useWorkbenchBoardWiring({
    db,
    selectedTaskId: session.view.selectedTaskId,
    closeWorkSurfaceTab: session.commands.closeWorkSurfaceTab,
    boardStore: boardStoreProp,
    boardContent: boardContentProp,
    boardJobRuntime: boardJobRuntimeProp,
  })
  const { boardOpenerRef } = board

  // --- Catalog + selection ---
  const catalogView = useProjectCatalog(catalogController)
  const projectId = session.view.selectedProjectId

  // --- Document source (module-owned bind UI) ---
  const documentSource = useWorkspaceDocumentSource({
    runtimeMode: 'voltagent',
    voltAgentBaseUrl: resolveVoltAgentBaseUrl(),
    preferredHint:
      catalogController?.getProjectRecord(projectId ?? '')?.localRoot ?? null,
  })

  useEffect(() => {
    catalogController?.setFocusedProject(projectId)
  }, [catalogController, projectId, catalogView.ready])

  const currentProject: ProjectSummary | null =
    catalogView.projects.find((p) => p.id === projectId) ?? null

  const taskRail = useMemo(() => {
    if (!catalogController) {
      return { looseTasks: [], projectGroups: [] }
    }
    return buildNavigatorTaskRail({
      projects: catalogView.projects,
      getRecord: (id) => catalogController.getProjectRecord(id),
      listTasks: (id) => catalogController.listTasksInProject(id),
    })
  }, [catalogController, catalogView.projects, catalogView.tasks])

  const taskId = session.view.selectedTaskId
  const selectedTaskRow = taskId
    ? (catalogController?.getTaskRow(taskId) ?? null)
    : null

  // --- Runtime wiring ---
  const runtimeWiring = useWorkbenchRuntimeWiring({
    eventStore,
    projectId: projectId ?? DEFAULT_PROJECT_ID,
    persistence,
    bootReady,
    clientToolExecutor: board.executor,
  })
  const {
    controller: runtimeController,
    runStatusIndex,
    capabilityController,
  } = runtimeWiring

  const isRuntimePath = Boolean(taskId)
  const runtime = useTaskRuntime(runtimeController, taskId ?? '', {
    enabled: isRuntimePath && bootReady && Boolean(runtimeController),
    title: selectedTaskRow?.title ?? NEW_TASK_TITLE,
  })

  // Busy projection lives in runtime-wiring (after live runStatus is known).
  const busyTaskIds = useBusyTaskIds(runStatusIndex, taskId, runtime.turnStatus)

  // --- Surface registry + open channels ---
  const hasOpenWorkTabs = session.view.layout.openTabs.length > 0
  const surface = useWorkbenchSurfaceAssembly({
    documentSource,
    hasOpenWorkTabs,
    sessionCommands: session.commands,
    runtimeController,
    selectedTaskId: taskId,
    bootReady,
    board: board.surface,
  })
  board.attachPreviewOpener((boardId, title) => {
    openWorkSurfaceFromRuntimePayload(
      surface.surfaceRegistry,
      session.commands.openWorkSurfaceTab,
      {
        kind: 'board',
        resourceKey: boardId,
        title,
        focus: 'pane',
      },
    )
  })

  // Persist session pointers (IDB product path).
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
    void catalogController?.renameTask(taskId, title, 'runtime')
  }, [
    catalogController,
    isRuntimePath,
    runtime.readModel.title,
    selectedTaskRow?.title,
    taskId,
  ])

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
      projectName: currentProject?.name ?? '未选择项目',
      mode,
      readModel: isRuntimePath ? runtime.readModel : null,
      launchActions,
      contextSections: runtimeContext(),
      contextPanelOpen: session.view.layout.contextPanelOpen,
    }
  }, [
    taskId,
    displayTitle,
    currentProject?.name,
    mode,
    isRuntimePath,
    runtime.readModel,
    session.view.layout.contextPanelOpen,
  ])

  const composerRuntime = useMemo(
    () =>
      isRuntimePath
        ? {
            mode: 'runtime' as const,
            modelLabel: '本地侧车模型',
            turnStatus: runtime.turnStatus,
            onSubmitText: async (
              text: string,
              composerContext?: Parameters<typeof runtime.submitText>[1],
            ) => {
              const gate = await localRootRef.current?.waitForWritableRuntime()
              if (gate && !gate.ok) {
                setProjectActionError(gate.message)
                return null
              }
              setProjectActionError(null)
              const featureIds = await board.resolveFeatureIds(taskId)
              return runtime.submitText(text, {
                ...composerContext,
                featureIds,
              })
            },
            onCancelRun: runtime.cancelActiveRun,
            runtimeNotice: [
              runtime.notice,
              bootError && persistence === 'idb'
                ? `本地存储降级：${bootError}`
                : null,
              projectActionError,
            ]
              .filter(Boolean)
              .join(' · ') || null,
            onApprove: (requestId: string, reason?: string) =>
              runtime.respondToApproval(requestId, 'approved', reason),
            onReject: (requestId: string) =>
              runtime.respondToApproval(requestId, 'rejected'),
            onProvideInput: (requestId: string, text: string) =>
              runtime.provideRunInput(text, requestId),
            onRespondToQuestion: runtime.respondToQuestion,
            onRetryTurn: () => runtime.retryTurn(),
            onFollowModeChange: runtime.setFollowMode,
            capabilityController,
            capabilityTaskId: taskId,
          }
        : undefined,
    [
      board,
      isRuntimePath,
      runtime.turnStatus,
      runtime.submitText,
      runtime.cancelActiveRun,
      runtime.notice,
      runtime.respondToApproval,
      runtime.provideRunInput,
      runtime.respondToQuestion,
      runtime.retryTurn,
      runtime.setFollowMode,
      bootError,
      persistence,
      capabilityController,
      taskId,
      projectActionError,
    ]
  )

  const onLaunchAction = useCallback(
    (action: LaunchAction) => {
      if (!taskId || !action.promptStub) return
      void (async () => {
        const gate = await localRootRef.current?.waitForWritableRuntime()
        if (gate && !gate.ok) {
          setProjectActionError(gate.message)
          return
        }
        const featureIds = await board.resolveFeatureIds(taskId)
        void runtime.submitText(action.promptStub, { featureIds })
      })()
    },
    [board, runtime, taskId]
  )

  // --- Task lifecycle commands ---
  const selectedTaskIdRef = useRef(session.view.selectedTaskId)
  selectedTaskIdRef.current = session.view.selectedTaskId
  const selectedProjectIdRef = useRef(session.view.selectedProjectId)
  selectedProjectIdRef.current = session.view.selectedProjectId
  const newTaskCounterRef = useRef(0)
  const openingDraftRef = useRef(false)
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(
    null
  )
  const [removeConfirmProjectId, setRemoveConfirmProjectId] = useState<
    string | null
  >(null)

  const bindSelectedProject = useCallback(
    (nextProjectId: string) => {
      catalogController?.setFocusedProject(nextProjectId)
      selectedProjectIdRef.current = nextProjectId

      const current = selectedTaskIdRef.current
        ? catalogController?.getTaskRow(selectedTaskIdRef.current)
        : null
      if (current?.projectId === nextProjectId) {
        session.commands.selectProject(nextProjectId, current.id)
        return
      }

      const inProject = catalogController?.listTasksInProject(nextProjectId) ?? []
      const blank = inProject.find(isBlankDraftTask)
      const remembered = session.view.lastTaskByProject[nextProjectId]
      const rememberedRow = remembered
        ? catalogController?.getTaskRow(remembered)
        : null
      const nextTaskId =
        blank?.id ??
        (rememberedRow?.projectId === nextProjectId ? rememberedRow.id : null) ??
        inProject[0]?.id ??
        null

      selectedTaskIdRef.current = nextTaskId
      session.commands.selectProject(nextProjectId, nextTaskId)
    },
    [
      catalogController,
      session.commands,
      session.view.lastTaskByProject,
    ],
  )

  const localRootCommands = useMemo(() => {
    if (!catalogController) return null
    return createProjectLocalRootCommands({
      catalog: catalogController,
      host: hostPort,
      getSelectedProjectId: () => selectedProjectIdRef.current,
      selectProject: bindSelectedProject,
      fetchWorkspaceRoot: () => fetchWorkspaceHint(resolveVoltAgentBaseUrl()),
      onRuntimeError: (err) => {
        setProjectActionErrorRef.current(
          actionErrorMessage(err, '无法切换项目运行时'),
        )
      },
    })
  }, [bindSelectedProject, catalogController, hostPort])
  localRootRef.current = localRootCommands

  const onNewChat = useCallback(
    async (options?: { grantBoard?: boolean }): Promise<string | null> => {
      if (!catalogController || !localRootCommands) return null
      if (openingDraftRef.current) return null
      openingDraftRef.current = true

      try {
        let project
        try {
          project = await localRootCommands.ensureProjectForNewChat()
        } catch (err) {
          setProjectActionError(actionErrorMessage(err, '无法准备项目'))
          return null
        }
        setProjectActionError(null)

        const selected = selectedTaskIdRef.current
          ? catalogController.getTaskRow(selectedTaskIdRef.current)
          : null
        const decision = decideNewChat({
          selectedProjectId: project.id,
          selectedTask: selected,
          blankDraftInProject:
            catalogController
              .listTasksInProject(project.id)
              .find(isBlankDraftTask) ?? null,
        })
        let taskId: string
        if (decision.kind === 'reselect') {
          taskId = decision.taskId
        } else {
          newTaskCounterRef.current += 1
          const row = await createNewChatTask({
            catalog: catalogController,
            projectId: project.id,
            sequence: newTaskCounterRef.current,
          })
          taskId = row.id
          session.commands.ensureTaskLayout(taskId)
        }
        if (options?.grantBoard) {
          await board.grantCapability(taskId)
        }
        session.commands.selectTask(taskId)
        return taskId
      } finally {
        openingDraftRef.current = false
      }
    },
    [board, catalogController, localRootCommands, session.commands],
  )

  const onCreateBoardChat = useCallback(async () => {
    await onNewChat({ grantBoard: true })
  }, [onNewChat])

  useEffect(() => {
    if (!bootReady || !localRootCommands || !catalogController) return
    if (session.view.selectedTaskId) return
    void onNewChat()
  }, [
    bootReady,
    catalogController,
    localRootCommands,
    onNewChat,
    session.view.selectedTaskId,
  ])

  const startRuntimeForSelected = useCallback(() => {
    void localRootCommands
      ?.ensureRuntimeForSelectedProject()
      .then(() => setProjectActionError(null))
      .catch((err: unknown) => {
        setProjectActionError(actionErrorMessage(err, '无法切换项目运行时'))
      })
  }, [localRootCommands])

  const onSelectProject = useCallback(
    (nextProjectId: string) => {
      bindSelectedProject(nextProjectId)
      startRuntimeForSelected()
      if (!selectedTaskIdRef.current) void onNewChat()
    },
    [bindSelectedProject, onNewChat, startRuntimeForSelected],
  )

  const onNewProjectChat = useCallback(
    (nextProjectId: string) => {
      bindSelectedProject(nextProjectId)
      startRuntimeForSelected()
      void onNewChat()
    },
    [bindSelectedProject, onNewChat, startRuntimeForSelected],
  )

  const onOpenLocalFolder = useCallback(async () => {
    if (!localRootCommands) return
    try {
      await localRootCommands.openLocalFolder()
      setProjectActionError(null)
    } catch (err) {
      setProjectActionError(actionErrorMessage(err, '无法打开本地文件夹'))
    }
  }, [localRootCommands])

  const onCreateProject = useCallback(async (name?: string) => {
    if (!localRootCommands) return
    try {
      await localRootCommands.createProject(name)
      setProjectActionError(null)
    } catch (err) {
      setProjectActionError(actionErrorMessage(err, '无法新建项目'))
    }
  }, [localRootCommands])

  const onClearProject = useCallback(async () => {
    if (!localRootCommands) return
    try {
      await localRootCommands.useUnspecifiedProject()
      setProjectActionError(null)
    } catch (err) {
      setProjectActionError(actionErrorMessage(err, '无法取消项目'))
      return
    }
    void onNewChat()
  }, [localRootCommands, onNewChat])

  const performDeleteTask = useCallback(
    async (deleteTaskId: string) => {
      if (!catalogController || !session.view.selectedProjectId) return

      const result = await hardDeleteTask({
        taskId: deleteTaskId,
        catalog: catalogController,
        eventStore,
        db,
        persistence,
        runStatusIndex,
        runtimeController,
        activeTaskId: taskId,
        selectedTaskId: session.view.selectedTaskId,
        selectedProjectId: session.view.selectedProjectId,
        lastTaskByProject: session.view.lastTaskByProject,
        navigatorOpen: session.view.navigatorOpen,
        activeRunStatus: runtime.turnStatus,
        onTaskDeleted: (deletedTaskId) => {
          capabilityController.clearTask(deletedTaskId)
        },
      })

      // Always sync selection + lastTaskByProject into session memory so the
      // putSessionPointer effect cannot overwrite IDB with a stale map.
      session.commands.removeTaskLayout(deleteTaskId)
      session.commands.hydratePointers({
        selectedProjectId: session.view.selectedProjectId,
        selectedTaskId: result.selectionChanged
          ? result.nextSelectedTaskId
          : session.view.selectedTaskId,
        lastTaskByProject: result.lastTaskByProject,
        navigatorOpen: session.view.navigatorOpen,
      })
      setDeleteConfirmTaskId(null)
    },
    [
      catalogController,
      capabilityController,
      db,
      eventStore,
      persistence,
      runStatusIndex,
      runtime.turnStatus,
      runtimeController,
      session.commands,
      session.view.lastTaskByProject,
      session.view.navigatorOpen,
      session.view.selectedProjectId,
      session.view.selectedTaskId,
      taskId,
    ]
  )

  const onSelectCatalogTask = useCallback(
    (nextTaskId: string) => {
      if (!catalogController) return
      const row = catalogController.getTaskRow(nextTaskId)
      if (!row) return
      selectedTaskIdRef.current = nextTaskId
      if (row.projectId !== selectedProjectIdRef.current) {
        catalogController.setFocusedProject(row.projectId)
        selectedProjectIdRef.current = row.projectId
        session.commands.selectProject(row.projectId, nextTaskId)
        void localRootCommands
          ?.ensureRuntimeForSelectedProject()
          .then(() => setProjectActionError(null))
          .catch((err: unknown) => {
            setProjectActionError(
              actionErrorMessage(err, '无法切换项目运行时'),
            )
          })
        return
      }
      session.commands.selectTask(nextTaskId)
    },
    [catalogController, localRootCommands, session.commands],
  )

  const performRemoveProject = useCallback(
    async (projectId: string) => {
      if (!catalogController) return

      const result = await removeProjectFromList({
        projectId,
        catalog: catalogController,
        eventStore,
        runStatusIndex,
        runtimeController,
        activeTaskId: taskId,
        selectedTaskId: session.view.selectedTaskId,
        selectedProjectId: session.view.selectedProjectId,
        lastTaskByProject: session.view.lastTaskByProject,
        activeRunStatus: runtime.turnStatus,
        onTaskDeleted: (deletedTaskId) => {
          capabilityController.clearTask(deletedTaskId)
        },
      })

      for (const removedTaskId of result.removedTaskIds) {
        session.commands.removeTaskLayout(removedTaskId)
      }
      selectedProjectIdRef.current = result.nextSelectedProjectId
      selectedTaskIdRef.current = result.nextSelectedTaskId
      session.commands.hydratePointers({
        selectedProjectId: result.nextSelectedProjectId,
        selectedTaskId: result.nextSelectedTaskId,
        lastTaskByProject: result.lastTaskByProject,
        navigatorOpen: session.view.navigatorOpen,
      })
      setRemoveConfirmProjectId(null)

      if (result.selectionChanged && result.nextSelectedProjectId) {
        void localRootCommands
          ?.ensureRuntimeForSelectedProject()
          .then(() => setProjectActionError(null))
          .catch((err: unknown) => {
            setProjectActionError(
              actionErrorMessage(err, '无法切换项目运行时'),
            )
          })
      }
    },
    [
      catalogController,
      capabilityController,
      eventStore,
      localRootCommands,
      runStatusIndex,
      runtime.turnStatus,
      runtimeController,
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

  const onRemoveProject = useCallback((id: string) => {
    setRemoveConfirmProjectId(id)
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
          looseTasks={taskRail.looseTasks}
          projectGroups={taskRail.projectGroups}
          busyTaskIds={busyTaskIds}
          onLaunchAction={onLaunchAction}
          onNewChat={() => void onNewChat()}
          onCreateByChat={() => void onCreateBoardChat()}
          onSelectTask={onSelectCatalogTask}
          onDeleteTask={onDeleteTask}
          onRemoveProject={onRemoveProject}
          onNewProjectChat={onNewProjectChat}
          projectActionError={projectActionError}
          composerRuntime={
            composerRuntime
              ? {
                  ...composerRuntime,
                  projectPicker: {
                    projects: catalogView.projects.map((item) => {
                      const record = catalogController?.getProjectRecord(
                        item.id,
                      )
                      return {
                        id: item.id,
                        name: item.name,
                        specified: record
                          ? isSpecifiedWorkProject(record)
                          : false,
                      }
                    }),
                    selectedProjectId: session.view.selectedProjectId,
                    hostAvailable,
                    onSelectProject,
                    onOpenLocalFolder: () => void onOpenLocalFolder(),
                    onCreateProject: (name?: string) =>
                      void onCreateProject(name),
                    onClearProject: () => void onClearProject(),
                  },
                }
              : undefined
          }
          capabilityController={capabilityController}
          surfaceRegistry={surface.surfaceRegistry}
          boardStore={board.store}
          boardRefresh={board.refresh}
          boardRevision={board.revision}
          taskExists={(id) => Boolean(catalogController?.getTaskRow(id))}
          boardOpenerRef={boardOpenerRef}
          onOpenFileRef={surface.onOpenFileRef}
          workSurfaceEmptyExtra={surface.workSurfaceEmptyExtra}
          workSurfaceToolbarTrailing={surface.workSurfaceToolbarTrailing}
        />
        <DeleteTaskConfirmDialog
          open={deleteConfirmTaskId != null}
          onCancel={() => setDeleteConfirmTaskId(null)}
          onConfirm={() => {
            if (deleteConfirmTaskId) {
              void performDeleteTask(deleteConfirmTaskId)
            }
          }}
        />
        <DeleteProjectConfirmDialog
          open={removeConfirmProjectId != null}
          projectName={
            removeConfirmProjectId
              ? (catalogController?.getProjectRecord(removeConfirmProjectId)
                  ?.name ?? null)
              : null
          }
          onCancel={() => setRemoveConfirmProjectId(null)}
          onConfirm={() => {
            if (removeConfirmProjectId) {
              void performRemoveProject(removeConfirmProjectId)
            }
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  )
}
