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
  build: {
    rolldownOptions: {
      output: {
        // Vendors em chunks próprios: mudam pouco, então o navegador reaproveita o cache entre deploys.
        // As telas vêm em dois chunks de rota (src/app/route-modules.ts). `vendor` junta as outras
        // libs usadas por mais de um chunk (Query, Radix base, lucide…), para não sobrar chunk
        // minúsculo; libs só do app logado (dnd-kit, diálogos) ficam no chunk do app.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              priority: 3,
            },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 2 },
            { name: 'vendor', test: /node_modules[\\/]/, minShareCount: 2, priority: 1 },
          ],
        },
      },
    },
  },
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
