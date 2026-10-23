# ADR 0001 — Conteúdo das páginas em Yjs: log de updates com compactação em `page_contents`

- **Status:** aceito (Fase 2a, 2026-10-22); **implementado na Fase 2b** (migration
  `20261022120001_page_contents.sql`), com as correções da seção "Correções no 2b" no fim. Confirma a DECISÃO-012 e a
  DECISÃO-016 (`docs/DECISIONS.md`).
- **Quem implementa:** 2a = editor local (Y.Doc + y-indexeddb, sem servidor); 2b = tudo que está marcado
  "(2b)" abaixo; colaboração em tempo real = Fase 11.
- **Nenhuma migration nasce deste documento.** O 2b escreve a migration seguindo a skill `migracao-supabase`,
  com testes de RLS em PGlite, e o Gabriel aplica (DECISÃO-015).

## Contexto

O conteúdo de cada página precisa: funcionar offline e mesclar edições feitas em dois aparelhos sem conflito
(DECISÃO-009); servir de base para a colaboração em tempo real (DECISÃO-004/012); alimentar a busca e as prévias;
e respeitar o modelo multiusuário (RLS por pertencimento ao workspace). O título continua em `pages.title`, fora do
documento.

## Decisão

1. **Um Y.Doc por página.** O BlockNote grava no `Y.XmlFragment` `"document-store"` (padrão da doc do BlockNote). O
   título **não** entra no Y.Doc.
2. **No aparelho:** um banco IndexedDB por página, nome `axenotes-page-<pageId>` (prefixo fixo, em
   `src/lib/idb-names.ts`), via `y-indexeddb`. O logout apaga esses bancos (`src/lib/reset-client-state.ts`).
