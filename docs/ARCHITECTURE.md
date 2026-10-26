# Arquitetura do AxeNotes

> Este documento explica o **porquê** (estratégia, modelo de dados, sync). Para achar **onde** cada coisa fica no
> código, e o passo a passo de cada fluxo, veja o [CODEMAP](CODEMAP.md).

## 1. Estratégia de plataforma (por que web + PWA)

Um app estilo Notion vive ou morre pelo editor de blocos e pelas bases de dados. Os editores de
blocos maduros (ProseMirror/Tiptap/BlockNote) são **web**. Por isso:

| Opção | Prós | Contras | Veredito |
| --- | --- | --- | --- |
| **Web (React) + PWA (+ Capacitor no futuro)** | 1 código para Windows, iPhone, iPad, Android; editor web maduro; deploy instantâneo | No iOS, push só com o PWA na Tela de Início | **Escolhida** |
| React Native / Expo | UI nativa | Editor de blocos nativo não existe pronto; teria de embutir webview; 2 UIs para tabelas | Não |
| Flutter | Performance | Reescrever editor e bases do zero | Não |

Dispositivos de teste reais: Windows (Chrome/Edge), iPhone e iPad (Safari). Lojas ficam para
depois (DECISÃO-001).

## 2. Stack

- **Frontend**: Vite, React, TypeScript strict, React Router, TanStack Query, Zustand,
  Tailwind CSS, shadcn/ui (Radix), lucide-react, date-fns (pt-BR), zod.
- **Editor**: BlockNote (núcleo MPL-2.0) + `@blocknote/shadcn`, dicionário `pt` ajustado para
  pt-BR; `@blocknote/xl-multi-column` (colunas) e `@blocknote/xl-ai` (IA) — GPL-3.0, ok porque o
  projeto é GPL-3.0. Blocos nossos: `callout`, `pageLink`, `subpage`, `bookmark`, `embed`
  (YouTube/Drive/Vimeo), `databaseView`, `pdf`, depois `reminder` e `spreadsheet`.
- **Conteúdo e sync**: Yjs (Y.Doc por página) + `y-indexeddb`; provedor em tempo real na fase de
  colaboração (Cloudflare Durable Objects + `y-partyserver`).
- **Bases**: TanStack Table + TanStack Virtual, dnd-kit, calendário (FullCalendar ou próprio —
  decidir na fase, checando licença).
- **Backend**: Supabase — Postgres, Auth, Storage, Realtime, Edge Functions, Vault, pg_cron.
- **IA**: Vercel AI SDK (provedores Google, OpenRouter, Anthropic, OpenAI) via Edge Function.
- **PWA**: vite-plugin-pwa. **Futuro**: Capacitor.
- **Hospedagem**: Cloudflare Pages (front) + Workers/Durable Objects (sync); Supabase Free.
- **Qualidade**: ESLint, Prettier, Vitest, Testing Library, Playwright (desktop 1440×900, iPhone,
  iPad), GitHub Actions (typecheck, lint, test, build com orçamento de bundle, licenças, knip, format e
  `codemap:check`, que confere as referências do `docs/CODEMAP.md`). O e2e
  ainda não roda no CI: precisa dos secrets do Supabase (ver ROADMAP, Fase 1).

Licenças: toda dependência precisa ser compatível com GPL-3.0 (DECISÃO-003).

## 3. Estrutura de pastas

