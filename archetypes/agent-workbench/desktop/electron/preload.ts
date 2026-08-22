/**
 * Electron preload — expose typed window.__workbenchHost. No Node in renderer.
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  HOST_IPC,
  isHostNativeTheme,
  type HostNativeTheme,
  type WorkbenchHostBridge,
} from '../../src/modules/project/ports/host-wire'

/** Keep in sync with `src/shell/theme/theme-preference.ts`. */
const THEME_STORAGE_KEY = 'uilab-workbench-theme'

const PLATFORM_CLASS: Record<string, string> = {
  darwin: 'wb-platform-mac',
  win32: 'wb-platform-windows',
}

function applyShellDocumentMarkers(): boolean {
  try {
    const root = document?.documentElement
    if (!root) return false
    root.classList.add('wb-electron')
    root.classList.add(PLATFORM_CLASS[process.platform] ?? 'wb-platform-linux')
    root.dataset.wbHost = 'electron'
    return true
  } catch {
    return false
  }
}

function readStoredNativeTheme(): HostNativeTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isHostNativeTheme(raw)) return raw
  } catch {
    // private mode / blocked storage
  }
  return 'system'
}

function applyEarlyDocumentTheme(): void {
  try {
    const preference = readStoredNativeTheme()
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark =
      preference === 'dark' || (preference === 'system' && systemDark)
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    void ipcRenderer.invoke(HOST_IPC.setNativeTheme, preference)
  } catch {
    // document / storage may be unavailable during very early inject
  }
}

if (!applyShellDocumentMarkers()) {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      applyShellDocumentMarkers()
      applyEarlyDocumentTheme()
    },
    { once: true },
  )
} else {
  applyEarlyDocumentTheme()
}

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
  setNativeTheme(theme) {
    return ipcRenderer.invoke(HOST_IPC.setNativeTheme, theme)
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
