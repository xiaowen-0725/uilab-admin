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

const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174'
const SIDECAR_PORT = process.env.WORKBENCH_SIDECAR_PORT ?? '3141'
const SIDECAR_BASE = `http://127.0.0.1:${SIDECAR_PORT}`

type ProfilePayload = {
  projectsHomeDirName: string
  projectsHomeOverride?: string
}

let mainWindow: BrowserWindow | null = null
let sidecar: ChildProcess | null = null
let runtimeStatus: 'stopped' | 'starting' | 'ready' | 'error' = 'stopped'

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

function resolveHome(payload: ProfilePayload): string {
  const homeDir = os.homedir()
  return resolveProjectsHomePath(homeDir, {
    projectsHomeDirName: payload.projectsHomeDirName || 'AgentWorkbench',
    projectsHomeOverride: payload.projectsHomeOverride,
  })
}

async function waitForRuntimeReady(
  workspaceRoot: string,
  timeoutMs = 20_000,
): Promise<void> {
  const expected = normalizeLocalRoot(workspaceRoot)
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${SIDECAR_BASE}/workspace/info`)
      if (res.ok) {
        const body = (await res.json()) as { workspaceRoot?: string }
        if (
          typeof body.workspaceRoot === 'string' &&
          normalizeLocalRoot(body.workspaceRoot) === expected
        ) {
          return
        }
      }
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('侧车启动超时：工作根尚未就绪')
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
  ipcMain.handle('host:pickDirectory', async () => {
    const parent = mainWindow ?? undefined
    const result = await dialog.showOpenDialog(parent, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const }
    }
    return { path: result.filePaths[0]! }
  })

  ipcMain.handle('host:ensureProjectsHome', async (_event, payload: ProfilePayload) => {
    const home = resolveHome(payload)
    await mkdir(home, { recursive: true })
    return home
  })

  ipcMain.handle(
    'host:createProjectDirectory',
    async (
      _event,
      input: ProfilePayload & { preferredName: string },
    ) => {
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

  ipcMain.handle('host:startRuntime', async (_event, workspaceRoot: string) => {
    const root = normalizeLocalRoot(expandHome(workspaceRoot, os.homedir()))
    runtimeStatus = 'starting'
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
      await waitForRuntimeReady(root)
      runtimeStatus = 'ready'
      return { baseUrl: SIDECAR_BASE }
    } catch (err) {
      runtimeStatus = 'error'
      throw err
    }
  })

  ipcMain.handle('host:stopRuntime', async () => {
    await stopSidecar()
  })

  ipcMain.handle('host:getRuntimeStatus', async () => runtimeStatus)
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
