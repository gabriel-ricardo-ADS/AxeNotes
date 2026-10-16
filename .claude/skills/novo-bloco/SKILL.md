---
name: novo-bloco
description: Passo a passo para adicionar um tipo de bloco customizado ao editor BlockNote do AxeNotes (schema, renderização, menu "/", "Transformar em", pt-BR, mobile e testes). Use ao criar ou alterar blocos como callout, link de página, base inline, embed, lembrete.
argument-hint: "[nome do bloco]"
---

# Novo bloco no editor

Antes: confira na documentação atual do BlockNote (Context7 ou site oficial) a API de
`createReactBlockSpec` e de customização do slash menu — ela muda entre versões.

1. Crie `src/features/editor/blocks/<nome>/` com:
   - `<nome>.spec.tsx`: `createReactBlockSpec` com `type`, `propSchema` (só dados serializáveis;
     IDs em vez de objetos), `content: "inline" | "none"` e `render`.
   - `<nome>.test.tsx`: renderização e serialização (o JSON salvo volta igual ao carregar).
2. Registre no schema em `src/features/editor/schema.ts`.
3. Adicione ao menu "/" (`src/features/editor/slashMenu.ts`) com título, aliases em pt-BR e em
   inglês, grupo, ícone lucide e atalho se houver.
4. Se fizer sentido, adicione em "Transformar em" no menu do bloco.
5. Textos em `src/i18n/pt-BR.ts`.
6. Visual segundo a skill `design-axenotes`; estados: vazio, carregando, erro, somente leitura.
7. Mobile: funciona com toque, sem hover obrigatório; menus em bottom sheet.
8. Se o bloco referencia dados (página, base, arquivo), trate referência quebrada (item excluído)
   mostrando um estado "Conteúdo indisponível".
9. Teste e2e mínimo: inserir pelo "/", editar, recarregar a página e ver persistido.
10. Rode a skill `verificar-ui`.
