# Decisões do AxeNotes

Status: **ABERTA** (Claude deve perguntar antes de agir), **PADRÃO** (seguir até alguém mudar),
**DECIDIDA**. Ao decidir, troque o status, escreva a data e o motivo. Todas abaixo foram
respondidas pelo Gabriel/cliente em 2026-10-15.

---

### DECISÃO-001 — Lojas de apps ou PWA?
**DECIDIDA** — PWA (navegador, instalável) agora; lojas (Capacitor) ficam para depois, como
escalabilidade. Testes reais: Windows (Chrome/Edge), iPhone e iPad (Safari, PWA na Tela de Início).
Não há Mac: quando chegar a hora do iOS nativo, usar build na nuvem (ex.: GitHub Actions com
runner macOS ou Codemagic).

### DECISÃO-002 — Colunas ("dividir a tela")
**DECIDIDA** — `@blocknote/xl-multi-column` (GPL-3.0), permitido porque o repositório é GPL-3.0.

### DECISÃO-003 — Repositório
**DECIDIDA** — público, licença **GPL-3.0**, como portfólio e aberto a contribuições.
- Dependências precisam ser compatíveis com GPL-3.0 (MIT, BSD, ISC, Apache-2.0, MPL-2.0, LGPL,
  GPL-3.0). Nada proprietário ou "non-commercial".
- Nada sensível no repositório: segredos ficam em `.env.local` (ignorado) e nos painéis do
  Supabase, Cloudflare e do ambiente de nuvem do Claude; dados/imagens da cliente nunca entram em
  código, seeds, testes, issues, commits ou prints (só dados fictícios).
- A chave anon/publishable do Supabase é pública por design; a proteção é a RLS.

### DECISÃO-004 — Usuários, compartilhamento e colaboração
**DECIDIDA** — começa com a cliente usando sozinha, mas a arquitetura já nasce **multiusuário**:
- Modelo com `workspaces` + `workspace_members` (papéis owner/editor/viewer) desde a Fase 1;
  RLS por pertencimento ao workspace, não por `owner_id`.
- Compartilhar página/workspace por convite (e-mail) e link somente leitura — fase própria.
- Edição simultânea em tempo real (presença, cursores) com Yjs — fase própria (DECISÃO-012).
- Escalabilidade: Postgres com índices certos, conteúdo em Yjs (merge sem conflito), servidor de
  sincronização que escala por documento.

### DECISÃO-005 — Importar do Notion
**DECIDIDA** — não. (Fica fora do roadmap.)

### DECISÃO-006 — Agenda e Google Agenda
**DECIDIDA** — agenda própria **e** integração com Google Agenda:
1. Primeiro: ler o calendário do Google pelo "endereço secreto no formato iCal" (somente leitura,
   sem OAuth) — mostra os eventos na agenda e em "Próximos eventos".
2. Depois: sincronização em duas vias via OAuth (Google Calendar API). Exige tela de consentimento
   no Google Cloud; o escopo de calendário é sensível e, para muitos usuários, pede verificação do
   app pelo Google. Em modo de teste funciona para até 100 usuários de teste.

### DECISÃO-007 — Mídia
**DECIDIDA** — vídeos e arquivos grandes **por link** (YouTube, Google Drive, Vimeo, outros como
bookmark com prévia). Sem upload de vídeo. Upload só de imagens/GIFs (comprimidos) e PDFs pequenos
(até 10 MB).

### DECISÃO-008 — IA dentro do app
**DECIDIDA** — sim, com provedores plugáveis:
- Editor com `@blocknote/xl-ai` (GPL-3.0, ok) sobre o Vercel AI SDK.
- Provedores: Google Gemini (tem nível gratuito com chave do Google AI Studio — atenção: no nível
  gratuito o Google pode usar os dados para melhorar produtos), OpenRouter (tem modelos gratuitos),
  e "traga sua chave" para Claude (Anthropic), GPT (OpenAI) e Gemini pago.
- Chaves do usuário guardadas criptografadas no servidor (Supabase Vault) e usadas só por Edge
  Function proxy; nunca no bundle do front. Limite de uso por usuário.
