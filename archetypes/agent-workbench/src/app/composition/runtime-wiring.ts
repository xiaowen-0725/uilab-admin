/**
 * Workbench Runtime wiring — VoltAgent adapter + TaskRuntimeController + busy index.
 * Browser-only; no Node/Electron imports.
 *
 * VoltAgent is the only runtime (ADR-0018 removed the Deterministic Fake Runtime).
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  resolveVoltAgentBaseUrl,
  resolveVoltAgentId,
} from '@/config/runtime-adapter'
import {
  createCapabilityController,
  createBrowserTaskCapabilitySelectionStore,
  createHttpCapabilitySnapshotPort,
  type CapabilityController,
  type CapabilitySnapshotPort,
} from '@/modules/capabilities'
import { DEFAULT_PROJECT_ID } from '@/modules/project'
import type { EventStorePort, RuntimePort } from '@/modules/task'
import {
  createRunStatusIndex,
  isNavigatorBusyStatus,
  TaskRuntimeController,
  type RunStatus,
  type RunStatusIndex,
} from '@/modules/task'
import { createVoltAgentRuntimeAdapter } from '@/modules/task-runtime'
import type { WorkbenchPersistence } from './workbench-boot'

export interface CreateWorkbenchRuntimePortsOptions {
  voltAgentBaseUrl?: string
  voltAgentId?: string
  projectId?: string
}

export interface WorkbenchRuntimePorts {
  runtimePort: RuntimePort
  runStatusIndex: RunStatusIndex
  /** Capability Surface snapshot port (VoltAgent HTTP). */
  capabilityPort: CapabilitySnapshotPort
  capabilityController: CapabilityController
}

/**
 * Create Runtime ports + busy index. Pure factory — no React.
 */
export function createWorkbenchRuntimePorts(
  options: CreateWorkbenchRuntimePortsOptions = {}
): WorkbenchRuntimePorts {
  const projectId = options.projectId ?? DEFAULT_PROJECT_ID

  const voltBase = options.voltAgentBaseUrl ?? resolveVoltAgentBaseUrl()
  const runtimePort: RuntimePort = createVoltAgentRuntimeAdapter({
    baseUrl: voltBase,
    agentId: options.voltAgentId ?? resolveVoltAgentId(),
    projectId,
  })

  const capabilityPort: CapabilitySnapshotPort =
    createHttpCapabilitySnapshotPort({ baseUrl: voltBase })
  const capabilityController = createCapabilityController(capabilityPort, {
    selectionStore: createBrowserTaskCapabilitySelectionStore(),
  })

  return {
    runtimePort,
    runStatusIndex: createRunStatusIndex(),
    capabilityPort,
    capabilityController,
  }
}

export interface EnsureTaskRuntimeControllerOptions {
  runtimePort: RuntimePort
  eventStore: EventStorePort
  projectId: string
  eventStoreKind: 'idb' | 'memory'
  runStatusIndex: RunStatusIndex
  seed?: string
}

/**
 * Create TaskRuntimeController and bind busy index listener.
 */
export function createTaskRuntimeController(
  options: EnsureTaskRuntimeControllerOptions
): TaskRuntimeController {
  const controller = new TaskRuntimeController({
    runtime: options.runtimePort,
    projectId: options.projectId,
    eventStore: options.eventStore,
    seed: options.seed ?? 'workbench',
    eventStoreKind: options.eventStoreKind,
  })
  controller.setRunStatusListener((id, status) => {
    options.runStatusIndex.set(id, status)
  })
  return controller
}

/**
 * Ensure a single TaskRuntimeController instance.
 * Returns `existing` when present; otherwise creates via {@link createTaskRuntimeController}.
 */
export function ensureTaskRuntimeController(
  existing: TaskRuntimeController | null,
  options: EnsureTaskRuntimeControllerOptions
): TaskRuntimeController {
  if (existing != null) return existing
  return createTaskRuntimeController(options)
}

/**
 * Merge RunStatusIndex busy set with selected-task live status (Navigator).
 */
