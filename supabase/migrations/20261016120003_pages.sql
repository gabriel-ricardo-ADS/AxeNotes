-- pages + can_access_page(). Sem conteúdo Yjs (Fase 2), capa (Fase 3), largura total (Fase 4)
-- nem propriedades/database_id (Fase 5): cada fase acrescenta o que precisa.

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  parent_id uuid,
  title text not null default '',
  icon jsonb,
  -- Índice fracionário: comparação byte a byte, por isso collate "C".
  sort_key text collate "C" not null,
  created_by uuid references auth.users on delete set null,
  last_edited_by uuid references auth.users on delete set null default auth.uid(),
  last_edited_at timestamptz not null default now(),
  -- Lixeira em cascata: a subárvore inteira recebe o mesmo trashed_at (ver trash_page).
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_id_workspace_key unique (id, workspace_id),
  constraint pages_not_own_parent check (parent_id is null or parent_id <> id),
  -- FK composta: o pai precisa estar no mesmo workspace. Apagar o pai apaga os filhos.
  constraint pages_parent_fkey foreign key (parent_id, workspace_id)
    references public.pages (id, workspace_id) on delete cascade
);

-- Página inicial do workspace: precisa ser do próprio workspace; some se a página for apagada.
alter table public.workspaces
  add constraint workspaces_home_page_fkey foreign key (home_page_id, id)
  references public.pages (id, workspace_id) on delete set null (home_page_id);

create index pages_tree_idx on public.pages (workspace_id, parent_id, sort_key);
create index pages_parent_id_idx on public.pages (parent_id);
create index pages_trashed_idx on public.pages (workspace_id, trashed_at) where trashed_at is not null;
create index pages_created_by_idx on public.pages (created_by);
create index pages_last_edited_by_idx on public.pages (last_edited_by);

create trigger pages_set_updated_at before update on public.pages
  for each row execute function public.set_updated_at();

-- Regras que a FK não cobre: workspace imutável, sem ciclos, nada novo sob página na lixeira,
-- e "editada por/em" quando título ou ícone mudam. (Mover várias páginas numa só instrução
-- pode escapar da detecção de ciclo; o app move uma página por vez.)
create function public.pages_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.trashed_at is null and new.parent_id is not null and exists (
      select 1 from public.pages p where p.id = new.parent_id and p.trashed_at is not null
    ) then
      raise exception 'parent_trashed' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_immutable' using errcode = '23514';
  end if;

  if new.parent_id is distinct from old.parent_id and new.parent_id is not null then
    if exists (
      with recursive ancestors as (
        select p.id, p.parent_id from public.pages p where p.id = new.parent_id
        union all
        select p.id, p.parent_id from public.pages p join ancestors a on p.id = a.parent_id
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception 'page_cycle' using errcode = '23514';
    end if;

    if new.trashed_at is null and exists (
      select 1 from public.pages p where p.id = new.parent_id and p.trashed_at is not null
    ) then
      raise exception 'parent_trashed' using errcode = '23514';
    end if;
  end if;

  if new.title is distinct from old.title or new.icon is distinct from old.icon then
    new.last_edited_by := coalesce((select auth.uid()), old.last_edited_by);
    new.last_edited_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.pages_guard() from public, anon, authenticated;

create trigger pages_guard before insert or update on public.pages
  for each row execute function public.pages_guard();

-- O usuário logado acessa a página (papel mínimo no workspace dela)? Ponto único para estender
-- com permissões por página na Fase 11. security definer: lê pages sem passar pela RLS.
create function public.can_access_page(p_page_id uuid, p_min_role text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pages p
    where p.id = p_page_id
      and public.is_workspace_member(p.workspace_id, p_min_role)
  );
$$;

revoke all on function public.can_access_page(uuid, text) from public, anon;
grant execute on function public.can_access_page(uuid, text) to authenticated;

-- RLS ---------------------------------------------------------------------------------------

alter table public.pages enable row level security;

revoke all on public.pages from anon, authenticated;
grant select, delete on public.pages to authenticated;
grant insert (id, workspace_id, parent_id, title, icon, sort_key, created_by)
  on public.pages to authenticated;
-- trashed_at só muda por trash_page()/restore_page(), que mantêm a cascata consistente.
grant update (parent_id, title, icon, sort_key) on public.pages to authenticated;

-- As políticas usam is_workspace_member(workspace_id) direto (e não can_access_page(id)) porque
-- uma função que relê pages não enxerga a linha recém-inserida em INSERT ... RETURNING.
create policy pages_select on public.pages for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy pages_insert on public.pages for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id, 'editor')
    and created_by = (select auth.uid())
  );
create policy pages_update on public.pages for update to authenticated
  using (public.is_workspace_member(workspace_id, 'editor'))
  with check (public.is_workspace_member(workspace_id, 'editor'));
-- Exclusão definitiva só para quem já está na lixeira.
create policy pages_delete on public.pages for delete to authenticated
  using (trashed_at is not null and public.is_workspace_member(workspace_id, 'editor'));
