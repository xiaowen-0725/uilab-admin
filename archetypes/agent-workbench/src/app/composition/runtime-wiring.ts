/**
 * Workbench Runtime wiring — Fake / VoltAgent adapter + TaskRuntimeController + busy index.
 * Browser-only; no Node/Electron imports.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  resolveRuntimeAdapterMode,
  resolveVoltAgentBaseUrl,
  resolveVoltAgentId,
} from '@/config/runtime-adapter'
import { DEFAULT_PROJECT_ID } from '@/modules/project'
import type { EventStorePort, RuntimePort } from '@/modules/task'
import {
  createDeterministicFakeRuntime,
  createRunStatusIndex,
  createVoltAgentRuntimeAdapter,
  isNavigatorBusyStatus,
  TaskRuntimeController,
  VirtualClock,
  type DeterministicFakeRuntime,
  type RunStatus,
  type RunStatusIndex,
} from '@/modules/task'
import type { WorkbenchPersistence } from './workbench-boot'

const INSTANT_DEMO =
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITEST === true ||
  import.meta.env.VITEST === 'true'

export type RuntimeHonestyMode = 'fake' | 'voltagent'

export interface CreateWorkbenchRuntimePortsOptions {
  adapterMode?: RuntimeHonestyMode
  instantDemo?: boolean
  voltAgentBaseUrl?: string
  voltAgentId?: string
  projectId?: string
  seed?: string
  nowMs?: number
}

export interface WorkbenchRuntimePorts {
  adapterMode: RuntimeHonestyMode
  honestyMode: RuntimeHonestyMode
  runtimePort: RuntimePort
  /** Present when adapter is fake (for realtime clock drive). */
  fakeRuntime: DeterministicFakeRuntime | null
  runStatusIndex: RunStatusIndex
  instantDemo: boolean
}

/**
 * Create Runtime ports + busy index. Pure factory — no React.
 */
export function createWorkbenchRuntimePorts(
  options: CreateWorkbenchRuntimePortsOptions = {},
): WorkbenchRuntimePorts {
  const adapterMode =
    options.adapterMode ?? resolveRuntimeAdapterMode()
  const instantDemo = options.instantDemo ?? INSTANT_DEMO
  const seed = options.seed ?? 'workbench'
  const projectId = options.projectId ?? DEFAULT_PROJECT_ID

  const fakeRuntime =
    adapterMode === 'fake'
      ? createDeterministicFakeRuntime({
          seed,
          clock: new VirtualClock({
            startMs: options.nowMs ?? Date.now(),
          }),
          stepMs: instantDemo ? 0 : 48,
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
        })
      : null

  const voltRuntime =
    adapterMode === 'voltagent'
      ? createVoltAgentRuntimeAdapter({
          baseUrl:
            options.voltAgentBaseUrl ?? resolveVoltAgentBaseUrl(),
          agentId: options.voltAgentId ?? resolveVoltAgentId(),
          projectId,
        })
      : null

  const runtimePort: RuntimePort =
    adapterMode === 'voltagent'
      ? (voltRuntime as RuntimePort)
      : (fakeRuntime as RuntimePort)

  return {
    adapterMode,
    honestyMode: adapterMode,
    runtimePort,
    fakeRuntime,
    runStatusIndex: createRunStatusIndex(),
    instantDemo,
  }
}

export interface EnsureTaskRuntimeControllerOptions {
  runtimePort: RuntimePort
  eventStore: EventStorePort
  projectId: string
  honestyMode: RuntimeHonestyMode
  eventStoreKind: 'idb' | 'memory'
  instantDemo: boolean
  adapterMode: RuntimeHonestyMode
  runStatusIndex: RunStatusIndex
  seed?: string
}

/**
 * Create TaskRuntimeController and bind busy index listener.
 */
export function createTaskRuntimeController(
  options: EnsureTaskRuntimeControllerOptions,
): TaskRuntimeController {
  const controller = new TaskRuntimeController({
    runtime: options.runtimePort,
    projectId: options.projectId,
    eventStore: options.eventStore,
    seed: options.seed ?? 'workbench',
    honestyMode: options.honestyMode,
    eventStoreKind: options.eventStoreKind,
    autoFlush:
      options.instantDemo && options.adapterMode === 'fake',
  })
  controller.setRunStatusListener((id, status) => {
    options.runStatusIndex.set(id, status)
  })
  return controller
}

/**
 * Drive Fake VirtualClock realtime for interactive demos.
 * No-op for VoltAgent or instant demo / non-runtime path.
 */
export function setFakeRuntimeClockRealtime(
  fakeRuntime: DeterministicFakeRuntime | null,
  active: boolean,
): () => void {
  if (!fakeRuntime) return () => {}
  if (!active) {
    fakeRuntime.clock.stopRealtime()
    return () => {}
  }
  fakeRuntime.clock.startRealtime({ intervalMs: 32, scale: 1 })
  return () => {
    fakeRuntime.clock.stopRealtime()
  }
}

