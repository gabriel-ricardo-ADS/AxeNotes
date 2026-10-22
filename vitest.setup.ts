import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

// O jsdom não tem IndexedDB: o editor da página (y-indexeddb) usa o fake, zerado a cada teste.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
