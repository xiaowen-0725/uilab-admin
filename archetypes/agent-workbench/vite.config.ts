/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
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
