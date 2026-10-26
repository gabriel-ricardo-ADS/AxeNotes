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
- Scripts: dev, build, preview, typecheck, lint, test, e2e, format; `pnpm run license:check`
  (o `pnpm licenses` é nativo do pnpm) falhando se entrar dependência com licença incompatível
  com GPL-3.0.
- `src/i18n/pt-BR.ts` e helper `t()`.
- Layout vazio: sidebar fixa (desktop) / gaveta (mobile, aberta só pelo ☰) + área de conteúdo.
- GitHub Actions: typecheck, lint, test, build, checagem de licenças (DECISÃO-017).
- Config do Cloudflare Pages (`pnpm build`, `dist`, fallback de SPA) e `docs/DEPLOY.md`;
  o Gabriel conecta a conta (DECISÃO-018).
- Dividida em 2 PRs: fundação (scaffold, qualidade, CI, deploy, docs) e layout (tokens, i18n, UI).
**Pronto quando:** CI verde; screenshots desktop/mobile do layout vazio no tema escuro.
**Antes da Fase 1 (Gabriel):** criar o projeto Supabase, ativar a proteção da `main` e configurar o
SMTP (Brevo ou Resend) para o OTP.

## Fase 1 — Supabase, autenticação, workspaces e árvore de páginas
- Cliente Supabase tipado (`src/lib/supabase.ts`, `database.types.ts`).
- Migrações: `profiles`, `workspaces`, `workspace_members` (owner/editor/viewer), `pages`
  com RLS **por pertencimento ao workspace** (funções `is_workspace_member(ws, min_role)` e
  `can_access_page(page_id)`), índices, trigger de `updated_at`. `pages` **sem Yjs**; busca só por
  título (unaccent). `workspaces.home_page_id` define a página inicial.
- Ao criar conta: workspace pessoal criado automaticamente (trigger).
- Telas: entrar, criar conta, código OTP de 6 dígitos (sem link mágico, DECISÃO-014), sair.
  Rotas protegidas. Requer o Supabase e o SMTP configurados pelo Gabriel.
- Sidebar: árvore (criar, renomear, subpágina, expandir, arrastar para mover, favoritos por
  usuário, recentes), lixeira em cascata. Índice fracionário (licença da lib conferida).
  Página: ícone, título, breadcrumb, "Editada há…". Busca Ctrl+K por título.
