# AxeNotes

App de notas e organização estilo Notion — páginas com blocos, colunas, checklists, mídia,
bases de dados, agenda e lembretes — para PC, Android e iOS a partir de um único código web.

Stack: React + TypeScript + Vite · BlockNote · Supabase · Tailwind + shadcn/ui · PWA · Capacitor.

> Em desenvolvimento. Prints e demonstração serão adicionados ao fim do MVP (com dados fictícios).

- Requisitos: [docs/PRD.md](docs/PRD.md)
- Arquitetura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Mapa do código (onde fica cada fluxo, banco, funções-chave): [docs/CODEMAP.md](docs/CODEMAP.md)
- Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)
- Decisões: [docs/DECISIONS.md](docs/DECISIONS.md)
- Referência de UI: [docs/UI-REFERENCE.md](docs/UI-REFERENCE.md)
- Instruções para o Claude Code: [CLAUDE.md](CLAUDE.md)

## Rodar localmente

Requer Node 24 (LTS) e pnpm (`corepack enable` instala a versão certa).

```bash
corepack enable
pnpm install
cp .env.example .env.local   # preencha com os dados do Supabase (a partir da Fase 1)
pnpm dev                     # http://localhost:5173
```

| Comando | O que faz |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm preview` | servidor local, build de produção e prévia do build |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | tipos, ESLint e Prettier |
| `pnpm test` | testes unitários (Vitest) |
| `pnpm e2e` | testes de ponta a ponta (Playwright: desktop, iPhone e iPad) |
| `pnpm screenshots [rota ...]` | prints desktop/iPhone/iPad em `.screenshots/` (com `pnpm dev` rodando) |
| `pnpm run license:check` | falha se alguma dependência não for compatível com GPL-3.0 |

Na primeira vez, instale os navegadores do e2e: `pnpm exec playwright install chromium webkit`.
Deploy e previews no Cloudflare Pages: [docs/DEPLOY.md](docs/DEPLOY.md).

## Contribuindo

Issues e pull requests são bem-vindos. Leia o [CLAUDE.md](CLAUDE.md) (regras de código e definição
de pronto) e o [docs/ROADMAP.md](docs/ROADMAP.md). Vulnerabilidades: veja [SECURITY.md](SECURITY.md).

## Licença

[GPL-3.0](LICENSE). AxeNotes não tem relação com a Notion Labs, Inc.
