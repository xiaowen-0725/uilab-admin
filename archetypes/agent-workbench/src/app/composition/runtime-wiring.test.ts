import { describe, expect, it } from 'vitest'
import {
  createTaskRuntimeController,
  createWorkbenchRuntimePorts,
  ensureTaskRuntimeController,
  projectBusyTaskIds,
  setFakeRuntimeClockRealtime,
} from './runtime-wiring'
// useBusyTaskIds is covered via projectBusyTaskIds + integration shell/runtime tests
import { createMemoryEventStore, createRunStatusIndex } from '@/modules/task'
import { DEFAULT_PROJECT_ID } from '@/modules/project'

describe('createWorkbenchRuntimePorts', () => {
  it('creates Fake ports by default with busy index', () => {
    const ports = createWorkbenchRuntimePorts({
      adapterMode: 'fake',
      instantDemo: true,
      nowMs: 1_700_000_000_000,
    })
    expect(ports.honestyMode).toBe('fake')
    expect(ports.fakeRuntime).not.toBeNull()
    expect(ports.runtimePort).toBe(ports.fakeRuntime)
    expect(ports.runStatusIndex.getBusyTaskIds().size).toBe(0)
    expect(ports.capabilityPort).toBeTruthy()
    expect(ports.capabilityController).toBeTruthy()
  })

  it('creates VoltAgent adapter without Fake clock', () => {
    const ports = createWorkbenchRuntimePorts({
      adapterMode: 'voltagent',
      voltAgentBaseUrl: 'http://127.0.0.1:3141',
      voltAgentId: 'workbench',
      projectId: DEFAULT_PROJECT_ID,
    })
    expect(ports.honestyMode).toBe('voltagent')
    expect(ports.fakeRuntime).toBeNull()
    expect(ports.runtimePort).toBeTruthy()
    expect(ports.capabilityPort).toBeTruthy()
  })
})

describe('createTaskRuntimeController', () => {
  it('binds run status listener to index', () => {
    const ports = createWorkbenchRuntimePorts({
      adapterMode: 'fake',
      instantDemo: true,
    })
    const store = createMemoryEventStore()
    const controller = createTaskRuntimeController({
      runtimePort: ports.runtimePort,
      eventStore: store,
      projectId: DEFAULT_PROJECT_ID,
      honestyMode: 'fake',
      eventStoreKind: 'memory',
      instantDemo: true,
      adapterMode: 'fake',
      runStatusIndex: ports.runStatusIndex,
    })
    expect(controller).toBeTruthy()
    // Listener path: index starts empty until runs update
    expect(ports.runStatusIndex.getBusyTaskIds().size).toBe(0)
  })
})

describe('ensureTaskRuntimeController', () => {
  it('creates once and reuses existing instance', () => {
    const ports = createWorkbenchRuntimePorts({
      adapterMode: 'fake',
      instantDemo: true,
    })
    const store = createMemoryEventStore()
    const options = {
      runtimePort: ports.runtimePort,
      eventStore: store,
      projectId: DEFAULT_PROJECT_ID,
      honestyMode: 'fake' as const,
      eventStoreKind: 'memory' as const,
      instantDemo: true,
      adapterMode: 'fake' as const,
      runStatusIndex: ports.runStatusIndex,
    }

    const first = ensureTaskRuntimeController(null, options)
    const second = ensureTaskRuntimeController(first, {
      ...options,
      // Different projectId must not force a new instance when existing is passed
      projectId: 'other-project',
    })
    expect(second).toBe(first)

    // Factory path (null existing) yields a distinct instance
    const third = ensureTaskRuntimeController(null, options)
    expect(third).not.toBe(first)
  })
})

describe('projectBusyTaskIds', () => {
  it('merges selected-task live busy status into index set', () => {
    const index = createRunStatusIndex()
    index.set('task-a', 'running')
    const withSelected = projectBusyTaskIds(index, 'task-b', 'queued')
    expect(withSelected.has('task-a')).toBe(true)
    expect(withSelected.has('task-b')).toBe(true)

    const idleSelected = projectBusyTaskIds(index, 'task-b', 'completed')
    expect(idleSelected.has('task-b')).toBe(false)
    expect(idleSelected.has('task-a')).toBe(true)
  })
})

describe('setFakeRuntimeClockRealtime', () => {
  it('no-ops for null fake runtime', () => {
    const stop = setFakeRuntimeClockRealtime(null, true)
    expect(() => stop()).not.toThrow()
  })
})
