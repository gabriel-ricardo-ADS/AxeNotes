import { useSearchStore } from '@/features/search/search-store'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import { create, resetAllStores } from '@/lib/create-store'

describe('create-store', () => {
  it('puts every store created through it back to its initial state', () => {
    const useCounter = create<{ count: number; bump: () => void }>((set, get) => ({
      count: 0,
      bump: () => {
        set({ count: get().count + 1 })
      },
    }))
    useCounter.getState().bump()
    useCounter.getState().bump()

    resetAllStores()

    expect(useCounter.getState().count).toBe(0)
    useCounter.getState().bump()
    expect(useCounter.getState().count).toBe(1)
  })

  it('resets the app stores (search and tree)', () => {
    useSearchStore.getState().openSearch(null)
    useSearchStore.getState().setTerm('leituras')
    useSearchStore.getState().notifyPick()
    useTreeUiStore.getState().bindUser('user-a')
    useTreeUiStore.getState().expand('page-1')
    useTreeUiStore.getState().startRename('page-1')
    useTreeUiStore.getState().setNotice('aviso')

    resetAllStores()

    expect(useSearchStore.getState()).toMatchObject({
      open: false,
      term: '',
      opener: null,
      pickCount: 0,
    })
    const tree = useTreeUiStore.getState()
    expect(tree).toMatchObject({ ownerId: null, renamingId: null, notice: null })
    expect(tree.expanded.size).toBe(0)
  })
})
