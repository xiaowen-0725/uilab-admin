import { describe, expect, it, vi } from 'vitest'
import type { DocumentContentPort } from '../ports/document-content-port'
import { createWorkspaceDocumentSourceController } from './workspace-document-source'

function stubPort(label: string): DocumentContentPort {
  return {
    async readText() {
      return { ok: true, text: label, byteLength: label.length }
    },
  }
}

function fakeHandle(name: string): FileSystemDirectoryHandle {
  return { name } as FileSystemDirectoryHandle
}

describe('createWorkspaceDocumentSourceController', () => {
  it('fake mode defaults to Memory port and no hint', () => {
    const memory = stubPort('memory')
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'fake', voltAgentBaseUrl: '/voltagent-runtime' },
      {
        createMemory: () => memory,
        createHttp: () => stubPort('http'),
        isPickerSupported: () => true,
      },
    )
    const s = ctrl.getState()
    expect(s.content).toBe(memory)
    expect(s.localFolderBound).toBe(false)
    expect(s.workspaceHint).toBeNull()
    expect(s.bindNotice).toBeNull()
    expect(s.pickerSupported).toBe(true)
  })

  it('voltagent reports pickerSupported false', () => {
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'voltagent', voltAgentBaseUrl: '/va' },
      {
        createHttp: () => stubPort('http'),
        isPickerSupported: () => true,
      },
    )
    expect(ctrl.getState().pickerSupported).toBe(false)
  })

  it('voltagent mode defaults to HTTP port (no Memory fallback)', () => {
    const http = stubPort('http')
    const memory = stubPort('memory')
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'voltagent', voltAgentBaseUrl: 'http://127.0.0.1:3141' },
      {
        createMemory: () => memory,
        createHttp: (base) => {
          expect(base).toBe('http://127.0.0.1:3141')
          return http
        },
      },
    )
    expect(ctrl.getState().content).toBe(http)
    expect(ctrl.getState().content).not.toBe(memory)
  })

  it('preferredHint wins over sidecar fetch and later updates', async () => {
    const fetchHint = vi.fn(async () => '/tmp/stale-sidecar')
    const ctrl = createWorkspaceDocumentSourceController(
      {
        runtimeMode: 'voltagent',
        voltAgentBaseUrl: '/va',
        preferredHint: '/Users/me/AgentWorkbench/demo',
      },
      {
        createHttp: () => stubPort('http'),
        fetchHint,
      },
    )
    expect(ctrl.getState().workspaceHint).toBe(
      '/Users/me/AgentWorkbench/demo',
    )
    const unmount = ctrl.mount()
    await Promise.resolve()
    expect(fetchHint).not.toHaveBeenCalled()
    expect(ctrl.getState().workspaceHint).toBe(
      '/Users/me/AgentWorkbench/demo',
    )

    ctrl.setPreferredHint('/Users/me/AgentWorkbench/other')
    expect(ctrl.getState().workspaceHint).toBe(
      '/Users/me/AgentWorkbench/other',
    )
    unmount()
  })

  it('sidecar fetch does not clobber a preferredHint set after mount', async () => {
    let resolveHint!: (value: string) => void
    const fetchHint = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveHint = resolve
        }),
    )
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'voltagent', voltAgentBaseUrl: '/va' },
      {
        createHttp: () => stubPort('http'),
        fetchHint,
      },
    )
    const unmount = ctrl.mount()
    ctrl.setPreferredHint('/Users/me/AgentWorkbench/live')
    resolveHint('/tmp/stale-sidecar')
    await Promise.resolve()
    expect(ctrl.getState().workspaceHint).toBe(
      '/Users/me/AgentWorkbench/live',
    )
    unmount()
  })

  it('voltagent mount fetches workspace hint', async () => {
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'voltagent', voltAgentBaseUrl: '/va' },
      {
        createHttp: () => stubPort('http'),
        fetchHint: async () => '/tmp/office-ws',
      },
    )
    const unmount = ctrl.mount()
    await vi.waitFor(() => {
      expect(ctrl.getState().workspaceHint).toBe('/tmp/office-ws')
    })
    unmount()
  })

  it('fake pick binds FS port; clear restores Memory', async () => {
    const memory = stubPort('memory')
    const fsPort = stubPort('fs')
    const handle = fakeHandle('my-folder')
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'fake', voltAgentBaseUrl: '/va' },
      {
        createMemory: () => memory,
        createFs: (root) => {
          expect(root).toBe(handle)
          return fsPort
        },
        fsHint: (h) => `本地文件夹 · ${h.name}`,
        pickDirectory: async () => ({ ok: true, handle }),
      },
    )

    await ctrl.pickLocalFolder()
    expect(ctrl.getState().content).toBe(fsPort)
    expect(ctrl.getState().localFolderBound).toBe(true)
    expect(ctrl.getState().workspaceHint).toBe('本地文件夹 · my-folder')
    expect(ctrl.getState().bindNotice).toBeNull()

    ctrl.clearLocalFolder()
    expect(ctrl.getState().content).toBe(memory)
    expect(ctrl.getState().localFolderBound).toBe(false)
    expect(ctrl.getState().workspaceHint).toBeNull()
  })

  it('voltagent pickLocalFolder sets honesty notice only', async () => {
    const pick = vi.fn(async () => ({
      ok: true as const,
      handle: fakeHandle('x'),
    }))
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'voltagent', voltAgentBaseUrl: '/va' },
      {
        createHttp: () => stubPort('http'),
        pickDirectory: pick,
      },
    )
    await ctrl.pickLocalFolder()
    expect(pick).not.toHaveBeenCalled()
    expect(ctrl.getState().localFolderBound).toBe(false)
    expect(ctrl.getState().bindNotice).toMatch(/WORKSPACE_ROOT/)
  })

  it('fake pick failure (non-abort) sets bindNotice', async () => {
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'fake', voltAgentBaseUrl: '/va' },
      {
        createMemory: () => stubPort('memory'),
        pickDirectory: async () => ({
          ok: false,
          reason: 'denied',
          message: '没有权限访问该文件夹',
        }),
      },
    )
    await ctrl.pickLocalFolder()
    expect(ctrl.getState().localFolderBound).toBe(false)
    expect(ctrl.getState().bindNotice).toMatch(/没有权限/)
  })

  it('fake pick abort does not set bindNotice', async () => {
    const ctrl = createWorkspaceDocumentSourceController(
      { runtimeMode: 'fake', voltAgentBaseUrl: '/va' },
      {
        createMemory: () => stubPort('memory'),
        pickDirectory: async () => ({
          ok: false,
          reason: 'aborted',
          message: '已取消',
        }),
      },
    )
    await ctrl.pickLocalFolder()
    expect(ctrl.getState().bindNotice).toBeNull()
  })
})
