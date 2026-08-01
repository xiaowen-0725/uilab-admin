/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

/**
 * Minimal Browser test harness for source-consumed Foundation.
 * Does not import Admin test support.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    silent: 'passed-only',
    setupFiles: ['./src/test/setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
