-- Conteúdo das páginas (Fase 2b, docs/adr/0001-conteudo-yjs.md): log de updates Yjs com snapshots
-- compactados em page_contents, texto para busca/prévias em page_texts e busca no corpo.
-- Só leitura direta pela RLS; toda escrita passa pelas RPCs abaixo, que conferem papel de editor e
-- página fora da lixeira. Tamanhos em bytes depois do decode do base64.

-- Tabelas ------------------------------------------------------------------------------------

create table public.page_contents (
  id bigint generated always as identity primary key,
  page_id uuid not null references public.pages (id) on delete cascade,
  kind text not null check (kind in ('update', 'snapshot')),
  data bytea not null,
  byte_size integer generated always as (octet_length(data)) stored,
  -- Só snapshot: maior id de linha da página que ele já contém.
  covers_up_to bigint,
  -- Marcada pela compactação; null = linha viva. Nada é apagado na hora (retenção, ver prune).
  superseded_at timestamptz,
  -- Auditoria, não regra de acesso. Nulo se o usuário for apagado (não bloqueia a exclusão da conta).
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint page_contents_snapshot_covers check ((kind = 'snapshot') = (covers_up_to is not null)),
  constraint page_contents_row_size check (octet_length(data) between 1 and 8388608)
);

create index page_contents_live on public.page_contents (page_id, id) where superseded_at is null;
create index page_contents_superseded on public.page_contents (page_id, superseded_at)
  where superseded_at is not null;
create index page_contents_created_by_idx on public.page_contents (created_by);

-- 1:1 com a página. `text` alimenta a busca; `json` são os primeiros blocos, para prévias.
create table public.page_texts (
  page_id uuid primary key references public.pages (id) on delete cascade,
  text text not null default '' check (octet_length(text) <= 1048576),
  json jsonb check (octet_length(json::text) <= 262144),
  updated_at timestamptz not null default now()
);

-- Mesma expressão usada em search_pages (senão o índice não serve).
create index page_texts_text_search_idx on public.page_texts
  using gin (public.immutable_unaccent(lower(text)) extensions.gin_trgm_ops);

-- RLS: authenticated só lê, e só páginas de workspaces de que participa ----------------------

alter table public.page_contents enable row level security;
alter table public.page_texts enable row level security;

revoke all on public.page_contents from public, anon, authenticated;
revoke all on public.page_texts from public, anon, authenticated;
grant select on public.page_contents to authenticated;
grant select on public.page_texts to authenticated;

create policy page_contents_select on public.page_contents for select to authenticated
  using (public.can_access_page(page_id, 'viewer'));
create policy page_texts_select on public.page_texts for select to authenticated
  using (public.can_access_page(page_id, 'viewer'));

-- Funções internas ---------------------------------------------------------------------------

