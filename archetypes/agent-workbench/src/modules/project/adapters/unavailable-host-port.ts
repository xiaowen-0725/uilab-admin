/**
 * Web / no-Host HostPort. Every mutating operation fails closed with a Chinese error.
 */

import {
  HOST_UNAVAILABLE_MESSAGE,
  HostUnavailableError,
  type HostPort,
  type HostRuntimeStatus,
} from '../ports/host-port'

export function createUnavailableHostPort(
  message: string = HOST_UNAVAILABLE_MESSAGE,
): HostPort {
  const fail = async (): Promise<never> => {
    throw new HostUnavailableError(message)
  }

  return {
    isAvailable() {
      return false
    },
    pickDirectory: fail,
    ensureProjectsHome: fail,
    createProjectDirectory: fail,
    startRuntime: fail,
    stopRuntime: fail,
    async getRuntimeStatus(): Promise<HostRuntimeStatus> {
      return 'error'
    },
    subscribeBoardRefreshWake() {
      return () => {}
    },
  }
}
