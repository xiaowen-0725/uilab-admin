/// <reference types="vitest/config" />
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const reactRoot = path.dirname(require.resolve('react/package.json'))
const reactDomRoot = path.dirname(require.resolve('react-dom/package.json'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
})
