---
name: fase
description: Executa uma fase do docs/ROADMAP.md de ponta a ponta (planejar, implementar, testar, verificar, abrir PR). Use quando pedirem para executar ou iniciar a fase N do roadmap (ex.: "use a skill /fase 3").
argument-hint: "[número da fase]"
---

# Executar a Fase $ARGUMENTS

1. Leia `CLAUDE.md`, a seção "Fase $ARGUMENTS" de `docs/ROADMAP.md` e as partes relevantes de
   `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/UI-REFERENCE.md` e `docs/DECISIONS.md`.
2. Confira se a fase anterior está na `main`. Se depender de decisão **ABERTA**, pare e pergunte.
3. Escreva um plano curto: arquivos a criar/alterar, migrações, componentes, testes, riscos, e o
   que fica fora. Se a fase for grande, proponha dividi-la em partes (uma por PR).
4. Crie a branch `feat/fase-$ARGUMENTS-<assunto>`.
5. Implemente em commits pequenos (Conventional Commits). Use as skills `design-axenotes`,
   `novo-bloco` e `migracao-supabase` quando couber. Consulte a documentação atual das libs.
6. Verifique: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` e `pnpm e2e` quando
   existir; depois a skill `verificar-ui` para tudo que for visual.
7. Revise o próprio diff (ou peça ao subagente `revisor-seguranca` se mexeu em banco/auth/storage).
8. Abra PR draft com: resumo, como testar (passo a passo), prints desktop/mobile, migrações que o
   Gabriel precisa aplicar, decisões tomadas, pendências. Marque como pronto para revisão só com
   tudo verde.
9. Atualize `docs/` se algo mudou (modelo de dados, decisão, roadmap).
