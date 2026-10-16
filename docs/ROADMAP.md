# Roadmap do AxeNotes

Cada fase vira 1 ou mais threads/PRs. Não comece uma fase sem a anterior estar mergeada.
"Pronto" de toda fase = definição de pronto do CLAUDE.md + os critérios abaixo.
MVP = Fases 0 a 6. Depois, cada fase é uma entrega usável.

---

## Fase 0 — Fundação do projeto
**Objetivo:** projeto rodando, com qualidade automatizada, sem funcionalidade ainda.
- Scaffold Vite + React + TS strict + pnpm; aliases `@/`.
- Tailwind + shadcn/ui; `src/styles/tokens.css` com os tokens da skill `design-axenotes`;
  fonte Inter; tema escuro padrão.
- ESLint + Prettier; Vitest + Testing Library; Playwright com projetos `desktop`, `mobile`
  (iPhone) e `tablet` (iPad) — a cliente usa Windows + iPhone e o Gabriel testa em iPad.
- Scripts: dev, build, preview, typecheck, lint, test, e2e, format; `pnpm licenses` no CI
  falhando se entrar dependência com licença incompatível com GPL-3.0.
- `src/i18n/pt-BR.ts` e helper `t()`.
- Layout vazio: sidebar fixa (desktop) / gaveta (mobile) + área de conteúdo.
- GitHub Actions: typecheck, lint, test, build, checagem de licenças.
**Pronto quando:** CI verde; screenshots desktop/mobile do layout vazio no tema escuro.

## Fase 1 — Supabase, autenticação, workspaces e árvore de páginas
- Cliente Supabase tipado (`src/lib/supabase.ts`, `database.types.ts`).
- Migrações: `profiles`, `workspaces`, `workspace_members` (owner/editor/viewer), `pages`
  com RLS **por pertencimento ao workspace** (função `is_workspace_member(ws, min_role)`),
  índices, trigger de `updated_at`, busca full-text pt (unaccent).
- Ao criar conta: workspace pessoal criado automaticamente (trigger).
- Telas: entrar, criar conta, link mágico, sair. Rotas protegidas.
- Sidebar: árvore (criar, renomear, subpágina, expandir, arrastar para mover, favoritos por
  usuário, recentes), lixeira. Página: ícone, título, breadcrumb, "Editada há…". Busca Ctrl+K.
- Seed com dados fictícios e 2 usuários de teste.
**Pronto quando:** teste de RLS prova que usuário B não vê o workspace de A, e que um viewer
não edita; árvore funciona no desktop e no mobile.

## Fase 2 — Editor de blocos local-first (Yjs)
- ADR curto em `docs/` confirmando a DECISÃO-012 antes de codar.
- BlockNote + `@blocknote/shadcn`, tema escuro com nossos tokens, idioma pt-BR.
- Conteúdo da página como Y.Doc: `y-indexeddb` (offline), gravação do estado Yjs no Supabase
  (coluna bytea ou Storage) com debounce, e snapshot de texto/JSON para busca e prévias.
- Indicador "Salvo / Salvando / Offline — será sincronizado".
- Menu "/", menu do bloco (Transformar em, Cor, Duplicar, Mover para, Excluir, Link do bloco),
  barra de formatação; blocos nativos (texto, títulos, listas, checklist, toggle, citação,
  código, divisor, tabela simples); blocos `callout` e `pageLink`/`subpage`.
- Mobile: alça ao tocar, barra acima do teclado, menus em bottom sheet.
**Pronto quando:** recriar a Home (`01-home.jpg`) sem colunas; editar offline (DevTools offline),
voltar online e ver salvo em outro navegador.

## Fase 3 — Imagens, PDFs e links
- Bucket `media` privado (RLS por workspace), upload de imagem/GIF (compressão) e PDF ≤ 10 MB.
- Blocos: imagem (legenda, redimensionar), PDF/arquivo, **embeds** por link (YouTube, Google
  Drive, Vimeo; outros viram bookmark com prévia via Edge Function). Sem upload de vídeo.