- Escolha do provedor/modelo em Configurações → IA.

### DECISÃO-009 — Offline
**DECIDIDA** — sim, **offline-first**:
- Conteúdo das páginas em Yjs, persistido no aparelho (IndexedDB) e sincronizado quando houver rede.
- Árvore de páginas e bases: cache local + fila de alterações (outbox) que sincroniza ao reconectar.
- App shell em cache pelo service worker (abre sem internet).

### DECISÃO-010 — Planilhas
**DECIDIDA** — bases estilo Notion (principal) + bloco "Planilha" estilo Excel com fórmulas,
numa fase posterior. Candidatos com licença compatível: Univer (Apache-2.0), Fortune-sheet (MIT),
HyperFormula (GPL-3.0) para o motor de fórmulas — avaliar na fase.

### DECISÃO-011 — Hospedagem
**DECIDIDA** — Cloudflare Pages (front) + Cloudflare Workers/Durable Objects (sincronização Yjs,
DECISÃO-012) + Supabase Free (Auth, Postgres, Storage, Edge Functions). Domínio próprio opcional.
Supabase Free pausa após 1 semana sem uso (o uso diário evita).

### DECISÃO-012 — Sincronização de conteúdo (Yjs)
**DECIDIDA (2026-10-22, Fase 2a)** — confirmada pelo ADR `docs/adr/0001-conteudo-yjs.md` (formato de
`page_contents`, compactação com retenção, limites, corrida entre aparelhos, snapshot de busca, riscos do
armazenamento local e o que muda na colaboração). Conteúdo de cada página é um documento Yjs
(BlockNote suporta nativamente):
- Fase 2: Y.Doc local + `y-indexeddb` (offline) + gravação no Supabase como **log de updates Yjs
  com compactação periódica, numa tabela separada (`page_contents`)**, e não numa coluna
  `pages.ydoc` (DECISÃO-016). Um snapshot JSON/texto continua servindo busca e prévias.
- Fase de colaboração: provedor em tempo real. Recomendado: Cloudflare Durable Objects com
  `y-partyserver` (um objeto por página; Durable Objects existem no plano gratuito do Workers),
  autenticando com o JWT do Supabase. Alternativa: Hocuspocus (MIT) em um servidor Node.

### DECISÃO-013 — Plano e uso do Claude
**DECIDIDA** — Claude Pro com Projects disponível. Threads em Sonnet (esforço alto); fases
críticas (editor/Yjs, bases, sincronização, colaboração) pedem Opus explicitamente. No máximo
1–2 threads simultâneas para não estourar o limite.

---

Decisões abaixo: Gabriel, 2026-10-15, ao abrir a Fase 0.

### DECISÃO-014 — Login: e-mail + senha + código OTP, sem link mágico
**DECIDIDA** — o acesso usa e-mail + senha, confirmados por um código OTP de 6 dígitos enviado
por e-mail. **Sem link mágico**, por causa do problema que ele causa no PWA no iOS.
- SMTP gratuito (Brevo ou Resend) configurado pelo Gabriel **antes da tela de login** (Fase 1).
- Substitui o "link mágico" do PRD 3.1 e da Fase 1 do roadmap.

**Esclarecimento (Fase 1, T3a — como o fluxo foi implementado):**
1. *Criar conta:* nome + e-mail + senha → `signUp` → tela do código (6 dígitos) →
   `verifyOtp({ type: 'signup' })` → entra.
2. *Entrar:* e-mail + senha (`signInWithPassword`), sessão persistente. **O código não é pedido a cada
   login**; só confirma o cadastro e a recuperação de senha. Conta existente mas não confirmada → tela do
   código com "Reenviar código" (espera de 60 s entre reenvios, além do limite do servidor).
3. *Esqueci a senha:* e-mail → `resetPasswordForEmail` → código (`verifyOtp({ type: 'recovery' })`) →
   nova senha (`updateUser`) → entra. O Supabase não tem `resend` de recuperação: reenviar chama
   `resetPasswordForEmail` de novo.
