-- Busca por título (DECISÃO-019), sem acento e sem diferenciar maiúsculas. A busca por conteúdo
-- chega na Fase 2.

-- unaccent() é STABLE; esta versão fixa o dicionário para poder entrar em índice.
create function public.immutable_unaccent(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_text);
$$;

revoke all on function public.immutable_unaccent(text) from public, anon;
grant execute on function public.immutable_unaccent(text) to authenticated;

create index pages_title_search_idx on public.pages
  using gin (public.immutable_unaccent(lower(title)) extensions.gin_trgm_ops);

-- security invoker (padrão): a RLS de pages vale, então só volta página de workspace do usuário.
-- Esconde a lixeira, escapa % _ \ e limita o resultado (1 a 50). Título que começa com o termo vem primeiro.
create function public.search_pages(p_workspace_id uuid, p_query text, p_limit integer default 20)
returns table (
  id uuid,
  workspace_id uuid,
  parent_id uuid,
  title text,
  icon jsonb,
  last_edited_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select replace(replace(replace(
      public.immutable_unaccent(lower(btrim(coalesce(p_query, '')))),
      '\', '\\'), '%', '\%'), '_', '\_') as term
  )
  select p.id, p.workspace_id, p.parent_id, p.title, p.icon, p.last_edited_at
  from public.pages p, q
  where p.workspace_id = p_workspace_id
    and p.trashed_at is null
    and q.term <> ''
    and public.immutable_unaccent(lower(p.title)) like '%' || q.term || '%' escape '\'
  order by
    (public.immutable_unaccent(lower(p.title)) like q.term || '%' escape '\') desc,
    p.last_edited_at desc,
    p.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_pages(uuid, text, integer) from public, anon;
grant execute on function public.search_pages(uuid, text, integer) to authenticated;
