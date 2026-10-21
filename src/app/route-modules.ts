// Dois chunks de rota: autenticação (quem ainda não entrou não baixa o app) e app logado (layout,
// árvore, dnd-kit, diálogos). Agrupar evita um chunk minúsculo por página.
export const loadAuthRoutes = () => import('@/features/auth/auth-routes')
export const loadAppRoutes = () => import('@/app/app-routes')

/** Baixa os dois chunks de rota (os testes usam para não esperar o import no primeiro render). */
export async function preloadRoutes(): Promise<void> {
  await Promise.all([loadAuthRoutes(), loadAppRoutes()])
}
