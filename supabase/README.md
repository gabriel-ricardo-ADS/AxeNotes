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

> **Nunca** rode `supabase db reset --linked` (nem `db reset` apontando para o projeto remoto): além de
> apagar os dados, ele executa a seed e criaria contas com senha conhecida. O `db reset` é só para o
> Supabase local (Docker).

## Configuração do painel (Auth)

Estas opções ficam no painel do Supabase (não são versionadas em `migrations/` nem em `config.toml`).
Confira no projeto remoto sempre que criar ou recriar o projeto:

- **Confirm email** ligado (Authentication → Sign In / Providers → Email).
- **Email OTP Length = 6** (Authentication → Sign In / Providers → Email). Precisa bater com
  `CODE_LENGTH` em `src/features/auth/schemas.ts`; se divergir, o app rejeita o código recebido.
- **Templates de e-mail** (Authentication → Email Templates) usando só `{{ .Token }}`, sem link de
  confirmação:

  | Template | Assunto |
  | --- | --- |
  | Confirm sign up | `Seu código do AxeNotes` |
  | Reset password | `Código para redefinir sua senha` |

**Pendente de decisão** (ainda não alterado no painel):

- Cadastro aberto (**Allow new users to sign up**).
- Senha mínima no servidor (o app já valida o mínimo no cliente; falta definir o valor no painel).

## Rodar local com Docker (opcional)

```bash
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset   # aplica as migrações e a seed (usuários ana@/bruno@example.test)
```
