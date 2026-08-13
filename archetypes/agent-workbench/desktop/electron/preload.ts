/**
 * Electron preload — expose typed window.__workbenchHost. No Node in renderer.
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__workbenchHost', {
  isAvailable() {
    return true
  },
  pickDirectory() {
    return ipcRenderer.invoke('host:pickDirectory')
  },
  ensureProjectsHome(input: {
    projectsHomeDirName: string
    projectsHomeOverride?: string
  }) {
    return ipcRenderer.invoke('host:ensureProjectsHome', input)
  },
  createProjectDirectory(input: {
    preferredName: string
    projectsHomeDirName: string
    projectsHomeOverride?: string
  }) {
    return ipcRenderer.invoke('host:createProjectDirectory', input)
  },
  startRuntime(workspaceRoot: string) {
    return ipcRenderer.invoke('host:startRuntime', workspaceRoot)
  },
  stopRuntime() {
    return ipcRenderer.invoke('host:stopRuntime')
  },
  getRuntimeStatus() {
    return ipcRenderer.invoke('host:getRuntimeStatus')
  },
})
