# AxeNotes — instruções para o Claude

AxeNotes é um app de notas e organização no estilo Notion, para uma cliente que hoje usa o Notion
no dia a dia (estudos, leituras, agenda, trabalho). Um único código web roda no PC (navegador/PWA),
Android e iOS (PWA instalável e, depois, apps nativos via Capacitor).

Antes de qualquer tarefa, leia o que for relevante em `docs/`:

| Arquivo | Quando ler |
| --- | --- |
| `docs/PRD.md` | requisitos, prioridades (MVP / V1 / V2) e critérios de aceite |
| `docs/UI-REFERENCE.md` | qualquer trabalho visual ou de interação (descreve os vídeos/prints da cliente) |
| `docs/ARCHITECTURE.md` | stack, estrutura de pastas, modelo de dados, sincronização, notificações |
| `docs/ROADMAP.md` | fases, tarefas e definição de pronto de cada fase |
| `docs/DECISIONS.md` | decisões tomadas e em aberto — respeite as decididas, não invente as abertas |

Referências visuais (prints dos vídeos da cliente): `docs/reference/` quando a sessão é local
(pasta ignorada pelo git) e `/mnt/project-files/` nas threads de nuvem do Projeto. Elas contêm dados
pessoais da cliente: nunca copie esse conteúdo para o código, seeds, testes ou commits.

## Stack (resumo — detalhes em docs/ARCHITECTURE.md)

- Vite + React + TypeScript (strict), pnpm
- Tailwind CSS + shadcn/ui (Radix), ícones lucide-react, fonte Inter
- Editor de blocos: BlockNote (`@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`)
- Dados: Supabase (Postgres + Auth + Storage + Realtime + Edge Functions), RLS em todas as tabelas
- Conteúdo das páginas: Yjs + y-indexeddb (offline-first); colaboração em tempo real depois
- Estado: TanStack Query (servidor) + Zustand (UI). Rotas: React Router
- Tabelas/bases: TanStack Table + TanStack Virtual. Drag and drop: dnd-kit. Datas: date-fns (pt-BR)
- PWA: vite-plugin-pwa. Mobile nativo: Capacitor (fase posterior)
- Testes: Vitest + Testing Library (unidade), Playwright (e2e, projetos `desktop` e `mobile`)

Use sempre as versões estáveis mais recentes e confira a API atual na documentação (use o Context7
quando disponível) antes de escrever código de biblioteca — não confie em memória para APIs.

## Comandos

```bash
pnpm install        # dependências
pnpm dev            # servidor local (http://localhost:5173)
pnpm build          # build de produção
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest
pnpm e2e            # playwright (desktop + mobile)
```

(Se algum comando ainda não existir, crie o script no package.json na fase 0.)

## Regras de código

- Código, nomes de arquivos, variáveis e commits em inglês; TODO texto visível ao usuário em pt-BR,
  centralizado em `src/i18n/pt-BR.ts` (nada de string solta em componente).
- Organização por feature em `src/features/<feature>/` (components, hooks, api, types, tests).
- Componentes pequenos e tipados; sem `any`; validação de dados externos com zod.
- Formatação: um hook PostToolUse (`.claude/settings.json` → `scripts/format-edited-file.mjs`) roda o
  Prettier no arquivo que o Edit/Write acabou de mexer; `pnpm format:check` e `pnpm knip` rodam no CI.
- Acesso ao Supabase só via funções em `src/features/*/api/` + hooks do TanStack Query; nunca direto
  no componente.
- Stores Zustand só com `create` de `src/lib/create-store.ts` (o ESLint barra o do `zustand`): assim o
  logout as reseta. Todo estado de cliente novo (IndexedDB, Cache Storage, service worker) entra na
  limpeza de `src/lib/reset-client-state.ts`.
- Toda tabela nova: migração em `supabase/migrations/`, RLS ligada e políticas por pertencimento
  ao workspace (`is_workspace_member`) — o app é multiusuário (use a skill `migracao-supabase`). Regenerar `src/lib/database.types.ts` após migrações.
- O repositório é PÚBLICO (GPL-3.0). Nunca use a service_role key no frontend. Nunca leia nem
  escreva `.env` reais; use `.env.example`. Nada de segredos, dados ou imagens da cliente em código,
  seeds, testes, commits, issues ou prints — só dados fictícios.
- Toda dependência nova precisa ter licença compatível com GPL-3.0 (MIT, BSD, Apache-2.0, MPL-2.0,
  ISC, GPL-3.0). Na dúvida, pergunte.
- Mobile-first: tudo precisa funcionar em 390×844 (iPhone) e 820×1180 (iPad) com toque, sem
  depender de hover, e em 1440×900 (Windows). Safari/iOS é alvo de primeira classe.
- Offline-first: o conteúdo das páginas é Yjs (ver docs/ARCHITECTURE.md §5); nunca grave o
  conteúdo de página fora desse fluxo.
- Acessibilidade: navegação por teclado, foco visível, `aria-label` em botões só com ícone.
- Visual: siga a skill `design-axenotes` (tokens de cor, tipografia, espaçamentos). A experiência é
  inspirada no Notion, mas a identidade é própria: não use logo, ícones ou textos de marca do Notion.

## Como trabalhar

1. Entenda a tarefa e leia os docs relevantes. Se algo depende de uma decisão em aberto em
   `docs/DECISIONS.md`, pare e pergunte em vez de supor.
2. Planeje antes de editar (liste arquivos e passos). Tarefas grandes: quebre em commits pequenos.
3. Implemente com testes. Lógica pura (filtros, ordenação, datas, índices) sempre com teste unitário.
4. Verifique antes de dizer que terminou: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`,
   e para mudanças visuais use a skill `verificar-ui` (screenshots desktop e mobile).
5. Na mensagem final: o que mudou, como testar, prints gerados, pendências conhecidas.

## Definição de pronto (toda tarefa)

- Typecheck, lint, testes e build passando
- Funciona em desktop e mobile (screenshots conferidos)
- Textos em pt-BR, sem strings soltas
- Sem segredos no código; RLS conferida se mexeu no banco
- `docs/` atualizado se a tarefa mudou arquitetura, modelo de dados ou uma decisão

## Git

- Branch a partir de `main`: `feat/<fase>-<assunto>`, `fix/<assunto>`, `chore/<assunto>`
- Commits no padrão Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`)
- Um PR por tarefa, em modo draft até a verificação passar. Nunca faça push direto na `main`,
  force-push ou merge sem pedido explícito.
