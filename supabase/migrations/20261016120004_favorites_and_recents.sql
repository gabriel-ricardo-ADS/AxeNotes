-- user_favorites e user_recents: dados por usuário, sobre páginas que ele ainda pode acessar.

create table public.user_favorites (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  page_id uuid not null references public.pages on delete cascade,
  sort_key text collate "C" not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, page_id)
);

create table public.user_recents (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  page_id uuid not null references public.pages on delete cascade,
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, page_id)
);

create index user_favorites_page_id_idx on public.user_favorites (page_id);
create index user_recents_page_id_idx on public.user_recents (page_id);
create index user_recents_visited_idx on public.user_recents (user_id, visited_at desc);

create trigger user_favorites_set_updated_at before update on public.user_favorites
  for each row execute function public.set_updated_at();
create trigger user_recents_set_updated_at before update on public.user_recents
  for each row execute function public.set_updated_at();

alter table public.user_favorites enable row level security;
alter table public.user_recents enable row level security;

revoke all on public.user_favorites, public.user_recents from anon, authenticated;
grant select, delete on public.user_favorites, public.user_recents to authenticated;
grant insert (page_id, sort_key) on public.user_favorites to authenticated;
grant update (sort_key) on public.user_favorites to authenticated;
-- O app registra a visita com upsert (insert ... on conflict do update de visited_at).
grant insert (page_id, visited_at) on public.user_recents to authenticated;
grant update (visited_at) on public.user_recents to authenticated;

create policy user_favorites_select on public.user_favorites for select to authenticated
  using (user_id = (select auth.uid()) and public.can_access_page(page_id));
create policy user_favorites_insert on public.user_favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_access_page(page_id));
create policy user_favorites_update on public.user_favorites for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_access_page(page_id));
create policy user_favorites_delete on public.user_favorites for delete to authenticated
  using (user_id = (select auth.uid()));

create policy user_recents_select on public.user_recents for select to authenticated
  using (user_id = (select auth.uid()) and public.can_access_page(page_id));
create policy user_recents_insert on public.user_recents for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_access_page(page_id));
create policy user_recents_update on public.user_recents for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_access_page(page_id));
create policy user_recents_delete on public.user_recents for delete to authenticated
  using (user_id = (select auth.uid()));
