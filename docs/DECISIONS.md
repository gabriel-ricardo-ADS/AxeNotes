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
**PADRÃO (confirmar com ADR na Fase 2)** — conteúdo de cada página é um documento Yjs
(BlockNote suporta nativamente):
- Fase 2: Y.Doc local + `y-indexeddb` (offline) + gravação do estado Yjs no Supabase (bytea) e de
  um snapshot JSON/texto para busca e prévias.
- Fase de colaboração: provedor em tempo real. Recomendado: Cloudflare Durable Objects com
  `y-partyserver` (um objeto por página; Durable Objects existem no plano gratuito do Workers),
  autenticando com o JWT do Supabase. Alternativa: Hocuspocus (MIT) em um servidor Node.

### DECISÃO-013 — Plano e uso do Claude
**DECIDIDA** — Claude Pro com Projects disponível. Threads em Sonnet (esforço alto); fases
críticas (editor/Yjs, bases, sincronização, colaboração) pedem Opus explicitamente. No máximo
1–2 threads simultâneas para não estourar o limite.
