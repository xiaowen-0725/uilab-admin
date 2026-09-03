import { useMemo, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  createMemoryInteractiveArtifactStore,
  emptyProjectionState,
  projectEvents,
  TaskSurface,
  type AgentRuntimeEventEnvelope,
  type TaskSurfaceView,
} from '@/modules/task'
import {
  WorkSurfaceHost,
  createMemoryDocumentContent,
  type WorkspaceDocumentSource,
} from '@/modules/work-surface'
import {
  useWorkbenchSession,
  workSurfaceTabIdFor,
} from '@/modules/workbench-session'
import { useWorkbenchInteractiveArtifactWiring } from './interactive-artifact-wiring'
import { useWorkbenchSurfaceAssembly } from './surface-assembly'

const HTML =
  '<!doctype html><html><body><button>筛选</button></body></html>'
const TABLE = '<table><tr><td>整表不该出现在聊天里</td></tr></table>'

function renderHarness(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

function envelope(
  eventType: string,
  taskSequence: number,
  payload: unknown = {},
): AgentRuntimeEventEnvelope {
  return {
    eventId: `e${taskSequence}`,
    eventType,
    schemaVersion: 2,
    projectId: 'project-default',
    taskId: 'task-a',
    turnId: 'turn-1',
    taskSequence,
    occurredAt: '1970-01-01T00:00:00.000Z',
    receivedAt: '1970-01-01T00:00:00.000Z',
    payload,
  }
}

function PointerHarness() {
  const store = useMemo(() => {
    const next = createMemoryInteractiveArtifactStore()
    void next.put({
      id: 'ia_notes-table',
      taskId: 'task-a',
      title: '对比清单',
      html: HTML,
      contentHash: 'hash-1',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    })
    return next
  }, [])
  const session = useWorkbenchSession({
    selectedProjectId: 'project-default',
    selectedTaskId: 'task-a',
  })
  const interactive = useWorkbenchInteractiveArtifactWiring({
    db: null,
    selectedTaskId: session.view.selectedTaskId,
    store,
  })
  const documentSource = useMemo<WorkspaceDocumentSource>(
    () => ({
      runtimeMode: 'fake',
      content: createMemoryDocumentContent({
        files: {
          'notes/report.html': '<!doctype html><title>源码</title>',
        },
      }),
      workspaceHint: null,
      localFolderBound: false,
      pickerSupported: false,
      bindNotice: null,
      pickLocalFolder: async () => {},
      clearLocalFolder: () => {},
    }),
    [],
  )
  const { readModel } = useMemo(
    () =>
      projectEvents(
        emptyProjectionState({
          taskId: 'task-a',
          projectId: 'project-default',
          title: '指针卡',
        }),
        [
          envelope('turn.started', 1, { inputText: '做表', text: '做表' }),
          envelope('file.changed', 2, {
            path: 'notes/report.html',
            changeKind: 'created',
          }),
          envelope('artifact.created', 3, {
            id: 'ia_notes-table',
            title: '对比清单',
            kind: 'interactive',
            html: TABLE,
            content: TABLE,
          }),
          envelope('file.changed', 4, {
            path: 'src/app.ts',
            changeKind: 'updated',
          }),
          envelope('message.delta', 5, { text: '表做好了。' }),
          envelope('turn.completed', 6),
        ],
      ),
    [],
  )
  const surface = useWorkbenchSurfaceAssembly({
    documentSource,
    hasOpenWorkTabs: session.view.layout.openTabs.length > 0,
    sessionCommands: session.commands,
    runtimeController: null,
    selectedTaskId: session.view.selectedTaskId,
    bootReady: true,
    interactive: interactive.surface,
    readModel,
    workSurfaceVisible: session.view.layout.workSurfaceVisible,
  })

  const view: TaskSurfaceView = {
    taskId: 'task-a',
    title: readModel.title,
    projectName: '测试项目',
    mode: 'runtime',
    readModel,
    launchActions: [],
    contextSections: [],
    contextPanelOpen: false,
  }
  const tabs = session.view.layout.openTabs.map((tab) => ({
    tabId: tab.tabId,
    kind: tab.kind,
    resourceKey: tab.resourceKey,
    title: tab.title,
  }))

  return (
    <div style={{ width: 1100, height: 720 }}>
      <div style={{ position: 'relative', zIndex: 20, display: 'flex', gap: 8 }}>
        <button
          type='button'
          data-testid='close-interactive'
          onClick={() => {
            const tab = session.view.layout.openTabs.find(
              (item) => item.kind === 'interactive',
            )
            if (tab) session.commands.closeWorkSurfaceTab(tab.tabId)
          }}
        >
          关掉
        </button>
      </div>
      <div style={{ display: 'flex', height: 640, gap: 16 }}>
        <div style={{ width: 480, minWidth: 0, overflow: 'auto' }}>
          <TaskSurface
            view={view}
            onOpenFileRef={surface.onOpenFileRef}
            onOpenDeliverables={surface.onOpenDeliverables}
            composerRuntime={{
              mode: 'runtime',
              turnStatus: readModel.turnStatus,
            }}
          />
        </div>
        <WorkSurfaceHost
        view={{
          visible: session.view.layout.workSurfaceVisible,
          maximized: false,
          width: 420,
          minWidth: 320,
          maxWidth: 960,
          tabs,
          activeTabId: session.view.layout.activeTabId,
        }}
        callbacks={{
          onClose: session.commands.closeWorkSurface,
          onCloseTab: session.commands.closeWorkSurfaceTab,
          onActivateTab: session.commands.activateTab,
          onResize: () => {},
          onToggleMaximize: () => {},
          onExitMaximize: () => {},
        }}
        registry={surface.surfaceRegistry}
        taskId={session.view.selectedTaskId}
      />
      </div>
    </div>
  )
}

describe('interactive artifact pointer cards', () => {
  it('hydrates a pointer card without opening, then reopens the same artifact by id', async () => {
    await renderHarness(<PointerHarness />)

    const zone = page.getByTestId('timeline-deliverables')
    await expect.element(zone).toHaveTextContent('对比清单')
    await expect.element(zone).toHaveTextContent('交互产物')
    await expect.element(zone).toHaveTextContent('文档 · HTML')
    expect(zone.element().textContent ?? '').not.toContain('整表不该出现在聊天里')
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()

    await userEvent.click(page.getByTestId('interactive-artifact-pointer'))
    await expect
      .element(page.getByTestId('work-surface-interactive'))
      .toBeInTheDocument()
    const interactiveTab = document.querySelector(
      '[data-testid^="work-tab-ws:interactive:"]',
    )
    expect(interactiveTab).not.toBeNull()
    expect(
      workSurfaceTabIdFor('interactive', 'ia_notes-table'),
    ).toBe(interactiveTab?.getAttribute('data-testid')?.replace('work-tab-', ''))

    await userEvent.click(page.getByTestId('close-interactive'))
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()
    await expect.element(zone).toHaveTextContent('对比清单')
    await expect.element(zone).toHaveTextContent('交互产物')

    await userEvent.click(page.getByTestId('interactive-artifact-pointer'))
    await expect
      .element(page.getByTestId('work-surface-interactive'))
      .toBeInTheDocument()
    expect(
      document.querySelectorAll('[data-testid^="work-tab-ws:interactive:"]')
        .length,
    ).toBe(1)
    expect(
      document.querySelector(
        `[data-testid="work-tab-${workSurfaceTabIdFor('interactive', 'ia_notes-table')}"]`,
      ),
    ).not.toBeNull()

    await userEvent.click(page.getByTestId('close-interactive'))
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()

    await userEvent.click(page.getByTestId('timeline-deliverables-all'))
    await expect
      .element(
        page.getByTestId(
          `work-tab-${workSurfaceTabIdFor('interactive', 'ia_notes-table')}`,
        ),
      )
      .toBeInTheDocument()
    await expect
      .element(
        page.getByTestId(
          `work-tab-${workSurfaceTabIdFor('document', 'notes/report.html')}`,
        ),
      )
      .toBeInTheDocument()
    expect(
      document.querySelectorAll('[data-testid^="work-tab-ws:interactive:"]').length,
    ).toBe(1)
  })
})