4. *Sair:* `signOut({ scope: 'local' })` — só este aparelho (o padrão, `global`, derrubaria todos); limpa o
   cache do TanStack Query.
- Respostas que não revelam contas: login errado mostra sempre "E-mail ou senha incorretos."; o pedido de
  recuperação responde igual exista a conta ou não; a tela do código diz "se o e-mail estiver correto".
- Senha: mínimo de 8 caracteres e máximo de 72 **bytes** (limite do bcrypt), validados no cliente (zod).
- Durante a recuperação o código aceito já abre sessão; a tela marca `recovering` (antes de verificar,
  desfeito se falhar) para a guarda "só deslogado" não tirar a pessoa da etapa da nova senha. Recarregar
  nessa etapa deixa a pessoa logada no app sem ter trocado a senha (já provou posse do e-mail).
- Depois de trocar a senha na recuperação, as sessões dos OUTROS aparelhos são encerradas
  (`signOut({ scope: 'others' })`, best effort): quem recupera a senha pode estar com a conta comprometida.
- `/codigo` aberta sem `location.state` (PWA do iOS reaberto) pede o e-mail antes do código. O e-mail
  viaja pelo `location.state`, nunca pela URL.

### DECISÃO-015 — Supabase, testes de RLS e remoto
**DECIDIDA** — o projeto Supabase ainda não existe; o Gabriel cria **antes da Fase 1**.
- Testes de RLS rodam em Postgres local ou PGlite, sem depender do projeto remoto.
- **Nada é aplicado no Supabase remoto sem o ok do Gabriel.** Migrações entram no PR e ele aplica.

### DECISÃO-016 — Conteúdo das páginas em `page_contents` (log de updates Yjs)
**DECIDIDA (ADR na Fase 2)** — o conteúdo vive numa tabela separada `page_contents`: um log de
updates Yjs por página, compactado periodicamente em um estado único. A tabela `pages` não guarda
mais o `ydoc`. Atualiza a DECISÃO-012; o ADR da Fase 2 detalha o formato e a compactação.
- **ADR:** `docs/adr/0001-conteudo-yjs.md` (2026-10-22). Resumo: `bytea` trafegado em base64 só por RPC;
  compactação feita pelo cliente com lock por página (o mesmo do append) e **sem apagar na hora** (linhas
  substituídas ficam 7 dias ou nos 3 últimos snapshots); limites por chamada e por linha; texto para busca/prévias
  em `page_texts` (1:1), fora de `pages`. A migration é do 2b.

### DECISÃO-017 — CI desde a Fase 0
**DECIDIDA** — GitHub Actions em `.github/workflows/ci.yml` com typecheck, lint, test, build e
checagem de licenças (`pnpm run license:check`, compatíveis com GPL-3.0). O e2e roda localmente
na Fase 0 e entra no CI quando o app tiver o que testar (Fase 1).
`pnpm licenses` é comando nativo do pnpm, por isso o script se chama `license:check`.

### DECISÃO-018 — Preview no Cloudflare Pages adiantado
**DECIDIDA** — a configuração (`pnpm build`, `dist`, fallback de SPA) e o passo a passo ficam no
repositório desde a Fase 0 (`docs/DEPLOY.md`), para testar no iPhone/iPad por URL de preview.
O Gabriel conecta a conta. O deploy completo (PWA, redirect URLs do Auth) continua na Fase 6.

### DECISÃO-019 — Escopo da Fase 1
**DECIDIDA**
- `pages` **sem Yjs** na Fase 1 (o conteúdo chega na Fase 2).
- **Busca só por título.** Busca por conteúdo entra com o snapshot de texto da Fase 2.
- Gaveta mobile **só pelo botão ☰** (sem gesto de arrastar da borda).
- `workspaces.home_page_id` define a página inicial.
- Lixeira **em cascata**: excluir uma página leva as subpáginas; restaurar traz de volta.
- Ordem por **índice fracionário**, com a licença da biblioteca conferida antes de adotar.
- RLS com `is_workspace_member(ws, min_role)` + `can_access_page(page_id)`.

