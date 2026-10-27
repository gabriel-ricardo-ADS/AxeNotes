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

## Headers de segurança e CSP

Ficam em `public/_headers`, que o Vite copia para `dist/` e o Cloudflare Pages aplica a todas as respostas (regra
`/*`, inclusive o `index.html` do fallback de SPA). Não usamos `<meta http-equiv>`: `frame-ancestors` não funciona por
meta, e o arquivo de headers não atrapalha o `pnpm dev` (o HMR do Vite injeta estilos e scripts inline).

| Header | Valor | Para quê |
| --- | --- | --- |
| `Content-Security-Policy` | ver abaixo | só carrega código, estilos, fontes e conexões do próprio app e do Supabase |
| `X-Content-Type-Options` | `nosniff` | o navegador não "adivinha" o tipo de um arquivo |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | outros sites só veem a origem, nunca a rota (ids de página) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | desliga APIs que o app não usa |
| `X-Frame-Options` | `DENY` | reforço do `frame-ancestors 'none'` para navegadores antigos |

CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none';
base-uri 'self'; form-action 'self'; object-src 'none'`.

- **`'unsafe-inline'` em `style-src`** tem motivo concreto: o `react-remove-scroll-bar` (via `react-style-singleton`,
  usado pelo Dialog, Sheet, AlertDialog e DropdownMenu do Radix) injeta um `<style>` com o travamento da rolagem e
  a largura da barra calculada na hora. Sem ele, o Console mostra "Applying inline style violates the following
  Content Security Policy directive 'style-src 'self''" ao abrir a busca, um menu, o diálogo da lixeira ou a gaveta.
  O conteúdo é dinâmico (hash não serve) e nonce exigiria gerar a resposta no servidor (Pages Functions). Script
  inline continua bloqueado.
- **zod sem `eval`:** o zod 4 testa `new Function` para compilar validadores; sob `script-src 'self'` o teste vira
  violação de CSP. `src/lib/zod-config.ts` liga `jitless` antes de qualquer schema rodar.
- **Supabase local:** a CSP só libera `*.supabase.co`. Com `VITE_SUPABASE_URL` apontando para o Supabase local
  (`http://127.0.0.1:54321`), o `pnpm preview` bloqueia as chamadas; use `pnpm dev` nesse caso.
- **Cloudflare Web Analytics** (se for ligado no painel) injeta um script de outro domínio e viola a CSP: liberar o
  domínio dele em `script-src`/`connect-src` antes de ligar.
- **Fases futuras:** os embeds da Fase 3 (YouTube, Google Drive, Vimeo) vão exigir `frame-src` com esses domínios
  (hoje cai no `default-src 'self'` e é bloqueado); o PWA da Fase 6 usa `worker-src`/`manifest-src`, hoje cobertos por
  `default-src 'self'`.
- **Editor (Fase 2a):** o BlockNote foi conferido contra esta CSP **sem mudar nada**: `pnpm build && pnpm preview`,
  Chromium e WebKit, abrindo o menu "/", um toggle, uma tabela, a barra de formatação e a alça do bloco, com um
  ouvinte de `securitypolicyviolation`: zero violações e zero erros no Console. Os estilos inline do editor e dos
  menus flutuantes já estão cobertos por `style-src 'unsafe-inline'`; não há `eval` no código do BlockNote; o seletor
  de emoji (emoji-mart) está desligado. O BlockNote só avisa no Console (`console.warn`, não é CSP) que a meta
  viewport não tem `interactive-widget=resizes-content`: fica para o 2c (barra acima do teclado no mobile).
- **Formato do arquivo:** o `pnpm preview` lê o mesmo `public/_headers` (`scripts/cloudflare-headers.ts`) e aplica os
  headers localmente. O leitor aceita só a regra `/*` com linhas `Nome: valor` indentadas; o teste
  `scripts/cloudflare-headers.test.ts` falha se o arquivo sair desse formato ou perder uma diretiva.

### Como conferir

Localmente: `pnpm build && pnpm preview` (porta 4173) já serve os headers. No preview do Cloudflare (a fonte de
verdade):

1. Abra a URL de preview do PR (ou o alias da branch) numa aba anônima do Chrome ou do Edge.
2. Abra o DevTools (F12) → aba **Network** → marque **Disable cache** → recarregue a página.
3. Clique na primeira linha (o documento, tipo `document`) → **Headers** → **Response Headers**. Confira os 5 headers
   da tabela acima, com os valores iguais.
4. Vá para a aba **Console**, limpe (Ctrl+L) e use o app: entrar, abrir e fechar a busca (Ctrl+K), abrir o menu "⋯"
   de uma página da árvore, a lixeira e o diálogo "Excluir definitivamente" (cancele), e "Sair". Esperado: nenhuma
   mensagem "Content Security Policy" / "Refused to …".
5. No iPhone (Safari) ou no modo dispositivo do DevTools (390×844), repita o passo 4 abrindo e fechando a gaveta (☰).
6. Opcional: em **Application** → **Frames** → **top**, a seção de segurança mostra a CSP aplicada.

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

### Editor no toque (Fase 2c-2)

No preview do PR, com o usuário de teste, numa página nova (apague-a no fim). iPhone e iPad no Safari; Android no
Chrome. O e2e emula o teclado reduzindo a altura da janela; o teclado de verdade só se confere aqui.

- **iPhone (retrato):** tocar no texto abre o teclado e a barra aparece colada em cima dele (⋮⋮, /, Aa, Tarefa,
  Transformar em, Desfazer, Refazer, Fechar teclado), sem barra duplicada. Em 320 px (iPhone SE) a barra rola de lado.
- **"/" da barra:** o painel abre acima da barra, o teclado continua aberto, digitar filtra, apagar o "/" fecha. A linha do
  cursor fica visível acima do painel.
- **Aa:** negrito, itálico, sublinhado, riscado, código, link e cores; o teclado não fecha. O **campo do Link não dá zoom**
  ao focar (nem a busca do menu do bloco).
- **Tarefa:** texto → checklist → texto. **⋮⋮ e Transformar em:** o teclado fecha, o bottom sheet abre; depois da ação o
  teclado não volta sozinho e o próximo toque o reabre.
- **Fim de uma página longa:** digitando no fim, o cursor nunca fica atrás da barra nem do teclado.
- **iPhone na horizontal:** pouco espaço; o "/" abre baixo e ainda rola; nada fica atrás do teclado.
- **Girar o aparelho com o teclado aberto:** a barra continua acima do teclado (o BlockNote zera a detecção quando a
  largura muda; se ela sumir, um toque no texto a traz de volta).
- **Zoom de pinça:** com zoom a barra some; ao voltar ao normal, ela volta.
- **iPad:** a barra aparece com o teclado na tela; tocar num bloco mostra a alça ⋮⋮ de 44 px na margem, que abre o menu do
  bloco. Com **teclado físico**: sem barra, alça da margem e "/" como no desktop. Com **trackpad**: anotar o que aparece
  (se o iPadOS informar `pointer: fine`, é o desktop: alça por hover e arrastar; senão, a alça da margem e sem arrastar).
- **Android (Chrome):** a barra fica acima do teclado (o layout encolhe com `interactive-widget=resizes-content`).
- **Desktop:** nada mudou (barra flutuante só com seleção, "/" no cursor, alça por hover).

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
