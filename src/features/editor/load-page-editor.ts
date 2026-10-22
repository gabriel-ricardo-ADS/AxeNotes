// Import do chunk do editor (BlockNote + Yjs). O PageView e o prefetch do app logado usam esta mesma
// função: o mesmo módulo, então o chunk é um só e o que o prefetch baixou fica no cache.
export const loadPageEditor = () => import('@/features/editor/PageEditor')