### DECISÃO-020 — Escopo da Fase 5 (bases de dados)
**DECIDIDA**
- **Agrupamento por status/seleção entra no MVP** (antes era V1).
- **Avaliação 1–5** com ícone configurável (estrela ou coração) e destaque ❤️ opcional; um mock
  visual é validado antes de implementar.
- **Imagem** aceita URL e upload.
- **Formato de data por propriedade** (dia/mês/ano, relativo, com ou sem hora).

### DECISÃO-021 — Backup e "Mover bloco"
**DECIDIDA**
- **Backup semanal na Fase 6**, para um destino **privado**. Nunca no repositório público.
- "Mover bloco para outra página" fica para a **V1** (sai do menu do bloco do MVP).

### DECISÃO-022 — Fonte Inter (OFL-1.1) é a única exceção de licença de fonte
**DECIDIDA** — Gabriel, 2026-10-15, ao abrir o PR 2 da Fase 0. A fonte Inter vem do pacote
`@fontsource-variable/inter`, sob a SIL Open Font License 1.1. Ela não está na lista geral de
licenças compatíveis com GPL-3.0, então foi aprovada **só para esse pacote**, em
`PACKAGE_EXCEPTIONS` de `scripts/check-licenses.mjs`. Qualquer outro pacote em OFL-1.1 (ou outra
fonte) continua barrado pelo `pnpm run license:check` e precisa de nova aprovação.

