import { waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { usePageMutations } from '@/features/workspace/hooks/use-page-mutations'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { dbPage, fakeId, mockProfile, resetFakeSupabase, seedPages } from '@/test/fake-supabase'
import { renderWithSession } from '@/test/render-with-session'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const HOME = fakeId(1000)
const PARENT = fakeId(1)
const CHILD = fakeId(2)
const NEW_ID = fakeId(99)

const probe: { mutations: ReturnType<typeof usePageMutations> | null; loaded: boolean } = {
  mutations: null,
  loaded: false,
}

function Probe() {
  const mutations = usePageMutations()
  const loaded = usePages().isSuccess
  useEffect(() => {
    probe.mutations = mutations
    probe.loaded = loaded
  })
  return null
}

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
  probe.mutations = null
  probe.loaded = false
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    { id: PARENT, title: 'Mãe', sortKey: 'a0' },
    { id: CHILD, parentId: PARENT, title: 'Filha', sortKey: 'a0' },
  ])
})

describe('usePageMutations.createPage', () => {
  it('uses the id given by the caller and puts the page after the existing children', async () => {
    renderWithSession(<Probe />)
    await waitFor(() => {
      expect(probe.loaded).toBe(true)
    })

    const id = await probe.mutations?.createPage(PARENT, { id: NEW_ID })

    expect(id).toBe(NEW_ID)
    const row = dbPage(NEW_ID)
    expect(row?.parent_id).toBe(PARENT)
    expect(String(row?.sort_key) > 'a0').toBe(true)
  })
})
