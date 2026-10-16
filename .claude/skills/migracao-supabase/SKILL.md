---
name: migracao-supabase
description: Cria ou altera tabelas, políticas RLS, funções, triggers ou buckets do Supabase do AxeNotes com migração versionada, RLS obrigatória e tipos regenerados. Use sempre que a tarefa mexer no banco ou no Storage.
---

# Migração Supabase

1. Leia o modelo em `docs/ARCHITECTURE.md` §4 e as migrações existentes em `supabase/migrations/`.
2. Crie um arquivo novo `supabase/migrations/<YYYYMMDDHHMMSS>_<descricao>.sql`
   (nunca edite migração já aplicada/mergeada).
3. Toda tabela nova deve ter:
   - `id uuid primary key default gen_random_uuid()`
   - `workspace_id uuid not null references workspaces on delete cascade` (dados de usuário
     isolado, como preferências, usam `user_id uuid not null default auth.uid()`)
   - `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
     + trigger de `updated_at`
   - `alter table ... enable row level security;`
   - políticas separadas de select/insert/update/delete usando
     `is_workspace_member(workspace_id, 'viewer')` para ler e `'editor'` para escrever
     (ou `user_id = (select auth.uid())` em tabelas por usuário)
   - índices para chaves estrangeiras e para os filtros usados no app
4. Storage: buckets privados; políticas pelo prefixo `{workspace_id}/` em `storage.objects`,
   conferindo o pertencimento ao workspace. Segredos de usuário vão para o Supabase Vault.
5. Funções `security definer` só quando inevitável, com `set search_path = ''`.
6. Atualize `supabase/seed.sql` só com dados fictícios.
7. Escreva/atualize o teste de RLS (`supabase/tests/` com pgTAP ou teste de integração que usa dois
   usuários e papéis) provando que quem não é membro não lê e que leitor não altera.
8. Regenere os tipos: `pnpm supabase gen types typescript --linked > src/lib/database.types.ts`
   (ou `--local`). Se não houver acesso ao projeto Supabase nesta sessão, avise no relatório que
   o Gabriel precisa rodar `pnpm supabase db push` e o gen types localmente.
9. Atualize `docs/ARCHITECTURE.md` §4 se o modelo mudou.

Nunca rode `supabase db reset` ou comandos destrutivos contra o projeto remoto. Nunca coloque a
service_role key em código do front ou em arquivos versionados.
