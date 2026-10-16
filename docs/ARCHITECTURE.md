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
  iPad), GitHub Actions (typecheck, lint, test, build, e2e, licenças).

Licenças: toda dependência precisa ser compatível com GPL-3.0 (DECISÃO-003).

## 3. Estrutura de pastas

```
src/
  app/            # rotas, providers, layout raiz, error boundary
  components/ui/  # shadcn/ui
  features/
    auth/         # login, sessão
    workspace/    # workspaces, membros, sidebar, árvore, busca, favoritos, recentes, lixeira
    pages/        # tela da página: capa, ícone, título, breadcrumb, editor
    editor/       # BlockNote, schema, blocos customizados, menus pt-BR, Yjs
    sync/         # y-indexeddb, persistência no Supabase, outbox, status online/offline
    databases/    # propriedades e vistas (table, gallery, board, calendar, list)
    agenda/       # agenda própria + Google Agenda (iCal, depois OAuth)
    reminders/    # lembretes, central, push
    media/        # upload de imagens/PDF, embeds
    ai/           # configurações de provedor, chamadas ao proxy
    sharing/      # convites, papéis, links públicos, presença
    settings/
  lib/            # supabase client, query client, database.types.ts, fractional-index, utils
  i18n/pt-BR.ts
  styles/         # tokens.css
supabase/
  migrations/  functions/  tests/  seed.sql   # seed só com dados fictícios
workers/
  sync/           # Cloudflare Worker + Durable Object do Yjs (fase de colaboração)
e2e/
public/
```

## 4. Modelo de dados (rascunho — refinar nas fases 1 e 5)

```sql
-- todas as tabelas: created_at, updated_at; RLS ligada.
-- Acesso por pertencimento: is_workspace_member(workspace_id, min_role) security definer.

profiles (id uuid pk references auth.users, display_name, avatar_path)

workspaces (id uuid pk, name text, icon jsonb, created_by uuid)

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
  ydoc bytea null,             -- estado Yjs do conteúdo (ou caminho no Storage se crescer)
  content_json jsonb,          -- snapshot BlockNote para prévias/export
  content_text text default '',-- texto puro para busca
  properties jsonb default '{}',
  sort_key text not null,      -- índice fracionário
  full_width bool default false,
  created_by uuid, last_edited_by uuid, last_edited_at timestamptz,
  trashed_at timestamptz null,
  public_share_token text null -- link somente leitura (fase 11)
)

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
- **Conteúdo em Yjs** (merge sem conflito para offline e coedição) + snapshot para busca.
- **Linha de base = página**; ordenação por índice fracionário; exclusão lógica (`trashed_at`).

## 5. Sincronização e offline

```
Editor (BlockNote) ── Y.Doc ──┬─ y-indexeddb (aparelho, offline)
                              ├─ Fase 2: persistência debounced → Supabase (ydoc + snapshot)
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
