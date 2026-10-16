---
name: verificar-ui
description: Verifica visualmente uma mudança de interface do AxeNotes tirando screenshots em desktop (1440x900) e mobile (390x844) com Playwright e comparando com as referências da cliente. Use depois de qualquer mudança visual e antes de dizer que uma tarefa de UI terminou.
argument-hint: "[rota ou página a verificar, ex.: /p/home]"
---

# Verificar UI

1. Garanta que o app está rodando (`pnpm dev`, porta 5173). Em sessão local do app desktop,
   prefira abrir no painel Browser; em thread de nuvem, use Playwright headless.
2. Se a rota precisa de login, use o usuário de teste do seed (`E2E_EMAIL` / `E2E_PASSWORD` do
   ambiente) — nunca dados reais.
3. Gere os prints com o script `e2e/screenshot.ts` (crie se não existir) para a rota
   `$ARGUMENTS` (ou as rotas afetadas pela mudança):
   - `desktop`: viewport 1440×900, tema escuro
   - `mobile`: viewport 390×844 (iPhone, WebKit), `isMobile: true`, `hasTouch: true`
   - `tablet`: viewport 820×1180 (iPad, WebKit), `hasTouch: true` — quando a tela mudar de layout
   - salve em `.screenshots/<data>-<rota>-<viewport>.png` (pasta no .gitignore)
4. Abra cada PNG com a ferramenta Read e olhe de verdade. Compare com a referência relevante de
   `docs/UI-REFERENCE.md` (tabela de arquivos). Avalie: hierarquia, cores dos tokens,
   espaçamentos, alinhamento, truncamento de texto, sobreposição, rolagem horizontal indevida,
   alvos de toque no mobile.
5. Teste a interação principal (clique/toque, menu "/", arrastar) com Playwright e tire print do
   estado aberto dos menus.
6. Corrija o que estiver errado e repita até ficar consistente. Se a diferença em relação à
   referência for intencional (ex.: adaptação mobile), explique.
7. No relatório final, liste os prints gerados e as diferenças restantes.

Para uma segunda opinião em mudanças grandes, delegue ao subagente `revisor-ui`.
