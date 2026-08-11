/// <reference types="vitest/config" />
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const reactRoot = path.dirname(require.resolve('react/package.json'))
const reactDomRoot = path.dirname(require.resolve('react-dom/package.json'))

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
  plugins: [
    react(),
    tailwindcss(),
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
