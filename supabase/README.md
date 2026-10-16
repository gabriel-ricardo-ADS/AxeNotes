# Banco de dados (Supabase)

- `migrations/` — migrações versionadas (nunca edite uma já aplicada; crie outra).
- `seed.sql` — dados fictícios para desenvolvimento local; **nunca** vai para o projeto remoto.
- `tests/` — testes de RLS e das funções em PGlite (Postgres em WASM). Rodam no `pnpm test`
  (`pnpm test:db` roda só eles) e no CI, sem Docker e sem tocar no projeto remoto.
- `config.toml` — configuração mínima do Supabase CLI.

## Aplicar no projeto remoto (só com o ok do Gabriel, DECISÃO-015)

```bash
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref <REF_DO_PROJETO>
pnpm dlx supabase@latest db push --dry-run   # lista o que será aplicado, sem aplicar
pnpm dlx supabase@latest db push
pnpm dlx supabase@latest gen types typescript --linked > src/lib/database.types.ts
```

O `db push` aplica só `migrations/`; a seed não é executada no remoto.

## Rodar local com Docker (opcional)

```bash
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset   # aplica as migrações e a seed (usuários ana@/bruno@example.test)
```
