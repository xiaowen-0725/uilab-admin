/**
 * Electron preload — expose typed window.__workbenchHost. No Node in renderer.
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  HOST_IPC,
  type WorkbenchHostBridge,
} from '../../src/modules/project/ports/host-wire'

const bridge: WorkbenchHostBridge = {
  isAvailable() {
    return true
  },
  pickDirectory() {
    return ipcRenderer.invoke(HOST_IPC.pickDirectory)
  },
  ensureProjectsHome(input) {
    return ipcRenderer.invoke(HOST_IPC.ensureProjectsHome, input)
  },
  createProjectDirectory(input) {
    return ipcRenderer.invoke(HOST_IPC.createProjectDirectory, input)
  },
  startRuntime(workspaceRoot) {
    return ipcRenderer.invoke(HOST_IPC.startRuntime, workspaceRoot)
  },
  stopRuntime() {
    return ipcRenderer.invoke(HOST_IPC.stopRuntime)
  },
  getRuntimeStatus() {
    return ipcRenderer.invoke(HOST_IPC.getRuntimeStatus)
  },
  onBoardRefreshWake(listener) {
    const handler = (): void => {
      listener()
    }
    ipcRenderer.on(HOST_IPC.boardRefreshWake, handler)
    return () => {
      ipcRenderer.removeListener(HOST_IPC.boardRefreshWake, handler)
    }
  },
}

contextBridge.exposeInMainWorld('__workbenchHost', bridge)