- Seed com dados fictícios e 2 usuários de teste.
- e2e passa a rodar no CI.
- Dividida em partes (um PR cada). **T2 — banco e RLS** (`supabase/`: migrações, seed e testes em
  PGlite; sem telas) e **T3a — cliente Supabase + autenticação** (`src/features/auth/`: entrar, criar conta,
  código de 6 dígitos, recuperar senha, sair, rotas protegidas; e2e com 1 login por projeto e smoke de RLS só
  leitura) estão na `main`. **T3b — árvore de páginas e tela da página** (feita, na `main`, #5): seção "Páginas" da
  sidebar (criar, subpágina, renomear, ícone, expandir, mover por "Mover para…" ou arrastando, teclado e
  toque), página inicial criada sob demanda, rota `/p/:pageId` (ícone, título com debounce, breadcrumb,
  "Editada há…"), "Página não encontrada" única. A **T4** foi dividida em três PRs
  (DECISÃO-026): **T4a — favoritos + recentes** (feita, na `main`, #7: estrela na página e no menu da linha, seção
  "Favoritos", seção "Recentes" com registro da visita; sem migration), **T4b — lixeira** (feita, na `main`, #8: UI em `/lixeira`:
  mandar para a lixeira pela árvore e pelo menu da página, restaurar, excluir definitivamente; sem migration) e **T4c — busca Ctrl+K**
  (feita, na `main`, #9: diálogo Ctrl/Cmd+K e botão "Buscar" na sidebar/gaveta, `search_pages` por título, recentes sem texto,
  combobox/listbox acessível; sem migration). **A T4 está completa** (T4a + T4b + T4c).
  **Correções pós-T3b:** o título digitado é salvo ao ocultar/recarregar a página (`keepalive` + aviso de
  saída) e mover entre vizinhos com a mesma `sort_key` é recusado em vez de gravar uma chave inócua.
  **Correção da busca sem workspace:** feita, na `main` (#11): sem workspace carregado, o diálogo de busca não fica mais
  em "Buscando…" para sempre.
  Pendência (decidir com o Gabriel): `sort_key` empatadas entre irmãos (hoje só se recusa o movimento; ver DECISÃO-025, ABERTA).
  **Fase 1 funcionalmente completa** (`main` em `2d28e67`): T2 (#3), T3a (#4), T3b (#5), correção pós-T3b (#6), T4a (#7),
  T4b (#8) e T4c (#9). **Pendências que continuam dentro da Fase 1** (nenhuma bloqueia o uso de Gabriel e da cliente):
  - **e2e no CI: NÃO feito.** Precisa dos secrets `VITE_SUPABASE_*` e `E2E_*` no GitHub. Ao ligar, desligar o `trace` do
    Playwright nos projetos de login (`trace: 'on-first-retry'` poderia registrar o e-mail e a senha do usuário de teste, e
    o relatório do CI é um artefato de repositório público).
  - **Exclusão de conta:** DECISÃO-023 (ABERTA); hoje só Gabriel apaga contas, à mão, no painel.
  - **`sort_key` empatadas entre irmãos:** DECISÃO-025 (ABERTA); nada implementado.
**Pronto quando:** teste de RLS (Postgres local/PGlite) prova que usuário B não vê o workspace de
A, e que um viewer não edita; árvore funciona no desktop e no mobile. Nada é aplicado no
Supabase remoto sem o ok do Gabriel (DECISÃO-015).

## Fase 2 — Editor de blocos local-first (Yjs)
**Antes de abrir esta fase:** se o diferencial de produto da campanha de lançamento (tratada em outro projeto) exigir
mudança no editor, isso precisa ser **decidido antes** de abrir a Fase 2 (junto do ADR da DECISÃO-012/016).
**Pré-requisitos (feitos, num PR só, antes de abrir a fase):** logout limpo (ponto único em
`src/lib/reset-client-state.ts`: cache do Query, stores Zustand, IndexedDB, service worker e Cache Storage),
code-splitting por rota (dois chunks lazy + vendors `react`, `supabase` e `vendor`; entrada de 876,93 kB para
36,54 kB, com recarga única quando um chunk antigo some depois de um deploy) e CSP + headers de segurança em
`public/_headers` (`docs/DEPLOY.md`).
- **Dividida em três PRs:** 2a, 2b e 2c.
- **2a — ADR + editor local (feita):** ADR `docs/adr/0001-conteudo-yjs.md` (confirma a DECISÃO-012/016:
  formato de `page_contents`, compactação com retenção, limites, corrida entre aparelhos, snapshot de busca, riscos do
  armazenamento local). Editor BlockNote (`@blocknote/shadcn`, tema escuro com os tokens, pt-BR) abaixo do título, num
  chunk próprio; Y.Doc por página com `y-indexeddb` (`axenotes-page-<id>`), sem Supabase; trocar de página destrói o
  editor e o doc; IndexedDB falhando cai para memória com aviso; aviso fixo "Prévia: o conteúdo fica salvo só neste
  aparelho."; blocos nativos (texto, títulos, listas, checklist, toggle, citação, código, divisor, tabela), sem mídia;
  leitor e página na lixeira em só leitura (a página na lixeira passa a abrir, com aviso); logout fecha os docs e apaga
  os bancos `axenotes-page-*`; ponto de extensão `ContentSync` para o 2b; CSP conferida sem mudança.
- **2b — sincronização (feita; migration a aplicar pelo Gabriel antes do merge):** migration
  `20261022120001_page_contents.sql` (`page_contents`, `page_texts`, RPCs do ADR, teto de 32 MiB vivos por página,
  `search_pages` no corpo com trecho; testes de RLS, limites, compactação concorrente, retenção e índice em PGlite).
  `supabaseSync` no lugar do `localOnlySync`: diff por state vector ao abrir, fila com debounce (1 s / máx. 5 s) e
  retry, recebimento sem Realtime (foco, visibilidade, rede e polling de 20 s), compactação pelo cliente, `page_texts`,
  indicador "Salvo / Salvando… / Offline — será sincronizado / Erro ao salvar", "Editada há…" contando o corpo
  (DECISÃO-029), aviso de prévia removido, "Sair" que envia o pendente antes e pergunta se sobrar, metadados
  `axenotes-sync` (clean/dirty/blocked), reenvio em segundo plano e despejo dos bancos sem abrir há 30 dias.
  `navigator.storage.persist()` continua na Fase 6. Detalhes em `docs/ARCHITECTURE.md` §5.
  **Pronto quando:** editar no navegador A (inclusive offline), voltar online e ver o conteúdo no navegador B; dois
  aparelhos editando a mesma página convergem; compactação provada em PGlite sem perder update concorrente; busca
  acha uma palavra do corpo; logout com update pendente não perde nada; aviso de prévia removido.
- **2c — blocos e mobile:** dividida em dois PRs (DECISÃO-030).
  - **2c-1 — blocos e menu do bloco (feita):** `callout` (destaque), `pageLink` (link de página e subpágina, com
    estados de lixeira e indisponível), menu do bloco (Transformar em, Cor, Link para o bloco, Duplicar, Excluir, com
    busca; popover no desktop, bottom sheet no toque), link para o bloco com destaque, links externos só
    http/https/mailto. Home de referência (`01-home.jpg`) recriada sem colunas (`e2e/home-referencia.spec.ts`).
  - **2c-2 — editor no mobile (próximo):** alça ao tocar (iPhone: na barra; iPad: na margem), barra acima do teclado
    (`MobileFormattingToolbarController` do BlockNote, que segue o `visualViewport`), meta viewport
    `interactive-widget=resizes-content`, "/" e "Transformar em" em bottom sheet, prévia ao passar o mouse sobre o
    link de página (item 06 da UI-REFERENCE).
    **Pronto quando:** no iPhone e no iPad, inserir e transformar blocos só com toque, com a barra acima do teclado.

Escopo original da fase (repartido acima entre 2a, 2b e 2c):
- BlockNote + `@blocknote/shadcn`, tema escuro com nossos tokens, idioma pt-BR. (2a)
- Conteúdo da página como Y.Doc: `y-indexeddb` (offline), gravação dos updates Yjs em
  `page_contents` com debounce e compactação periódica, e snapshot de texto/JSON para busca e
  prévias. A busca passa a cobrir o conteúdo, além do título.
- Indicador "Salvo / Salvando / Offline — será sincronizado".
- Menu "/", menu do bloco (Transformar em, Cor, Duplicar, Excluir, Link do bloco; "Mover para"
  fica para a V1, DECISÃO-021),
  barra de formatação; blocos nativos (texto, títulos, listas, checklist, toggle, citação,
  código, divisor, tabela simples); blocos `callout` e `pageLink`/`subpage`.
- Mobile: alça ao tocar, barra acima do teclado, menus em bottom sheet.
- O logout espera a sincronização dos updates Yjs pendentes ou avisa que há alterações não salvas antes de apagar
  o IndexedDB (a limpeza em si já existe: `src/lib/reset-client-state.ts`). Registrar o nome (ou prefixo) dos
  bancos do y-indexeddb em `KNOWN_IDB_DATABASES`, para navegadores sem `indexedDB.databases()`. (2a: prefixo
  `axenotes-page-` e bancos abertos na aba apagados no logout; esperar os pendentes fica para o 2b.)
- Revisar a CSP (`public/_headers`) com o BlockNote: estilos e atributos `style` do editor não podem gerar
  violação no Console. (2a: conferida, sem mudança; `docs/DEPLOY.md`.)
**Pronto quando (fase inteira):** recriar a Home (`01-home.jpg`) sem colunas; editar offline (DevTools offline),
voltar online e ver salvo em outro navegador.

## Fase 3 — Imagens, PDFs e links
- Bucket `media` privado (RLS por workspace), upload de imagem/GIF (compressão) e PDF ≤ 10 MB.
- Blocos: imagem (legenda, redimensionar), PDF/arquivo, **embeds** por link (YouTube, Google
  Drive, Vimeo; outros viram bookmark com prévia via Edge Function). Sem upload de vídeo.
- Capa da página (enviar/trocar/reposicionar, GIF permitido).
**Pronto quando:** recriar a matéria com imagens e links (`10-materia-imagens-links.jpg`) e o título
com toggle e imagem (`11-modulo-toggle-imagem.jpg`) usando links do YouTube e do Drive.

## Fase 4 — Colunas e layout
- `@blocknote/xl-multi-column`: 2–4 colunas, arrastar bloco para o lado, redimensionar.
- Página com opção "largura total". Mobile: colunas empilham abaixo de 768 px.
**Pronto quando:** layout de 3 colunas do painel de leituras (`00-painel-de-leituras.jpg`) montável.

## Fase 5 — Bases de dados: núcleo + Tabela + Galeria
- Migrações `databases`, `database_properties`, `database_views`; linhas como páginas.
- Propriedades MVP (PRD 3.5), incluindo Status com grupos e Avaliação 1–5 (ícone configurável,
  destaque ❤️ opcional; mock visual antes). Imagem por URL e upload. Formato de data por
  propriedade (DECISÃO-020).
- Tabela (edição inline, colunas, larguras, rolagem com coluna fixa, virtualização, contagem),
  Galeria (capa, propriedades visíveis), filtros, ordenação, **agrupamento por status/seleção**,
  busca, abas, botão "Nova".
- Bloco `databaseView` (inline e vista vinculada com filtro próprio).
**Pronto quando:** o painel de leituras do print inteiro é montável com dados fictícios; tabela com
1.000 linhas fluida.

## Fase 6 — PWA, offline básico e deploy (fecha o MVP)
- vite-plugin-pwa: manifest, ícones, service worker (app shell offline), prompt de atualização,
  tela "Instalar app" com passo a passo para iPhone/iPad.
- Cache persistente (IndexedDB) da árvore e das bases já abertas, para leitura offline.
- Deploy no Cloudflare Pages com previews por PR (a config já existe desde a Fase 0,
  `docs/DEPLOY.md`); redirect URLs do Supabase Auth.
- Backup semanal dos dados para um destino **privado**, nunca no repositório público
  (DECISÃO-021).
- Lighthouse (PWA, acessibilidade, performance).
**Pronto quando:** instalado no Windows, iPhone e iPad; abre e mostra páginas sem internet.

## Marco — lançamento público (gate)
Não é uma fase e **não bloqueia** o uso de Gabriel e da cliente, nem a ordem das Fases 7 em diante. É o pré-requisito
para **abrir cadastro a outras pessoas e divulgar**. A campanha de divulgação é tratada em outro projeto; nenhuma
funcionalidade nova entra no app por causa dela sem decisão registrada em `docs/DECISIONS.md`.
- a) DECISÃO-023 resolvida e exclusão de conta implementada (LGPD), mais política de privacidade e termos de uso.
- b) Senha mínima no servidor (Auth do Supabase; hoje só o cliente valida), decisão sobre cadastro aberto e CAPTCHA.
- c) SMTP com domínio próprio (SPF/DKIM) e limites do plano gratuito conferidos para o volume de códigos OTP.
- d) Plano e backups do Supabase conferidos para uso além de Gabriel e da cliente (o plano Free pausa por inatividade);
  backup semanal da DECISÃO-021 já em funcionamento.
