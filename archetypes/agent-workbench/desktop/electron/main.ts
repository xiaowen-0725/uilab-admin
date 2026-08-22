/**
 * Minimal Electron main process for Spec-α Desktop Host.
 * Dev-mode only: no installer, updater, or code signing.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  type BrowserWindowConstructorOptions,
} from 'electron'
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
  isHostNativeTheme,
  type HostCreateProjectDirectoryInput,
  type HostNativeTheme,
  type HostProjectsHomePayload,
  type HostRuntimeStatus,
} from '../../src/modules/project/ports/host-wire'

const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174'
const SIDECAR_PORT = process.env.WORKBENCH_SIDECAR_PORT ?? '3141'
const SIDECAR_BASE = `http://127.0.0.1:${SIDECAR_PORT}`

let mainWindow: BrowserWindow | null = null
let sidecar: ChildProcess | null = null
let runtimeStatus: HostRuntimeStatus = 'stopped'

const HERE_DIR = path.dirname(fileURLToPath(import.meta.url))

function resolveSidecarDir(): string {
  if (process.env.WORKBENCH_SIDECAR_DIR) {
    return path.resolve(process.env.WORKBENCH_SIDECAR_DIR)
  }
  return path.resolve(HERE_DIR, '../../../../../tooling/workbench-runtime-voltagent')
}

function resolvePreload(): string {
  return path.join(HERE_DIR, 'preload.cjs')
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

/** Light uses the system sidebar material; dark punches through to the desktop. */
function macosVibrancyForCurrentTheme(): 'under-window' | 'sidebar' {
  return nativeTheme.shouldUseDarkColors ? 'under-window' : 'sidebar'
}

function applyMacWindowAppearance(win: BrowserWindow): void {
  if (process.platform !== 'darwin') return
  win.setVibrancy(macosVibrancyForCurrentTheme())
  win.setBackgroundColor('#00000001')
}

function refreshMacWindowAppearance(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  applyMacWindowAppearance(mainWindow)
}

function applyNativeTheme(theme: HostNativeTheme): boolean {
  nativeTheme.themeSource = theme
  refreshMacWindowAppearance()
  return true
}

function macWindowOptions(): BrowserWindowConstructorOptions {
  if (process.platform !== 'darwin') return {}
  return {
    backgroundColor: '#00000001',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    vibrancy: macosVibrancyForCurrentTheme(),
    visualEffectState: 'active',
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    ...macWindowOptions(),
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
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
  ipcMain.handle(HOST_IPC.setNativeTheme, async (_event, theme: unknown) => {
    if (!isHostNativeTheme(theme)) return false
    return applyNativeTheme(theme)
  })
  // Board schedule wake: send HOST_IPC.boardRefreshWake to the renderer.
  // Host must not fetch widget data or write IDB.
}

app.whenReady().then(() => {
  registerIpc()
  nativeTheme.on('updated', () => {
    refreshMacWindowAppearance()
  })
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
