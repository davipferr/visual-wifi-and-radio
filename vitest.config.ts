import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { 'visual-wifi-and-radio': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // The signal math is pure, so plain Node is enough.
    environment: 'node',
  },
})
