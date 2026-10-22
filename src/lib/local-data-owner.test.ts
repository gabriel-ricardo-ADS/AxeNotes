import {
  claimLocalData,
  clearLocalDataOwner,
  LOCAL_DATA_OWNER_KEY,
  localDataBelongsTo,
  readLocalDataOwner,
} from '@/lib/local-data-owner'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dono dos dados locais', () => {
  it('sem marcador, o primeiro usuário vira o dono', () => {
    expect(readLocalDataOwner()).toBeNull()
    expect(claimLocalData('user-a')).toBe(true)
    expect(localStorage.getItem(LOCAL_DATA_OWNER_KEY)).toBe('user-a')
    expect(localDataBelongsTo('user-a')).toBe(true)
  })

  it('não toma os dados de outra conta', () => {
    claimLocalData('user-a')
    expect(claimLocalData('user-b')).toBe(false)
    expect(readLocalDataOwner()).toBe('user-a')
    expect(localDataBelongsTo('user-b')).toBe(false)
  })

  it('o mesmo usuário continua dono; depois de esquecer, outro pode entrar', () => {
    claimLocalData('user-a')
    expect(claimLocalData('user-a')).toBe(true)
    clearLocalDataOwner()
    expect(claimLocalData('user-b')).toBe(true)
  })

  it('dono desconhecido ou sem usuário não conta como dono', () => {
    expect(localDataBelongsTo('user-a')).toBe(false)
    claimLocalData('user-a')
    expect(localDataBelongsTo(null)).toBe(false)
  })

  it('sem localStorage, não há dono e nada quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    expect(readLocalDataOwner()).toBeNull()
    // Não há dono de outra conta para proteger; o app entra, e o segundo plano não envia nada.
    expect(claimLocalData('user-a')).toBe(true)
    expect(() => {
      clearLocalDataOwner()
    }).not.toThrow()
    expect(localDataBelongsTo('user-a')).toBe(false)
  })
})
