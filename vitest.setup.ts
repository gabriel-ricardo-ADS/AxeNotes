import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

// O jsdom não tem IndexedDB: o editor da página (y-indexeddb) usa o fake, zerado a cada teste.
// O localStorage do jsdom vive o arquivo inteiro: zerado também (o marcador do dono dos dados locais
// de um teste não pode disparar a limpeza de troca de conta no seguinte).
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  // Os testes em ambiente node (supabase/tests, scripts) não têm localStorage.
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
