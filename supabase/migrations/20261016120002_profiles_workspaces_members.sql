-- profiles, workspaces e workspace_members + is_workspace_member().
-- O workspace é a fronteira de acesso (DECISÃO-004). Clientes não criam workspaces nem membros:
-- o workspace pessoal nasce no cadastro (trigger) e convites chegam na Fase 11 (Edge Function).

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon jsonb,
  created_by uuid references auth.users on delete set null,
  -- Página inicial (DECISÃO-019). A FK composta vem junto com a tabela pages.
  home_page_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger workspace_members_set_updated_at before update on public.workspace_members
  for each row execute function public.set_updated_at();

-- O usuário logado é membro do workspace com pelo menos o papel mínimo?
-- security definer para ler workspace_members sem recursão de RLS.
create function public.is_workspace_member(p_workspace_id uuid, p_min_role text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and public.workspace_role_rank(m.role) >= public.workspace_role_rank(p_min_role)
  );
$$;

revoke all on function public.is_workspace_member(uuid, text) from public, anon;
grant execute on function public.is_workspace_member(uuid, text) to authenticated;

-- Nunca deixar um workspace sem dono (rebaixar ou remover o último owner).
-- Ignora quando o workspace ou o usuário estão sendo apagados em cascata.
-- security definer: lê auth.users e a lista completa de owners, que o chamador não enxerga.
create function public.workspace_members_guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if exists (select 1 from public.workspaces w where w.id = old.workspace_id)
      and exists (select 1 from auth.users u where u.id = old.user_id)
      and not exists (
        select 1
        from public.workspace_members m
        where m.workspace_id = old.workspace_id
          and m.role = 'owner'
          and m.user_id <> old.user_id
      )
    then
      raise exception 'last_owner' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.workspace_members_guard_last_owner() from public, anon, authenticated;

create trigger workspace_members_guard_last_owner
  before update or delete on public.workspace_members
  for each row execute function public.workspace_members_guard_last_owner();

-- RLS ---------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Cada tabela só aceita o que o app precisa; o resto fica sem privilégio.
revoke all on public.profiles, public.workspaces, public.workspace_members from anon, authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant update (name, icon, home_page_id) on public.workspaces to authenticated;
grant update (role) on public.workspace_members to authenticated;
grant delete on public.workspace_members to authenticated;

-- profiles: o próprio perfil e o de quem divide algum workspace comigo.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members m
      where m.user_id = profiles.id
        and public.is_workspace_member(m.workspace_id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- workspaces: membros leem, só o owner altera. Sem insert/delete pelo cliente.
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_workspace_member(id, 'owner'))
  with check (public.is_workspace_member(id, 'owner'));

-- workspace_members: membros enxergam a lista; só o owner muda papéis; cada um pode sair.
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (public.is_workspace_member(workspace_id, 'owner'))
  with check (public.is_workspace_member(workspace_id, 'owner'));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (public.is_workspace_member(workspace_id, 'owner') or user_id = (select auth.uid()));
