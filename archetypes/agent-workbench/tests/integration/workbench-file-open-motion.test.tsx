import {
  useWorkbenchSurfaceAssembly,
  type UseWorkbenchSurfaceAssemblyOptions,
} from '@/app/composition/surface-assembly'
import { useWorkbenchSession } from '@/modules/workbench-session'
import type {
  DocumentContentPort,
  WorkspaceDocumentSource,
} from '@/modules/work-surface'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'
import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

function parseDurationMs(value: string): number {
  const first = value.split(',')[0]?.trim() ?? '0s'
  if (first.endsWith('ms')) return Number.parseFloat(first)
  if (first.endsWith('s')) return Number.parseFloat(first) * 1000
  return Number.parseFloat(first)
}

function stubDocumentContent(): DocumentContentPort {
  return {
    readText: async () => ({
      ok: false,
      reason: 'not-found',
      message: 'stub',
    }),
  }
}

function stubDocumentSource(): WorkspaceDocumentSource {
  return {
    runtimeMode: 'fake',
    content: stubDocumentContent(),
    workspaceHint: null,
    localFolderBound: false,
    pickerSupported: false,
    bindNotice: null,
    pickLocalFolder: async () => undefined,
    clearLocalFolder: () => undefined,
  }
}

function FileOpenMotionHarness() {
  const session = useWorkbenchSession({
    selectedProjectId: null,
    selectedTaskId: 'task-1',
  })
  const [token, setToken] = useState(0)
  const documentSource = useMemo(() => stubDocumentSource(), [])
  const assemblyOptions: UseWorkbenchSurfaceAssemblyOptions = {
    documentSource,
    hasOpenWorkTabs: session.view.layout.openTabs.length > 0,
    sessionCommands: session.commands,
    runtimeController: null,
    selectedTaskId: 'task-1',
    bootReady: true,
    workSurfaceVisible: session.view.layout.workSurfaceVisible,
    onRequestPaneOpenMotion: () => {
      setToken((value) => value + 1)
    },
  }
  const surface = useWorkbenchSurfaceAssembly(assemblyOptions)

  return (
    <ThemeProvider>
      <WorkbenchShell
        view={session.view}
        commands={session.commands}
        taskView={null}
        looseTasks={[]}
        projectGroups={[]}
        surfaceRegistry={surface.surfaceRegistry}
        onOpenFileRef={surface.onOpenFileRef}
        onOpenDeliverables={surface.onOpenDeliverables}
        workSurfaceOpenMotionToken={token}
      />
      <button
        type='button'
        data-testid='simulate-file-open'
        onClick={() =>
          surface.onOpenFileRef({ path: 'poems.md', label: 'poems.md' })
        }
      >
        打开文件
      </button>
      <button
        type='button'
        data-testid='simulate-deliverables-open'
        onClick={() =>
          surface.onOpenDeliverables({
            items: [
              { path: 'poems.md', source: 'file', changeKind: 'created' },
            ],
            activatePath: 'poems.md',
          })
        }
      >
        查看所有产物
      </button>
      <button
        type='button'
        data-testid='simulate-instant-open'
        onClick={() => {
          session.commands.openWorkSurface()
        }}
      >
        即时开栏
      </button>
    </ThemeProvider>
  )
}

function clickFlush(testId: string): void {
  const trigger = page.getByTestId(testId).element()
  if (!(trigger instanceof HTMLElement)) {
    throw new TypeError(`${testId} must be an HTMLElement`)
  }
  flushSync(() => trigger.click())
}

function expectPointerOpenDrawer(): void {
  const shell = page.getByTestId('workbench-shell')
  expect(shell.element().getAttribute('data-pane-motion')).toBe('animated')
  expect(shell.element().getAttribute('data-pane-transition')).toBe('open')
  const slot = document.querySelector(
    '[data-slot="work-drawer-slot"]',
  ) as HTMLElement
  expect(parseDurationMs(getComputedStyle(slot).transitionDuration)).toBe(200)
  expect(getComputedStyle(slot).transitionTimingFunction).toBe(
    'cubic-bezier(0.32, 0.72, 0, 1)',
  )
}

function expectInstantDrawer(): void {
  const shell = page.getByTestId('workbench-shell')
  expect(shell.element().getAttribute('data-pane-motion')).toBe('instant')
  expect(shell.element().getAttribute('data-pane-transition')).toBe('instant')
  const slot = document.querySelector(
    '[data-slot="work-drawer-slot"]',
  ) as HTMLElement
  expect(parseDurationMs(getComputedStyle(slot).transitionDuration)).toBe(0)
}

describe('Workbench user file-open pane motion', () => {
  it('uses the pointer open transition when a file chip opens a closed pane', async () => {
    await page.viewport(1440, 900)
    await render(<FileOpenMotionHarness />)
    await expect.element(page.getByTestId('workbench-shell')).toBeInTheDocument()
    expectInstantDrawer()

    clickFlush('simulate-file-open')
    expectPointerOpenDrawer()
  })

  it('uses the pointer open transition when「查看所有产物」opens a closed pane', async () => {
    await page.viewport(1440, 900)
    await render(<FileOpenMotionHarness />)
    clickFlush('simulate-deliverables-open')
    expectPointerOpenDrawer()
  })

  it('keeps tab switch instant when the pane is already open', async () => {
    await page.viewport(1440, 900)
    await render(<FileOpenMotionHarness />)
    clickFlush('simulate-instant-open')
    expectInstantDrawer()

    clickFlush('simulate-file-open')
    expectInstantDrawer()
  })
})
