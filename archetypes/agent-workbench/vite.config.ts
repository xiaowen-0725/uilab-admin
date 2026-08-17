/// <reference types="vitest/config" />
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

const CSP_NONCE_PLACEHOLDER = 'WORKBENCH_CSP_NONCE'
const CSP_DEV_CONNECT_PLACEHOLDER = 'WORKBENCH_DEV_CONNECT'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const reactRoot = path.dirname(require.resolve('react/package.json'))
const reactDomRoot = path.dirname(require.resolve('react-dom/package.json'))

function resolveDevConnect(server: ViteDevServer | undefined): string {
  if (!server) return ''
  const configured = server.config.server.port ?? 5174
  const bound = server.httpServer?.address()
  const actualPort = typeof bound === 'object' && bound ? bound.port : configured
  const ports = [...new Set([5174, configured, actualPort].filter((port) => port > 0))]
  const listed = ports.flatMap((port) => [
    `ws://localhost:${port}`,
    `ws://127.0.0.1:${port}`,
  ])
  return [...listed, 'ws://localhost:*', 'ws://127.0.0.1:*'].join(' ')
}

function workbenchCspPlugin(): Plugin {
  const buildNonce = randomBytes(16).toString('base64url')
  return {
    name: 'workbench-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const nonce = ctx.server
          ? randomBytes(16).toString('base64url')
          : buildNonce
        const sidecarPort = process.env.WORKBENCH_SIDECAR_PORT ?? '3141'
        const devConnect = resolveDevConnect(ctx.server)
        return html
          .replaceAll(CSP_NONCE_PLACEHOLDER, nonce)
          .replaceAll(` ${CSP_DEV_CONNECT_PLACEHOLDER}`, devConnect ? ` ${devConnect}` : '')
          .replaceAll('http://127.0.0.1:3141', `http://127.0.0.1:${sidecarPort}`)
      },
    },
  }
}

function browserTestFixtures(): Plugin {
  return {
    name: 'workbench-browser-test-fixtures',
    configureServer(server) {
      server.middlewares.use(
        '/__vitest__/browser-frame-pending',
        (_request, response) => {
          response.statusCode = 200
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.write('<!doctype html><title>pending</title>')
          // Deliberately leave the response open. Removing the test iframe
          // closes the response and gives BrowserPanel no native load signal.
        },
      )
    },
  }
}

export default defineConfig(({ mode }) => ({
  html: {
    cspNonce: CSP_NONCE_PLACEHOLDER,
  },
  plugins: [
    react(),
    tailwindcss(),
    workbenchCspPlugin(),
    ...(mode === 'test' ? [browserTestFixtures()] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Single React for Base UI primitives + Vitest browser (avoid dual copies).
      react: reactRoot,
      'react-dom': reactDomRoot,
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      '@base-ui/react/button',
      '@base-ui/react/collapsible',
      '@base-ui/react/dialog',
      '@base-ui/react/menu',
      '@base-ui/react/radio',
      '@base-ui/react/radio-group',
      '@base-ui/react/scroll-area',
      '@base-ui/react/separator',
      '@base-ui/react/tooltip',
      '@base-ui/react/use-render',
      'class-variance-authority',
    ],
  },
  server: {
    port: 5174,
    proxy: {
      // Local VoltAgent sidecar (tooling/workbench-runtime-voltagent)
      '/voltagent-runtime': {
        target: 'http://127.0.0.1:3141',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/voltagent-runtime/, ''),
      },
    },
  },
  preview: {
    port: 4174,
  },
  test: {
    silent: 'passed-only',
    setupFiles: ['./src/test-support/setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      // Wide desktop target from work order — reserved Navigator, not overlay.
      instances: [
        {
          browser: 'chromium',
          viewport: { width: 1440, height: 900 },
        },
      ],
    },
  },
}))