/**
 * Merge RunStatusIndex busy set with selected-task live status (Navigator).
 */
export function projectBusyTaskIds(
  runStatusIndex: RunStatusIndex,
  selectedTaskId: string | null,
  selectedRunStatus: RunStatus | null | undefined,
): ReadonlySet<string> {
  const base = runStatusIndex.getBusyTaskIds()
  if (
    selectedTaskId &&
    isNavigatorBusyStatus(selectedRunStatus)
  ) {
    if (base.has(selectedTaskId)) return base
    const set = new Set(base)
    set.add(selectedTaskId)
    return set
  }
  return base
}

export interface UseWorkbenchRuntimeWiringOptions {
  eventStore: EventStorePort | null
  projectId: string
  persistence: WorkbenchPersistence
  bootReady: boolean
  /** Selected task id for clock drive; null = stop. */
  selectedTaskId: string | null
  /** Live run status of selected task (for busy merge). */
  selectedRunStatus?: RunStatus | null
  adapterMode?: RuntimeHonestyMode
}

export interface WorkbenchRuntimeWiring {
  honestyMode: RuntimeHonestyMode
  controller: TaskRuntimeController | null
  runStatusIndex: RunStatusIndex
  busyTaskIds: ReadonlySet<string>
  runtimePort: RuntimePort
}

/**
 * React wiring: ports, controller lifecycle, Fake clock, busy projection.
 */
export function useWorkbenchRuntimeWiring(
  options: UseWorkbenchRuntimeWiringOptions,
): WorkbenchRuntimeWiring {
  const {
    eventStore,
    projectId,
    persistence,
    bootReady,
    selectedTaskId,
    selectedRunStatus,
    adapterMode: adapterModeProp,
  } = options

  const portsRef = useRef<WorkbenchRuntimePorts | null>(null)
  if (portsRef.current == null) {
    portsRef.current = createWorkbenchRuntimePorts({
      adapterMode: adapterModeProp,
    })
  }
  const ports = portsRef.current

  const controllerRef = useRef<TaskRuntimeController | null>(null)

  if (
    controllerRef.current == null &&
    eventStore != null
  ) {
    controllerRef.current = createTaskRuntimeController({
      runtimePort: ports.runtimePort,
      eventStore,
      projectId,
      honestyMode: ports.honestyMode,
      eventStoreKind: persistence === 'idb' ? 'idb' : 'memory',
      instantDemo: ports.instantDemo,
      adapterMode: ports.adapterMode,
      runStatusIndex: ports.runStatusIndex,
    })
  }

  // Ensure controller after async boot when store becomes available.
  useEffect(() => {
    if (!bootReady || !eventStore) return
    if (controllerRef.current == null) {
      controllerRef.current = createTaskRuntimeController({
        runtimePort: ports.runtimePort,
        eventStore,
        projectId,
        honestyMode: ports.honestyMode,
        eventStoreKind: persistence === 'idb' ? 'idb' : 'memory',
        instantDemo: ports.instantDemo,
        adapterMode: ports.adapterMode,
        runStatusIndex: ports.runStatusIndex,
      })
    }
  }, [
    bootReady,
    eventStore,
    persistence,
    ports.adapterMode,
    ports.honestyMode,
    ports.instantDemo,
    ports.runtimePort,
    ports.runStatusIndex,
    projectId,
  ])

  useEffect(() => {
    controllerRef.current?.setProjectId(projectId)
  }, [projectId])

  const isRuntimePath = Boolean(selectedTaskId)
  useEffect(() => {
    if (ports.adapterMode !== 'fake') return
    if (ports.instantDemo || !isRuntimePath) {
      return setFakeRuntimeClockRealtime(ports.fakeRuntime, false)
    }
    return setFakeRuntimeClockRealtime(ports.fakeRuntime, true)
  }, [isRuntimePath, ports.adapterMode, ports.fakeRuntime, ports.instantDemo])

  const runStatusIndex = ports.runStatusIndex
  const busyRevision = useSyncExternalStore(
    (cb) => runStatusIndex.subscribe(cb),
    () => runStatusIndex.getRevision(),
    () => runStatusIndex.getRevision(),
  )

  const busyTaskIds = useMemo(
    () =>
      projectBusyTaskIds(
        runStatusIndex,
        selectedTaskId,
        selectedRunStatus,
      ),
    // busyRevision invalidates when index mutates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyRevision, selectedRunStatus, selectedTaskId, runStatusIndex],
  )

  return {
    honestyMode: ports.honestyMode,
    controller: controllerRef.current,
    runStatusIndex,
    busyTaskIds,
    runtimePort: ports.runtimePort,
  }
}
