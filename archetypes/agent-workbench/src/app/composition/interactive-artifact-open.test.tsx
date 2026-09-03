import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  createMemoryInteractiveArtifactContent,
  createMemoryInteractiveArtifactStore,
  hashInteractiveContent,
} from '@/modules/task'
import {
  WorkSurfaceHost,
  createMemoryDocumentContent,
} from '@/modules/work-surface'
import {
  useWorkbenchSession,
  workSurfaceTabIdFor,
} from '@/modules/workbench-session'
import { useWorkbenchInteractiveArtifactWiring } from './interactive-artifact-wiring'
import {
  createWorkbenchSurfaceRegistry,
  openWorkSurfaceFromFileRef,
  openWorkSurfaceFromRuntimePayload,
} from './surface-assembly'

const HTML =
  '<!doctype html><html><body><button>筛选</button></body></html>'
const HTML_V2 =
  '<!doctype html><html><body><button>已标红</button></body></html>'
const HTML_OTHER =
  '<!doctype html><html><body><p>另一 Task 提交</p></body></html>'

function renderHarness(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

async function seedDraft(
  content: ReturnType<typeof createMemoryInteractiveArtifactContent>,
  draftId: string,
  html: string,
) {
  const contentHash = await hashInteractiveContent(html)
  content.seed({
    draftId,
    status: 'ready',
    content: html,
    hash: contentHash,
    bytes: html.length,
    title: '对比清单',
  })
  return contentHash
}

function CommitOpenHarness() {
  const store = useMemo(() => createMemoryInteractiveArtifactStore(), [])
  const content = useMemo(() => createMemoryInteractiveArtifactContent(), [])
  const session = useWorkbenchSession({
    selectedProjectId: 'project-default',
    selectedTaskId: 'task-a',
  })
  const [ready, setReady] = useState(false)
  const [writeOk, setWriteOk] = useState(false)
  const [artifactId, setArtifactId] = useState<string | null>(null)
  const startedRef = useRef(false)
  const interactive = useWorkbenchInteractiveArtifactWiring({
    db: null,
    selectedTaskId: session.view.selectedTaskId,
    store,
    content,
  })
  const registry = useMemo(
    () =>
      createWorkbenchSurfaceRegistry(
        createMemoryDocumentContent({
          files: {
            'notes/report.html': '<!doctype html><title>源码</title>',
          },
        }),
        null,
        undefined,
        interactive.surface,
      ),
    [interactive.surface],
  )

  interactive.attachCommittedOpener((artifactId, title) => {
    openWorkSurfaceFromRuntimePayload(
      registry,
      session.commands.openWorkSurfaceTab,
      {
        kind: 'interactive',
        resourceKey: artifactId,
        title,
        focus: 'pane',
      },
    )
  })

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    session.commands.ensureTaskLayout('task-b')
    void (async () => {
      const firstHash = await seedDraft(content, 'draft-1', HTML)
      const created = await interactive.executor({
        toolName: 'interactive_commit',
        args: {
          draftId: 'draft-1',
          contentHash: firstHash,
          title: '对比清单',
        },
        taskId: 'task-a',
        turnId: 'turn-1',
      })
      if (
        created &&
        typeof created === 'object' &&
        'ok' in created &&
        created.ok === true &&
        'artifactId' in created
      ) {
        setWriteOk(true)
        setArtifactId(String(created.artifactId))
      }
      setReady(true)
    })()
  }, [content, interactive, session.commands])

  const tabs = session.view.layout.openTabs.map((tab) => ({
    tabId: tab.tabId,
    kind: tab.kind,
    resourceKey: tab.resourceKey,
    title: tab.title,
  }))

  if (!ready) return <p data-testid='commit-open-pending'>正在提交…</p>

  return (
    <div style={{ width: 720, height: 640 }}>
      <p data-testid='commit-write-ok'>{writeOk ? 'ok' : 'fail'}</p>
      <p data-testid='selected-task'>{session.view.selectedTaskId}</p>
      <button
        type='button'
        data-testid='switch-task-b'
        onClick={() => session.commands.selectTask('task-b')}
      >
        切到 B
      </button>
      <button
        type='button'
        data-testid='switch-task-a'
        onClick={() => session.commands.selectTask('task-a')}
      >
        回到 A
      </button>
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
      <button
        type='button'
        data-testid='commit-on-b'
        onClick={() => {
          void (async () => {
            const hash = await seedDraft(content, 'draft-b', HTML_OTHER)
            const result = await interactive.executor({
              toolName: 'interactive_commit',
              args: {
                draftId: 'draft-b',
                contentHash: hash,
                title: 'B 的表',
              },
              taskId: 'task-a',
              turnId: 'turn-b',
            })
            setWriteOk(
              Boolean(
                result &&
                  typeof result === 'object' &&
                  'ok' in result &&
                  result.ok,
              ),
            )
          })()
        }}
      >
        在 B 上提交 A
      </button>
      <button
        type='button'
        data-testid='commit-again'
        onClick={() => {
          void (async () => {
            const hash = await seedDraft(content, 'draft-2', HTML_V2)
            await interactive.executor({
              toolName: 'interactive_commit',
              args: {
                artifactId: artifactId ?? undefined,
                draftId: 'draft-2',
                contentHash: hash,
                title: '对比清单',
              },
              taskId: 'task-a',
              turnId: 'turn-2',
            })
          })()
        }}
      >
        再提交
      </button>
      <button
        type='button'
        data-testid='replay-commit'
        onClick={() => {
          void (async () => {
            const hash = await hashInteractiveContent(HTML)
            await interactive.executor({
              toolName: 'interactive_commit',
              args: {
                draftId: 'gone',
                contentHash: hash,
                title: '对比清单',
              },
              taskId: 'task-a',
              turnId: 'turn-replay',
            })
          })()
        }}
      >
        回放
      </button>
      <button
        type='button'
        data-testid='open-html-file'
        onClick={() => {
          openWorkSurfaceFromFileRef(
            registry,
            session.commands.openWorkSurfaceTab,
            { path: 'notes/report.html', label: 'report.html' },
          )
        }}
      >
        打开 html
      </button>
      <WorkSurfaceHost
        view={{
          visible: session.view.layout.workSurfaceVisible,
          maximized: false,
          width: 480,
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
        registry={registry}
        taskId={session.view.selectedTaskId}
      />
    </div>
  )
}

describe('interactive commit opens Interactive Surface', () => {
  it('opens the island after a live commit and keeps file html on Document', async () => {
    await renderHarness(<CommitOpenHarness />)
    await expect.element(page.getByTestId('commit-write-ok')).toHaveTextContent('ok')
    await expect
      .element(page.getByTestId('work-surface-interactive'))
      .toBeInTheDocument()
    const iframe = page.getByTestId('interactive-island-frame').element()
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(iframe.getAttribute('csp') ?? '').toContain("connect-src 'none'")

    await userEvent.click(page.getByTestId('open-html-file'))
    const htmlTabId = workSurfaceTabIdFor('document', 'notes/report.html')
    await userEvent.click(page.getByTestId(`work-tab-${htmlTabId}`))
    await expect
      .element(page.getByTestId('work-surface-document'))
      .toBeInTheDocument()
    expect(
      document.querySelectorAll('[data-testid="work-surface-interactive"]')
        .length,
    ).toBe(0)

    const interactiveTabs = document.querySelectorAll(
      '[data-testid^="work-tab-ws:interactive:"]',
    )
    expect(interactiveTabs.length).toBe(1)
  })

  it('does not open on the wrong Task, but still writes; close then commit opens again; replay does not', async () => {
    await renderHarness(<CommitOpenHarness />)
    await expect
      .element(page.getByTestId('work-surface-interactive'))
      .toBeInTheDocument()

    await userEvent.click(page.getByTestId('switch-task-b'))
    await expect.element(page.getByTestId('selected-task')).toHaveTextContent('task-b')
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()

    await userEvent.click(page.getByTestId('commit-on-b'))
    await expect.element(page.getByTestId('commit-write-ok')).toHaveTextContent('ok')
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()

    await userEvent.click(page.getByTestId('switch-task-a'))
    await expect
      .element(page.getByTestId('work-surface-interactive'))
      .toBeInTheDocument()

    await userEvent.click(page.getByTestId('close-interactive'))
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()

    await userEvent.click(page.getByTestId('replay-commit'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()

    await userEvent.click(page.getByTestId('commit-again'))
    await expect
      .element(page.getByTestId('work-surface-interactive'))
      .toBeInTheDocument()
  })
})
