import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/auth-context'
import { indexedDbSyncMeta } from '@/features/sync/sync-meta'
import { pageDbName } from '@/lib/idb-names'
import { claimLocalData, readLocalDataOwner } from '@/lib/local-data-owner'
import { clientStateResetInProgress } from '@/lib/reset-client-state'
import { readSyncMetaEntries } from '@/lib/sync-meta-read'
import { emitAuthEvent, fakeAuth, fakeSession, resetFakeSupabase } from '@/test/fake-supabase'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

function Probe() {
  const auth = useAuth()
  return (
    <p data-testid="auth">
      {auth.status}|{auth.session?.user.id ?? ''}
      {auth.localDataError ? '|erro' : ''}
    </p>
  )
}

function renderProvider() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

const auth = () => screen.getByTestId('auth').textContent

const databaseNames = async () =>
  (await indexedDB.databases()).flatMap((info) => (info.name ? [info.name] : []))

/** Cria um banco vazio, como o y-indexeddb deixaria para a página. */
function createDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('open falhou'))
    }
  })
}

/** O que a conta A deixou no aparelho: uma página com edição ainda não enviada. */
async function leaveLocalDataOf(userId: string) {
  claimLocalData(userId)
  await createDatabase(pageDbName('pagina-de-a'))
  await indexedDbSyncMeta.setState('pagina-de-a', 'dirty', 1)
}

beforeEach(() => {
  resetFakeSupabase()
})

describe('dono dos dados locais', () => {
  it('a sessão de A expirou com o app fechado e B entra: nada de A fica no IndexedDB', async () => {
    await leaveLocalDataOf('user-a')
    renderProvider()

    emitAuthEvent('INITIAL_SESSION', null)
    expect(auth()).toBe('unauthenticated|')
    // Sem conta nenhuma, os dados de A ficam (ela pode voltar e enviar o pendente).
    expect(await databaseNames()).toContain(pageDbName('pagina-de-a'))

    emitAuthEvent('SIGNED_IN', fakeSession('user-b'))
    // B só entra depois da limpeza: nada abre nem sincroniza página antes. As telas de entrar ou
    // recuperar a senha seguem montadas (sem sessão) enquanto isso.
    expect(auth()).toBe('unauthenticated|')

    expect(await screen.findByText('authenticated|user-b')).toBeInTheDocument()
    expect((await databaseNames()).filter((name) => name.startsWith('axenotes-'))).toEqual([])
    expect(await readSyncMetaEntries()).toEqual([])
    expect(readLocalDataOwner()).toBe('user-b')
  })

  it('B com sessão guardada abre o app sobre os dados de A: limpa antes de liberar', async () => {
    await leaveLocalDataOf('user-a')
    renderProvider()

    emitAuthEvent('INITIAL_SESSION', fakeSession('user-b'))
    expect(auth()).toBe('loading|')

    expect(await screen.findByText('authenticated|user-b')).toBeInTheDocument()
    expect(await databaseNames()).not.toContain(pageDbName('pagina-de-a'))
    expect(readLocalDataOwner()).toBe('user-b')
  })

  it('A volta depois da sessão expirar: os dados (e o pendente) continuam', async () => {
    await leaveLocalDataOf('user-a')
    renderProvider()

    emitAuthEvent('INITIAL_SESSION', null)
    emitAuthEvent('SIGNED_IN', fakeSession('user-a'))

    expect(auth()).toBe('authenticated|user-a')
    expect(await databaseNames()).toContain(pageDbName('pagina-de-a'))
    expect(await readSyncMetaEntries()).toEqual([{ pageId: 'pagina-de-a', state: 'dirty' }])
  })

  it('dados sem dono gravado (de antes do marcador) passam a ser de quem entra', async () => {
    await createDatabase(pageDbName('antiga'))
    renderProvider()

    emitAuthEvent('INITIAL_SESSION', fakeSession('user-a'))

    expect(auth()).toBe('authenticated|user-a')
    expect(readLocalDataOwner()).toBe('user-a')
    expect(await databaseNames()).toContain(pageDbName('antiga'))
  })

  it('o logout esquece o dono: a próxima conta entra sem esperar', async () => {
    renderProvider()
    emitAuthEvent('INITIAL_SESSION', fakeSession('user-a'))
    expect(readLocalDataOwner()).toBe('user-a')

    emitAuthEvent('SIGNED_OUT', null)
    await vi.waitFor(() => {
      expect(readLocalDataOwner()).toBeNull()
    })

    emitAuthEvent('SIGNED_IN', fakeSession('user-b'))
    expect(auth()).toBe('authenticated|user-b')
    expect(readLocalDataOwner()).toBe('user-b')
  })

  it('se os dados de A não saem do IndexedDB, B não entra: sai e a tela de entrar avisa', async () => {
    await leaveLocalDataOf('user-a')
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const real = indexedDB
    vi.stubGlobal('indexedDB', {
      open: real.open.bind(real),
      databases: real.databases.bind(real),
      deleteDatabase: () => {
        throw new DOMException('falha simulada')
      },
    })
    try {
      renderProvider()
      emitAuthEvent('INITIAL_SESSION', fakeSession('user-b'))

      expect(await screen.findByText('unauthenticated||erro')).toBeInTheDocument()
      expect(fakeAuth.signOut).toHaveBeenCalled()
      expect(readLocalDataOwner()).toBe('user-a')
    } finally {
      vi.unstubAllGlobals()
      errorLog.mockRestore()
    }
  })

  it('se a limpeza trava, B não fica esperando para sempre nem entra sobre os dados de A', async () => {
    await leaveLocalDataOf('user-a')
    const real = indexedDB
    let unblock: (names: IDBDatabaseInfo[]) => void = () => undefined
    vi.stubGlobal('indexedDB', {
      open: real.open.bind(real),
      databases: () =>
        new Promise<IDBDatabaseInfo[]>((resolve) => {
          unblock = resolve
        }),
      deleteDatabase: real.deleteDatabase.bind(real),
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderProvider()
      emitAuthEvent('INITIAL_SESSION', fakeSession('user-b'))
      expect(auth()).toBe('loading|')

      await act(() => vi.advanceTimersByTimeAsync(10_000))

      expect(auth()).toBe('unauthenticated||erro')
      expect(fakeAuth.signOut).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      // Destrava a limpeza para ela não sobrar para o próximo teste.
      unblock([])
      await act(async () => {
        await clientStateResetInProgress()
      })
      vi.unstubAllGlobals()
    }
  })

  it('um evento mais novo durante a limpeza vence a sessão segurada', async () => {
    await leaveLocalDataOf('user-a')
    renderProvider()

    emitAuthEvent('SIGNED_IN', fakeSession('user-b'))
    emitAuthEvent('SIGNED_OUT', null)

    expect(auth()).toBe('unauthenticated|')
    await vi.waitFor(async () => {
      expect(readLocalDataOwner()).toBeNull()
      expect(await databaseNames()).not.toContain(pageDbName('pagina-de-a'))
    })
    expect(auth()).toBe('unauthenticated|')
  })
})
