/**
 * Minimal Electron main process for Spec-α Desktop Host.
 * Dev-mode only: no installer, updater, or code signing.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  expandHome,
  normalizeLocalRoot,
  resolveProjectsHomePath,
  uniqueChildDirectoryName,
} from '../../src/modules/project/application/local-root-path'
import {
  fetchSidecarWorkspaceRoot,
  planSidecarStart,
  waitForSidecarWorkspaceRoot,
} from '../../src/modules/project/application/sidecar-workspace-ready'
import {
  HOST_IPC,
  type HostCreateProjectDirectoryInput,
  type HostProjectsHomePayload,
  type HostRuntimeStatus,
} from '../../src/modules/project/ports/host-wire'

const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174'
const SIDECAR_PORT = process.env.WORKBENCH_SIDECAR_PORT ?? '3141'
const SIDECAR_BASE = `http://127.0.0.1:${SIDECAR_PORT}`

let mainWindow: BrowserWindow | null = null
let sidecar: ChildProcess | null = null
let runtimeStatus: HostRuntimeStatus = 'stopped'

function hereDir(): string {
  return path.dirname(fileURLToPath(import.meta.url))
}

function resolveSidecarDir(): string {
  if (process.env.WORKBENCH_SIDECAR_DIR) {
    return path.resolve(process.env.WORKBENCH_SIDECAR_DIR)
  }
  const here = hereDir()
  return path.resolve(here, '../../../../../tooling/workbench-runtime-voltagent')
}

function resolvePreload(): string {
  const here = hereDir()
  return path.join(here, 'preload.cjs')
}

function resolveHome(payload: HostProjectsHomePayload): string {
  const homeDir = os.homedir()
  return resolveProjectsHomePath(homeDir, {
    projectsHomeDirName: payload.projectsHomeDirName || 'AgentWorkbench',
    projectsHomeOverride: payload.projectsHomeOverride,
  })
}

async function stopSidecar(): Promise<void> {
  const child = sidecar
  sidecar = null
  if (!child || child.killed) {
    runtimeStatus = 'stopped'
    return
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 3000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
  runtimeStatus = 'stopped'
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  void mainWindow.loadURL(DEV_URL)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpc(): void {
  ipcMain.handle(HOST_IPC.pickDirectory, async () => {
    const parent = mainWindow ?? undefined
    const result = await dialog.showOpenDialog(parent, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const }
    }
    return { path: result.filePaths[0]! }
  })

  ipcMain.handle(HOST_IPC.ensureProjectsHome, async (_event, payload: HostProjectsHomePayload) => {
    const home = resolveHome(payload)
    await mkdir(home, { recursive: true })
    return home
  })

  ipcMain.handle(
    HOST_IPC.createProjectDirectory,
    async (_event, input: HostCreateProjectDirectoryInput) => {
      const home = resolveHome(input)
      await mkdir(home, { recursive: true })
      const entries = await readdir(home, { withFileTypes: true })
      const existing = entries.filter((e) => e.isDirectory()).map((e) => e.name)
      const unique = uniqueChildDirectoryName(input.preferredName, existing)
      const created = path.join(home, unique)
      await mkdir(created, { recursive: true })
      return created
    },
  )

  ipcMain.handle(HOST_IPC.startRuntime, async (_event, workspaceRoot: string) => {
    const root = normalizeLocalRoot(expandHome(workspaceRoot, os.homedir()))
    runtimeStatus = 'starting'
    const live = await fetchSidecarWorkspaceRoot(
      SIDECAR_BASE,
      fetch,
      AbortSignal.timeout(2_000),
    )
    if (planSidecarStart(live, root) === 'adopt') {
      runtimeStatus = 'ready'
      return { baseUrl: SIDECAR_BASE }
    }
    await stopSidecar()
    runtimeStatus = 'starting'
    const cwd = resolveSidecarDir()
    sidecar = spawn('pnpm', ['exec', 'tsx', '--env-file=.env', 'src/server.ts'], {
      cwd,
      env: {
        ...process.env,
        WORKSPACE_ROOT: root,
        PORT: SIDECAR_PORT,
      },
      stdio: 'pipe',
    })
    sidecar.once('exit', () => {
      if (runtimeStatus === 'starting' || runtimeStatus === 'ready') {
        runtimeStatus = 'error'
      }
      sidecar = null
    })
    try {
      await waitForSidecarWorkspaceRoot({
        baseUrl: SIDECAR_BASE,
        expectedRoot: root,
      })
      runtimeStatus = 'ready'
      return { baseUrl: SIDECAR_BASE }
    } catch (err) {
      runtimeStatus = 'error'
      throw err
    }
  })

  ipcMain.handle(HOST_IPC.stopRuntime, async () => {
    await stopSidecar()
  })

  ipcMain.handle(HOST_IPC.getRuntimeStatus, async () => runtimeStatus)
  // Board schedule wake: send HOST_IPC.boardRefreshWake to the renderer.
  // Host must not fetch widget data or write IDB.
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => {
  void stopSidecar().finally(() => {
    if (process.platform !== 'darwin') app.quit()
  })
})

app.on('before-quit', () => {
  void stopSidecar()
})
