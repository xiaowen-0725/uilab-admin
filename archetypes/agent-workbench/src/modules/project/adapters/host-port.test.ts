import { describe, expect, it } from 'vitest'
import {
  createElectronHostAdapter,
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
    })
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