-- O usuário logado pode escrever o conteúdo da página: editor e página fora da lixeira.
create function public.page_content_writable(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_page(p_page_id, 'editor')
    and exists (select 1 from public.pages p where p.id = p_page_id and p.trashed_at is null);
$$;

-- base64 -> bytea; texto inválido ou vazio vira erro claro (22023).
create function public.page_content_decode(p_data text)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_data bytea;
begin
  begin
    v_data := decode(p_data, 'base64');
  exception when others then
    raise exception 'page_content_invalid' using errcode = '22023';
  end;
  if v_data is null or octet_length(v_data) = 0 then
    raise exception 'page_content_invalid' using errcode = '22023';
  end if;
  return v_data;
end;
$$;

-- Retenção: apaga linhas substituídas há mais de 7 dias, menos os 3 snapshots substituídos mais
-- recentes da página (proteção contra snapshot ruim). Chamada pela compactação; o pg_cron diário
-- para páginas que não compactam mais entra na Fase 6.
create function public.prune_page_contents(p_page_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with keep as (
    select c.id
    from public.page_contents c
    where c.page_id = p_page_id and c.kind = 'snapshot' and c.superseded_at is not null
    order by c.superseded_at desc, c.id desc
    limit 3
  )
  delete from public.page_contents c
  where c.page_id = p_page_id
    and c.superseded_at is not null
    and c.superseded_at < now() - interval '7 days'
    and c.id not in (select keep.id from keep);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.page_content_writable(uuid) from public, anon, authenticated;
revoke all on function public.page_content_decode(text) from public, anon, authenticated;
revoke all on function public.prune_page_contents(uuid) from public, anon, authenticated;

-- RPCs ---------------------------------------------------------------------------------------

-- Acrescenta updates Yjs (base64) ao log. Até 100 por chamada, cada um até 1 MiB e 2 MiB somados;
-- as linhas vivas da página somam no máximo 32 MiB (acima disso o cliente compacta). O lock por
-- página é o mesmo da compactação: os ids de uma página são confirmados na ordem em que nascem.
-- "Editada há…" conta as edições do corpo, no máximo uma escrita em pages a cada 60 s.
create function public.append_page_updates(p_page_id uuid, p_updates text[])
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_items bytea[] := '{}';
  v_item bytea;
  v_text text;
  v_total bigint := 0;
  v_live bigint;
  v_ids bigint[];
begin
  -- Mesma resposta para "não existe", "sem permissão" e "na lixeira": não vaza a existência da página.
  if not public.page_content_writable(p_page_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_updates is null or cardinality(p_updates) = 0 then
    return '{}';
  end if;
  if cardinality(p_updates) > 100 then
    raise exception 'page_content_batch_too_large' using errcode = '22023';
  end if;

  foreach v_text in array p_updates loop
    v_item := public.page_content_decode(v_text);
    if octet_length(v_item) > 1048576 then
      raise exception 'page_content_too_large' using errcode = '22023';
    end if;
    v_total := v_total + octet_length(v_item);
    if v_total > 2097152 then
      raise exception 'page_content_batch_too_large' using errcode = '22023';
    end if;
    v_items := array_append(v_items, v_item);
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(p_page_id::text, 0));

  select coalesce(sum(c.byte_size), 0) into v_live
  from public.page_contents c
  where c.page_id = p_page_id and c.superseded_at is null;
  if v_live + v_total > 33554432 then
    raise exception 'page_content_live_too_large' using errcode = '22023';
  end if;

  with inserted as (
    insert into public.page_contents (page_id, kind, data, created_by)
    select p_page_id, 'update', u.item, v_uid
    from unnest(v_items) with ordinality as u (item, n)
    order by u.n
    returning id
  )
  select array_agg(inserted.id order by inserted.id) into v_ids from inserted;

  update public.pages p
  set last_edited_at = now(), last_edited_by = v_uid
  where p.id = p_page_id and p.last_edited_at < now() - interval '60 seconds';

  return v_ids;
end;
$$;

-- Linhas vivas da página em ordem de id, em base64. Sem p_after: todas (o snapshot vivo e os
-- updates ainda não compactados, inclusive os que chegaram durante a última compactação). Com
-- p_after: só as de id maior (recarga incremental). security invoker: a RLS de select basta.
create function public.get_page_content(p_page_id uuid, p_after bigint default null)
returns table (
  id bigint,
  kind text,
  data text,
  covers_up_to bigint,
  byte_size integer
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.kind, encode(c.data, 'base64'), c.covers_up_to, c.byte_size
  from public.page_contents c
  where c.page_id = p_page_id
    and c.superseded_at is null
    and (p_after is null or c.id > p_after)
  order by c.id;
$$;

-- Grava um snapshot que cobre as linhas vivas com id <= p_up_to e as marca como substituídas.
-- Devolve false (sem fazer nada) se outro aparelho já compactou até esse ponto.
create function public.compact_page_content(p_page_id uuid, p_snapshot text, p_up_to bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data bytea;
begin
  if not public.page_content_writable(p_page_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_data := public.page_content_decode(p_snapshot);
  if octet_length(v_data) > 8388608 then
    raise exception 'page_content_too_large' using errcode = '22023';
  end if;
  if p_up_to is null or p_up_to < 0 then
    raise exception 'page_content_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_page_id::text, 0));

  if exists (
    select 1 from public.page_contents c
    where c.page_id = p_page_id and c.kind = 'snapshot' and c.superseded_at is null
      and c.covers_up_to >= p_up_to
  ) then
    return false;
  end if;

  -- Só cobre linhas que existem na página: o cliente não pode "cobrir" ids que nunca leu.
  -- p_up_to = 0 só vale para página ainda sem linhas (primeiro envio grande demais para o append).
  if (p_up_to = 0 and exists (select 1 from public.page_contents c where c.page_id = p_page_id))
    or (p_up_to > 0 and not exists (
      select 1 from public.page_contents c where c.page_id = p_page_id and c.id = p_up_to
    )) then
    raise exception 'page_content_invalid' using errcode = '22023';
  end if;

  insert into public.page_contents (page_id, kind, data, covers_up_to, created_by)
  values (p_page_id, 'snapshot', v_data, p_up_to, (select auth.uid()));

  update public.page_contents c
  set superseded_at = now()
  where c.page_id = p_page_id and c.superseded_at is null and c.id <= p_up_to;

  perform public.prune_page_contents(p_page_id);
  return true;
end;
$$;

-- Texto puro (busca) e primeiros blocos (prévias) da página. Texto até 1 MiB, JSON até 256 KiB.
create function public.set_page_text(p_page_id uuid, p_text text, p_json jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.page_content_writable(p_page_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if octet_length(coalesce(p_text, '')) > 1048576
    or (p_json is not null and octet_length(p_json::text) > 262144) then
    raise exception 'page_text_too_large' using errcode = '22023';
  end if;

  insert into public.page_texts (page_id, text, json, updated_at)
  values (p_page_id, coalesce(p_text, ''), p_json, now())
  on conflict (page_id) do update
    set text = excluded.text, json = excluded.json, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.append_page_updates(uuid, text[]) from public, anon;
revoke all on function public.get_page_content(uuid, bigint) from public, anon;
revoke all on function public.compact_page_content(uuid, text, bigint) from public, anon;
revoke all on function public.set_page_text(uuid, text, jsonb) from public, anon;
grant execute on function public.append_page_updates(uuid, text[]) to authenticated;
grant execute on function public.get_page_content(uuid, bigint) to authenticated;
grant execute on function public.compact_page_content(uuid, text, bigint) to authenticated;
grant execute on function public.set_page_text(uuid, text, jsonb) to authenticated;

-- Busca: título OU corpo ---------------------------------------------------------------------

-- O tipo de retorno ganha `snippet`, o que exige recriar a função (mesmos argumentos; o cliente
-- antigo ignora a coluna nova). Cada ramo do `union` usa o próprio índice trigram, com a mesma
-- expressão do índice. Ordem: título que começa com o termo, título que contém, só o corpo.
-- `snippet` é null quando o título casou; senão, ~160 caracteres do texto em volta do termo. A
-- posição vem do texto sem acento (o unaccent troca 1 caractere por 1 em pt-BR).
drop function public.search_pages(uuid, text, integer);

create function public.search_pages(p_workspace_id uuid, p_query text, p_limit integer default 20)
returns table (
  id uuid,
  workspace_id uuid,
  parent_id uuid,
  title text,
  icon jsonb,
  last_edited_at timestamptz,
  snippet text
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select n.norm,
      replace(replace(replace(n.norm, '\', '\\'), '%', '\%'), '_', '\_') as term
    from (select public.immutable_unaccent(lower(btrim(coalesce(p_query, '')))) as norm) n
  ),
  matches as (
    select p.id
    from public.pages p, q
    where p.workspace_id = p_workspace_id
      and q.term <> ''
      and public.immutable_unaccent(lower(p.title)) like '%' || q.term || '%' escape '\'
    union
    select t.page_id
    from public.page_texts t, q
    where q.term <> ''
      and public.immutable_unaccent(lower(t.text)) like '%' || q.term || '%' escape '\'
  ),
  ranked as (
    select p.id, p.workspace_id, p.parent_id, p.title, p.icon, p.last_edited_at, t.text,
      public.immutable_unaccent(lower(p.title)) like q.term || '%' escape '\' as title_prefix,
      public.immutable_unaccent(lower(p.title)) like '%' || q.term || '%' escape '\' as in_title,
      strpos(public.immutable_unaccent(lower(t.text)), q.norm) as body_pos
    from matches m
    join public.pages p on p.id = m.id
    cross join q
    left join public.page_texts t on t.page_id = p.id
    where p.workspace_id = p_workspace_id
      and p.trashed_at is null
  )
  select r.id, r.workspace_id, r.parent_id, r.title, r.icon, r.last_edited_at,
    case
      when r.in_title or coalesce(r.body_pos, 0) = 0 then null
      else
        (case when s.start > 1 then '…' else '' end)
        || btrim(regexp_replace(substr(r.text, s.start, 160), '\s+', ' ', 'g'))
        || (case when s.start + 160 <= char_length(r.text) then '…' else '' end)
    end
  from ranked r
  cross join lateral (select greatest(r.body_pos - 60, 1) as start) s
  order by r.title_prefix desc, r.in_title desc, r.last_edited_at desc, r.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_pages(uuid, text, integer) from public, anon;
grant execute on function public.search_pages(uuid, text, integer) to authenticated;
