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
    // Só cala o aviso do Vite para o chunk do editor (BlockNote + Yjs, ~1,1 MB minificado, lazy). O
    // orçamento de verdade, em gzip e por chunk, é o `pnpm size:check` (scripts/check-bundle-size.mjs).
    chunkSizeWarningLimit: 1200,
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
            // Código do app usado pela entrada E pelos chunks de rota e do editor (textos, cliente
            // Supabase, `cn`): chunk próprio, como já saía sozinho até a 2c-1. Sem este grupo o
            // rolldown passou a fundi-lo na entrada (a mesma coisa baixada no início, mas a entrada crescia).
            { name: 'shared', test: /[\\/]src[\\/]/, minShareCount: 3, priority: 0 },
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
    // O fake-indexeddb (editor da página) agenda as transações com setImmediate: os timers falsos
    // não podem tomá-lo, senão a transação fecha antes da hora.
    fakeTimers: {
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    },
    // Os testes de banco sobem um Postgres (PGlite/WASM) por arquivo.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