```
src/
  app/            # rotas (lazy, dois chunks: route-modules.ts), providers, RouteErrorBoundary
    layout/       # AppLayout: sidebar fixa (>= 768 px) ou gaveta pelo ☰ (MobileNav) + conteúdo
  components/ui/  # shadcn/ui (alert-dialog, button, dialog, dropdown-menu, input e sheet; o Sheet é adaptado:
                  # animações próprias, sem tw-animate-css)
  features/
    auth/         # entrar, criar conta, código OTP, recuperar senha, AuthProvider (sessão), guardas
    workspace/    # workspace do usuário, páginas (api/ + hooks/), árvore da sidebar (components/), tree.ts
                  # (árvore, ordem, validação de mover), página inicial (home.ts)
    favorites/    # favoritos do usuário: estrela, seção da sidebar, ordem (favorites.ts), mutations otimistas
    recents/      # recentes do usuário: registro da visita ao abrir a página, seção da sidebar (recents.ts)
    trash/        # lixeira em /lixeira: restaurar, excluir definitivamente (T4b)
    search/       # busca Ctrl/Cmd+K por título e corpo: diálogo (combobox + listbox), atalho, RPC search_pages
    pages/        # tela da página /p/:pageId: título, ícone, breadcrumb, "Editada há…", editor (lazy); página
                  # na lixeira abre só para leitura
    home/         # a rota "/": mostra a página inicial do workspace
    editor/       # PageEditor (chunk próprio), schema (blocos), dicionário pt-BR, menu "/", editor.css
    sync/         # Y.Doc por página + y-indexeddb (page-doc.ts) e sincronização com o Supabase (2b:
                  # supabase-sync.ts, api/, sync-meta.ts, background.ts, indicador); depois: outbox (Fase 10)
    databases/    # propriedades e vistas (table, gallery, board, calendar, list)
    agenda/       # agenda própria + Google Agenda (iCal, depois OAuth)
    reminders/    # lembretes, central, push
    media/        # upload de imagens/PDF, embeds
    ai/           # configurações de provedor, chamadas ao proxy
    sharing/      # convites, papéis, links públicos, presença
    settings/
  hooks/          # hooks genéricos (use-media-query, use-now)
  lib/            # supabase.ts (cliente tipado; env validada em supabase-env.ts), query-client.ts,
                  # database.types.ts (gerado), fractional-index, utils (cn), relative-time, create-store.ts
                  # (stores Zustand), reset-client-state.ts (limpeza do logout), local-data-owner.ts (dono dos
                  # dados locais), idb-names.ts e sync-meta-read.ts (nomes e leitura crua dos bancos IndexedDB),
                  # pending-content.ts (ponte do "Sair" com o sync), lazy-with-reload.ts e chunk-reload.ts (chunk
                  # antigo após deploy), prefetch-on-idle.ts (baixa o chunk do editor em ocioso), zod-config.ts
                  # (zod sem eval, por causa da CSP)
  i18n/           # pt-BR.ts (todos os textos) + index.ts (t() com chaves tipadas)
  styles/         # tokens.css (variáveis do tema), theme.css (@theme do Tailwind, também usado pelo editor.css)
                  # + index.css (Tailwind v4, base)
  test/           # helpers de teste (ex.: stub de matchMedia)
supabase/
  migrations/  functions/  tests/  seed.sql   # seed só com dados fictícios
workers/
  sync/           # Cloudflare Worker + Durable Object do Yjs (fase de colaboração)
e2e/              # specs do Playwright (auth.setup.ts salva a sessão por projeto; rls-smoke.spec.ts lê o
                  # projeto real; pages-tree.spec.ts e favoritos-recentes.spec.ts (fixture em support/run-fixture.ts)
                  # escrevem só páginas "e2e-…" do usuário de teste 1 (e favoritos/recentes delas) e as
                  # apaga, com faxina inicial em cleanup.setup.ts; editor, sync, busca, lixeira e layout têm
                  # specs próprios) + screenshot.ts (pnpm screenshots)
public/           # _headers: CSP e headers de segurança do Cloudflare Pages (docs/DEPLOY.md)
scripts/          # check-licenses.mjs; check-bundle-size.mjs (orçamento de bundle); check-codemap.mjs (referências do
                  # CODEMAP); eslint-require-tsdoc.mjs (regra local: export sem TSDoc é erro em src/lib, api/, hooks/,
                  # sync e auth); format-edited-file.mjs (hook do Prettier); cloudflare-headers.ts (lê o _headers
                  # para o pnpm preview)
```

## 4. Modelo de dados (rascunho — refinar nas fases 1 e 5)

**Já implementado (Fase 1, T2 — `supabase/migrations/`):** `profiles`, `workspaces`,
`workspace_members`, `pages` (só `id`, `workspace_id`, `parent_id`, `title`, `icon`, `sort_key`,
`created_by`, `last_edited_by/at`, `trashed_at`), `user_favorites`, `user_recents`, as funções
`is_workspace_member`, `can_access_page`, `trash_page`, `restore_page`, `search_pages` e o trigger de
cadastro. **Fase 2b** (`20261022120001_page_contents.sql`): `page_contents`, `page_texts`, as RPCs
`append_page_updates`, `get_page_content`, `compact_page_content`, `set_page_text`, a limpeza interna
`prune_page_contents` e a `search_pages` no título e no corpo. O restante do rascunho abaixo entra nas fases
indicadas. Detalhes do que existe:

- **Privilégios mínimos:** `anon` não tem acesso a nada; `authenticated` recebe grants por coluna
  (ex.: não escreve `pages.workspace_id` nem `trashed_at`). Clientes não criam `workspaces` nem
  `workspace_members`: o workspace pessoal nasce no cadastro (`handle_new_user`) e convites virão na Fase 11.
