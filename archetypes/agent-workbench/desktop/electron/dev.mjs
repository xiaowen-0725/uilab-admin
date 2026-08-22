#!/usr/bin/env node
/**
 * Dev launcher: compile Electron main/preload, wait for Vite, then start Electron.
 * Does not replace `pnpm dev:workbench`; run Vite separately or let this spawn it.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const workbenchRoot = path.resolve(here, '../..')
const electronBinary = require('electron')

async function loadEsbuild() {
  try {
    return await import('esbuild')
  } catch (directImportError) {
    try {
      const resolved = require.resolve('esbuild', {
        paths: [workbenchRoot, here],
      })
      return await import(resolved)
    } catch {
      throw new Error(
        'dev:desktop 需要 esbuild 才能从源码重编 Electron。请在 @uilab/agent-workbench 安装该 devDependency，不要直接运行 desktop/electron/dist/main.js。',
        { cause: directImportError },
      )
    }
  }
}

async function bundle() {
  const esbuild = await loadEsbuild()
  const outdir = path.join(here, 'dist')
  await esbuild.build({
    entryPoints: [path.join(here, 'main.ts')],
    outfile: path.join(outdir, 'main.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    external: ['electron'],
    alias: {
      '@': path.join(workbenchRoot, 'src'),
    },
  })
  await esbuild.build({
    entryPoints: [path.join(here, 'preload.ts')],
    outfile: path.join(outdir, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  })
}

function waitForVite(url, timeoutMs = 60_000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { method: 'HEAD' })
        if (res.ok || res.status === 404) {
          resolve(undefined)
          return
        }
      } catch {
        // not up yet
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`等待 Vite 超时：${url}`))
        return
      }
      setTimeout(tick, 300)
    }
    void tick()
  })
}

async function main() {
  await bundle()
  const viteUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174'
  const spawnVite = process.env.WORKBENCH_ELECTRON_SPAWN_VITE !== '0'
  let vite = null
  if (spawnVite) {
    vite = spawn('pnpm', ['dev'], {
      cwd: workbenchRoot,
      stdio: 'inherit',
      env: process.env,
    })
  }
  await waitForVite(viteUrl)
  const electron = spawn(electronBinary, [path.join(here, 'dist/main.js')], {
    cwd: workbenchRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: viteUrl,
    },
  })
  electron.on('exit', (code) => {
    if (vite) vite.kill('SIGTERM')
    process.exit(code ?? 0)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
