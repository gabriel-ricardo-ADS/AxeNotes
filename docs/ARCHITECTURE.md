# Arquitetura do AxeNotes

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
  iPad), GitHub Actions (typecheck, lint, test, build, licenças; o e2e entra no CI na Fase 1).

Licenças: toda dependência precisa ser compatível com GPL-3.0 (DECISÃO-003).

## 3. Estrutura de pastas

```
src/
  app/            # rotas, providers, error boundary
    layout/       # AppLayout: sidebar fixa (>= 768 px) ou gaveta pelo ☰ (MobileNav) + conteúdo
  components/ui/  # shadcn/ui (hoje só o Sheet, adaptado: animações próprias, sem tw-animate-css)
  features/
    auth/         # entrar, criar conta, código OTP, recuperar senha, AuthProvider (sessão), guardas
    workspace/    # workspace do usuário, páginas (api/ + hooks/), árvore da sidebar (components/), tree.ts
                  # (árvore, ordem, validação de mover), página inicial (home.ts); depois busca, favoritos,
                  # recentes, lixeira
    pages/        # tela da página /p/:pageId: título, ícone, breadcrumb, "Editada há…" (editor na Fase 2)
    editor/       # BlockNote, schema, blocos customizados, menus pt-BR, Yjs
    sync/         # y-indexeddb, persistência no Supabase, outbox, status online/offline
    databases/    # propriedades e vistas (table, gallery, board, calendar, list)
    agenda/       # agenda própria + Google Agenda (iCal, depois OAuth)
    reminders/    # lembretes, central, push
    media/        # upload de imagens/PDF, embeds
    ai/           # configurações de provedor, chamadas ao proxy
    sharing/      # convites, papéis, links públicos, presença
    settings/
  hooks/          # hooks genéricos (use-media-query)
  lib/            # supabase.ts (cliente tipado; env validada em supabase-env.ts), query-client.ts,
                  # database.types.ts (gerado), fractional-index, utils (cn)
  i18n/           # pt-BR.ts (todos os textos) + index.ts (t() com chaves tipadas)
  styles/         # tokens.css (variáveis do tema) + index.css (Tailwind v4, @theme, base)
  test/           # helpers de teste (ex.: stub de matchMedia)
supabase/
  migrations/  functions/  tests/  seed.sql   # seed só com dados fictícios
workers/
  sync/           # Cloudflare Worker + Durable Object do Yjs (fase de colaboração)
e2e/              # specs do Playwright (auth.setup.ts salva a sessão por projeto; rls-smoke.spec.ts lê o
                  # projeto real; pages-tree.spec.ts escreve só páginas "e2e-…" do usuário de teste 1 e as
                  # apaga, com faxina inicial em cleanup.setup.ts) + screenshot.ts (pnpm screenshots)
public/
```

## 4. Modelo de dados (rascunho — refinar nas fases 1 e 5)

**Já implementado (Fase 1, T2 — `supabase/migrations/`):** `profiles`, `workspaces`,
`workspace_members`, `pages` (só `id`, `workspace_id`, `parent_id`, `title`, `icon`, `sort_key`,
`created_by`, `last_edited_by/at`, `trashed_at`), `user_favorites`, `user_recents`, as funções
`is_workspace_member`, `can_access_page`, `trash_page`, `restore_page`, `search_pages` e o trigger de
cadastro. O restante do rascunho abaixo entra nas fases indicadas. Detalhes do que existe:

- **Privilégios mínimos:** `anon` não tem acesso a nada; `authenticated` recebe grants por coluna
  (ex.: não escreve `pages.workspace_id` nem `trashed_at`). Clientes não criam `workspaces` nem
  `workspace_members`: o workspace pessoal nasce no cadastro (`handle_new_user`) e convites virão na Fase 11.
- **Árvore:** FK composta `(parent_id, workspace_id)` garante pai no mesmo workspace; `pages_guard`
  barra ciclos, mudança de workspace e página nova sob pai na lixeira. `sort_key` usa `collate "C"`.
- **Lixeira em cascata:** `trash_page(id)` marca a subárvore inteira com o MESMO `trashed_at`;
  `restore_page(id)` restaura só quem tem esse carimbo (subpágina enviada antes continua na lixeira) e
  recusa se o pai ainda estiver na lixeira. Exclusão definitiva = `delete` só em página já na lixeira.
- **Busca:** `search_pages(ws, texto, limite)` com `immutable_unaccent` + índice trigram, só por título.
- **Políticas de `pages`** usam `is_workspace_member(workspace_id, …)` direto; `can_access_page(id)` serve
  às tabelas por usuário (favoritos, recentes) e é o ponto único para estender com permissões por página.
- **Árvore no cliente (T3b):** `usePages` traz todas as páginas fora da lixeira (id, parent_id, title, icon,
  sort_key, last_edited_at), em lotes de 1000 (limite do PostgREST); `tree.ts` monta a árvore, ordena por
  `sort_key` (`<`, nunca `localeCompare`, desempate por id) e valida mover (sem ciclo). Criar usa o UUID gerado
  no cliente e não pede `RETURNING` (a RLS de SELECT pode não enxergar a linha nova). Mutations otimistas
  sobre `['pages', workspaceId]` com rollback; título/ícone não recarregam a lista a cada salvamento, só no erro
  ou uma vez ao terminar de editar; criar/mover reconciliam ao fim. Escritas em `pages` seguem uma fila
  (`scope`), na ordem.
- **Página inicial:** `workspaces.home_page_id` nulo → o owner cria "Página inicial" no 1º acesso (lock
  `navigator.locks` + `update … where home_page_id is null`). Só o owner grava esse campo (RLS).
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
  content_json jsonb,          -- snapshot BlockNote para prévias/export (fase 2)
  content_text text default '',-- texto puro para busca por conteúdo (fase 2)
  properties jsonb default '{}',
  sort_key text not null,      -- índice fracionário
  full_width bool default false,
  created_by uuid, last_edited_by uuid, last_edited_at timestamptz,
  trashed_at timestamptz null, -- lixeira em cascata: a subárvore inteira vai e volta junto
  public_share_token text null -- link somente leitura (fase 11)
)

-- Fase 2 (DECISÃO-016): conteúdo Yjs fora de `pages`, como log de updates + estado compactado.
page_contents (
  id bigint generated always as identity pk,
  page_id uuid not null references pages on delete cascade,
  kind text check (kind in ('update','snapshot')),  -- 'snapshot' = estado compactado
  data bytea not null,
  created_at timestamptz default now()
)
-- RLS: can_access_page(page_id). Compactação periódica: junta os 'update' em um 'snapshot'.

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
                              ├─ Fase 2: updates debounced → Supabase (page_contents: log de
                              │          updates + compactação) + snapshot de texto/JSON
                              └─ Fase 11: provedor tempo real → Durable Object por página
                                           (y-partyserver) → persiste no Supabase
Árvore/bases ── TanStack Query + cache IndexedDB ── Fase 10: outbox de mutações → Supabase
                Supabase Realtime avisa outros dispositivos
```
- Offline: app shell pelo service worker; páginas abertas ficam no IndexedDB; edições offline
  em páginas mesclam via Yjs; em bases, outbox com "último a gravar vence" por campo.
- Autenticação do provedor Yjs: o cliente envia o JWT do Supabase; o Worker valida e confere o
  papel do usuário no workspace antes de aceitar a conexão.

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