- **Árvore:** FK composta `(parent_id, workspace_id)` garante pai no mesmo workspace; `pages_guard`
  barra ciclos, mudança de workspace e página nova sob pai na lixeira. `sort_key` usa `collate "C"`.
- **Lixeira em cascata:** `trash_page(id)` marca a subárvore inteira com o MESMO `trashed_at`;
  `restore_page(id)` restaura só quem tem esse carimbo (subpágina enviada antes continua na lixeira) e
  recusa se o pai ainda estiver na lixeira. Exclusão definitiva = `delete` só em página já na lixeira.
- **Conteúdo (2b, ADR `docs/adr/0001-conteudo-yjs.md`):** `page_contents` (log de updates Yjs + snapshots, `bytea`
  trafegado em base64 só pelas RPCs) e `page_texts` (texto puro + primeiros blocos, 1:1). RLS ligada; `authenticated`
  só lê, por `can_access_page(page_id, 'viewer')`; toda escrita é por RPC `security definer` que confere editor e
  página fora da lixeira (`42501` igual para "não existe", "sem papel" e "lixeira"). Limites recusados com `22023`:
  100 updates e 2 MiB por chamada, 1 MiB por update, 32 MiB vivos por página (`page_content_live_too_large`, o
  cliente compacta), snapshot 8 MiB, texto 1 MiB, JSON 256 KiB. Append e compactação pegam o mesmo
  `pg_advisory_xact_lock` por página. A compactação só marca `superseded_at`; `prune_page_contents` apaga o que foi
  substituído há mais de 7 dias (ou o que passar de 64 MiB substituídos por página, os mais antigos primeiro), menos os
  3 snapshots substituídos mais recentes. `append_page_updates` atualiza
  `pages.last_edited_at/by` no máximo a cada 60 s (DECISÃO-029).
