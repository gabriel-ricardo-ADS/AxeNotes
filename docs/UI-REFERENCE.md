# Referência de UI e interação (análise dos vídeos e print da cliente)

Fonte: 2 gravações de tela do Notion da cliente (≈85 s e ≈26 s, sem áudio) e 1 print.
As imagens ficam em `docs/reference/` (local, fora do git) ou `/mnt/project-files/` (threads do
Projeto). **Elas contêm dados pessoais — use só como referência visual.**

| Arquivo | O que mostra |
| --- | --- |
| `00-painel-de-leituras.jpg` | Painel de leituras: callout, 3 colunas, checklist, galeria e tabela (alvo do MVP) |
| `01-home.jpg` | Home: capa ilustrada, ícone, callout verde, toggle, links de páginas, coluna lateral com checklist |
| `02-base-de-leituras-tabela.jpg` | Base em tabela: nota em estrelas, categoria, formato colorido |
| `03-base-de-leituras-propriedades.jpg` | Mesma base rolada: status com bolinha, autor, intervalo de datas, capa |
| `04-galeria-cards-hover.jpg` | Galeria filtrada das leituras em andamento (cards com capa) e ações ao passar o mouse |
| `05-edicao-inline-status.jpg` | Edição inline de célula de status (dropdown) |
| `06-home-preview-link-hover.jpg` | Prévia ao passar o mouse sobre link de página |
| `07-base-de-estudo-1.jpg` / `08-base-de-estudo-2.jpg` | Bases simples de estudo com tags coloridas e texto colorido |
| `09-pagina-de-trabalho.jpg` | Página de trabalho: capa, galeria de projetos, coluna lateral com toggles |
| `10-materia-imagens-links.jpg` | Matéria: imagens lado a lado, links para subpáginas e link externo |
| `11-modulo-toggle-imagem.jpg` | Título com fundo colorido, toggle, imagem grande |
| `12-menu-do-bloco.jpg` | Menu do bloco (⋮⋮) |
| `13-menu-transformar-em.jpg` | Submenu "Transformar em" |
| `14-menu-barra-slash.jpg` | Menu "/" com busca |
| `15-tabela-texto-colorido.jpg` | Imagem de tabela + texto com cores (vermelho, verde, azul) |

## 1. Linguagem visual

