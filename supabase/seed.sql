-- Dados FICTÍCIOS para desenvolvimento local (`supabase db reset`). Nada daqui vem da cliente,
-- e este arquivo nunca é aplicado no projeto remoto (`db push` só aplica migrações).
--
-- Dois usuários de teste, cada um com o workspace pessoal criado pelo trigger de cadastro:
--   ana@example.test    senha: senha-teste-local   (dona do workspace A)
--   bruno@example.test  senha: senha-teste-local   (dono do workspace B, sem acesso ao A)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000a1',
    'authenticated', 'authenticated', 'ana@example.test',
    extensions.crypt('senha-teste-local', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Ana Teste"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000b1',
    'authenticated', 'authenticated', 'bruno@example.test',
    extensions.crypt('senha-teste-local', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Bruno Teste"}', now(), now()
  );

-- Necessário para entrar com e-mail e senha no Supabase local.
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in ('ana@example.test', 'bruno@example.test');

do $$
declare
  v_ana uuid := '00000000-0000-4000-8000-0000000000a1';
  v_bruno uuid := '00000000-0000-4000-8000-0000000000b1';
  v_ws_ana uuid;
  v_ws_bruno uuid;
  v_inicio uuid := '20000000-0000-4000-8000-000000000001';
  v_estudos uuid := '20000000-0000-4000-8000-000000000002';
  v_materia uuid := '20000000-0000-4000-8000-000000000003';
  v_leituras uuid := '20000000-0000-4000-8000-000000000004';
  v_agenda uuid := '20000000-0000-4000-8000-000000000005';
  v_antiga uuid := '20000000-0000-4000-8000-000000000006';
  v_diario uuid := '20000000-0000-4000-8000-000000000011';
begin
  select workspace_id into v_ws_ana from public.workspace_members where user_id = v_ana and role = 'owner';
  select workspace_id into v_ws_bruno from public.workspace_members where user_id = v_bruno and role = 'owner';

  insert into public.pages (id, workspace_id, parent_id, title, icon, sort_key, created_by)
  values
    (v_inicio, v_ws_ana, null, 'Início', '{"type":"emoji","value":"🏠"}', 'a0', v_ana),
    (v_estudos, v_ws_ana, null, 'Estudos', '{"type":"emoji","value":"📚"}', 'a1', v_ana),
    (v_materia, v_ws_ana, v_estudos, 'Matemática', '{"type":"emoji","value":"📐"}', 'a0', v_ana),
    (v_leituras, v_ws_ana, null, 'Cantinho de leitura', '{"type":"emoji","value":"📖"}', 'a2', v_ana),
    (v_agenda, v_ws_ana, null, 'Agenda', '{"type":"emoji","value":"🗓️"}', 'a3', v_ana),
    (v_diario, v_ws_bruno, null, 'Diário', '{"type":"emoji","value":"📓"}', 'a0', v_bruno);

  -- Uma página já na lixeira, para a tela da lixeira ter o que mostrar.
  insert into public.pages (id, workspace_id, parent_id, title, sort_key, created_by, trashed_at)
  values (v_antiga, v_ws_ana, null, 'Anotações antigas', 'a4', v_ana, now() - interval '2 days');

  update public.workspaces set home_page_id = v_inicio where id = v_ws_ana;

  insert into public.user_favorites (user_id, page_id, sort_key)
  values (v_ana, v_estudos, 'a0'), (v_ana, v_leituras, 'a1');

  insert into public.user_recents (user_id, page_id, visited_at)
  values
    (v_ana, v_materia, now() - interval '1 hour'),
    (v_ana, v_estudos, now() - interval '3 hours'),
    (v_ana, v_inicio, now() - interval '1 day');
end;
$$;
