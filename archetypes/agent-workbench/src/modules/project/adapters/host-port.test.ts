import { describe, expect, it, vi } from 'vitest'
import {
  createElectronHostAdapter,
  createFakeHostPort,
  createUnavailableHostPort,
  createWorkbenchHostPort,
  HOST_IPC,
  HOST_UNAVAILABLE_MESSAGE,
  HostUnavailableError,
} from '@/modules/project'

describe('HostPort adapters (renderer)', () => {
  it('HOST_IPC channel names stay stable for Desktop preload/main', () => {
    expect(HOST_IPC).toEqual({
      pickDirectory: 'host:pickDirectory',
      ensureProjectsHome: 'host:ensureProjectsHome',
      createProjectDirectory: 'host:createProjectDirectory',
      startRuntime: 'host:startRuntime',
      stopRuntime: 'host:stopRuntime',
      getRuntimeStatus: 'host:getRuntimeStatus',
      boardRefreshWake: 'host:boardRefreshWake',
    })
  })

  it('fake host can emit a board refresh wake without fetching data', () => {
    const host = createFakeHostPort()
    const listener = vi.fn()
    const stop = host.subscribeBoardRefreshWake(listener)
    host.emitBoardRefreshWake()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    host.emitBoardRefreshWake()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('unavailable host wake subscription is a no-op', () => {
    const host = createUnavailableHostPort()
    expect(host.subscribeBoardRefreshWake(() => {})).toEqual(expect.any(Function))
  })

  it('unavailable host fails closed with Chinese copy', async () => {
    const host = createUnavailableHostPort()
    expect(host.isAvailable()).toBe(false)
    await expect(host.pickDirectory()).rejects.toBeInstanceOf(HostUnavailableError)
    await expect(host.ensureProjectsHome()).rejects.toMatchObject({
      message: HOST_UNAVAILABLE_MESSAGE,
    })
    expect(await host.getRuntimeStatus()).toBe('error')
  })

  it('createWorkbenchHostPort degrades when the Electron bridge is absent', () => {
    delete window.__workbenchHost
    const host = createWorkbenchHostPort()
    expect(host.isAvailable()).toBe(false)
    expect(createElectronHostAdapter().isAvailable()).toBe(false)
  })
})
