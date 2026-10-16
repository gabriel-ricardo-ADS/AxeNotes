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

1. No painel do Cloudflare: **Workers & Pages** → **Create** → aba **Pages** → **Connect to Git**.
2. Autorize o GitHub e escolha o repositório `AxeNotes`.
3. Branch de produção: `main`.
4. Build settings:
   - Framework preset: **None**
   - Build command: `pnpm build`
   - Build output directory: `dist`
5. Em **Environment variables** (produção e preview), adicione:
   - `NODE_VERSION` = `24`
   - `PNPM_VERSION` = `12.11.2` (o Pages não lê o `packageManager`; mantenha igual ao do
     `package.json`)
6. **Save and Deploy**. O primeiro build leva alguns minutos.
7. Quando o Supabase existir (Fase 1), adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   nas variáveis (só a chave anon/publishable; nunca a `service_role`).

## Previews

- Cada PR aberto neste repositório ganha uma URL de preview própria, atualizada a cada push.
- Cada branch também tem um alias: `feat/fase-0-layout` vira `feat-fase-0-layout.<projeto>.pages.dev`.
- Use a URL de preview para testar no iPhone e no iPad (Safari), sem precisar de `pnpm dev --host`.
- Os previews são públicos por padrão. Enquanto o app não tem dados, tudo bem. Quando tiver, ative
  em **Settings** → **General** → **Enable access policy** (Cloudflare Access) para restringir.

## Domínio próprio (opcional)

**Custom domains** → **Set up a custom domain**. Depois, adicione a URL final em **Authentication →
URL Configuration** do Supabase (Fase 1) para os redirecionamentos de login.