export function projectBusyTaskIds(
  runStatusIndex: RunStatusIndex,
  selectedTaskId: string | null,
  selectedRunStatus: RunStatus | null | undefined
): ReadonlySet<string> {
  const base = runStatusIndex.getBusyTaskIds()
  if (selectedTaskId && isNavigatorBusyStatus(selectedRunStatus)) {
    if (base.has(selectedTaskId)) return base
    const set = new Set(base)
    set.add(selectedTaskId)
    return set
  }
  return base
}

/**
 * Subscribe to RunStatusIndex + merge selected-task live status for Navigator.
 * Call after `useTaskRuntime` so live runStatus is available.
 */
export function useBusyTaskIds(
  runStatusIndex: RunStatusIndex,
  selectedTaskId: string | null,
  selectedRunStatus: RunStatus | null | undefined
): ReadonlySet<string> {
  const busyRevision = useSyncExternalStore(
    (cb) => runStatusIndex.subscribe(cb),
    () => runStatusIndex.getRevision(),
    () => runStatusIndex.getRevision()
  )
  return useMemo(
    () => projectBusyTaskIds(runStatusIndex, selectedTaskId, selectedRunStatus),
    // busyRevision invalidates when index mutates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyRevision, selectedRunStatus, selectedTaskId, runStatusIndex]
  )
}

export interface UseWorkbenchRuntimeWiringOptions {
  eventStore: EventStorePort | null
  projectId: string
  persistence: WorkbenchPersistence
  bootReady: boolean
}

export interface WorkbenchRuntimeWiring {
  controller: TaskRuntimeController | null
  runStatusIndex: RunStatusIndex
  runtimePort: RuntimePort
  capabilityController: CapabilityController
}

/**
 * React wiring: ports + controller lifecycle.
 * Busy projection is {@link useBusyTaskIds} after useTaskRuntime.
 *
 * Controller is **never** constructed during render — only in an effect when
 * `bootReady && eventStore`, held in state so consumers re-render. Mid-session
 * `projectId` changes go through `setProjectId` only (no recreate).
 */
export function useWorkbenchRuntimeWiring(
  options: UseWorkbenchRuntimeWiringOptions
): WorkbenchRuntimeWiring {
  const { eventStore, projectId, persistence, bootReady } = options

  // Ports: factory once per mount (stable across renders).
  const portsRef = useRef<WorkbenchRuntimePorts | null>(null)
  if (portsRef.current == null) {
    portsRef.current = createWorkbenchRuntimePorts()
  }
  const ports = portsRef.current

  // Controller: state for re-render; ref for guard + cleanup identity.
  const [controller, setController] = useState<TaskRuntimeController | null>(
    null
  )
  const controllerRef = useRef<TaskRuntimeController | null>(null)

  // Create only after boot + store; never during render. projectId not a create dep.
  useEffect(() => {
    if (!bootReady || !eventStore) return

    const portsNow = portsRef.current!
    const next = ensureTaskRuntimeController(controllerRef.current, {
      runtimePort: portsNow.runtimePort,
      eventStore,
      projectId,
      eventStoreKind: persistence === 'idb' ? 'idb' : 'memory',
      runStatusIndex: portsNow.runStatusIndex,
    })
    if (controllerRef.current !== next) {
      controllerRef.current = next
      setController(next)
    }

    return () => {
      const held = controllerRef.current
      controllerRef.current = null
      setController((current) => (current === held ? null : current))
      try {
        held?.detach()
      } catch {
        // detach is best-effort on unmount / Strict Mode remount
      }
    }
    // Intentionally omit projectId — updates via setProjectId effect only.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once on boot+store
  }, [bootReady, eventStore, persistence])

  useEffect(() => {
    controller?.setProjectId(projectId)
  }, [projectId, controller])

  return {
    controller,
    runStatusIndex: ports.runStatusIndex,
    runtimePort: ports.runtimePort,
    capabilityController: ports.capabilityController,
  }
}
