# Deploy no Cloudflare Pages

O front do AxeNotes é um site estático (Vite). O Cloudflare Pages publica a `main` e cria um
preview para cada branch e PR (DECISÃO-011). O repositório já deixa tudo pronto; falta só você
conectar a conta.

## Configuração do projeto (já definida no repositório)

| Item | Valor |
| --- | --- |
| Comando de build | `pnpm build` |
| Diretório de saída | `dist` |
| Branch de produção | `main` |
| Node | `.node-version` (24) |
| pnpm | campo `packageManager` do `package.json` |

Fallback de SPA: o Pages serve o `index.html` para qualquer rota que não seja um arquivo estático,
**desde que o projeto não tenha um `404.html` na raiz**. Por isso não existe `public/_redirects`,
e o projeto nunca deve ter um `public/404.html`. Sem isso, abrir `/p/abc` direto (ou recarregar a
página) quebraria.

## Passo a passo (você faz uma vez)

1. No painel do Cloudflare, a tela nova ("Make something new") **não** é o fluxo do Pages. Use o
   link **Continue to Pages** no rodapé dela.
2. Escolha **Import an existing Git repository** → **Connect GitHub**. Instale o app do Cloudflare
   **só para o repositório `AxeNotes`** (não dê acesso a todos os repositórios) e selecione-o.
3. Branch de produção: `main`.
4. Build settings:
   - Framework preset: **None**
   - Build command: `pnpm build`
   - Build output directory: `dist`
5. Em **Environment variables**, adicione as 4 variáveis em **Production e em Preview**:

   | Variável | Value |
   | --- | --- |
   | `NODE_VERSION` | `24` |
   | `PNPM_VERSION` | `12.11.2` (o Pages não lê o `packageManager`; mantenha igual ao do `package.json`) |
   | `VITE_SUPABASE_URL` | a URL do projeto Supabase (`https://<ref>.supabase.co`) |
   | `VITE_SUPABASE_ANON_KEY` | a chave pública (anon ou publishable `sb_publishable_…`) |

   > **Atenção ao campo Value:** ele recebe a URL do projeto e a chave **pública**. **Nunca** a
   > `service_role` nem a `sb_secret_…` (ficariam expostas no navegador), e **nunca um texto
   > descritivo** no lugar do valor. Isso já aconteceu: o build é aceito, mas o app falha ao abrir.
   >
   > As variáveis `VITE_*` entram **no build**. Mudar o valor só tem efeito depois de **Retry
   > deployment** (ou de um novo commit).
6. **Save and Deploy**. O primeiro build leva alguns minutos.
7. No Supabase, em **Authentication** → **URL Configuration**, defina o **Site URL** (a URL de
   produção, `https://<projeto>.pages.dev`) e adicione a mesma URL em **Redirect URLs** (e a dos
   previews, se for testar o login neles). Quando as contas existirem, desligue **Allow new users to
   sign up** (Authentication → Sign In / Providers).
8. Confira o fallback de SPA com uma rota interna (esperado: `200`; `404` indica um `404.html` na
   raiz ou um build errado):

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://<projeto>.pages.dev/lixeira
   ```

## Checklist do teste

Feito em 2026-10-20 no deploy de teste: desktop (Chrome), iPhone e iPad (Safari).

- entrar na conta;
- árvore de páginas;
- favoritos;
- recentes;
- lixeira;
- busca;
- recarregar a página;
- título salvo.

Tudo funcionou. A única diferença: os emojis têm o estilo do sistema (esperado: o app guarda o
caractere e cada sistema o desenha). Repetir este checklist antes do lançamento público.

## Nome do projeto

O deploy de teste usa o nome provisório `axenotes-dev` (`axenotes-dev.pages.dev`). O nome define a
URL `<projeto>.pages.dev` e não é renomeado depois: trocar exige **recriar o projeto** no Cloudflare
e ajustar o **Site URL** (e as Redirect URLs) do Supabase. O nome definitivo é a DECISÃO-027, ainda
**aberta** (`docs/DECISIONS.md`).

## Previews

- Cada PR aberto neste repositório ganha uma URL de preview própria, atualizada a cada push.
- Cada branch também tem um alias: `feat/fase-0-layout` vira `feat-fase-0-layout.<projeto>.pages.dev`.
- Use a URL de preview para testar no iPhone e no iPad (Safari), sem precisar de `pnpm dev --host`.
- Os previews são públicos por padrão. Para restringir, ligue **Settings** → **General** →
  **Preview access** → **Restrict previews** (nome atual na tela; antes aparecia como "Enable access
  policy"). Ele protege **só os previews**: a produção `<projeto>.pages.dev` continua pública,
  protegida pelo login do app. Ligado no deploy de teste em 2026-10-20.

## Domínio próprio (opcional)

**Custom domains** → **Set up a custom domain**. Depois, adicione a URL final em **Authentication →
URL Configuration** do Supabase (Fase 1) para os redirecionamentos de login.
