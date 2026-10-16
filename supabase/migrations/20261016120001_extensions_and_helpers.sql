-- Extensões e utilitários compartilhados pelas próximas migrações.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

grant usage on schema extensions to anon, authenticated, service_role;

-- Trigger genérico de updated_at.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Ordem dos papéis: owner > editor > viewer. Papel desconhecido vira null (nega acesso).
create function public.workspace_role_rank(p_role text)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_role when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 end::smallint;
$$;

-- Funções internas: ninguém chama pela API.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.workspace_role_rank(text) from public, anon, authenticated;