- e) Logout limpando IndexedDB, service worker e stores Zustand. **Atendido** nos pré-requisitos da Fase 2
  (`src/lib/reset-client-state.ts`, com teste de integração entrar com A, sair, entrar com B). A Fase 2 acrescenta
  esperar os updates Yjs pendentes antes de apagar o IndexedDB.
- f) Cloudflare Access ativo nos previews (`docs/DEPLOY.md`). **Parcialmente atendido:** "Restrict previews" ligado em
  2026-10-20 (só previews); a produção `<projeto>.pages.dev` continua pública, protegida pelo login.
- g) DECISÃO-027 (nome, marca e domínio) e DECISÃO-028 (licença e contribuições) decididas.
- h) Teste em iPhone e iPad reais depois do deploy. **Feito no deploy de teste de 2026-10-20 (desktop, iPhone e iPad);
  repetir antes do lançamento público.**
- i) PRD.md e UI-REFERENCE.md sem dados identificáveis da cliente (persona genérica), com o ok dela.
  **Parte do repositório feita** (PR `chore/higiene-repo`): persona genérica, exemplos e nomes de referência
  descritivos nos docs, e dados fictícios no seed e nos testes. O histórico do git ainda tem os textos antigos
  (reescrever exigiria force-push). **Falta o ok da cliente.**

## Fase 7 — Mais vistas
- Quadro (kanban), Calendário, Lista; exportar/importar CSV. (O agrupamento por status/seleção já
  entrou na Fase 5.) "Mover bloco para outra página" (DECISÃO-021).

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
