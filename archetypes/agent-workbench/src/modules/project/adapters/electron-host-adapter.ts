/**
 * Renderer adapter over `window.__workbenchHost` (Electron preload).
 * Does not import electron.
 */

import type { WorkbenchProductProfile } from '@/config/workbench-product-profile'
import { DEFAULT_WORKBENCH_PRODUCT_PROFILE } from '@/config/workbench-product-profile'
import type { HostPort } from '../ports/host-port'
import type { HostProjectsHomePayload, WorkbenchHostBridge } from '../ports/host-wire'
import { createUnavailableHostPort } from './unavailable-host-port'

function readLiveBridge(): WorkbenchHostBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = window.__workbenchHost
  if (!bridge || typeof bridge.isAvailable !== 'function') return undefined
  if (!bridge.isAvailable()) return undefined
  return bridge
}

export function isElectronHostBridgePresent(): boolean {
  return readLiveBridge() != null
}

function toProfilePayload(
  profile: WorkbenchProductProfile,
): HostProjectsHomePayload {
  const payload: HostProjectsHomePayload = {
    projectsHomeDirName: profile.projectsHomeDirName,
  }
  if (profile.projectsHomeOverride) {
    payload.projectsHomeOverride = profile.projectsHomeOverride
  }
  return payload
}

export function createElectronHostAdapter(
  profile: WorkbenchProductProfile = DEFAULT_WORKBENCH_PRODUCT_PROFILE,
): HostPort {
  const bridge = readLiveBridge()
  if (!bridge) {
    return createUnavailableHostPort()
  }

  const profilePayload = toProfilePayload(profile)

  return {
    isAvailable() {
      return true
    },
    pickDirectory() {
      return bridge.pickDirectory()
    },
    ensureProjectsHome() {
      return bridge.ensureProjectsHome(profilePayload)
    },
    createProjectDirectory(preferredName: string) {
      return bridge.createProjectDirectory({
        preferredName,
        ...profilePayload,
      })
    },
    startRuntime(workspaceRoot: string) {
      return bridge.startRuntime(workspaceRoot)
    },
    stopRuntime() {
      return bridge.stopRuntime()
    },
    getRuntimeStatus() {
      return bridge.getRuntimeStatus()
    },
    subscribeBoardRefreshWake(listener) {
      if (typeof bridge.onBoardRefreshWake !== 'function') {
        return () => {}
      }
      return bridge.onBoardRefreshWake(listener)
    },
  }
}

export function createWorkbenchHostPort(
  profile: WorkbenchProductProfile = DEFAULT_WORKBENCH_PRODUCT_PROFILE,
): HostPort {
  return createElectronHostAdapter(profile)
}