### DECISÃO-023 — Exclusão de conta e workspaces órfãos
**ABERTA** — apontada na revisão de segurança da Fase 1 (T2). Apagar um usuário em `auth.users`
remove o perfil e as memberships em cascata; o guarda do "último owner" é ignorado de propósito
nesse caso. Resultado: um workspace sem nenhum membro fica no banco, inalcançável, com as páginas; e
um workspace com outros membros pode ficar sem owner. Precisamos decidir (antes de oferecer "excluir
minha conta", LGPD): apagar o workspace pessoal junto, promover outro membro a owner, ou exigir a
transferência antes. Até lá, a exclusão de contas só é feita à mão pelo Gabriel, no painel.
- Passa a ser pré-requisito do "Marco — lançamento público" (`docs/ROADMAP.md`). Continua **ABERTA**.

### DECISÃO-024 — Árvore de páginas (Fase 1, T3b)
**DECIDIDA** — Gabriel aprovou o plano da T3b em 2026-10-16.
- **Ordem:** biblioteca `fractional-indexing` (CC0-1.0), isolada em `src/lib/fractional-index.ts`. Chaves
  comparadas sempre com `<` (a coluna é `collate "C"`), nunca com `localeCompare`; empate pelo id.
- **Arrastar:** só `@dnd-kit/core` (MIT), sem `@dnd-kit/sortable`: a árvore precisa de três alvos por linha
  (antes / dentro / depois), que a lista plana do `sortable` não dá. Sensores: mouse, toque (segurar 250 ms)
  e teclado (na alça da linha).
- **Sem arrastar:** "Mover para…" no menu da linha é o caminho garantido (teclado, leitor de tela, toque).
- **Página inicial** não aparece como raiz da seção "Páginas" (é o item "Página inicial"); filhas dela
  aparecem como raízes. Criada sob demanda pelo owner, com lock entre abas (Web Locks) e
  `update … where home_page_id is null`; quem perde só apaga a própria página depois de reler o workspace
  e confirmar que a página inicial atual é outra.
- **`home_page_id` só o owner grava** (política `workspaces_update`). Editor/viewer de workspace alheio com a
  página inicial vazia vê "sem página inicial". Rever na Fase 11 (convites).
- **Estado de expansão** da árvore fica em memória (Zustand), sem `localStorage`. O logout já devolve as stores ao
  estado inicial (`src/lib/reset-client-state.ts`); persistir a expansão continua fora do escopo.
- **`date-fns`** (MIT) para "Editada há…" em pt-BR.
- **Nota (correção pós-T3b):** arrastar para uma posição entre dois irmãos com a MESMA `sort_key` é recusado
  com aviso (`planMove` → `tie`); antes o app gravava uma chave inócua e a ordem não mudava. Como tratar as
  chaves empatadas está na DECISÃO-025 (ABERTA).

### DECISÃO-025 — Chaves de ordem (`sort_key`) empatadas entre irmãos
**ABERTA** — apontada ao investigar o e2e de arrastar (PR #6). **Sessões futuras NÃO implementam nada
disto (nem as opções abaixo, nem variações) sem o Gabriel decidir aqui.**

**Problema.** `pages.sort_key` não é único: duas páginas irmãs podem ter a mesma chave (duas abas ou
aparelhos criando no fim da lista ao mesmo tempo, ou dados importados). A árvore desempata pelo id, então
a ordem exibida é estável, mas não existe chave estritamente entre dois irmãos empatados sem reescrever um
deles. Hoje (DECISÃO-024) `planMove` devolve `tie` e o app só avisa que não dá para mover para aquela
posição; "Mover para…" (fim da lista) continua funcionando. O usuário fica sem poder arrastar para o meio
de um par empatado até as chaves mudarem por outro motivo.

**Opções.**
- **A — Autorreparo no cliente.** Ao detectar o empate, reescrever só a chave de UM dos empatados (a que fica
  depois, no desempate por id) para uma chave entre ela e a próxima distinta, e então calcular o movimento.
  Sem migration. Contras: duas escritas não atômicas (a segunda pode falhar e deixar o par reparado sem o
  movimento); duas abas podem reparar ao mesmo tempo; não impede novos empates; mais código na fila de
  escritas e no rollback otimista.
- **B — Índice único parcial** `(parent_id, sort_key) where trashed_at is null` (com `coalesce` para a raiz,
  já que `parent_id` nulo não empata em índice único) + retry do cliente com nova chave ao receber `23505`.
  O banco passa a impedir o empate de vez. Exige migration, que EU aplico (DECISÃO-015). Contras: dados que
  já estejam empatados precisam ser corrigidos antes de criar o índice; todo insert/update de ordem ganha
  um caminho de retry; a restauração da lixeira pode colidir com chaves ocupadas nesse meio-tempo.
- **C — RPC `rebalance_siblings(p_parent_id)`** em transação, que regrava as chaves dos filhos de um pai em
  sequência limpa (security definer, `is_workspace_member` com papel de editor). O cliente a chama quando
  `planMove` devolve `tie` e depois repete o movimento. Exige migration (que EU aplico) e testes de RLS em
  PGlite. Atômica e sem corrida entre abas. Contras: reescreve muitas linhas, com custo em pais com muitos
  filhos; não impede novos empates sozinha (pode ser combinada com B).

**Recomendação.** Não decidir agora: o caso só aparece com escritas concorrentes e hoje é raro e
inofensivo (aviso + "Mover para…"). Decidir **quando aparecer o primeiro caso real, ou antes da Fase 11
(convites e colaboração em tempo real)**, o que vier primeiro, porque colaboração multiplica as escritas
concorrentes. Se for preciso decidir cedo, a tendência é **C** (atômica, sem corrida), com **B** depois se
os empates continuarem aparecendo; **A** só como remendo.

### DECISÃO-026 — Favoritos, recentes, lixeira e busca (Fase 1, T4)
**DECIDIDA** — Gabriel aprovou o plano da T4 em 2026-10-16 e dividiu a entrega em três PRs: **T4a** (favoritos +
recentes), **T4b** (lixeira) e **T4c** (busca Ctrl+K). Cada uma ganha um plano próprio depois do merge da anterior.
A T4 é só cliente: **sem migration** (as tabelas e RPCs vieram na T2). A DECISÃO-025 segue ABERTA e nada dela foi feito.

**Implementado na T4a**
- **Pastas:** `src/features/{favorites,recents}` (e, nas próximas, `trash` e `search`), separadas de `workspace`.
- **Favoritos (por usuário):** seção "Favoritos" acima de "Páginas"; estrela no topo da página e item no menu "…" da
  linha da árvore (esse menu agora existe também para o leitor, só com a ação de favoritar). Ordem por `sort_key`
  (`<`, desempate pelo id da página). Favoritar sempre **no fim**; reordenar fica fora, então nenhum fluxo cria chave
  *entre* dois favoritos (nada a tratar de `tie`; empates só afetam a ordem de exibição, estável por id). Gravação
  `upsert … ON CONFLICT DO NOTHING` (idempotente entre abas); atualização otimista com rollback só do item mexido, em
  fila própria (`favorites-write`), sem recarregar a lista em sucesso. Favorita na lixeira some da seção (junção com
  `usePages`) mas a linha continua no banco: ao restaurar, ela volta. Leitor também favorita (é dado por usuário).
- **Recentes (por usuário):** a visita é gravada ao abrir `/p/:pageId` **depois** que a página foi encontrada (a RLS já
  barra o resto; inexistente, sem acesso e lixeira nunca chegam lá). `upsert` em `(user_id, page_id)` mandando sempre
  `visited_at` (o PostgREST só atualiza as colunas enviadas). A página inicial **não** entra. Antirrepetição: a **mesma**
  página não grava de novo por **30 s**; A → B → A grava as três, para a ordem refletir a última visita. **8 exibidos,
  50 guardados** por usuário: ao gravar com a lista cheia, apaga as visitas mais antigas que a 50ª (`lt visited_at`,
  best effort). `visited_at` vem do relógio do aparelho (sem migration não há `now()` do servidor).
- **Aviso de erro** das ações da sidebar sai da seção "Páginas" e fica no topo da sidebar (`SidebarNotice`).
- A estrela da página mostra o próprio erro dentro da página (a gaveta mobile fecha e esconderia o aviso da sidebar).

**Implementado na T4b (lixeira)** — Gabriel aprovou o plano em 2026-10-16/17, sem migration e sem dependência nova.
- Tela em rota **`/lixeira`**, item "Lixeira" no rodapé da sidebar, acima da conta. O leitor vê a lista em leitura
  (sem "Restaurar" nem "Excluir definitivamente").
- **Raízes da lixeira** = página na lixeira cujo pai **não** está na lixeira **ou** cujo `trashed_at` é **diferente** do
  `trashed_at` do pai (filho lixeado antes do pai segue visível e restaurável por conta própria). "+N subpáginas" conta
  só os descendentes com o **mesmo** `trashed_at` da raiz.
- Mandar para a lixeira a página aberta (ou uma que a contém) navega para a **página-pai**, ou para `/` se for raiz.
- "Excluir definitivamente" com `AlertDialog` (`radix-ui`, já dependência) e `parent_trashed` com mensagem clara em pt-BR.
- **Mandar para a lixeira:** item "Mover para a lixeira" no menu "…" da linha da árvore e no novo "…" do topo da página
  (editor/owner; **não** aparece para leitor, para a página inicial nem para página que a contém — `canTrash`). Pela
  **árvore** é otimista: navega (`replace`) para o pai ou `/` e **espera a rota mudar** antes de cancelar/remover `['page', id]`
  e a subárvore do cache; se o RPC falhar, devolve só as linhas removidas, reconcilia e avisa na `SidebarNotice`. Pelo
  **menu da página** espera o RPC (item "Movendo…" desabilitado) e só então navega; o erro aparece na própria página (no
  mobile a gaveta fechada esconderia a sidebar). Ambos usam a fila `pages-write` (um renomear pendente chega antes) e
  recarregam a lista da lixeira ao terminar.
- **Tela:** só as raízes, mais recentes primeiro, com "Excluída há X", "+N subpáginas" (mesmo `trashed_at`) e origem. Carimbos
  comparados como **texto igual**, não como data. **Restaurar** sem otimismo (linha "Restaurando…", páginas e lixeira
  recarregadas uma vez cada). **Excluir definitivamente** com `AlertDialog` (foco em Cancelar): a contagem do diálogo inclui
  **todos** os descendentes (o FK apaga também os lixeados antes, que aparecem como outras raízes) e avisa quando há esses.
  Zero linhas afetadas = erro (`gone`) + recarga.
- **Filho lixeado antes do pai:** segue visível como raiz, mas **restaurá-lo com o pai ainda na lixeira é recusado**
  (`parent_trashed`, mensagem em pt-BR): "restaurável por conta própria" vale quando o pai não está na lixeira. O botão
  continua habilitado e a origem diz "(também na lixeira)".
- **Sem conexão:** não há outbox até a Fase 10. Pela árvore, mandar para a lixeira se comporta como as outras escritas
  (criar, renomear, mover, favoritar): sai da lista na hora e o pedido fica em espera até o navegador reconectar (se a aba for
  fechada antes, perde-se). Restaurar, excluir e mandar para a lixeira pelo menu da página (sem otimismo) falham
  na hora, sem ficar "Restaurando…"/"Movendo…" até reconectar, e mostram o erro.
- **Risco registrado:** `trash_page` aceita lixear a **página inicial** (e uma página que a contém); hoje só o cliente
  impede (não oferece a ação). Quem chamar o RPC direto consegue; se isso importar, a regra vira migration depois.
- **Restaurar pode recriar empate de `sort_key`** entre irmãos (a página volta com a chave antiga). Isso fica sob a
  DECISÃO-025 (ABERTA): a T4b **não** resolve nem inventa solução.

**Implementado na T4c (busca)** — Gabriel aprovou o plano em 2026-10-18, sem migration e sem dependência nova (Radix
Dialog, que já existia; nada de `cmdk`). Nenhuma decisão nova.
- Diálogo Ctrl/Cmd+K com `search_pages` (limite 20 no cliente; o servidor aceita até 50), debounce de 200 ms, resposta
  antiga ignorada (chave da consulta por termo + `signal`), sem texto mostra os recentes (os 8 da sidebar, mesmo hook),
  botão "Buscar" visível na sidebar/gaveta para o mobile, ARIA de combobox/listbox e foco devolvido ao fechar.
- **O servidor faz o trabalho:** acento, caixa, espaços nas pontas, `%`/`_`/`\` literais, lixeira e limite estão na
  função (migration 0006); o cliente só faz trim + NFC + máximo de 200 caracteres e **não escapa nada**. A RLS de `pages`
  basta (a função é `security invoker`; leitor busca; quem é de fora recebe vazio). Provado em PGlite com a chamada de
  argumentos nomeados que o PostgREST emite.
- **Atalho:** ⌘K no Mac, Ctrl+K nos demais (no Mac, Ctrl+K é "apagar até o fim da linha"); `preventDefault` quando vale;
  ignora tecla segurada, IME e Alt/Shift; ignora evento já tratado (`defaultPrevented`); não abre por cima de outro
  diálogo (Mover para…, ícone, excluir), mas ainda cancela o padrão do navegador; com a busca aberta só devolve o foco ao
  campo; foco em campo de texto (título da página) não impede.
- **Teclado do diálogo:** ↑/↓ com volta, Enter abre a opção ativa (a primeira já nasce ativa; ignorado enquanto "Buscando…"),
  Esc fecha. **Home/End continuam movendo o cursor do campo** (padrão APG de combobox editável).
- **Foco:** guarda o elemento que abriu (o botão passa a si mesmo: o Safari não dá foco ao botão tocado) e o devolve ao
  fechar; se ele sumiu, vai ao ☰ e por último ao conteúdo. No mobile o diálogo abre **por cima da gaveta** (ela fica por
  baixo): Esc volta ao botão "Buscar" da gaveta; ao escolher um resultado, as duas fecham e o foco vai ao ☰. Provado no
  WebKit (iPhone emulado). Nota do Radix: um Esc no primeiro quadro depois de abrir ainda vai à camada de baixo (menos de
  50 ms; só um teste automático é tão rápido).
- **iOS:** o Safari não redimensiona o layout com o teclado; o diálogo fica no topo e `max-height`/`top` vêm do
  `visualViewport`. O WebKit do Playwright não abre teclado virtual: o e2e usa um viewport baixo (390×400) como
  substituto. Teclado automático e encaixe reais: teste manual em aparelho (checklist pós-deploy).
- **Página inicial** nos resultados abre em `/`. Termo só com espaços não consulta e mostra os recentes. Sem cache entre
  consultas (`gcTime: 0`): a busca reflete renomeações e a lixeira na hora.
- **Regra proposta para o `Mod+K` no editor (Fase 2; NADA do editor foi feito agora):** o BlockNote/TipTap usa `Mod+K`
  para "criar link" e chama `preventDefault`, mas o evento ainda sobe ao `document`. Nosso atalho já ignora
  `defaultPrevented`. Proposta: dentro do editor, **com texto selecionado = link, sem seleção = busca**, e o botão "Buscar"
  nunca depende de atalho. A regra final fica para a decisão da Fase 2.
- **Fora desta entrega:** busca no conteúdo (Fase 2+), filtros, busca tolerante a erros, destaque do trecho, Ctrl/Cmd+clique
  para abrir em outra aba, histórico de buscas e criar página a partir da busca.

### DECISÃO-027 — Nome, marca e domínio
**ABERTA** — registrada em 2026-10-18. **Sessões futuras NÃO renomeiam o projeto, não escolhem domínio e não mexem em
marca sem o Gabriel decidir aqui.**
- Contexto: o nome do projeto no Cloudflare Pages define `<projeto>.pages.dev`; a URL de produção entra no *Site URL* do
  Supabase Auth e no remetente do SMTP. Trocar isso depois do deploy custa mais do que trocar o nome no código: os textos
  visíveis já estão em `src/i18n/pt-BR.ts` (e o `<title>` em `index.html`; conferir `package.json`, README e o manifest
  da Fase 6 com uma busca no repositório na hora de renomear).
- Pendências (todas **a verificar**; nada abaixo está confirmado):
  - busca de anterioridade no INPI em classes de software/SaaS (em geral as classes 9 e 42; a verificar);
  - colisão do nome "Axe": é nome de marca conhecida de outro setor e há uma ferramenta de acessibilidade com nome
    parecido; situação de registro de qualquer terceiro **a verificar**;
  - domínio próprio disponível (a verificar).
- Prazo: decidir **antes do deploy em produção** (conectar o Cloudflare Pages, `docs/DEPLOY.md`) e antes do "Marco —
  lançamento público" (`docs/ROADMAP.md`).
- 2026-10-20: deploy de teste no Cloudflare Pages com o nome provisório "axenotes-dev". A decisão do nome definitivo
  continua **ABERTA** e segue como pré-requisito do "Marco — lançamento público". Renomear = recriar o projeto no
  Cloudflare e ajustar o *Site URL* do Supabase (`docs/DEPLOY.md`).
- Sem recomendação por enquanto. Não é aconselhamento jurídico.

### DECISÃO-028 — Licença e política de contribuição
**ABERTA** — registrada em 2026-10-18. **Sessões futuras NÃO mudam a licença, o LICENSE nem o README sem o Gabriel decidir
aqui.** Não é aconselhamento jurídico; confirmar com advogado antes de mudar.
- Contexto: repositório público em GPL-3.0 (DECISÃO-003). A GPL-3.0 permite cobrar assinatura e hospedagem, mas não
  fechar o código. Quem hospeda um fork **modificado** não precisa publicar as mudanças (a AGPL-3.0 fecha essa brecha;
  a convivência da AGPL-3.0 com as dependências GPL-3.0 está **a confirmar com advogado**).
- Hoje o Gabriel é o único autor (nenhuma contribuição externa) e o README convida PRs sem CLA/DCO. Enquanto for assim,
  trocar de licença é simples; depois de contribuições externas, exigiria o aceite de cada autor.
- Opções:
  - **A)** manter GPL-3.0 e aceitar PRs com DCO;
  - **B)** migrar para AGPL-3.0 antes de divulgar;
  - **C)** manter GPL-3.0 e não aceitar PRs de código por enquanto.
- Registrado também: os pacotes `@blocknote/xl-*` (colunas, IA) são GPL-3.0 e, para código fechado no futuro, exigiriam
  licença comercial ou troca (a verificar os termos atuais do projeto); há atrito conhecido entre GPL e App Store (Fase 15).
- Sem recomendação.

