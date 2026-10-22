/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { parseHeadersFile } from './scripts/cloudflare-headers.ts'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  // O `pnpm preview` serve os mesmos headers que o Cloudflare Pages lê do public/_headers (CSP
  // inclusa). O `pnpm dev` não: o HMR do Vite injeta estilos e scripts inline.
  preview: { headers: parseHeadersFile(readFileSync('public/_headers', 'utf8')) },
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
