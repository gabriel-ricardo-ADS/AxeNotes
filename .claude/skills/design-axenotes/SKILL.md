---
name: design-axenotes
description: Tokens visuais e regras de UI do AxeNotes (tema escuro estilo Notion, paleta de etiquetas, tipografia, espaçamentos, comportamento mobile). Use em qualquer tarefa que crie ou altere componentes, estilos, cores, layout ou interações.
---

# Design do AxeNotes

Referência visual: `docs/UI-REFERENCE.md` (+ imagens em `docs/reference/` ou `/mnt/project-files/`).
Objetivo: a cliente deve sentir que está no "Notion dela": escuro, calmo, denso, colorido só nas
etiquetas, callouts e títulos de seção. Identidade própria: nada de logo/ícones da marca Notion.

## Tokens (definir em `src/styles/tokens.css` como CSS variables e mapear no Tailwind)

Valores são aproximações das referências; ajuste olhando os prints, mantendo contraste AA.

```css
:root[data-theme="dark"] {
  --bg: #191919;            /* fundo da página */
  --bg-sidebar: #202020;
  --bg-hover: #2c2c2c;
  --bg-elevated: #252525;   /* menus, popovers, cards */
  --border: #2f2f2f;
  --text: #d4d4d4;
  --text-strong: #ffffffcf;
  --text-muted: #9b9b9b;
  --text-faint: #7f7f7f;
  --accent: #2383e2;        /* botão "Nova", links ativos, foco */
  --accent-hover: #0077d4;
  --danger: #eb5757;
}
```

Paleta de cores nomeadas (o usuário escolhe pelo nome; usamos 3 variantes por cor):

| nome | texto | fundo de bloco/título | etiqueta (select/status) |
| --- | --- | --- | --- |
| padrão | #d4d4d4 | transparente | #373737 |
| cinza | #9b9b9b | #2f2f2f | #5a5a5a |
| marrom | #ba856f | #4a3228 | #603b2c |
| laranja | #c77d48 | #5c3b23 | #854c1d |
| amarelo | #ca9849 | #564328 | #89632a |
| verde | #529e72 | #243d30 | #2b593f |
| azul | #5e87c9 | #143a4e | #28456c |
| roxo | #9d68d3 | #3c2d49 | #492f64 |
| rosa | #d15796 | #4e2c3c | #69314c |
| vermelho | #df5452 | #522e2a | #6e3630 |

Tema claro (V1): mesma estrutura de nomes com valores claros; nunca codificar hex em componente,
sempre via token.

## Tipografia
- Fonte: Inter (fallback: ui-sans-serif, system-ui, "Segoe UI", sans-serif).
- Título da página 40/1.2 bold · H1 30/1.3 semibold · H2 24/1.3 semibold · H3 20/1.3 semibold ·
  texto 16/1.5 · sidebar e tabelas 14 · metadados 12 `--text-muted`.

## Espaçamento e forma
- Largura de leitura da página: 900 px (padrão) | 100% com 96 px de margem (largura total).
- Raio: 4 px (etiquetas, botões), 6 px (cards, menus), 8 px (popovers grandes).
- Blocos com 2–4 px de padding vertical; alça "+ ⋮⋮" a 48 px à esquerda do bloco.
- Sombras discretas só em menus flutuantes.
- Transições 120–180 ms; respeitar `prefers-reduced-motion`.

## Componentes-chave
- **Etiqueta** (select/status): fundo da coluna "etiqueta", texto claro, raio 4, altura 20,
  padding 0 6; status tem bolinha à esquerda.
- **Avaliação**: etiqueta com fundo e N ícones (⭐ ou ❤️) — tamanho 14.
- **Callout**: fundo "fundo de bloco" da cor escolhida, emoji 20 px à esquerda, padding 16, raio 4.
- **Título de seção**: H2/H3 com fundo colorido ocupando a largura da coluna.
- **Botão primário** ("Nova"): fundo `--accent`, texto branco, com seta ▾ separada.
- **Menus**: fundo `--bg-elevated`, borda `--border`, itens 28 px de altura com ícone 16 e atalho à
  direita em `--text-faint`; campo de busca no topo quando houver muitas ações.

## Mobile (≤ 768 px)
- Sidebar → gaveta; menus → bottom sheet (componente Drawer do shadcn/vaul).
- Colunas empilham; tabelas rolam na horizontal com primeira coluna fixa.
- Alvos de toque ≥ 44 px; nada essencial só no hover.
- Barra de ferramentas do editor fixa acima do teclado (usar `visualViewport`).

## Checklist antes de entregar UI
- Comparou com a referência correspondente? Diferenças são intencionais?
- Funciona em 390×844 e 1440×900 (skill `verificar-ui`)?
- Contraste ok, foco visível, labels em botões só com ícone?
- Textos vindos de `src/i18n/pt-BR.ts`?
