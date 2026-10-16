# AxeNotes

App de notas e organização estilo Notion — páginas com blocos, colunas, checklists, mídia,
bases de dados, agenda e lembretes — para PC, Android e iOS a partir de um único código web.

Stack: React + TypeScript + Vite · BlockNote · Supabase · Tailwind + shadcn/ui · PWA · Capacitor.

> Em desenvolvimento. Prints e demonstração serão adicionados ao fim do MVP (com dados fictícios).

- Requisitos: [docs/PRD.md](docs/PRD.md)
- Arquitetura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)
- Decisões: [docs/DECISIONS.md](docs/DECISIONS.md)
- Referência de UI: [docs/UI-REFERENCE.md](docs/UI-REFERENCE.md)
- Instruções para o Claude Code: [CLAUDE.md](CLAUDE.md)

## Rodar localmente

```bash
corepack enable
pnpm install
cp .env.example .env.local   # preencha com os dados do Supabase
pnpm dev
```

## Contribuindo

Issues e pull requests são bem-vindos. Leia o [CLAUDE.md](CLAUDE.md) (regras de código e definição
de pronto) e o [docs/ROADMAP.md](docs/ROADMAP.md). Vulnerabilidades: veja [SECURITY.md](SECURITY.md).

## Licença

[GPL-3.0](LICENSE). AxeNotes não tem relação com a Notion Labs, Inc.