3. **No servidor (2b):** tabela `page_contents` = log de updates Yjs + snapshots compactados, separada de `pages`.
4. **A partir do 2b o servidor é a fonte de verdade**; o IndexedDB é cache e fila offline (ver "Riscos do
   armazenamento local").

## Tabela `page_contents` (2b)

```sql
create table public.page_contents (
  id            bigint generated always as identity primary key,
  page_id       uuid not null references public.pages (id) on delete cascade,
  kind          text not null check (kind in ('update', 'snapshot')),
  data          bytea not null,
  byte_size     integer generated always as (octet_length(data)) stored,
  covers_up_to  bigint null,          -- só snapshot: maior id de linha que ele já contém
  superseded_at timestamptz null,     -- marcada pela compactação; null = linha viva
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint page_contents_snapshot_covers check ((kind = 'snapshot') = (covers_up_to is not null)),
  constraint page_contents_row_size check (octet_length(data) between 1 and 8388608)   -- 8 MiB, rede de segurança
);
create index page_contents_live on public.page_contents (page_id, id) where superseded_at is null;
create index page_contents_superseded on public.page_contents (page_id, superseded_at)
  where superseded_at is not null;
```

- **Sem `workspace_id` na tabela:** o acesso sai da página (`pages.workspace_id`), então mover uma página de
  workspace no futuro não exige reescrever o conteúdo.
- **RLS ligada; nenhum privilégio de tabela para `anon`.** `authenticated` recebe **só `select`**:
  `using (public.can_access_page(page_id, 'viewer'))` (que já resolve `pages.workspace_id` +
  `is_workspace_member`). Insert, update e delete **não** têm grant: tudo que escreve passa pelas RPCs abaixo
  (`security definer`, `search_path = ''`), que conferem o papel `editor` e a página fora da lixeira.
- `created_by` é auditoria (quem escreveu), não regra de acesso.

## Formato dos updates

- **Coluna `bytea`** (binário do `Y.encodeStateAsUpdate` / updates do `doc.on('update')`).
- **No fio, base64**, convertido no SQL com `decode(x, 'base64')` / `encode(data, 'base64')`. Motivo: o PostgREST
  serializa `bytea` como texto hex `\x…` (2× o tamanho); base64 custa 1,33×. Por isso o cliente nunca lê nem
  escreve a tabela direto: só por RPC.
- O cliente junta os updates pendentes com `Y.mergeUpdates` antes de enviar (debounce de 1 s ocioso, no máximo
  5 s, e na hora em `visibilitychange: hidden`/`pagehide`; o 2b encurtou os 1,5 s / 10 s propostos).

## RPCs (2b)

| RPC | Faz | Quem |
| --- | --- | --- |
| `append_page_updates(p_page_id uuid, p_updates text[])` | insere cada update (base64) como `kind = 'update'`; devolve os ids | editor, página fora da lixeira |
| `get_page_content(p_page_id uuid, p_after bigint default null)` | **todas** as linhas vivas (`superseded_at is null`) em ordem de id, em base64 (`id, kind, data, covers_up_to, byte_size`); com `p_after`, só as de id maior (para recarregar incremental). Pode haver update vivo com id menor que o do snapshot vivo (gravado entre a leitura e a compactação de outro aparelho), por isso não é "snapshot + o que vem depois" | viewer (security invoker, RLS) |
| `compact_page_content(p_page_id uuid, p_snapshot text, p_up_to bigint)` | grava um snapshot que cobre as linhas vivas `id <= p_up_to` e marca essas linhas como substituídas; devolve `false` se já coberto. `p_up_to` precisa ser o id de uma linha da página, ou `0` em página ainda sem linhas | editor, página fora da lixeira |
| `set_page_text(p_page_id uuid, p_text text, p_json jsonb)` | upsert em `page_texts` | editor, página fora da lixeira |

**Limites (o servidor recusa, não corta):**

- `append_page_updates`: no máximo **100 updates** por chamada e **2 MiB** somados (depois do `decode`); cada
  update no máximo **1 MiB**.
- `append_page_updates` também recusa (`page_content_live_too_large`) se as linhas vivas da página passarem de
  **32 MiB** somadas; o cliente reage compactando (2b).
- `compact_page_content`: snapshot de no máximo **8 MiB** (mesmo valor do `check` da tabela).
- Recusa com `raise exception 'page_content_too_large' using errcode = '22023'` (o PostgREST devolve HTTP 400 e o
  cliente reconhece a mensagem). Lote grande demais é `page_content_batch_too_large` (mesmo errcode). Página na
  lixeira ou sem papel: `insufficient_privilege` (`42501`).
- **O que o cliente faz ao ser recusado:** lote grande → divide em chamadas menores; um único update acima de 1 MiB
  (ex.: colar um texto enorme) → tenta enviar o estado inteiro pela compactação (até 8 MiB); acima disso, a página
  fica "grande demais para sincronizar", com aviso, e o conteúdo continua salvo no aparelho.

## Compactação

**Quando (gatilho no cliente):** ao abrir a página o cliente carrega todas as linhas vivas; se forem **mais de 100
updates** ou **mais de 256 kB** somados desde o último snapshot, e o papel for editor, ele compacta. Também ao
terminar uma sessão longa de edição (mesmo critério, checado no envio).

**Como:**

1. O cliente monta o Y.Doc com as linhas vivas lidas (`p_up_to` = maior id lido) e gera
   `Y.encodeStateAsUpdate(doc)`.
2. **Autoverificação antes de enviar:** aplica o snapshot num Y.Doc novo e confere que o state vector bate com o do
   doc montado. Se não bater, não compacta (e registra no log, sem conteúdo).
3. A RPC, numa transação, pega `pg_advisory_xact_lock(hashtextextended(p_page_id::text, 0))`:
   - se já existe snapshot vivo com `covers_up_to >= p_up_to`, não faz nada (outro aparelho já compactou);
   - senão insere o snapshot (`covers_up_to = p_up_to`) e faz `update … set superseded_at = now()` nas linhas vivas
     com `id <= p_up_to` (updates e o snapshot anterior). **Nada é apagado aqui.**

**Corrida entre dois aparelhos:** `append_page_updates` pega **o mesmo lock** da página. Assim os ids de uma página
são confirmados na ordem em que são gerados: não existe linha com id menor confirmada depois de um cliente ter lido
um id maior. Logo "todas as linhas vivas com `id <= p_up_to`" são exatamente as que o cliente leu e mesclou. Updates
que chegam durante a compactação ganham id maior e continuam vivos. Como o merge do Yjs é idempotente e comutativo,
`snapshot + updates posteriores` reconstrói sempre o mesmo documento, em qualquer aparelho e em qualquer ordem.

**Retenção (proteção contra snapshot ruim e base para histórico):** linhas substituídas ficam guardadas e só uma
limpeza posterior as remove:

- regra: apagar linhas com `superseded_at` **há mais de 7 dias**, **exceto** os **3 snapshots substituídos mais
  recentes** de cada página (e tudo que eles cobrem só precisa existir como snapshot, então updates antigos podem
  sair);
- quem limpa: a própria `compact_page_content` limpa a página que está compactando (barato, sem agendador); um job
  `pg_cron` diário pega páginas que não são mais compactadas (entra com os backups, Fase 6);
- recuperação manual (por enquanto só o Gabriel, no SQL): marcar `superseded_at = null` nas linhas de antes do
  snapshot ruim e `superseded_at = now()` nele. Uma tela de "histórico de versões" pode usar os snapshots retidos
  no futuro (não está no roadmap).

## Snapshot para busca e prévias (2b)

- Tabela 1:1 `page_texts (page_id uuid pk references pages on delete cascade, text text not null default '',
  json jsonb, updated_at timestamptz)`, RLS igual à de `page_contents` (`select` por `can_access_page`; escrita só
  pela RPC `set_page_text`, editor e fora da lixeira; texto limitado a 1 MB).
- `text` = texto puro dos blocos (para `search_pages`, que passa a buscar título **e** texto, com o mesmo
  `immutable_unaccent` + trigram); `json` = os primeiros blocos do BlockNote, para prévias (galeria, links).
- Gravado pelo cliente com debounce longo (~5 s ocioso) e ao ocultar a aba, só se mudou.
- **Por que fora de `pages`:** gravar o texto a cada pausa de digitação em `pages` mexeria em `updated_at`, faria
  barulho no Realtime da árvore e engordaria a linha que a árvore lê em lotes. As colunas `content_json` /
  `content_text` do rascunho de `pages` em `docs/ARCHITECTURE.md` saem do plano.

## Páginas existentes

Página sem linhas em `page_contents` = Y.Doc vazio (o BlockNote mostra um parágrafo vazio). **Sem backfill.**
Conteúdo criado no 2a (só no IndexedDB do aparelho): ao abrir com o 2b, o y-indexeddb carrega o doc local e o 2b
envia o estado inteiro como primeiro update (o merge do Yjs resolve se outro aparelho também tiver conteúdo local).

## Riscos do armazenamento local

- **Safari/iOS apaga o armazenamento de sites sem interação há ~7 dias** (ITP) quando o app **não** está instalado
  na Tela de Início. Por isso, a partir do 2b, o servidor é a fonte de verdade e o IndexedDB só cache/fila. No 2a o
  editor avisa "Prévia: o conteúdo fica salvo só neste aparelho."; o 2b remove o aviso.
- **`navigator.storage.persist()`**: pede ao navegador para não despejar o armazenamento. Entra na **Fase 6** (PWA
  instalado, quando o pedido tem mais chance de ser aceito; o Firefox pergunta ao usuário). Não resolve o ITP do
  Safari sozinho.
- **Despejo dos bancos `axenotes-page-*` antigos:** cada página aberta cria um banco. Entra no **2b**: com o servidor
  como fonte de verdade, apagar bancos de páginas não abertas há 30 dias **e sem updates pendentes** (o 2b guarda a
  data da última abertura num banco de metadados com nome fixo, registrado em `KNOWN_IDB_DATABASES`).
- **Falha ao abrir o IndexedDB** (modo privado, cota, erro do navegador): o editor cai para um Y.Doc só em memória,
  com aviso de que o conteúdo não será guardado (2a). No 2b, nesse modo, o conteúdo ainda vai ao servidor.
- **Navegador sem `indexedDB.databases()`:** o logout só acha os bancos de páginas abertas na sessão atual (Chrome,
  Edge, Safari 14+ e Firefox 126+ têm a função).

## Fase 11 — colaboração em tempo real (y-partyserver)

- Um Durable Object por página (`y-partyserver`) segura o Y.Doc em memória; o cliente conecta com o JWT do Supabase
  e o Worker confere `can_access_page` (viewer lê, editor escreve).
- O Durable Object passa a ser **o único escritor** de `page_contents` (usa as mesmas RPCs ou um papel de serviço só
  no Worker), gravando updates em lote e compactando; os clientes param de chamar `append_page_updates`. O formato da
  tabela e a retenção não mudam.
- Entra o `awareness` (presença e cursores) pelo `provider` do `withCollaboration` do BlockNote, que hoje fica vazio.
- Offline continua igual: y-indexeddb no aparelho; ao reconectar, o provedor troca state vectors e envia só o que
  falta.

## Alternativas descartadas

- **`pages.ydoc` (uma coluna com o estado inteiro):** cada gravação reescreve o documento todo (corrida "último a
  gravar vence" entre aparelhos se não houver merge no servidor; o Postgres não mescla Yjs). Descartada na
  DECISÃO-016.
- **JSON do BlockNote como fonte da verdade:** perde o merge sem conflito do offline e da coedição.
- **Log sem compactação:** cresce sem limite e a abertura da página fica cada vez mais lenta.
- **Compactar em Edge Function ou pg_cron:** o Postgres não sabe mesclar Yjs; uma Edge Function precisaria do Yjs
  no Deno, com custo e cold start, e ainda correria contra os clientes. O cliente já tem o doc montado.
- **Apagar na hora o que foi compactado:** mais simples, mas um cliente com bug poderia destruir o conteúdo sem volta.
- **Supabase Realtime (broadcast) como transporte de updates:** sem persistência nem garantia de entrega; a
  colaboração usa Durable Objects (DECISÃO-012).
- **`@y/y` 14:** o BlockNote 0.56 aceita, mas ainda é release candidate; ficamos no `yjs` 13 estável.

## Correções no 2b

Ajustes feitos ao implementar (o texto acima já os reflete onde cabia):

1. **Logout:** o `signOut()` revoga a sessão antes de `resetClientState` rodar os ganchos de `onBeforeStorageClear`;
   depois disso o RPC iria sem JWT. O envio do pendente acontece **antes** do `signOut`: o "Sair" tenta por até 5 s e,
   se sobrar algo, pergunta. O gancho continua só fechando os docs.
2. **Debounce:** 1 s ocioso / máx. 5 s (em vez de 1,5 s / 10 s).
3. **Snapshot da compactação:** é o `encodeStateAsUpdate` do doc vivo, que contém todas as linhas `id <= p_up_to` e
   talvez edições locais ainda não enviadas (inofensivo: o merge é idempotente). A autoverificação compara o state
   vector do snapshot aplicado num doc novo com o do doc vivo no momento da codificação.
4. **`get_page_content`:** devolve todas as linhas vivas (ver a tabela de RPCs); no modo incremental, um snapshot
   gravado por outro aparelho chega junto e aplicá-lo de novo é inofensivo.
5. **Busca:** `search_pages` ganhou a coluna `snippet` (recriada com `drop` + `create`, mesmos argumentos, grants
   refeitos); o cliente antigo ignora a coluna nova.
6. **Metadados** `axenotes-sync` (nome fixo em `KNOWN_IDB_DATABASES`): `{ lastOpenedAt, state }` por página, com
   `clean` / `dirty` / `blocked`. Base do despejo de 30 dias, do aviso no logout e do reenvio de páginas fechadas.
7. `navigator.storage.persist()` continua na Fase 6.
8. **Teto de 32 MiB vivos por página** no append (o cliente compacta) e `p_up_to = 0` para o primeiro envio grande
   demais para o append numa página sem linhas.
9. `page_contents.created_by` é **nulo ao apagar o usuário** (`on delete set null`), para não travar a exclusão de conta
   (DECISÃO-023); continua sendo só auditoria.
10. **"Editada há…"** passa a contar as edições do corpo (DECISÃO-029).
11. **Teto de 64 MiB de histórico por página:** além dos 3 snapshots substituídos mais recentes, `prune_page_contents`
    apaga antes dos 7 dias o substituído que passar de 64 MiB (os mais antigos primeiro), para ciclos de append +
    compactação não fazerem o banco crescer sem limite (revisão de segurança do 2b).
12. **Busca no corpo e RLS:** o ramo do corpo faz `join` com as páginas do workspace; sob RLS o índice trigram não é
    usado (`like` não é *leakproof*), então o custo cresce com o número de páginas do workspace, não do banco.

## Consequências

- O 2a não grava nada no servidor: o conteúdo existe só no aparelho, com aviso visível.
- O 2b implementa a migration (`page_contents`, `page_texts`, RPCs, limpeza na compactação), o envio com debounce, a
  compactação, o snapshot de texto, a busca no conteúdo, o indicador "Salvo / Salvando / Offline — será
  sincronizado", o logout esperando updates pendentes (gancho `onBeforeStorageClear` de
  `src/lib/reset-client-state.ts`) e o despejo dos bancos antigos.
- O ponto de extensão do 2b no cliente é `ContentSync` (`src/features/sync/content-sync.ts`).