- Capa da página (enviar/trocar/reposicionar, GIF permitido).
**Pronto quando:** recriar `10-…` e `11-…` das referências usando links do YouTube e do Drive.

## Fase 4 — Colunas e layout
- `@blocknote/xl-multi-column`: 2–4 colunas, arrastar bloco para o lado, redimensionar.
- Página com opção "largura total". Mobile: colunas empilham abaixo de 768 px.
**Pronto quando:** layout de 3 colunas do print (`00-…`) montável.

## Fase 5 — Bases de dados: núcleo + Tabela + Galeria
- Migrações `databases`, `database_properties`, `database_views`; linhas como páginas.
- Propriedades MVP (PRD 3.5), incluindo Avaliação e Status com grupos.
- Tabela (edição inline, colunas, larguras, rolagem com coluna fixa, virtualização, contagem),
  Galeria (capa, propriedades visíveis), filtros, ordenação, busca, abas, botão "Nova".
- Bloco `databaseView` (inline e vista vinculada com filtro próprio).
**Pronto quando:** a página do print inteira é montável com dados fictícios; tabela com
1.000 linhas fluida.

## Fase 6 — PWA, offline básico e deploy (fecha o MVP)
- vite-plugin-pwa: manifest, ícones, service worker (app shell offline), prompt de atualização,
  tela "Instalar app" com passo a passo para iPhone/iPad.
- Cache persistente (IndexedDB) da árvore e das bases já abertas, para leitura offline.
- Deploy no Cloudflare Pages com previews por PR; redirect URLs do Supabase Auth.
- Lighthouse (PWA, acessibilidade, performance).
**Pronto quando:** instalado no Windows, iPhone e iPad; abre e mostra páginas sem internet.

## Fase 7 — Mais vistas
- Quadro (kanban), Calendário, Lista; agrupamento; exportar/importar CSV.

## Fase 8 — Agenda e lembretes
- Base de sistema "Agenda", página Agenda (mês/semana/dia/lista), repetição simples,
  "Próximos eventos" na sidebar.
- Lembretes + central no app + Web Push (VAPID, `push_subscriptions`, Edge Function, pg_cron).
**Pronto quando:** lembrete criado no PC toca no iPhone com o PWA instalado.

## Fase 9 — Google Agenda
- Etapa A: calendário do Google por URL iCal secreta (somente leitura), atualização periódica.
- Etapa B: OAuth + Google Calendar API, sincronização em duas vias (criar/editar eventos dos dois
  lados), tokens guardados no Supabase Vault. Documentar a configuração no Google Cloud.

## Fase 10 — Offline completo
- Fila de alterações (outbox) para árvore e bases: criar/editar/mover offline e sincronizar ao
  reconectar, com resolução por campo (último a gravar vence) e aviso de conflito.
- Testes e2e simulando offline → online em dois dispositivos.

## Fase 11 — Compartilhamento e colaboração em tempo real
- Convites por e-mail para o workspace e por página; papéis; link público somente leitura.
- Provedor Yjs em tempo real (DECISÃO-012: Durable Objects + y-partyserver, auth via JWT do
  Supabase); presença e cursores com nome/cor; comentários (opcional).
- Teste de carga simples (vários clientes no mesmo documento).

## Fase 12 — IA
- `@blocknote/xl-ai` no editor (escrever, resumir, continuar, traduzir, transformar seleção).
- Configurações → IA: provedor e modelo (Gemini nível gratuito, OpenRouter modelos gratuitos,
  ou chave própria de Anthropic/OpenAI/Google); chaves no Supabase Vault; Edge Function proxy
  com limite de uso e streaming.

## Fase 13 — Bloco Planilha (estilo Excel)
- Avaliar Univer, Fortune-sheet e HyperFormula (licença, tamanho, mobile); ADR; implementar bloco
  com fórmulas, formatação básica e import/export XLSX/CSV.

## Fase 14 — Polimento
- Tema claro, atalhos, templates (Leituras, Matéria, Agenda semanal, Vocabulário),
  acessibilidade e performance.

## Fase 15 — Apps de loja (futuro, escalabilidade)
- Capacitor Android (Play Store) e iOS via build na nuvem (sem Mac).
