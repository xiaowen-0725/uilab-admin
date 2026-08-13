/**
 * Renderer adapter over `window.__workbenchHost` (Electron preload).
 * Does not import electron.
 */

import type { WorkbenchProductProfile } from '@/config/workbench-product-profile'
import { DEFAULT_WORKBENCH_PRODUCT_PROFILE } from '@/config/workbench-product-profile'
import type { HostPort } from '../ports/host-port'
import { createUnavailableHostPort } from './unavailable-host-port'

export function isElectronHostBridgePresent(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.__workbenchHost != null &&
    typeof window.__workbenchHost.isAvailable === 'function' &&
    window.__workbenchHost.isAvailable()
  )
}

export function createElectronHostAdapter(
  profile: WorkbenchProductProfile = DEFAULT_WORKBENCH_PRODUCT_PROFILE,
): HostPort {
  const bridge =
    typeof window === 'undefined' ? undefined : window.__workbenchHost
  if (!bridge || typeof bridge.isAvailable !== 'function' || !bridge.isAvailable()) {
    return createUnavailableHostPort()
  }

  const profilePayload = {
    projectsHomeDirName: profile.projectsHomeDirName,
    ...(profile.projectsHomeOverride
      ? { projectsHomeOverride: profile.projectsHomeOverride }
      : {}),
  }

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
  }
}

export function createWorkbenchHostPort(
  profile: WorkbenchProductProfile = DEFAULT_WORKBENCH_PRODUCT_PROFILE,
): HostPort {
  if (isElectronHostBridgePresent()) {
    return createElectronHostAdapter(profile)
  }
  return createUnavailableHostPort()
}