- **Tema escuro** quase preto (≈ #191919) com sidebar um pouco mais clara (≈ #202020).
  Texto principal cinza claro, secundário cinza médio. Bordas quase invisíveis.
- Tipografia sans-serif limpa (Inter/system). Título da página grande e em negrito (~40 px);
  Título 1 ~30 px, Título 2 ~24 px, Título 3 ~20 px, texto 16 px, sidebar 14 px.
- Muita cor por **etiquetas** (seleção/status) em fundos escuros saturados: roxo "Físico",
  laranja "Kindle", vermelho "Audiobook", verde "Concluído", azul "Em andamento",
  laranja-tijolo "Abandonei", cinza "Não iniciada"; meses com cores diferentes.
- **Callouts** com fundo colorido (marrom com citação em itálico, verde com frase), emoji à esquerda.
- **Títulos com fundo colorido** (marrom/oliva) usados como "cabeçalhos de seção" (ex.: um período
  de estudo, uma lista de próximas leituras com ✨, "Menu").
- Emojis e pequenos ícones em quase todo título de página; ✨ muito usado.
- Capas: imagens ilustradas/GIFs ocupando toda a largura (~200–280 px de altura), ícone
  sobreposto na borda inferior esquerda (quadrado ~75 px).
- Figurinhas/GIFs fofos soltos na página como decoração (bloco de imagem com fundo transparente).
- Avaliação como sequência de ⭐ (às vezes com ❤️ no fim) dentro de etiqueta → no AxeNotes vira
  propriedade "Avaliação" nativa, com aparência parecida (fundo colorido + estrelas).

## 2. Layout

- Sidebar à esquerda (~240 px): busca ("Busque ou peça", Ctrl+K), Página inicial, ícones de chat
  e agenda, **Próximos eventos** (bolinha colorida + título truncado + "Amanhã 8:00", "dom. 7:00",
  "Visualizar tudo"), **Recentes** (ícone + nome), rodapé com conta.
- Topo da página: breadcrumb com ícones ("🌿 Home / 📚 Leituras"), à direita
  "Editada há 19 dias", "Compartilhar", favoritar ⭐, "…".
- Páginas de "painel" usam **largura total** e **3 colunas** (menu | checklist | base).
  Home usa 2 colunas (conteúdo principal largo | coluna lateral estreita com um checklist de
  lembretes com ★ e uma lista de arquivos).
- Links de subpáginas distribuídos em grade de 3 colunas sob um título de seção.

## 3. Interações observadas

1. Passar o mouse sobre um bloco mostra **"+" e "⋮⋮"** à esquerda.
2. Clique em "⋮⋮" abre **menu do bloco**: campo "Pesquisar ações…", seção "Texto":
   Transformar em ▸, Cor ▸, Link para o bloco (Alt+Shift+L), Duplicar (Ctrl+D), Mover para
   (Ctrl+Shift+P), Excluir (Del), Sugerir edições, Peça à IA; rodapé "Última edição por … · data"
   e contagem de palavras.
3. **Transformar em**: Texto ✓, Título 1–4, Página, Página em ▸, Lista com marcadores,
   Lista numerada, Lista de tarefas, Lista de alternantes, Código, Citação, Frase de destaque,
   Equação em bloco, Bloco sincronizado, Título alternante 1–4, 2 colunas, 3 colunas…
4. Digitar **"/"** abre menu flutuante com "Digite para filtrar", grupos "Sugestões" e
   "Blocos básicos", atalhos markdown à direita (#, ##, ###), "Fechar menu esc".
5. Placeholder do bloco vazio: "Clique na barra de espaço para ativar a IA ou '/' para acessar os
   comandos" → no AxeNotes: "Digite '/' para comandos".
6. **Base de dados**: abas de vistas, cada uma com nome e às vezes emoji e contagem (ex.: "Todas ✨",
   "Por nota", "Do ano passado ✨ (1)"),
   barra de ferramentas (filtro, ordenar, ⚡, busca, expandir, configurações) e botão azul
   **"Nova ▾"**; cabeçalhos com ícone do tipo de propriedade; "+ Nova página" no fim;
   "CONTAGEM 13" no rodapé; rolagem horizontal com barra visível.
7. Clicar numa célula de status abre dropdown inline com as opções coloridas.
8. **Galeria** como menu lateral: cards com capa do livro, título, autor, etiqueta do mês;
   filtro pela aba da vista (ex.: "Em andamento ▾"); "+ Nova página" no fim; ao passar o mouse aparecem ações
   (editar, "…").
9. Passar o mouse sobre link de página mostra **prévia** (ícone + título + começo do conteúdo).
10. Toggles ("▶ Objetivos") abrem/fecham conteúdo aninhado.
11. Arquivos: bloco de PDF com nome e tamanho ("material.pdf 3.1MB").
12. Texto com várias cores na mesma linha e links azuis sublinhados.

## 4. Adaptação para o celular (não aparece nos vídeos — decisões nossas)

- Sidebar vira gaveta; topo com ☰, breadcrumb curto e "…".
- Colunas empilham verticalmente abaixo de 768 px (ordem: da esquerda para a direita).
- Tabelas rolam na horizontal com a coluna de título fixa; galeria vira 2 cards por linha.
- Alça do bloco aparece ao tocar no bloco; segurar e arrastar move; "+" flutuante.
- Barra de ferramentas acima do teclado: "/", Aa (formatação), checklist, imagem, desfazer.
- Menus viram bottom sheets.
