-- Lixeira em cascata (DECISÃO-019). Toda a subárvore recebe o MESMO trashed_at; restaurar traz
-- de volta só quem saiu junto naquela exclusão (uma subpágina que já estava na lixeira antes
-- continua lá). Excluir definitivamente é um delete comum, permitido só para página na lixeira
-- (política pages_delete); o FK em cascata leva as subpáginas.
--
-- security definer porque trashed_at não é atualizável direto pelo cliente (evita deixar uma
-- página visível sob um pai na lixeira); a permissão de editor é conferida aqui dentro.

create function public.trash_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ts timestamptz := now();
begin
  -- Mesma resposta para "não existe" e "sem permissão": não vaza a existência da página.
  if not public.can_access_page(p_page_id, 'editor') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.pages p where p.id = p_page_id and p.trashed_at is not null) then
    return;
  end if;

  with recursive tree as (
    select p.id from public.pages p where p.id = p_page_id
    union all
    select c.id from public.pages c join tree t on c.parent_id = t.id where c.trashed_at is null
  )
  update public.pages p set trashed_at = v_ts from tree where p.id = tree.id;
end;
$$;

create function public.restore_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ts timestamptz;
  v_parent uuid;
begin
  if not public.can_access_page(p_page_id, 'editor') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.trashed_at, p.parent_id into v_ts, v_parent from public.pages p where p.id = p_page_id;
  if v_ts is null then
    return;
  end if;

  -- Restaurar sob um pai que continua na lixeira deixaria a página órfã e invisível.
  if v_parent is not null and exists (
    select 1 from public.pages p where p.id = v_parent and p.trashed_at is not null
  ) then
    raise exception 'parent_trashed' using errcode = '23514';
  end if;

  with recursive tree as (
    select p.id from public.pages p where p.id = p_page_id
    union all
    select c.id from public.pages c join tree t on c.parent_id = t.id where c.trashed_at = v_ts
  )
  update public.pages p set trashed_at = null from tree where p.id = tree.id;
end;
$$;

revoke all on function public.trash_page(uuid) from public, anon;
revoke all on function public.restore_page(uuid) from public, anon;
grant execute on function public.trash_page(uuid) to authenticated;
grant execute on function public.restore_page(uuid) to authenticated;
