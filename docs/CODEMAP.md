# CODEMAP — onde está cada coisa no AxeNotes

> Atualizado em 2026-10-26, `main` em 915ef05 (#19).

Este arquivo responde **"onde fica isso?"** e **"o que acontece, passo a passo?"**. O **porquê** das escolhas está
nos outros docs: [ARCHITECTURE](ARCHITECTURE.md) (stack, modelo de dados, sync), [DECISIONS](DECISIONS.md),
[ADR 0001](adr/0001-conteudo-yjs.md) (formato do conteúdo e limites), [DEPLOY](DEPLOY.md) (CSP e Cloudflare),
[ROADMAP](ROADMAP.md) e [`supabase/README.md`](../supabase/README.md) (aplicar migrações, painel de Auth).

**Convenções**

- Referência de código sempre como `arquivo:símbolo` (ou só `arquivo`), sem número de linha: o símbolo é o que
  não muda quando o arquivo é editado. `Classe.método` vale como `símbolo`.
- `pnpm codemap:check` confere que todo arquivo e símbolo citado entre crases ainda existe. Se ele falhar, o código
  mudou e este mapa precisa acompanhar (regra da skill `fase`: PR que cria ou muda um fluxo, uma RPC ou uma
  função-chave atualiza este arquivo no mesmo PR).
- "Servidor" = Supabase (Postgres + RLS + RPCs). "Aparelho" = navegador (IndexedDB, localStorage).
- Textos visíveis ficam em `src/i18n/pt-BR.ts`; aqui só aparecem as chaves quando ajudam a achar a tela.

---

## 1. Visão em 10 linhas

1. AxeNotes é um app de notas estilo Notion: páginas em árvore, editor de blocos, favoritos, recentes, lixeira, busca.
2. Um único código web (Vite + React + TypeScript strict) roda no PC, Android e iOS como PWA; hospedado no
   Cloudflare Pages (headers em `public/_headers`).
3. **Dados do servidor** (workspace, páginas, favoritos…): TanStack Query (`src/lib/query-client.ts`) chamando
   funções de `src/features/*/api/`; nunca o Supabase direto no componente.
4. **Estado só de interface** (árvore expandida, busca aberta, aviso): Zustand, sempre via `src/lib/create-store.ts`
   (o logout reseta todas).
5. **Conteúdo das páginas**: BlockNote (`src/features/editor/PageEditor.tsx`) sobre um Y.Doc por página, guardado no
   IndexedDB (`y-indexeddb`) e sincronizado com o servidor em `src/features/sync/`. Offline-first.
6. **Servidor**: Postgres com RLS em todas as tabelas; acesso por pertencimento ao workspace
   (`is_workspace_member`, `can_access_page`); escritas sensíveis só por RPC `security definer`.
7. **Auth**: e-mail + senha, com código de 6 dígitos (OTP) só para confirmar o cadastro e recuperar a senha
   (DECISÃO-014). A sessão fica no `AuthProvider`.
8. **Logout limpo**: um ponto único (`src/lib/reset-client-state.ts:resetClientState`) apaga cache, stores, IndexedDB,
   service worker e Cache Storage; o "Sair" envia o conteúdo pendente antes.
9. **Dois chunks de rota** (auth e app) mais o **chunk do editor** (BlockNote + Yjs + sync), todos lazy, com recarga
   automática se um chunk antigo sumir depois de um deploy.
10. **Testes**: Vitest (unidade e componentes, com `src/test/fake-supabase.ts`), PGlite para o SQL
    (`supabase/tests/`), Playwright em `e2e/` (desktop, iPhone, iPad; precisa de usuário de teste no `.env.local`).

---

## 2. Mapa de pastas

### 2.1 Código do app (`src/`)

| Pasta                                                       | Responsabilidade                                                                                                                       | Não coloque aqui                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/main.tsx`                                              | Entrada: configura o zod (`zod-config`, sempre o 1º import), CSS, escuta `vite:preloadError`, monta `<App />`.                         | Lógica de tela ou de dados.                                                            |
| `src/app/`                                                  | Rotas (`src/app/App.tsx`), os dois grupos lazy (`src/app/route-modules.ts`, `src/app/app-routes.ts`), `RouteErrorBoundary`, `NotFoundPage`.                    | Telas de uma feature (vão em `src/features/<feature>/`).                               |
| `src/app/layout/`                                           | Casca do app logado: `AppLayout` (sidebar fixa ou gaveta), `Sidebar`, `MobileNav`, faixa do topo (`top-bar-*`), `SidebarNotice`.       | Regras de negócio; as seções da sidebar vivem na feature de cada uma.                  |
| `src/components/`                                           | Componentes genéricos sem feature (`ScreenLoading`).                                                                                   | Componente usado por uma feature só.                                                   |
| `src/components/ui/`                                        | shadcn/ui (`alert-dialog`, `button`, `dialog`, `dropdown-menu`, `input`, `sheet`). Gerado/adaptado; fora do lint.                      | Componentes do app. Adicione novos com o CLI do shadcn.                                |
| `src/hooks/`                                                | Hooks genéricos (`use-media-query`, `use-now`).                                                                                        | Hook que conhece uma feature.                                                          |
| `src/i18n/`                                                 | `src/i18n/pt-BR.ts` (todos os textos) e `src/i18n/index.ts` (`t()` com chaves tipadas).                                                                  | Texto solto em componente.                                                             |
| `src/lib/`                                                  | Infra sem tela: cliente Supabase, query client, stores (`create-store`), limpeza do logout, dono dos dados locais, chunks, fracionário. | Código de uma feature. Se só uma feature usa, fica nela.                               |
| `src/styles/`                                               | `src/styles/tokens.css` (variáveis do tema), `src/styles/theme.css` (`@theme` do Tailwind), `src/styles/index.css`.                                                     | Estilo de componente (use classes Tailwind).                                           |
| `src/test/`                                                 | Apoio aos testes de unidade: `fake-supabase`, `render-app`, `match-media`.                                                             | Código de produção.                                                                    |
| `src/features/auth/`                                        | Entrar, criar conta, OTP, recuperar senha, sair, sessão (`AuthProvider`), guardas de rota, `UserMenu`.                                 | Dados do workspace.                                                                    |
| `src/features/workspace/`                                   | Workspace do usuário, páginas (CRUD, árvore, ordem, mover), página inicial, "Editada há…", `PagesSection`/`PageTree`.                  | Conteúdo do corpo da página (é `sync`/`editor`); lixeira (é `trash`).                  |
| `src/features/pages/`                                       | Rota `/p/:pageId`: `PagePage`, `PageView`, `PageTitle`, `Breadcrumb`, `PageMenu`, estados de carregamento.                             | Lista de páginas (é `workspace`).                                                      |
| `src/features/editor/`                                      | O **chunk do editor**: `PageEditor`, schema de blocos, dicionário pt-BR, menu "/", `src/features/editor/editor.css`.                                       | Lógica de sync (é `sync`). Só `editor/` e `sync/` podem importar BlockNote/Yjs.        |
| `src/features/sync/`                                        | Y.Doc por página, IndexedDB, sincronização com o servidor, metadados `axenotes-sync`, reenvio em segundo plano, indicador.             | Telas de página.                                                                       |
| `src/features/favorites/`, `recents/`, `trash/`, `search/`  | Uma pasta por função da sidebar: `api/`, `hooks/`, `components/`, um `src/features/<feature>/query-keys.ts` e a lógica pura (`src/features/favorites/favorites.ts`, `src/features/recents/recents.ts`…).    | Lógica de outra feature; reaproveite via import, não copie.                            |
| `src/features/home/`                                        | A rota `/`: mostra a página inicial do workspace.                                                                                      | —                                                                                      |

Padrão de uma feature: `api/` (só chamadas ao Supabase, validadas com zod) → `hooks/` (TanStack Query) →
`components/`; `src/features/<feature>/query-keys.ts` com as chaves; um arquivo de **lógica pura** testável (`src/features/workspace/tree.ts`, `src/features/recents/recents.ts`,
`src/features/trash/trash.ts`, `src/features/search/search.ts`); testes `*.test.ts(x)` ao lado do arquivo.

### 2.2 Fora de `src/`

| Pasta / arquivo                                                                          | Responsabilidade                                                                                                              | Não coloque aqui                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `supabase/migrations/`                                                                   | Migrações versionadas (8). **Nunca edite uma já aplicada**; crie outra. Skill `migracao-supabase`.                            | Seed ou dados.                                                |
| `supabase/tests/`                                                                        | Testes do SQL em PGlite (RLS, RPCs, limites). `helpers/` tem `supabase/tests/helpers/db.ts` (sobe o banco), `supabase/tests/helpers/fixtures.ts` e `supabase/tests/helpers/bootstrap.sql` (roles). | Teste do front.                                               |
| `supabase/seed.sql`, `supabase/config.toml`                                              | Seed fictícia (só local) e config mínima do CLI.                                                                              | Dados reais; a seed **nunca** vai para o remoto.              |
| `e2e/`                                                                                   | Specs do Playwright; `e2e/auth.setup.ts` salva a sessão por projeto; `e2e/cleanup.setup.ts` limpa sobras `e2e-…`; `e2e/screenshot.ts`.    | Teste que não precisa de navegador.                           |
| `e2e/support/`                                                                           | `e2e/support/env.ts` (credenciais do `.env.local`), `e2e/support/pages-api.ts` (API REST p/ criar/limpar páginas), `e2e/support/run-fixture.ts`, `e2e/support/ui.ts`.        | Segredos.                                                     |
| `scripts/`                                                                               | Ferramentas Node: `scripts/check-licenses.mjs`, `scripts/check-bundle-size.mjs`, `scripts/check-codemap.mjs`, `scripts/eslint-require-tsdoc.mjs` (regra local do lint), `scripts/cloudflare-headers.ts`, `scripts/format-edited-file.mjs`. | Código do app.                                                |
| `public/`                                                                                | `_headers` (CSP e demais headers do Cloudflare Pages), ícones/estáticos.                                                      | Código.                                                       |
| `.claude/`                                                                               | Skills (`design-axenotes`, `fase`, `migracao-supabase`, `novo-bloco`, `verificar-ui`), agentes revisores, hook de formatação. | —                                                             |
| `.github/`                                                                               | `.github/workflows/ci.yml` (matriz: typecheck, lint, test, build, licenses, knip, format, codemap) e o template de PR.                | —                                                             |
| `docs/`                                                                                  | PRD, ARCHITECTURE, DECISIONS, ROADMAP, UI-REFERENCE, DEPLOY, ADRs e este CODEMAP. `docs/reference/` é local e ignorada pelo git. | Dados da cliente em arquivos versionados.                     |
| `vite.config.ts`, `eslint.config.js`, `knip.json`, `playwright.config.ts`, `vitest.setup.ts` | Config de build/chunks (`codeSplitting`), lint, código morto, e2e (projetos `desktop`, `mobile`, `tablet`, `api`) e testes.   | —                                                             |

---

## 3. Fluxos de ponta a ponta

Cada item: **o que acontece → `arquivo:função`**.

### 3.1 Entrar (e-mail + senha)

1. Quem não tem sessão abre uma rota protegida → `src/features/auth/guards.tsx:RequireAuth` manda para `/entrar`,
   guardando `{ from }` no `location.state` (não guarda depois de "Sair": `signedOutByUser`).
2. Envio do formulário → `src/features/auth/pages/SignInPage.tsx:SignInPage` valida com
   `src/features/auth/schemas.ts:signInSchema`.
3. Chama `src/features/auth/api/auth.ts:signIn` (`signInWithPassword`). Qualquer erro vira
   `src/features/auth/errors.ts:AuthFlowError` com uma categoria; a mensagem vem de `authErrorMessageKey`.
   `email_not_confirmed` não mostra erro: leva a `/codigo`.
4. O supabase-js emite `SIGNED_IN` → `src/features/auth/AuthProvider.tsx:AuthProvider` (assinatura via
   `src/features/auth/api/auth.ts:subscribeToAuthChanges`) confere o dono dos dados locais (ver 3.5), faz
   `claimLocalData` e põe `status: 'authenticated'`.
5. `src/features/auth/guards.tsx:GuestOnly` redireciona para `sanitizeRedirect(readFrom(location.state))`
   (`src/features/auth/redirect.ts`, `src/features/auth/navigation-state.ts`): só caminhos internos, nunca `/entrar` etc.

### 3.2 Criar conta (OTP de cadastro)

1. `src/features/auth/pages/SignUpPage.tsx:SignUpPage` → `signUpSchema` → `src/features/auth/api/auth.ts:signUp`
   (`options.data.display_name`).
2. No servidor, o insert em `auth.users` dispara `handle_new_user`: cria `profiles`, o workspace pessoal e a linha
   `workspace_members` com papel `owner` (ver 4.2). A **página inicial não nasce aqui** (ver 3.7).
3. Navega para `/codigo` com `state { email, sent, from }` (o e-mail viaja no state, nunca na URL).
4. `src/features/auth/pages/VerifyCodePage.tsx:VerifyCodePage` lê o state com `readCodeState` (sem state, pede o
   e-mail). `src/features/auth/components/CodeInput.tsx:CodeInput` chama `onComplete` ao chegar a 6 dígitos
   (`CODE_LENGTH` em `src/features/auth/schemas.ts` precisa bater com o painel do Supabase).
5. `verifySignupCode` (`verifyOtp` tipo `signup`) abre a sessão → mesmo caminho dos passos 4–5 do 3.1.
6. Reenviar: `resendSignupCode` + `src/features/auth/hooks/use-cooldown.ts:useCooldown` (60 s).

### 3.3 Recuperar a senha

1. `src/features/auth/pages/RecoverPasswordPage.tsx:RecoverPasswordPage`, 3 etapas: e-mail → código → nova senha.
2. E-mail: `requestPasswordReset` (resposta igual exista a conta ou não).
3. Código: `submitCode` chama `setRecovering(true)` **antes** de `verifyRecoveryCode`, porque o código aceito já abre
   uma sessão e `GuestOnly` só deixa quem está em `/recuperar-senha` com `recovering` ficar na tela. Se falhar, desfaz.
4. Nova senha: `updatePassword` e, sem bloquear, `signOutOtherSessions` (derruba os outros aparelhos).
5. `setRecovering(false)` → `GuestOnly` vê usuário autenticado e redireciona para dentro do app.

### 3.4 Sair (flush do sync → signOut → resetClientState)

1. `src/features/auth/components/UserMenu.tsx:UserMenu` (`handleSignOut`): carrega o chunk do editor
   (`src/features/editor/load-page-editor.ts:loadPageEditor`), que registra o flusher em `src/lib/pending-content.ts`
   (`registerPendingContentFlusher`, chamado no fim de `src/features/sync/background.ts`).
2. `src/lib/pending-content.ts:flushPendingContent` (até 5 s): com o sync carregado,
   `src/features/sync/background.ts` (`flushAllPendingContent`) manda as páginas abertas (`PageSyncSession.settle`) e
   reenvia as `dirty` fechadas (`resyncClosedPages`), devolvendo quantas ainda estão pendentes. Sem o chunk (offline),
   conta as `dirty` lendo o `axenotes-sync` direto (`src/lib/sync-meta-read.ts:readSyncMetaEntries`), só se o dono dos
   dados locais é o usuário (`localDataBelongsTo`).
3. Sobrou algo → diálogo "Há alterações não sincronizadas. Sair mesmo assim?"; senão segue.
4. `doSignOut` → `src/features/auth/AuthProvider.tsx:AuthProvider` (`signOut`) → `src/features/auth/api/auth.ts:signOut`
   (`scope: 'local'`: só este aparelho).
5. O evento `SIGNED_OUT` chama, **na hora e síncrono**, `src/lib/reset-client-state.ts:resetClientState`: cancela e
   limpa o TanStack Query, `resetAllStores` (`src/lib/create-store.ts`) e então, assíncrono: roda os ganchos
   `onBeforeStorageClear` (o `page-doc` fecha os Y.Docs abertos), apaga os bancos IndexedDB, desregistra service
   workers, apaga o Cache Storage e, só com o IndexedDB apagado, `clearLocalDataOwner`.
6. `signOut` espera a mesma promessa (`pendingReset`), o estado vira `unauthenticated` e `RequireAuth` manda para
   `/entrar` sem `from`.
7. Sessão que acaba sem o botão (refresh recusado, logout em outra aba): o mesmo `SIGNED_OUT` limpa tudo sem enviar
   nada (ver ARCHITECTURE §5, "Sessão encerrada sem o botão").

### 3.5 Troca de conta e dono dos dados locais

1. O localStorage `axenotes-local-owner` (`src/lib/local-data-owner.ts:LOCAL_DATA_OWNER_KEY`) guarda o id de quem é
   dono dos bancos `axenotes-page-*` e `axenotes-sync`. É síncrono de propósito (o callback do auth não espera o IndexedDB).
2. Em cada evento, `AuthProvider` calcula `changedUser`: o id em memória mudou, **ou** há dono gravado diferente de
   quem entrou (conta A expirou com o app fechado e B entrou, sem `SIGNED_OUT`).
3. `SIGNED_OUT` ou `changedUser` → `resetClientState` (parte síncrona já). Se há sessão **e** uma limpeza em andamento
   (`clientStateResetInProgress`), a sessão nova **espera**: no app recém-aberto fica `loading`; vinda de
   entrar/recuperar fica `unauthenticated` (as telas não desmontam).
4. `settleWithin` espera a limpeza até 10 s. Passou e `claimLocalData(novo)` deu `true` → libera a sessão. Falhou ou
   estourou → `localDataError`, `apiSignOut()` e a tela de entrar avisa (`auth.errors.localDataNotCleared`).
5. `lastEvent` numera os eventos: uma sessão segurada só entra se nada mais novo chegou.
6. Reenvio em segundo plano e contagem do "Sair" só consideram os registros se o dono é o usuário do JWT
   (`src/features/sync/background.ts:countPendingPages` / `resyncClosedPages`, `ownsLocalData`).

### 3.6 Abrir o app (guards, prefetch, code-splitting, chunk antigo)

1. `src/main.tsx`: importa `src/lib/zod-config.ts` primeiro (zod `jitless`, por causa da CSP), CSS e fonte; registra
   `vite:preloadError` → `src/lib/chunk-reload.ts:reloadOnChunkError`; monta `src/app/App.tsx:App`.
2. `App`: `QueryClientProvider` (`createQueryClient`) → `BrowserRouter` → `AuthProvider` → `AppRoutes`. Importar
   `src/lib/supabase.ts` já valida as variáveis de ambiente (`parseSupabaseEnv`); env inválida derruba a tela cedo.
3. `AuthProvider` fica `loading` até o primeiro `onAuthStateChange` (`INITIAL_SESSION`). Enquanto isso `RequireAuth` e
   `GuestOnly` mostram `src/components/ScreenLoading.tsx:ScreenLoading`.
4. `AppRoutes` usa `lazyWithReload` (`src/lib/lazy-with-reload.ts`) em cada tela, mas só dois imports reais:
   `src/app/route-modules.ts:loadAuthRoutes` (chunk auth) e `loadAppRoutes` (chunk do app logado). Quem não entrou não
   baixa o app. Um `Suspense` e um `RouteErrorBoundary` (`resetKey` = pathname) envolvem tudo.
5. App logado: `src/app/layout/AppLayout.tsx:AppLayout` chama `prefetchOnIdle(loadPageEditor)`
   (`src/lib/prefetch-on-idle.ts`): baixa o chunk do editor em tempo ocioso (nada offline, com economia de dados ou 2G).
6. **Chunk antigo depois de um deploy**: o arquivo com hash velho some e o Cloudflare devolve `index.html` (MIME errado)
   → o import falha → `lazyWithReload` chama `reloadOnChunkError`: recarrega **uma** vez (guarda em `sessionStorage`
   por 10 s contra loop) e fica em suspenso; falhando de novo, `RouteErrorBoundary` mostra "recarregar".
7. Divisão em vendors (`react`, `supabase`, `vendor`) em `vite.config.ts` (`codeSplitting.groups`); o orçamento de
   cada chunk é conferido por `scripts/check-bundle-size.mjs` (`pnpm size:check`, depois do build).

### 3.7 Árvore de páginas (criar, mover, `sort_key`)

1. **Listar**: `src/features/workspace/hooks/use-pages.ts:usePages` → `src/features/workspace/api/pages.ts:fetchPages` (todas as páginas fora
   da lixeira, em lotes de 1000 por cursor de `id`) → cache `['pages', workspaceId]`
   (`src/features/workspace/query-keys.ts:workspaceKeys`). O workspace vem de `useWorkspace` → `fetchWorkspace`.
2. **Montar**: `src/features/workspace/tree.ts:buildPageTree` agrupa por pai de exibição (a página inicial não é item;
   os filhos dela viram raízes) e ordena com `comparePages` (`sort_key` por `<`, empate pelo id; **nunca**
   `localeCompare`). `flattenVisible` gera as linhas visíveis para `PageTree`.
3. **Criar**: `src/features/workspace/components/PagesSection.tsx:PagesSection` (`handleCreate`) →
   `src/features/workspace/hooks/use-page-mutations.ts:usePageMutations` (`createPage`): UUID gerado no cliente,
   `keyAtEnd` → `src/lib/fractional-index.ts:keyAtIndex` → `keyBetween` (lib `fractional-indexing`), `createMutation`
   otimista na fila `PAGES_WRITE_SCOPE` → `src/features/workspace/api/pages.ts:insertPage` (sem `RETURNING`, a RLS de select pode não ver a
   linha nova) → `reconcile` (invalida). Navega para `/p/:id` com `FOCUS_TITLE_STATE`.
4. **Renomear / ícone**: título por `PageTitle` (ver 3.11), ícone por `setPageIcon`; ambos `updateMutation` otimista
   (`applyPatch`, `rollbackRow` desfaz só o campo que a escrita mexeu) → `src/features/workspace/api/pages.ts:updatePage`. A RLS não dá erro
   ao barrar: zero linhas viram erro em `updatePage`.
5. **Mover**: arrastar (`src/features/workspace/components/PageTree.tsx:PageTree`, `handleDragEnd` → `resolveDrop`) ou
   "Mover para…" (`MovePageDialog`) → `usePageMutations.movePage` → `src/features/workspace/tree.ts:planMove` (`validateMove` barra ciclo;
   `tie` recusa quando os vizinhos têm a mesma `sort_key`) → `updateMutation` com `{ parentId, sortKey }` → ao fim
   `reconcile`. No banco, `pages_guard` barra ciclo e pai na lixeira (ver 4.3).
6. **Página inicial**: `src/features/workspace/hooks/use-home-page.ts:useHomePage` → se `home_page_id` é nulo e o
   usuário é owner, `src/features/workspace/home.ts:ensureHomePage` (lock `navigator.locks` entre abas + `update …
   where home_page_id is null` em `setHomePageIfEmpty`; quem perde apaga a própria página).
7. Estado só de UI (expandido, renomeando, aviso): `src/features/workspace/tree-ui-store.ts:useTreeUiStore`.

### 3.8 Favoritos e recentes

1. **Favoritos**: `src/features/favorites/hooks/use-favorites.ts:useFavorites` → `src/features/favorites/api/favorites.ts:fetchFavorites`
   (cache `['favorites', userId]`). A sidebar junta com `usePages` em `src/features/favorites/favorites.ts:visibleFavorites`: favorito de página
   na lixeira some, mas a linha continua; restaurar traz de volta.
2. **Favoritar**: estrela (`FavoriteButton`) ou menu da linha → `src/features/favorites/hooks/use-favorite-mutations.ts:useFavoriteMutations`
   (`toggleFavorite`): otimista, fila `favorites-write`, `addFavorite` (`upsert … ignoreDuplicates`) com chave no fim
   (`favoriteKeyAtEnd`) ou `removeFavorite`. Sucesso não recarrega nada; falha desfaz só o item.
3. **Recentes**: `src/features/recents/hooks/use-record-visit.ts:useRecordVisit` (chamado por `PageView` só para
   página encontrada, fora a inicial e fora a lixeira). `shouldRecord` barra a mesma página em 30 s; sobe a página no
   cache (`withVisit`), `recordVisit` (`upsert` com `visited_at` sempre no payload) e, se a lista passou de 50,
   `trimRecents` (best effort).
4. **Mostrar**: `src/features/recents/hooks/use-visible-recents.ts:useVisibleRecents` → `src/features/recents/recents.ts:visibleRecents` (8 itens, sem a inicial nem o
   que não está em `usePages`). Também alimenta a busca vazia (3.10).

### 3.9 Lixeira (mandar, restaurar, apagar de vez, abrir só leitura)

1. **Mandar** (`src/features/trash/hooks/use-trash-page.ts:useTrashPage`, função `trash`): se a página aberta está na
   subárvore, `leaveTo` navega (replace) para o pai (`fallbackAfterTrash`) e **espera** a rota mudar; então
   `removeFromCache` (tira a subárvore de `['pages', ws]` e remove `['page', id]`); então o RPC
   `src/features/trash/api/trash.ts:trashPage` (`trash_page`), na fila `PAGES_WRITE_SCOPE`. Na árvore é otimista (falha
   devolve as linhas). No menu da página (`confirmFirst`) espera o servidor antes de sair da tela.
2. O RPC marca a subárvore viva inteira com o **mesmo** `trashed_at` (ver 4.4). `refreshTrash` invalida `['trash', ws]`.
3. **Listar**: `src/features/trash/hooks/use-trash.ts:useTrash` → `src/features/trash/api/trash.ts:fetchTrashedPages` → `src/features/trash/trash.ts:buildTrashRoots` (raiz = pai fora da
   lixeira **ou** com `trashed_at` diferente; carimbos comparados como texto) em `src/features/trash/components/TrashPage.tsx:TrashPage`.
4. **Restaurar**: `src/features/trash/hooks/use-trash-actions.ts:useTrashActions` (`restore`, sem otimismo) → `restorePage` (`restore_page`).
   `23514`/`parent_trashed` (pai ainda na lixeira) vira mensagem própria via `src/features/trash/messages.ts:trashErrorMessage`.
5. **Apagar de vez**: `deleteForever` → `deletePagePermanently`: `delete … returning id`; a RLS só deixa página já na
   lixeira e de editor; **zero linhas = `gone`**. O FK em cascata leva descendentes, `page_contents`, `page_texts`,
   favoritos e recentes; `workspaces.home_page_id` vira nulo.
6. **Abrir só leitura**: `usePage` (`src/features/workspace/hooks/use-pages.ts`) acha a página fora da lista com `fetchPage`, que devolve
   `trashed: true`. `PageView` mostra o aviso, esconde estrela e menu, não grava visita e passa `editable=false` ao
   editor (o sync só recebe, `canWrite=false`).

### 3.10 Busca (título + corpo, trecho)

1. Abrir: Ctrl/⌘+K (`src/features/search/hooks/use-search-shortcut.ts:useSearchShortcut`, regra em
   `src/features/search/search.ts:isSearchShortcut`) ou o botão (`src/features/search/components/SearchButton.tsx`) → `src/features/search/search-store.ts:useSearchStore`
   (`openSearch`). O `SearchDialog` é montado uma vez no `AppLayout`.
2. Termo → `src/features/search/search.ts:normalizeTerm` (trim, NFC, 200 caracteres; **não** tira acento nem escapa `%`) → `use-debounced-value`
   (200 ms) → `src/features/search/hooks/use-search.ts:useSearch` (chave `['search', ws, termo]`, `gcTime: 0`, sem retry, `signal` cancela).
3. `src/features/search/api/search.ts:searchPages` → RPC `search_pages(p_workspace_id, p_query, p_limit)`. O servidor ignora acento e caixa,
   trata `% _ \`, esconde a lixeira, ordena título-que-começa → título-que-contém → só corpo, e devolve `snippet`
   (~160 caracteres) só quando apenas o corpo casou (ver 4.4).
4. `src/features/search/search.ts:resolveSearchMode` decide a tela (`recents` | `loading` | `error` | `results`); `highlightParts` marca o
   termo no trecho (só texto, sem HTML do servidor); `searchPath` mostra o caminho curto vindo de `ancestorsOf`.
5. Escolher: `SearchDialog` navega (a inicial vai para `/`), `notifyPick` fecha a gaveta mobile, `restoreFocus`
   devolve o foco. No iOS o diálogo se mede por `src/features/search/hooks/use-visual-viewport.ts:useVisualViewport`.

### 3.11 Abrir uma página

1. Rota `/p/:pageId` → `src/features/pages/PagePage.tsx:PagePage` (`z.guid()`: id inválido = mesma tela "não
   encontrada") → `PageScreen` → `usePage(pageId)`: acha na lista ou confirma com `fetchPage`.
2. `src/features/pages/components/PageView.tsx:PageView` (com `key` por página): `useRecordVisit`, `Breadcrumb`
   (`ancestorsOf`), `PageTitle`, e o editor por `lazyWithReload(loadPageEditor)` dentro de `Suspense`.
   `editable = !trashed && papel owner/editor`.
3. **Título** (`src/features/pages/components/PageTitle.tsx:PageTitle`): salva com debounce de 600 ms, no blur, ao desmontar e ao ocultar
   (`visibilitychange`/`pagehide`) por `renamePage` com `keepalive`; `beforeunload` avisa enquanto há texto pendente.
4. `src/features/editor/PageEditor.tsx:PageEditor` (chunk próprio) chama
   `src/features/sync/use-page-doc.ts:usePageDoc(pageId, editable)`.
5. `usePageDoc` roda `startBackgroundSync` (1ª vez na aba) e `src/features/sync/page-doc.ts:openPageDoc`: cria o
   `Y.Doc`, abre o banco `axenotes-page-<id>` (`prepareDatabase` → `rememberOpenedDatabase` → `y-indexeddb`) e espera
   `whenSynced` (limite de 8 s; se falhar, **cai para memória** e o editor mostra aviso; nunca tela de erro).
6. Depois de `ready`, `openPageDoc` chama `ContentSync.start` (`supabaseSync`), que cria a `PageSyncSession` (3.12).
7. `PageEditor` só então monta `LoadedEditor`: `useCreateBlockNote(withCollaboration({ fragment }))` no fragmento
   `document-store`, registra `setTextSource(() => editor.document)` e desenha o `SyncIndicator` num portal no
   `statusSlot` do `PageView`. Cada envio confirmado chama `onContentSaved` → `markPageEditedLocally`.
8. Trocar de página desmonta tudo: `pageDoc.destroy()` → `session.stop()` (tenta enviar o pendente por até 2 s) →
   fecha o banco → `doc.destroy()`.

### 3.12 Sincronização do conteúdo (fila, receber, compactar, texto, segundo plano)

Tudo em `src/features/sync/supabase-sync.ts:PageSyncSession` (uma por página aberta). Formato e limites: ADR 0001.

**Abrir (reconciliar)**

1. O construtor registra `markOpened` no `axenotes-sync` e chama `receive`; a 1ª busca é `reconcile`.
2. `reconcile` → `pull(null)` → `src/features/sync/api/page-content.ts:supabasePageContentApi.fetch` (RPC `get_page_content`, todas as
   linhas vivas) → `applyRows` aplica uma a uma no Y.Doc com origem `SERVER_ORIGIN` (linha inválida é pulada e
   registrada só pelo id).
3. `missingOnServer` monta o estado do servidor num doc à parte e calcula o que o aparelho tem a mais pelo **state
   vector** (`encodeStateAsUpdate(doc, sv)`); se falta algo (`snapshotContainsUpdate` confere exclusões), `enqueue` e
   `flush`. Cobre o conteúdo do 2a e o que ficou offline.

**Enviar**

4. Cada `doc.on('update')` local entra em `onDocUpdate` (ignora `SERVER_ORIGIN` e o `IndexeddbPersistence`) → `enqueue`:
   marca a página `dirty` e agenda `scheduleSend` (1 s ocioso, no máximo 5 s da 1ª edição: `SYNC_TIMING`).
5. `flush` espera o envio em curso, junta o lote com `Y.mergeUpdates` e `sendPending` chama
   `api.append` (RPC `append_page_updates`); os ids devolvidos vão para `ownIds` (não serão reaplicados).
6. Lote acima de 1 MiB (`APPEND_MAX_BYTES`) ou erro `too_large`/`batch_too_large`/`live_too_large` → `pushSnapshot`
   (estado inteiro pela compactação). `forbidden` (`42501`) → `block()`. Rede/erro → `requeue` + `scheduleRetry`
   (1 s … 60 s, 8 tentativas; depois espera foco, rede ou nova edição). Aba oculta ou `pagehide` → `onHide` envia na hora.
7. Não existe fila persistida à parte: o y-indexeddb já guarda cada update e a próxima abertura reenvia a diferença
   pelo state vector.

**Receber (sem Realtime)**

8. `receive` (gatilhos juntos viram uma busca só) roda ao abrir, no foco (`onFocus`), ao ficar visível
   (`onVisibility`), ao reconectar (`onOnline`) e a cada 20 s enquanto a aba está visível **e** online
   (`schedulePoll`). `pull(lastId)` pede só linhas com id maior (`p_after`).

**Compactar**

9. `maybeCompact` (após enviar ou receber): se desde o último snapshot há mais de 100 updates ou 256 kB e o papel é
   editor, em tempo ocioso chama `pushSnapshot`: refaz `receive`, `encodeStateAsUpdate(doc)`, confere com
   `snapshotMatches` (o snapshot, aplicado num doc novo, dá o mesmo state vector) e `api.compact`
   (RPC `compact_page_content(p_up_to = maior id lido)`). `false` = outro aparelho já compactou: busca e tenta de novo (até 3).

**Texto de busca e prévias**

10. `scheduleText`/`saveText` (5 s ocioso e ao ocultar): `src/features/sync/page-text.ts:pageTextSnapshot` extrai texto
    puro e os 20 primeiros blocos de `editor.document` e `api.setText` (RPC `set_page_text`), só se mudou.

**Estados** (`refreshStatus`, nesta ordem de prioridade): `blocked` → `readonly` → `tooLarge` → `offline` → `error`
→ `saving` → `saved`. `src/features/sync/components/SyncIndicator.tsx:SyncIndicator` só mostra "Salvando…" depois de 400 ms
e some em `readonly`.

**Metadados** (`src/features/sync/sync-meta.ts`, banco `axenotes-sync`, uma linha por página):
`clean` (servidor tem tudo) · `dirty` (há edição não confirmada) · `blocked` (servidor recusou; não conta como
pendente e volta a `dirty` ao abrir com permissão de escrita — `stateOnOpen`).

**Segundo plano** (`src/features/sync/background.ts:startBackgroundSync`, uma vez por aba, em ocioso e no `online`):
`registerUnknownPageDatabases` (bancos do 2a sem registro entram `dirty`) → `resyncClosedPages` (até 10 páginas
`dirty` fechadas: abre sem editor, `settle`, fecha) → `evictStalePages` (despeja o banco de página não aberta há 30
dias e que não está `dirty`; ela volta do servidor ao abrir).

### 3.13 CSP e headers de segurança

1. Fonte única: `public/_headers` (regra `/*`). O Vite copia para `dist/` e o Cloudflare Pages aplica.
2. `pnpm preview` serve os mesmos headers: `vite.config.ts` usa `scripts/cloudflare-headers.ts:parseHeadersFile`, que
   **só** aceita a regra `/*` com `Nome: valor` indentado (qualquer outra coisa é erro, para o preview não divergir).
   `scripts/cloudflare-headers.test.ts` falha se o arquivo sair do formato ou perder uma diretiva.
3. `pnpm dev` **não** aplica a CSP (o HMR injeta inline).
4. Por que `style-src 'unsafe-inline'`, por que zod `jitless`, como conferir no DevTools: `docs/DEPLOY.md`.

---

## 4. Banco de dados (Supabase / Postgres)

Todas as migrações estão em `supabase/migrations/`. O SQL fica documentado **só aqui** (as migrações não recebem
comentários novos). Regras comuns: RLS ligada em toda tabela; `anon` sem acesso a nada; `authenticated` com grants
**por coluna**; funções `security definer` com `search_path = ''` (guardado por `supabase/tests/schema.test.ts`).

### 4.1 Códigos de erro que o app trata

| Código / mensagem                                                                        | Quem levanta                                                                | Como o front trata                                                                             |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `42501` `forbidden`                                                                      | `trash_page`, `restore_page`, `append_page_updates`, `compact_page_content`, `set_page_text` (não existe, sem papel **ou** página na lixeira, sempre igual) | `src/features/trash/trash.ts:mapTrashError` → `forbidden`; `src/features/sync/api/page-content.ts:contentErrorKind` → `forbidden` (sync vira `blocked`) |
| `23514` `parent_trashed`                                                                 | `pages_guard` (criar ou mover sob pai na lixeira), `restore_page` (pai ainda na lixeira) | `mapTrashError` → `parent_trashed` (mensagem de restaurar)                                      |
| `23514` `page_cycle`, `workspace_immutable`, `last_owner`                                | `pages_guard`, `workspace_members_guard_last_owner`                         | Não chegam pela UI normal (cliente já valida); aparecem como erro genérico                     |
| `22023` `page_content_invalid`                                                           | `page_content_decode` (base64 inválido/vazio), `compact_page_content` (`p_up_to` inválido) | `contentErrorKind` → `invalid`                                                                  |
| `22023` `page_content_too_large`, `page_text_too_large`                                  | update > 1 MiB, snapshot > 8 MiB, texto > 1 MiB, JSON > 256 KiB             | `too_large` (sync tenta snapshot; se também não cabe, status `tooLarge`)                       |
| `22023` `page_content_batch_too_large`                                                   | mais de 100 updates ou 2 MiB por chamada                                    | `batch_too_large` → envia como snapshot                                                         |
| `22023` `page_content_live_too_large`                                                    | linhas vivas da página passariam de 32 MiB                                  | `live_too_large` → compacta                                                                     |
| (nenhum erro; **zero linhas**)                                                           | RLS em `update`/`delete` de `pages`, `workspaces`                           | `updatePage` e `deletePagePermanently` transformam zero linhas em erro                          |

### 4.2 Tabelas

| Tabela                         | Para que serve                                                                                                | Acesso (RLS)                                                                                                                        | Migração                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `profiles`                     | Nome de exibição por usuário (`id` = `auth.users`).                                                           | Lê o próprio e de quem divide workspace; só atualiza o próprio (`display_name`, `avatar_path`). Nasce no trigger.                    | `supabase/migrations/20261016120002_profiles_workspaces_members.sql` |
| `workspaces`                   | Fronteira de acesso. `home_page_id` = página inicial (FK composta com `pages`, `on delete set null`).         | Membros leem; só o **owner** atualiza (`name`, `icon`, `home_page_id`). Clientes **não** criam nem apagam.                           | idem                           |
| `workspace_members`            | Quem é `owner`/`editor`/`viewer` de cada workspace.                                                           | Membros leem a lista; owner muda papel; cada um pode sair. Sem insert pelo cliente. Trigger barra tirar o último owner.             | idem                           |
| `pages`                        | Árvore de páginas (`parent_id`, `sort_key collate "C"`, `title ≤ 500`, `icon`, `trashed_at`, `last_edited_*`). | Membro lê; **editor** insere (com `created_by = auth.uid()`), atualiza `parent_id/title/icon/sort_key`; delete só se `trashed_at` não é nulo. `trashed_at` só muda por RPC. | `supabase/migrations/20261016120003_pages.sql`     |
| `user_favorites`               | Favoritos por usuário (`user_id` default `auth.uid()`, `sort_key`).                                           | Só as próprias linhas e de página acessível (`can_access_page`, **não** olha a lixeira).                                            | `supabase/migrations/20261016120004_favorites_and_recents.sql` |
| `user_recents`                 | Última visita por usuário e página (`visited_at`).                                                            | Idem favoritos. O grant de `update (page_id, visited_at)` existe porque o upsert do supabase-js põe todas as colunas no `SET`.      | idem                           |
| `page_contents`                | Log de updates Yjs (`kind = 'update'`) e snapshots (`'snapshot'` com `covers_up_to`); `superseded_at` marca o compactado. `data` é `bytea`. | `authenticated` **só lê** (`can_access_page(page_id, 'viewer')`); **toda escrita por RPC**. Cliente nunca lê `bytea` direto: usa `get_page_content` (base64). | `supabase/migrations/20261022120001_page_contents.sql` |
| `page_texts`                   | 1:1 com a página: `text` (busca, ≤ 1 MiB) e `json` (primeiros blocos, ≤ 256 KiB).                             | Só leitura direta; escrita por `set_page_text`.                                                                                      | idem                           |

### 4.3 Funções auxiliares e triggers

| Função / trigger                                                     | O que faz                                                                                                                              | Quem chama                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `is_workspace_member(ws, min_role)` (`security definer`)             | O usuário logado é membro com papel ≥ mínimo? Base de **todas** as políticas de `pages`, `workspaces`, `workspace_members`.             | Políticas RLS, `can_access_page`; `authenticated` pode executar.              |
| `can_access_page(page_id, min_role)` (`security definer`)            | Atalho "tem acesso a esta página?"; **ignora a lixeira**. Ponto único para permissões por página (Fase 11).                            | Políticas de `user_favorites`, `user_recents`, `page_contents`, `page_texts`; RPCs de conteúdo e lixeira. |
| `workspace_role_rank(role)`                                          | Converte papel em número (owner 3 > editor 2 > viewer 1).                                                                              | `is_workspace_member`. Interna.                                               |
| `set_updated_at()`                                                   | Trigger genérico de `updated_at`.                                                                                                      | Triggers de todas as tabelas. Interna.                                        |
| `pages_guard()` (trigger `before insert or update` em `pages`)       | Barra: filho de pai na lixeira, mudar de workspace, ciclo (lock advisory por workspace + CTE recursiva) e atualiza `last_edited_by/at` quando título ou ícone mudam. | Todo insert/update em `pages`.                                                |
| `workspace_members_guard_last_owner()` (trigger)                     | Nunca deixa um workspace sem owner (ignora cascata de exclusão de conta).                                                              | Update/delete em `workspace_members`.                                         |
| `handle_new_user()` (trigger `on_auth_user_created` em `auth.users`) | Cria perfil (`display_name` do metadata, limitado a 100), workspace "Workspace pessoal" e membership `owner`. **Não cria página.**       | Cadastro (`signUp`).                                                          |
| `immutable_unaccent(text)`                                           | `unaccent` com dicionário fixo, para poder entrar em índice trigram.                                                                   | `search_pages` e os índices GIN de `pages.title` e `page_texts.text`.         |
| `page_content_writable(page_id)` (`security definer`)                | Editor **e** página fora da lixeira.                                                                                                   | RPCs de escrita de conteúdo. Interna.                                         |
| `page_content_decode(base64)`                                        | base64 → `bytea`; inválido ou vazio levanta `page_content_invalid`.                                                                    | RPCs de conteúdo. Interna.                                                    |
| `prune_page_contents(page_id)`                                       | Retenção: apaga substituídos há > 7 dias (mantém os 3 snapshots substituídos mais recentes) e o que passar de 64 MiB substituídos.      | `compact_page_content`. Interna.                                              |

### 4.4 RPCs (API para o cliente)

Todas: `execute` só para `authenticated`; `anon` nada. Nome, argumentos, o que faz e quem chama no front:

| RPC                                                       | `security`        | O que faz                                                                                                                                                          | Erros                                                                  | Front                                                                        |
| --------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `trash_page(p_page_id)`                                   | definer           | Exige editor. Marca a página e a subárvore **viva** com o **mesmo** `trashed_at = now()`. Idempotente (página já na lixeira: não muda o carimbo).                  | `42501`                                                                | `src/features/trash/api/trash.ts:trashPage`, `src/features/workspace/api/pages.ts:trashAndDeletePage` |
| `restore_page(p_page_id)`                                 | definer           | Exige editor. Restaura a página e **só** quem tem o mesmo carimbo. Recusa se o pai ainda está na lixeira.                                                          | `42501`, `23514` `parent_trashed`                                      | `src/features/trash/api/trash.ts:restorePage`                                |
| `search_pages(p_workspace_id, p_query, p_limit = 20)`     | **invoker** (RLS vale) | Busca título e corpo (`page_texts`), sem acento/caixa, escapa `% _ \`, esconde a lixeira, limite 1..50. Ordem: título que começa, título que contém, só corpo. `snippet` só quando o corpo casou. | — (termo vazio devolve vazio)                                          | `src/features/search/api/search.ts:searchPages`                              |
| `append_page_updates(p_page_id, p_updates text[])`        | definer           | Exige `page_content_writable`. Até 100 updates (1 MiB cada, 2 MiB total), vivas ≤ 32 MiB. Lock advisory por página. Atualiza `pages.last_edited_*` no máx. a cada 60 s (DECISÃO-029). Devolve os ids na ordem. | `42501`, `22023` (`..._too_large`, `..._batch_too_large`, `..._live_too_large`, `..._invalid`) | `supabasePageContentApi.append`                                              |
| `get_page_content(p_page_id, p_after = null)`             | **invoker**       | Linhas vivas em ordem de id, em base64 (`id, kind, data, covers_up_to, byte_size`); com `p_after`, só as de id maior. Vale a RLS de leitura (viewer), inclusive página na lixeira. | —                                                                      | `supabasePageContentApi.fetch`                                               |
| `compact_page_content(p_page_id, p_snapshot, p_up_to)`    | definer           | Grava um snapshot que cobre as linhas vivas com id ≤ `p_up_to` e marca-as `superseded_at`; roda `prune_page_contents`. `false` se já há snapshot vivo cobrindo ≥ `p_up_to`. `p_up_to = 0` só para página sem linhas. | `42501`, `22023`                                                       | `supabasePageContentApi.compact`                                             |
| `set_page_text(p_page_id, p_text, p_json)`                | definer           | Upsert em `page_texts` (texto ≤ 1 MiB, JSON ≤ 256 KiB).                                                                                                            | `42501`, `22023` `page_text_too_large`                                 | `supabasePageContentApi.setText`                                             |

### 4.5 Onde ficam os testes do banco (`supabase/tests/`)

| Arquivo                          | Cobre                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/tests/schema.test.ts`                 | Guarda-corpo: toda tabela com RLS e política, nenhuma política `true`, `anon` sem privilégio, **lista exata** de funções executáveis por `authenticated`, `search_path` fixo, colunas de controle sem `UPDATE`, timestamps únicos das migrações, seed carrega. |
| `supabase/tests/rls.test.ts`                    | Isolamento entre workspaces, papéis owner/editor/viewer, `pages` (ciclo, workspace imutável, `trashed_at` direto), favoritos e recentes.    |
| `supabase/tests/signup.test.ts`                 | `handle_new_user`: perfil, workspace, owner; apagar conta não esbarra no último owner.                                                     |
| `supabase/tests/trash.test.ts`                  | `trash_page`/`restore_page` em cascata, carimbos, pai na lixeira, exclusão definitiva.                                                     |
| `supabase/tests/trash-client-queries.test.ts`   | As consultas exatas do front da lixeira (cursor, restaurar sob pai na lixeira, `delete … returning`).                                      |
| `supabase/tests/search.test.ts`                 | `search_pages` (acento, `% _ \`, lixeira, RLS, corpo, trecho, índice trigram).                                                              |
| `supabase/tests/search-client-queries.test.ts`  | A chamada do front (`limit` 1..50, colunas esperadas, termo cru).                                                                          |
| `supabase/tests/client-queries.test.ts`         | Upserts de favoritos/recentes como o supabase-js faz, limpeza dos 50 recentes.                                                             |
| `supabase/tests/hardening.test.ts`              | Upsert com todas as colunas no `SET`, limites de tamanho (título, ícone, nome), cadastro com nome gigante.                                  |
| `supabase/tests/page-contents.test.ts`          | RLS e papéis do conteúdo, limites, compactação concorrente/idempotente, retenção 7 dias e 64 MiB, "Editada há…" a cada 60 s, `page_texts`.  |

---

## 5. Funções-chave

| Símbolo | Para que serve | Quem chama |
| --- | --- | --- |
| `src/features/auth/AuthProvider.tsx:AuthProvider` | Sessão em estado React; dispara a limpeza no `SIGNED_OUT`/troca de conta e segura a sessão nova até a limpeza acabar. | `src/app/App.tsx:App` |
| `src/features/auth/auth-context.ts:useAuth` | Lê `status`, `session`, `signOut`, `recovering`, `localDataError`. | Quase todo hook que precisa do `userId` |
| `src/features/auth/guards.tsx:RequireAuth` | Barra rotas do app sem sessão e guarda a origem. | `src/app/App.tsx:AppRoutes` |
| `src/features/auth/guards.tsx:GuestOnly` | Barra telas de entrar para quem já está logado (exceto na recuperação). | `src/app/App.tsx:AppRoutes` |
| `src/features/auth/redirect.ts:sanitizeRedirect` | Só deixa voltar a caminho interno e não-auth. | `src/features/auth/guards.tsx:GuestOnly` |
| `src/features/auth/errors.ts:mapAuthError` | Reduz erro do supabase-js a uma categoria sem texto do servidor. | `src/features/auth/api/auth.ts`, telas de auth |
| `src/features/auth/api/auth.ts:subscribeToAuthChanges` | Assina `onAuthStateChange`. | `AuthProvider` |
| `src/features/auth/components/UserMenu.tsx:UserMenu` | Botão "Sair" com envio do pendente antes. | `src/app/layout/Sidebar.tsx:Sidebar` |
| `src/lib/reset-client-state.ts:resetClientState` | Ponto único da limpeza do cliente. | `AuthProvider` |
| `src/lib/reset-client-state.ts:onBeforeStorageClear` | Registra tarefa que roda antes de apagar o IndexedDB. | `src/features/sync/page-doc.ts` |
| `src/lib/create-store.ts:create` | Cria store Zustand registrada para o reset do logout. | Toda store (`tree-ui-store`, `search-store`) |
| `src/lib/local-data-owner.ts:claimLocalData` | Marca o dono dos dados locais (recusa se for outro). | `AuthProvider` |
| `src/lib/local-data-owner.ts:localDataBelongsTo` | Os dados locais são deste usuário? | `src/lib/pending-content.ts`, `src/features/sync/background.ts` |
| `src/lib/pending-content.ts:flushPendingContent` | Ponte entre o "Sair" e o sync (sem trazer o Yjs para o chunk de rotas). | `UserMenu` |
| `src/lib/idb-names.ts:pageDbName` | Nome do banco `axenotes-page-<id>`. | `src/features/sync/page-doc.ts`, `src/features/sync/background.ts`, `src/lib/reset-client-state.ts` |
| `src/lib/sync-meta-read.ts:readSyncMetaEntries` | Lê o `axenotes-sync` cru, sem criar o banco. | `src/lib/reset-client-state.ts`, `src/lib/pending-content.ts` |
| `src/lib/lazy-with-reload.ts:lazyWithReload` | `React.lazy` que recarrega uma vez se o chunk sumiu. | `src/app/App.tsx`, `src/features/pages/components/PageView.tsx` |
| `src/lib/chunk-reload.ts:reloadOnChunkError` | Decide e executa a recarga única por chunk antigo. | `src/lib/lazy-with-reload.ts`, `src/main.tsx` |
| `src/lib/prefetch-on-idle.ts:prefetchOnIdle` | Baixa um chunk lazy quando o navegador está ocioso. | `AppLayout` |
| `src/lib/fractional-index.ts:keyBetween` | Chave de ordem entre duas vizinhas (com fallback se empatadas). | `src/features/workspace/tree.ts`, `src/features/workspace/home.ts`, `src/features/favorites/favorites.ts` |
| `src/lib/supabase.ts:supabase` | Cliente tipado (só a chave anon). | Só funções de `features/*/api/` |
| `src/lib/supabase-env.ts:parseSupabaseEnv` | Valida URL https e recusa chave `service_role`. | `src/lib/supabase.ts`, `src/features/workspace/api/pages.ts` (keepalive) |
| `src/features/workspace/hooks/use-workspace.ts:useWorkspace` | Workspace + papel do usuário. | Quase todas as telas |
| `src/features/workspace/hooks/use-pages.ts:usePages` | Lista de páginas fora da lixeira (cache `['pages', ws]`). | Sidebar, busca, breadcrumb, lixeira |
| `src/features/workspace/hooks/use-pages.ts:usePage` | Acha uma página (lista ou consulta pontual) e distingue lixeira. | `src/features/pages/PagePage.tsx:PageScreen` |
| `src/features/workspace/hooks/use-page-mutations.ts:usePageMutations` | Criar, renomear, ícone e mover com otimismo e rollback. | `PagesSection`, `PageTree`, `PageTitle`, `PageView` |
| `src/features/workspace/tree.ts:buildPageTree` | Monta a árvore de exibição. | `PagesSection` |
| `src/features/workspace/tree.ts:planMove` | Valida e calcula `parent_id` + `sort_key` de um movimento. | `usePageMutations.movePage` |
| `src/features/workspace/tree.ts:descendantIds` | Subárvore de uma página. | `useTrashPage`, `validateMove`, `canTrash` |
| `src/features/workspace/tree.ts:ancestorsOf` | Cadeia de pais (breadcrumb, caminho da busca). | `PageView`, `SearchDialog` |
| `src/features/workspace/home.ts:ensureHomePage` | Cria a página inicial uma vez, sem corrida entre abas. | `src/features/workspace/hooks/use-home-page.ts:useHomePage` |
| `src/features/workspace/api/pages.ts:fetchPages` | Lista em lotes por cursor de `id`. | `usePages` |
| `src/features/workspace/api/pages.ts:updatePage` | PATCH das colunas permitidas; opção `keepalive`. | `usePageMutations` |
| `src/features/workspace/last-edited.ts:markPageEditedLocally` | Atualiza "Editada há…" no cache após envio (máx. a cada 60 s). | `PageView` |
| `src/features/pages/components/PageView.tsx:PageView` | Tela da página (breadcrumb, título, editor). | `src/features/pages/PagePage.tsx:PageScreen` |
| `src/features/pages/components/PageTitle.tsx:PageTitle` | Título com salvamento ao sair. | `PageView` |
| `src/features/favorites/hooks/use-favorite-mutations.ts:useFavoriteMutations` | Alterna favorito com otimismo. | `FavoriteButton`, `PageTree` |
| `src/features/recents/hooks/use-record-visit.ts:useRecordVisit` | Registra a visita (com trava de 30 s). | `PageView` |
| `src/features/recents/hooks/use-visible-recents.ts:useVisibleRecents` | Recentes já cruzados com as páginas vivas. | `RecentsSection`, `SearchDialog` |
| `src/features/trash/hooks/use-trash-page.ts:useTrashPage` | Manda para a lixeira na ordem certa (navegar → cache → RPC). | `PageTree`, `PageMenu` |
| `src/features/trash/hooks/use-trash-actions.ts:useTrashActions` | Restaurar e excluir definitivamente (sem otimismo). | `src/features/trash/components/TrashPage.tsx` |
| `src/features/trash/trash.ts:buildTrashRoots` | Deriva raízes, contagens e origem da lixeira. | `src/features/trash/components/TrashPage.tsx` |
| `src/features/trash/trash.ts:mapTrashError` | Classifica erro de Postgres da lixeira. | `src/features/trash/api/trash.ts`, `src/features/trash/messages.ts` |
| `src/features/search/search.ts:resolveSearchMode` | Escolhe o que o diálogo mostra. | `src/features/search/components/SearchDialog.tsx` |
| `src/features/search/search.ts:normalizeTerm` | Termo como vai ao servidor. | `src/features/search/components/SearchDialog.tsx` |
| `src/features/search/api/search.ts:searchPages` | RPC `search_pages`. | `src/features/search/hooks/use-search.ts:useSearch` |
| `src/features/editor/PageEditor.tsx:PageEditor` | Editor BlockNote ligado ao Y.Doc (`export default`). | `PageView` (por `loadPageEditor`) |
| `src/features/editor/load-page-editor.ts:loadPageEditor` | Import único do chunk do editor. | `PageView`, `AppLayout`, `UserMenu` |
| `src/features/editor/schema.ts:editorSchema` | Lista explícita de blocos permitidos. | `PageEditor` |
| `src/features/sync/use-page-doc.ts:usePageDoc` | Abre/fecha o Y.Doc conforme a página. | `PageEditor` |
| `src/features/sync/use-page-doc.ts:useSyncStatus` | Status do salvamento (hook de store externa). | `PageEditor` |
| `src/features/sync/page-doc.ts:openPageDoc` | Y.Doc + IndexedDB + início do sync; cai para memória se falhar. | `usePageDoc`, `src/features/sync/background.ts:resyncPage` |
| `src/features/sync/supabase-sync.ts:PageSyncSession` | O coração do sync (fila, receber, compactar, texto, status). | `createContentSync` |
| `src/features/sync/supabase-sync.ts:supabaseSync` | Implementação real de `ContentSync`. | `usePageDoc`, `src/features/sync/background.ts` |
| `src/features/sync/supabase-sync.ts:SERVER_ORIGIN` | Origem dos updates vindos do servidor (não voltam para a fila). | `PageSyncSession.pull` |
| `src/features/sync/supabase-sync.ts:missingOnServer` | Diff por state vector entre o aparelho e o servidor. | `PageSyncSession.reconcile` |
| `src/features/sync/supabase-sync.ts:snapshotMatches` | Autoverificação do snapshot antes de compactar. | `PageSyncSession.pushSnapshot` |
| `src/features/sync/content-sync.ts:ContentSync` | Contrato do sync (ponto de extensão; ver `localOnlySync` nos testes). | `openPageDoc` |
| `src/features/sync/api/page-content.ts:supabasePageContentApi` | As 4 RPCs de conteúdo, com base64 e zod. | `PageSyncSession` |
| `src/features/sync/api/page-content.ts:contentErrorKind` | Erro do PostgREST/fetch → motivo. | `supabasePageContentApi` |
| `src/features/sync/sync-meta.ts:indexedDbSyncMeta` | Metadados `clean/dirty/blocked` por página, compartilhados entre abas. | `PageSyncSession`, `src/features/sync/background.ts` |
| `src/features/sync/sync-meta.ts:stateOnOpen` | Regra do estado ao abrir uma página. | `indexedDbSyncMeta.markOpened` |
| `src/features/sync/background.ts:startBackgroundSync` | Reenvio e despejo em segundo plano, uma vez por aba. | `usePageDoc` |
| `src/features/sync/background.ts:resyncClosedPages` | Reenvia páginas `dirty` fechadas. | `runMaintenance`, "Sair" |
| `src/features/sync/page-text.ts:pageTextSnapshot` | Texto puro + primeiros blocos dentro dos limites. | `PageSyncSession.saveText` |
| `src/features/sync/base64.ts:toBase64` | Bytes → base64 do fio (e `fromBase64`). | `src/features/sync/api/page-content.ts` |
| `src/features/sync/components/SyncIndicator.tsx:SyncIndicator` | Indicador "Salvo / Salvando… / Offline…". | `PageEditor` |
| `src/app/layout/AppLayout.tsx:AppLayout` | Casca do app logado; prefetch do editor; `SearchDialog`. | `src/app/App.tsx` (rota) |
| `src/i18n/index.ts:t` | Traduz uma chave tipada de `src/i18n/pt-BR.ts`. | Todo componente |
| `src/test/fake-supabase.ts:fakeDb` | Banco em memória dos testes (`rpcCalls`, `rpcFailures`, `rpcGates`). | Testes de componente |
| `scripts/check-codemap.mjs` | Confere as referências deste arquivo (`pnpm codemap:check`). | CI |
| `scripts/eslint-require-tsdoc.mjs:requireExportedTsdoc` | Regra do ESLint: export sem TSDoc é erro nas pastas cobertas (ver `eslint.config.js`). | `pnpm lint` |

---

## 6. Onde mexer para…

- **Adicionar um bloco novo ao editor** — skill `novo-bloco`. Resumo: `src/features/editor/schema.ts:editorSchema`
  (`blockSpecs`; a lista é explícita de propósito), item no menu "/" em `src/features/editor/slash-menu.ts:slashMenuItems`,
  rótulos em `src/features/editor/dictionary.ts:editorDictionary` e `src/i18n/pt-BR.ts`, CSS em `src/features/editor/editor.css`, e um teste
  em `src/features/editor/schema.test.ts`. O texto de busca (`src/features/sync/page-text.ts:blocksToPlainText`) só entende texto, links
  e tabela: bloco com conteúdo novo precisa ensinar a função.
- **Adicionar um texto em pt-BR** — a chave em `src/i18n/pt-BR.ts` (a chave vira tipo em
  `src/i18n/index.ts:TranslationKey`) e `t('a.b.c')` no componente. Nada de string solta.
- **Criar uma store Zustand** — `import { create } from '@/lib/create-store'` (o ESLint barra o `create` do
  `zustand`). Ela entra no reset do logout sozinha. Se guardar algo fora da memória (IndexedDB, Cache Storage, service
  worker), registre a limpeza em `src/lib/reset-client-state.ts`; banco IndexedDB novo de nome fixo entra em
  `KNOWN_IDB_DATABASES` e o nome em `src/lib/idb-names.ts`.
- **Criar uma RPC** — skill `migracao-supabase`: nova migração em `supabase/migrations/` (timestamp maior que o da
  última; `supabase/tests/schema.test.ts` confere), `revoke … from public, anon` e `grant execute … to authenticated`,
  `security definer` + `set search_path = ''` quando precisar contornar RLS, conferir o papel **dentro** da função e
  devolver o **mesmo** erro para "não existe" e "sem permissão". Depois: regenerar `src/lib/database.types.ts`,
  **acrescentar o nome à lista exata** em `supabase/tests/schema.test.ts` ("authenticated só executa…"), escrever teste
  PGlite, criar a função em `features/<x>/api/` com zod, suportar a RPC em `src/test/fake-supabase.ts` e atualizar a
  seção 4 deste arquivo.
- **Criar uma tabela** — a mesma skill: RLS ligada, políticas por `is_workspace_member`/`can_access_page`, grants por
  coluna, índice nas FKs, trigger `set_updated_at`, teste em `supabase/tests/`. O app é multiusuário.
- **Criar uma rota nova** — a tela em `src/features/<x>/`; export em `src/app/app-routes.ts` (logado) ou
  `src/features/auth/auth-routes.ts` (auth); `lazyWithReload` + `<Route>` em `src/app/App.tsx:AppRoutes`; helper de
  caminho em `src/features/<feature>/routes.ts`; se for rota de auth, inclua em `AUTH_PATHS` de `src/features/auth/redirect.ts`. Teste
  em `src/app/App.test.tsx` e e2e.
- **Mudar um header de segurança / a CSP** — só `public/_headers` (formato rígido, ver 3.13); ajuste
  `scripts/cloudflare-headers.test.ts` e a tabela de `docs/DEPLOY.md`. Confira com `pnpm build && pnpm preview` e o
  Console sem "Content Security Policy".
- **Mudar o orçamento de bundle** — `BUDGETS` em `scripts/check-bundle-size.mjs` (limites em gzip; explique no PR por
  que subiu). Rode `pnpm build && pnpm size:check`.
- **Criar uma query nova** — função em `features/<x>/api/` (zod no retorno), chave em `features/<x>/query-keys.ts`
  (inclua `userId` ou `workspaceId`: o cache é limpo no logout, mas a chave evita vazamento entre contas), hook em
  `hooks/`.
- **Exportar algo novo em `src/lib`, `src/features/*/api`, `src/features/*/hooks`, `src/features/sync` ou `src/features/auth`** — o export precisa de um
  comentário TSDoc `/** … */` em pt-BR (1–3 linhas: o que faz, quando usar, efeitos e erros). O `pnpm lint` falha sem ele
  (regra `axenotes/require-exported-tsdoc`; testes em `scripts/eslint-require-tsdoc.test.mjs`).
- **Acrescentar uma dependência** — licença compatível com GPL-3.0; `pnpm license:check` confere. `pnpm knip` acusa
  o que ficar sem uso.
- **Mudar tempos do sync** — `SYNC_TIMING` e as constantes de compactação em `src/features/sync/supabase-sync.ts`; os
  limites do servidor estão no ADR 0001 e na migração (4.4) e precisam andar juntos.

---

## 7. Como depurar

| Sintoma | Onde olhar |
| --- | --- |
| Tela branca ao abrir o app | Console: erro de env de `parseSupabaseEnv` (nomes das variáveis, nunca valores) ou chunk que não carrega. Network: arquivo de script voltando como `text/html` = deploy novo; recarregue (o `lazyWithReload` já tenta uma vez). |
| "Carregando…" para sempre depois do login | `AuthProvider` segurando a sessão por limpeza de dados locais: Application → Local Storage `axenotes-local-owner` e IndexedDB; se a limpeza travou, passa de 10 s e a tela de entrar avisa. |
| Voltou para `/entrar` sozinho | Sessão expirada/recusada (`SIGNED_OUT`): ver Network → `token?grant_type=refresh_token`. Depois de "Sair", a origem não é guardada de propósito. |
| Dados de outra conta no aparelho | `localStorage axenotes-local-owner` ≠ usuário atual; IndexedDB `axenotes-sync` e `axenotes-page-*`. Fluxo 3.5. |
| Edição não chegou ao servidor / outro aparelho | Indicador ao lado do "Editada há…" (atributo `data-sync-status`): `saving`, `offline`, `error`, `tooLarge`, `blocked`. IndexedDB `axenotes-sync`: o registro da página (`dirty` = pendente, `blocked` = recusada). Network: chamadas `rpc/append_page_updates`, `rpc/get_page_content` (poll de 20 s). |
| `blocked` | O servidor devolveu `42501`: leitor, sem acesso ou página na lixeira. Confira o papel em `workspace_members` e `pages.trashed_at`. Reabrir a página com permissão de escrita volta a `dirty`. |
| `tooLarge` | Snapshot > 8 MiB (limite de `compact_page_content`); o conteúdo fica no aparelho. |
| Conteúdo da página vazio ou sumiu depois de dias | O banco local é despejado após 30 dias sem abrir (`evictStalePages`) e volta do servidor. Se o servidor também está vazio: tabela `page_contents` (linhas vivas = `superseded_at is null`) e o log "Linhas de conteúdo inválidas ignoradas" (só ids). |
| Busca não acha uma palavra recém-digitada | O texto sobe 5 s depois de parar de digitar (`set_page_text`); confira `page_texts.text`. Termo é por trecho, sem acento e sem caixa. |
| Erro de permissão em RPC | Código `42501` (sem papel / não existe / lixeira, indistinguíveis de propósito) ou `22023` (limite/entrada inválida; a mensagem é o identificador, ex. `page_content_too_large`). Tabela 4.1. |
| Alteração "não pegou" (título, mover, apagar) | A RLS não dá erro ao barrar `update`/`delete`: devolve zero linhas, e o app converte em erro (`updatePage`, `deletePagePermanently`). Veja o papel do usuário e se a página está na lixeira. |
| Arrastar não move | Vizinhos com a mesma `sort_key` (`planMove` → `tie`, aviso na sidebar); ou destino dentro da própria subárvore. |
| Erro só no Safari/iPhone | IndexedDB indisponível → cai para memória (aviso no editor); `visualViewport` da busca; WebKit nos e2e (`mobile`, `tablet`). |
| Violação de CSP no Console | `public/_headers` e `docs/DEPLOY.md`; `pnpm dev` não aplica a CSP, use `pnpm build && pnpm preview`. |
| Teste de banco falha | `pnpm test:db`; os helpers sobem as migrações num PGlite novo por arquivo (`supabase/tests/helpers/db.ts`). Se acabou de criar uma função, atualize a lista de `supabase/tests/schema.test.ts`. |
| e2e falhou | `pnpm e2e` precisa de `.env.local` (`E2E_EMAIL`, `E2E_PASSWORD`, e o 2º usuário para `rls-smoke`). Sem credenciais os testes são pulados. Trace: `trace: 'on-first-retry'` em `playwright.config.ts`; abra com `pnpm exec playwright show-trace`. Sobras `e2e-…` são removidas por `e2e/cleanup.setup.ts`. |
| Supabase local | `pnpm dlx supabase@latest start` (Docker) e `db reset` **só local**; nunca `db reset --linked`. Ver `supabase/README.md`. A CSP só libera `*.supabase.co`: com Supabase local use `pnpm dev`. |
| Quero ver o estado do cache | Não há devtools do Query instalado; use o Console e as chaves em `src/features/<feature>/query-keys.ts`. |

---

## 8. Glossário

| Termo | Significado |
| --- | --- |
| **workspace** | Fronteira de acesso. Hoje cada usuário tem um pessoal, criado no cadastro; convites vêm na Fase 11. |
| **owner / editor / viewer** | Papéis em `workspace_members`. owner > editor > viewer. Viewer lê (e favorita, é dado por usuário); só editor escreve; só owner muda o workspace. |
| **página inicial (`home_page_id`)** | Página que a rota `/` mostra. Nasce sob demanda no primeiro acesso do owner; os filhos dela aparecem como raízes na árvore. |
| **`sort_key`** | Chave de ordem fracionária (`pages`, `user_favorites`). Texto comparado byte a byte (`collate "C"`): use `<`, nunca `localeCompare`. |
| **empate (`tie`)** | Dois irmãos com a mesma `sort_key`: não há chave entre eles; o app recusa o movimento (DECISÃO-025). |
| **`trashed_at`** | Carimbo da lixeira. A subárvore enviada junta recebe o **mesmo** valor; restaurar traz só quem tem o mesmo carimbo. |
| **raiz da lixeira** | Página na lixeira cujo pai não está nela, ou cujo carimbo difere do pai. É o que a tela `/lixeira` lista. |
| **Y.Doc / update / snapshot** | Documento Yjs de uma página; *update* é uma mudança incremental; *snapshot* é o estado inteiro codificado. |
| **state vector** | Resumo do que um Y.Doc já viu. Permite calcular só o que falta ao outro lado (`missingOnServer`). |
| **`SERVER_ORIGIN`** | Origem dada aos updates aplicados vindos do servidor, para não voltarem para a fila de envio. |
| **`page_contents`** | Log de updates e snapshots do servidor. **Linha viva** = `superseded_at is null`. |
| **`covers_up_to`** | Só em snapshot: maior id de linha da página que ele já contém. |
| **`superseded_at`** | Marca de uma linha substituída por compactação. Nada é apagado na hora; `prune_page_contents` limpa depois de 7 dias. |
| **compactação** | Trocar muitos updates por um snapshot (`compact_page_content`), feita pelo cliente em tempo ocioso. |
| **`page_texts`** | Texto puro e primeiros blocos de cada página, para busca e prévias. |
| **`dirty` / `clean` / `blocked`** | Estados de sincronização por página no IndexedDB `axenotes-sync`. `dirty` = há edição não confirmada; `blocked` = servidor recusou. |
| **`readonly`, `tooLarge`, `saving`…** | Estados do indicador (`SyncStatus`), diferentes dos de metadados. |
| **`axenotes-page-<id>`** | Banco IndexedDB do `y-indexeddb` de uma página. |
| **`axenotes-sync`** | Banco IndexedDB de metadados de sincronização. |
| **`axenotes-local-owner`** | Chave do localStorage com o id do dono dos dados locais. |
| **despejo (`evict`)** | Apagar do aparelho o banco de uma página não aberta há 30 dias e sem pendência. |
| **otimista** | A tela muda antes do servidor responder; se falhar, volta ao que era (rollback só do que a escrita mexeu). |
| **fila de escritas (`scope`)** | Mutations do TanStack Query com o mesmo `scope.id` rodam uma de cada vez (`pages-write`, `favorites-write`). |
| **`keepalive`** | `fetch` que o navegador termina mesmo se a página fechar; usado no salvamento do título ao sair. |
| **chunk** | Arquivo JS carregado sob demanda: `auth-routes`, `app-routes`, `PageEditor`. |
| **RLS** | Row Level Security: o Postgres filtra as linhas por usuário/papel. Barrar um `update` não dá erro, só zero linhas. |
| **PGlite** | Postgres em WASM usado nos testes de `supabase/tests/`, sem Docker. |