- **Busca:** `search_pages(ws, texto, limite)` com `immutable_unaccent` + índice trigram no título e no corpo
  (`page_texts.text`, mesma expressão dos índices; o ramo do corpo faz `join` com `pages` do workspace). Sob RLS
  (`authenticated`) o Postgres não usa o índice trigram, porque o `like` não é *leakproof*; o plano percorre as páginas
  do workspace (`pages_tree_idx` + `page_texts_pkey`), e o índice só serve a consultas sem RLS. Ordem: título que começa com o termo,
  título que contém, só o corpo. Devolve `snippet` (~160 caracteres em volta do termo) quando só o corpo casou. O servidor
  trata acento, caixa, espaços nas pontas, `%`, `_` e `\`, a lixeira e o limite (1 a 50); é `security invoker`,
  então a RLS de `pages` vale (leitor busca, quem é de fora recebe vazio). O cliente manda o termo cru, sem escapar.
- **Busca no cliente (T4c):** `src/features/search/`. Um `SearchDialog` montado uma vez no `AppLayout` (Radix Dialog),
  aberto por Ctrl+K / ⌘K (`use-search-shortcut`, com `preventDefault`) ou pelo botão "Buscar" da sidebar/gaveta
  (`search-store`, Zustand, sem persistência). Termo → `normalizeTerm` (trim, NFC, 200 caracteres) → debounce de
  200 ms → `useQuery(['search', workspaceId, termo])` (cada termo tem a própria resposta, `gcTime: 0`, sem repetição
  automática; o `signal` cancela o pedido anterior). Sem texto mostra os mesmos recentes da sidebar
  (`useVisibleRecents`). Combobox + listbox com `aria-activedescendant`; o foco fica no campo. O caminho (breadcrumb
  curto) vem de `usePages` + `ancestorsOf`, não do servidor. No iOS o diálogo é ancorado no topo e medido pelo
  `visualViewport` (o teclado não redimensiona o layout). No mobile abre por cima da gaveta.
- **Políticas de `pages`** usam `is_workspace_member(workspace_id, …)` direto; `can_access_page(id)` serve
  às tabelas por usuário (favoritos, recentes) e é o ponto único para estender com permissões por página.
- **Árvore no cliente (T3b):** `usePages` traz todas as páginas fora da lixeira (id, parent_id, title, icon,
  sort_key, last_edited_at), em lotes de 1000 (limite do PostgREST); `tree.ts` monta a árvore, ordena por
  `sort_key` (`<`, nunca `localeCompare`, desempate por id) e valida mover (sem ciclo). Criar usa o UUID gerado
  no cliente e não pede `RETURNING` (a RLS de SELECT pode não enxergar a linha nova). Mutations otimistas
  sobre `['pages', workspaceId]` com rollback; título/ícone não recarregam a lista a cada salvamento, só no erro
  ou uma vez ao terminar de editar; criar/mover reconciliam ao fim. Escritas em `pages` seguem uma fila
  (`scope`), na ordem.
- **Título da página: salvar ao sair.** O título salva com debounce (600 ms), no blur e ao desmontar. Reload,
  fechar a aba e trocar de app não desmontam o React, então `visibilitychange` (hidden), `pagehide` e
  `beforeunload` salvam o texto pendente na hora, uma vez só (`dirty` + `inFlight`), por `fetch` com
  `keepalive: true` (o `fetch` comum é cancelado no reload; medido: Chromium 11/20 perdas, WebKit 20/20; com
  `keepalive`, 0/20 nos dois). O token vai só em `Authorization`, para o host do Supabase. O `beforeunload`
  pede a confirmação do navegador enquanto há texto pendente ou em envio (a falha mantém os dois); iOS não o
  honra, lá vale o salvamento ao ocultar. Outros salvamentos (renomear na sidebar, ícone, mover) são imediatos,
  sem estado pendente local.
  O foco automático do título de página nova (com re-tentativas por ~700 ms por causa da gaveta mobile) para na
  primeira ação do usuário (toque, clique ou tecla), para não roubar o foco de um campo recém-aberto.
- **Mover entre irmãos empatados:** `planMove` devolve `reason: 'tie'` quando os dois vizinhos da posição têm a
  mesma `sort_key` (não há chave entre eles sem reescrever um vizinho). O app avisa e não grava; "Mover para…"
  (fim da lista) continua funcionando. Os e2e criam páginas com chaves únicas (`sortKeySequence`).
- **Página inicial:** `workspaces.home_page_id` nulo → o owner cria "Página inicial" no 1º acesso (lock
  `navigator.locks` + `update … where home_page_id is null`). Só o owner grava esse campo (RLS).
- **Favoritos e recentes (T4a):** `user_favorites (page_id, sort_key)` e `user_recents (page_id, visited_at)`, por
  usuário (RLS por `user_id` + `can_access_page`, que **não** olha a lixeira: o cliente junta com `usePages` e esconde
  o que não está na lista; restaurar a página traz o favorito de volta). Favoritar = `upsert … ignoreDuplicates` no fim
  da lista (chave `keyAtIndex`), otimista com rollback do item e fila `favorites-write`; sem reordenar, nunca nasce
  chave entre dois favoritos. Visita = `upsert` com `page_id` e `visited_at` (sempre enviado) feito por `PageView` só
  para página já encontrada e fora a inicial; a mesma página não regrava por 30 s; 8 exibidos, 50 guardados, e o
  excesso é apagado com `delete … lt visited_at` (best effort). `visited_at` é do relógio do aparelho.
- **Lixeira no cliente (T4b):** `src/features/trash/`. `fetchTrashedPages` traz todas as páginas lixeadas do workspace (lotes de
  1000 por cursor de id; a RLS de SELECT já deixa o leitor ver) e `buildTrashRoots` deriva as raízes (pai fora da lixeira ou
  `trashed_at` diferente do pai, carimbos comparados como texto), as contagens e a origem. `trash_page`/`restore_page` são RPCs;
  excluir é `delete … returning id` (RLS: editor + página lixeada; zero linhas vira erro). Mandar para a lixeira (`useTrashPage`):
  na árvore é otimista com rollback das linhas removidas; no menu da página espera o servidor. Ordem ao lixear a página aberta:
  `navigate(replace)` → espera a rota → `cancelQueries`/`removeQueries` de `['page', id]` → tira a subárvore de `['pages', ws]` → RPC (fila
  `pages-write`). Restaurar/excluir não são otimistas e não usam a fila de escritas.
- **Estado de interface da árvore** (expandido, renomeando, aviso): Zustand em memória, sem `persist`.
- **Testes:** `supabase/tests/` roda as migrações em PGlite (com uma simulação mínima do schema `auth` e
  dos roles do Supabase em `helpers/bootstrap.sql`) dentro do `pnpm test`. Não substitui um smoke test no
  projeto real depois do `db push`.

```sql
-- todas as tabelas: created_at, updated_at; RLS ligada.
-- Acesso por pertencimento: is_workspace_member(workspace_id, min_role) security definer.

profiles (id uuid pk references auth.users, display_name, avatar_path)

