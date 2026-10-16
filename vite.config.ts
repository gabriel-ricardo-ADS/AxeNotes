/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.{ts,mjs}',
      'supabase/tests/**/*.test.ts',
    ],
    css: false,
    // Os testes de banco sobem um Postgres (PGlite/WASM) por arquivo.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