workspaces (id uuid pk, name text, icon jsonb, created_by uuid,
            home_page_id uuid null references pages)   -- página inicial (DECISÃO-019)

workspace_members (
  workspace_id uuid, user_id uuid, role text check (role in ('owner','editor','viewer')),
  primary key (workspace_id, user_id)
)

pages (
  id uuid pk,
  workspace_id uuid not null references workspaces,
  parent_id uuid null references pages on delete cascade,
  database_id uuid null references databases,   -- se a página é linha de base
  title text not null default '',
  icon jsonb, cover jsonb,
  -- texto/JSON para busca e prévias NÃO ficam aqui: tabela 1:1 page_texts (ADR 0001, Fase 2b)
  properties jsonb default '{}',
  sort_key text not null,      -- índice fracionário
  full_width bool default false,
  created_by uuid, last_edited_by uuid, last_edited_at timestamptz,
  trashed_at timestamptz null, -- lixeira em cascata: a subárvore inteira vai e volta junto
  public_share_token text null -- link somente leitura (fase 11)
)

-- Fase 2b (DECISÃO-016, ADR 0001): conteúdo Yjs fora de `pages`. Implementado; ver o início desta seção.
page_contents (id bigint identity pk, page_id → pages on delete cascade, kind 'update'|'snapshot',
               data bytea, byte_size (gerada), covers_up_to bigint, superseded_at timestamptz,
               created_by uuid → auth.users on delete set null, created_at)
page_texts (page_id pk → pages on delete cascade, text text, json jsonb, updated_at)

page_permissions (page_id, user_id, role)   -- compartilhamento de página fora do workspace (fase 11)
user_favorites (user_id, page_id, sort_key)
user_recents (user_id, page_id, visited_at)

databases (id, workspace_id, page_id, title, icon, is_system bool)
database_properties (id, database_id, name, type, config jsonb, sort_key)
database_views (id, database_id, name, icon, type, config jsonb, sort_key)

reminders (id, workspace_id, user_id, page_id, block_id, property_id, title, remind_at,
           repeat, status, sent_at)
push_subscriptions (id, user_id, platform, endpoint, keys jsonb, device_label, active, last_seen_at)

calendar_connections (id, user_id, kind text, -- 'ical' | 'google_oauth'
                      ical_url_secret_id uuid, google_token_secret_id uuid, sync_state jsonb)
external_events (id, connection_id, external_id, title, starts_at, ends_at, all_day, raw jsonb)

ai_settings (user_id pk, provider text, model text, api_key_secret_id uuid null, monthly_limit int)
ai_usage (id, user_id, provider, model, tokens_in, tokens_out, created_at)

-- Storage: bucket privado "media", caminho {workspace_id}/{page_id}/{uuid}.{ext}.
-- Segredos de usuário (chaves de IA, URL iCal, tokens Google) no Supabase Vault, nunca em colunas.
```

Decisões de modelagem:
- **Workspace como fronteira de acesso** desde o início: hoje 1 usuária, amanhã convites.
- **Conteúdo em Yjs** (merge sem conflito para offline e coedição) + snapshot para busca,
  guardado em `page_contents` (log de updates com compactação), separado da tabela `pages`.
- **Acesso a páginas** por `is_workspace_member(ws, min_role)` + `can_access_page(page_id)`.
- **Linha de base = página**; ordenação por índice fracionário; exclusão lógica (`trashed_at`).

## 5. Sincronização e offline

```
Editor (BlockNote) ── Y.Doc ──┬─ y-indexeddb (aparelho, offline)
                              ├─ Fase 2b: updates em lote → RPCs → page_contents (log de
                              │           updates + compactação) + page_texts (busca/prévias)
                              └─ Fase 11: provedor tempo real → Durable Object por página
                                           (y-partyserver) → persiste no Supabase
Árvore/bases ── TanStack Query + cache IndexedDB ── Fase 10: outbox de mutações → Supabase
                Supabase Realtime avisa outros dispositivos
```
- Offline: app shell pelo service worker; páginas abertas ficam no IndexedDB; edições offline
  em páginas mesclam via Yjs; em bases, outbox com "último a gravar vence" por campo.
- Autenticação do provedor Yjs: o cliente envia o JWT do Supabase; o Worker valida e confere o
  papel do usuário no workspace antes de aceitar a conexão.
- **Editor local (Fase 2a):** `PageView` carrega `src/features/editor/PageEditor.tsx` por `lazyWithReload` (chunk
  próprio: BlockNote, tiptap, ProseMirror e Yjs só descem ao abrir uma página). `usePageDoc(pageId)` abre um Y.Doc por
  página (`openPageDoc` em `src/features/sync/page-doc.ts`) com `y-indexeddb` num banco **`axenotes-page-<id>`**
  (prefixo em `src/lib/idb-names.ts`); o editor só monta depois de carregar o que já está no aparelho (fragmento
  `document-store`, `withCollaboration` do BlockNote sem provedor de rede). Trocar de página desmonta o editor e
  destrói o Y.Doc e a conexão do banco (`PageView` tem `key` por página). O título continua em `pages.title`.
  - **Falha do IndexedDB** (inexistente, erro ao abrir, cota, mais de 8 s): o Y.Doc segue só em memória, com aviso
    de que nada fica no aparelho (o conteúdo ainda vai ao servidor enquanto houver rede); nunca tela de erro. O banco
    é aberto e preparado antes de entregar ao y-indexeddb (que não trata a falha ao abrir).
  - **`ContentSync`** (`src/features/sync/content-sync.ts`): `start(pageId, doc, { canWrite })` roda depois de carregar
    o doc local e `stop()` antes de fechar. A implementação é `supabaseSync` (2b, abaixo); `localOnlySync` fica para
    os testes do doc local. O aviso de prévia do 2a saiu.
  - **Só leitura:** leitor (viewer) e página na lixeira → `editable=false` (página na lixeira abre pela rota e pela
    lista da `/lixeira`, com aviso e link para a lixeira; não grava visita nem oferece favoritar).
  - **Blocos:** lista explícita em `schema.ts` (texto, títulos, listas, checklist, toggle, citação, código, divisor,
    tabela); imagem, vídeo, áudio, arquivo e emoji ficam fora dos menus. Dicionário `pt` do BlockNote + placeholders
    de `src/i18n/pt-BR.ts`.
  - **Estilo:** `editor.css` (só no chunk do editor) gera os utilitários do `@blocknote/shadcn` **escopados em
    `.bn-root`** (sem o escopo, um `.flex-col` do editor vencia o `md:flex-row` do app) e troca as cores do BlockNote
    pelos tokens. Usa `src/styles/theme.css` como referência, sem emitir as variáveis de novo.
  - **Mod+K:** o BlockNote só captura Ctrl/⌘+K com a barra de formatação aberta (com seleção) e chama
    `preventDefault`; a busca ignora eventos já tratados. Resultado: com seleção = link, sem seleção = busca.
- **Logout:** todo estado de cliente sai pelo ponto único `src/lib/reset-client-state.ts` (ver §9). Quem criar
  um banco IndexedDB (y-indexeddb na Fase 2), um service worker ou um cache (Fase 6) não precisa de código novo
  para a limpeza quando o navegador tem `indexedDB.databases()`; para os demais, registra o nome em
  `KNOWN_IDB_DATABASES`. Com `indexedDB.databases()` (Chrome, Edge, Safari 14+, Firefox 126+) o logout apaga **todos**
  os bancos da origem, os `axenotes-page-*` inclusos; sem ela, apaga `KNOWN_IDB_DATABASES`, os bancos de página
  abertos **nesta aba** (`rememberOpenedDatabase`) e os de toda página registrada no `axenotes-sync` (2b). Antes de
  apagar, roda os ganchos de `onBeforeStorageClear` (o `page-doc` fecha os docs abertos, senão o delete fica
  bloqueado pela própria aba). O envio do conteúdo pendente acontece antes, no "Sair" (abaixo). O banco
  `axenotes-sync` está em `KNOWN_IDB_DATABASES`.
- **Sincronização do conteúdo (Fase 2b, `src/features/sync/supabase-sync.ts`):** uma `PageSyncSession` por página
  aberta. O servidor é a fonte de verdade; o IndexedDB é cache e fila.
  - **Abrir:** `get_page_content` completo → aplica no Y.Doc com a origem `SERVER_ORIGIN` → monta o estado do servidor
    e envia o que o aparelho tem a mais (`encodeStateAsUpdate(doc, svDoServidor)`, só se `snapshotContainsUpdate` disser
    que falta algo, exclusões inclusas). Cobre o conteúdo criado no 2a e o que ficou offline em sessões anteriores.
  - **Fila:** cada `doc.on('update')` local (origem diferente de `SERVER_ORIGIN` e do y-indexeddb) entra numa fila em
    memória; envio com debounce de 1 s ocioso e no máximo 5 s, lote juntado com `Y.mergeUpdates`, e na hora ao ocultar
    a aba (`visibilitychange`/`pagehide`). Lote acima de 1 MiB, página acima de 32 MiB vivos ou lote recusado por
    tamanho vão como estado inteiro pela compactação; acima de 8 MiB o status vira "grande demais" e o conteúdo fica
    no aparelho. Retry exponencial (1 s… 60 s, 8 tentativas seguidas; depois espera rede, foco ou nova edição).
    **Não há fila persistida separada:** o y-indexeddb já guarda cada update e a próxima abertura reenvia a diferença
    pelo state vector.
  - **Receber (sem Realtime, ADR):** `get_page_content(p_after = maior id lido)` ao abrir, no foco, ao ficar visível,
    ao reconectar e por polling de 20 s enquanto a aba está visível **e** online. Gatilhos simultâneos entram na mesma
    busca. Os ids gravados pela própria sessão são pulados.
  - **Compactação:** depois de receber ou enviar, se desde o último snapshot há mais de 100 updates ou 256 kB, e o papel
    é editor: em tempo ocioso, `encodeStateAsUpdate(doc)` com autoverificação (o snapshot aplicado num doc novo dá o
    mesmo state vector) e `compact_page_content(p_up_to = maior id lido)`; `false` = outro aparelho já compactou, busca
    de novo e tenta com o id novo (até 3 vezes). `p_up_to = 0` só vale para página ainda sem linhas.
  - **Texto de busca/prévias:** `set_page_text` com debounce de 5 s ocioso e ao ocultar a aba, só se mudou, a partir de
    `editor.document` (`page-text.ts`: texto puro e primeiros 20 blocos).
  - **Leitor e lixeira:** `canWrite=false` só recebe; recusa `42501` vira `blocked` (não tenta de novo).
  - **Indicador** (`components/SyncIndicator.tsx`), desenhado pelo editor num slot ao lado do "Editada há…" (barra no
    desktop, abaixo do título no mobile), para o código de sync ficar no chunk do editor: Salvo / Salvando… (só depois
    de 400 ms) / Offline — será sincronizado / Erro ao salvar (tentando de novo) / grande demais / sem permissão;
    `role="status"`, `aria-live="polite"`. Cada envio confirmado atualiza o "Editada há…" no cache da lista de páginas
    (`markPageEditedLocally`, no máximo a cada 60 s, sem nova busca).
  - **Metadados (`axenotes-sync`, `sync-meta.ts`):** por página `{ lastOpenedAt, state }` com `clean` / `dirty` /
    `blocked`, compartilhado entre as abas. Página sem registro entra `dirty` se já tem conteúdo local. `blocked` não
    conta como pendente, não é reenviada em loop e volta a `dirty` ao abrir de novo com permissão de escrita.
  - **Segundo plano (`background.ts`, uma vez por aba, em ocioso, e no `online`):** registra bancos `axenotes-page-*`
    sem metadados (do 2a) como `dirty`, reabre sem editor até 10 páginas `dirty` fechadas para enviar o que falta e
    **despeja** os bancos de páginas não abertas há mais de 30 dias que não estão `dirty` nem abertas (voltam do
    servidor ao abrir). `navigator.storage.persist()` fica para a Fase 6 (ADR).
  - **"Sair":** o `UserMenu` carrega o chunk do editor (que registra o envio em `src/lib/pending-content.ts`), tenta
    enviar o pendente das páginas abertas e das `dirty` fechadas por até 5 s **antes** do `signOut` (depois dele a sessão
    já não vale) e, se sobrar algo, pergunta "Há alterações não sincronizadas. Sair mesmo assim?". Se o chunk não
    carregar (offline sem cache), conta as páginas `dirty` lendo o `axenotes-sync` direto (`src/lib/sync-meta-read.ts`).
    O gancho `onBeforeStorageClear` continua só fechando os docs; o `stop()` espera as gravações de metadados.
  - **Linha inválida no servidor** (bug ou update corrompido): as linhas são aplicadas uma a uma; a inválida é pulada e
    registrada só pelo id, sem travar a página.
  - **Sessão encerrada sem o botão** (refresh token recusado, logout em outra aba): o `SIGNED_OUT` limpa tudo na hora,
    como antes (privacidade primeiro num aparelho compartilhado). Só se perde algo se, online, a sessão acabar com um
    update ainda não enviado; online o envio acontece em até ~5 s, então a janela é mínima. Offline o refresh falha por
    rede e o supabase-js não desloga. O "Sair" de outra aba lê as flags `dirty` do `axenotes-sync` (inclusive das
    páginas abertas aqui) e avisa.
  - **Dono dos dados locais** (`src/lib/local-data-owner.ts`): o localStorage `axenotes-local-owner` guarda o id do
    usuário dono dos bancos `axenotes-page-*` e `axenotes-sync`. Fecha a troca de conta **sem** `SIGNED_OUT` no meio
    (a sessão de A expira com o app fechado: o primeiro evento é `INITIAL_SESSION` nulo, e B entra em seguida). Quem
    entra com um id diferente do dono gravado dispara `resetClientState`, e o `AuthProvider` segura a sessão nova até
    a limpeza acabar (em `loading` ao abrir o app; `unauthenticated` vindo das telas de entrar/recuperar, que não
    desmontam); só então grava o novo dono. Se a limpeza falha (o dono continua o antigo) ou passa de 10 s, a sessão
    nova não entra: o app sai (`signOut` local, que tenta limpar de novo) e a tela de entrar avisa
    (`localDataError`). Sem conta nenhuma (ou com a própria A de volta), os
    dados ficam: A pode voltar e enviar o pendente. O reenvio em segundo plano e a contagem do "Sair" só consideram
    os registros quando o dono é o usuário da sessão (o dono do JWT do envio), conferido antes de cada página. O
    marcador sai no logout só depois de o IndexedDB ser apagado; se a limpeza falhar, a próxima conta diferente tenta
    de novo. Limitações: dados de antes do marcador (sem dono) passam a ser de quem entrar primeiro; sem localStorage
    não há dono, e o segundo plano não envia nada (só a página aberta sincroniza).

## 6. Lembretes, notificações e agenda

```
[app] reminder ──► tabela reminders
pg_cron (1/min) ──► Edge Function send-reminders ──► Web Push (VAPID) ──► PWA (Windows/iPhone/iPad*)
Google Agenda: iCal secreto (leitura, Edge Function agendada) → external_events
               OAuth (fase 9B) → Google Calendar API, sync em duas vias
```
\* iOS/iPadOS: push só com o app na Tela de Início (16.4+) e permissão pedida por toque.

## 7. IA

```
Editor (xl-ai) ──► Edge Function ai-proxy (valida JWT, limite de uso, lê chave do Vault)
                    └► AI SDK → Google Gemini | OpenRouter | Anthropic | OpenAI (streaming)
```
- Padrão sem custo: Gemini (nível gratuito) ou modelo gratuito do OpenRouter. Avisar na tela
  que nesses planos gratuitos o provedor pode usar os dados enviados.
- Chave própria do usuário: cadastrada em Configurações → IA, salva no Vault, nunca devolvida ao
  front.

## 8. Mídia
- Imagens comprimidas no cliente (WebP; GIF mantido); PDF ≤ 10 MB. Vídeos e arquivos grandes por
  link (YouTube, Drive, Vimeo). Leitura por URL assinada de curta duração.

## 9. Segurança
- RLS em todas as tabelas e no Storage, testada com 2 usuários e papéis diferentes.
- Só a anon/publishable key no front. service_role apenas em Edge Functions/Workers (secrets).
- Segredos de usuário no Vault. Sanitizar HTML colado; `rel="noopener noreferrer"` em links.
- Edge Functions validam JWT e entrada (zod), com timeout e limite de uso.
- Repositório público: push protection e secret scanning do GitHub ligados.
- **Logout limpo (ponto único):** `resetClientState(queryClient)` em `src/lib/reset-client-state.ts`, chamado
  pelo `AuthProvider` no evento `SIGNED_OUT` (botão "Sair", sessão expirada ou logout em outra aba) e na troca
  de usuário, inclusive quando quem entra não é o dono gravado dos dados locais (§5); o "Sair" espera a mesma limpeza (roda uma vez por logout). Na hora, antes do próximo render:
  cancela e apaga o cache do TanStack Query e devolve **todas** as stores Zustand ao estado inicial. Depois:
  apaga os bancos IndexedDB do app, desregistra service workers e apaga o Cache Storage. Erros de limpeza só vão
  para o log (sem dados da conta) e não impedem o logout. A sessão do Supabase fica por conta do `signOut`.
- **Stores Zustand:** sempre com `create` de `src/lib/create-store.ts`, que registra a store para o reset. O
  ESLint (`no-restricted-imports`) barra `create`/`createStore` do `zustand` em qualquer outro arquivo, então
  uma store nova não tem como escapar da limpeza.
- **Headers HTTP:** CSP e demais headers de segurança em `public/_headers` (Cloudflare Pages); o que cada um faz,
  por que `style-src` tem `'unsafe-inline'` e como conferir estão em `docs/DEPLOY.md`.
