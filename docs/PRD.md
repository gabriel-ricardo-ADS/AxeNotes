# AxeNotes — Documento de Requisitos (PRD)

Versão 1.0 · origem: entrevista com a cliente + 2 vídeos de tela + 1 print do Notion dela.

## 1. Visão

Um "caderno digital" pessoal no estilo Notion: páginas que podem conter qualquer coisa (texto,
links, imagens, vídeos, checklists, tabelas, bases de dados), organizadas em árvore, divididas em
colunas e acessíveis do PC e do celular, com agenda e lembretes.

**Usuária principal:** estudante universitária e designer freelancer, usa o Notion em tema escuro,
todos os dias, para: matérias da faculdade (páginas por semestre/matéria/módulo), controle de
leituras (base de livros com nota, formato, status e capa), estudo de inglês (bases de vocabulário),
projetos de clientes, metas pessoais, checklists rápidos e agenda (compromissos com horário).

**Princípio de produto:** recriar a *sensação* do Notion que ela já ama (escuro, limpo, blocos com
alça "⋮⋮", menu "/", páginas com capa e ícone, bases coloridas) — sem tentar copiar o Notion inteiro.

**Critério de sucesso do MVP:** a cliente consegue montar no AxeNotes, sozinha, a página
"Cantinho de Leitura 2026" do print (callout com citação, 3 colunas, checklist, galeria filtrada
"Leitura atual" e tabela "Leituras de 2026" com nota em estrelas, formato e status) e usá-la no PC
e no celular.

## 2. Requisitos da entrevista → funcionalidades

| Pedido da cliente | Como atendemos | Prioridade |
| --- | --- | --- |
| App parecido com o Notion | Editor de blocos + páginas aninhadas + sidebar + tema escuro | MVP |
| Rodar no PC e no celular (Android e iOS) | Web app responsivo + PWA instalável (Windows, iPhone, iPad); lojas via Capacitor no futuro | MVP (PWA) / futuro (lojas) |
| Tela onde pode colocar várias coisas | Página = documento de blocos livres | MVP |
| Escrever textos, colocar links, imagens, vídeos | Blocos de texto rico, link/bookmark, imagem, vídeo (upload e YouTube/Vimeo), arquivo/PDF | MVP |
| Criar blocos (dividir a tela) | Colunas (2 a 4, redimensionáveis) + arrastar blocos | MVP |
| Menu | Sidebar com árvore de páginas, busca, favoritos, recentes, agenda; menu "/" e menu do bloco | MVP |
| Checklists | Bloco "lista de tarefas" + propriedade caixa de seleção nas bases | MVP |
| Lembretes | Lembrete em página, bloco ou data de base, com notificação no aparelho | V1 |
| Agendas | Página Agenda + "Próximos eventos" na sidebar + integração com Google Agenda | V1 |
| Planilhas | Bases estilo Notion (tabela, galeria, quadro, calendário, lista) + bloco Planilha estilo Excel | MVP (tabela+galeria) / V1 (demais) / V2 (Excel) |
| Múltiplas páginas com "coisas" dentro | Páginas aninhadas sem limite de profundidade, página-dentro-de-página | MVP |

## 3. Funcionalidades detalhadas

### 3.1 Conta, dispositivos e usuários (MVP)
- Login por e-mail + senha + código OTP de 6 dígitos (Supabase Auth). **Sem link mágico**
  (problema no PWA do iOS, DECISÃO-014). Sessão persistente.
- Arquitetura multiusuário desde o início: cada conta tem um workspace; workspaces têm membros
  com papéis (dono, editor, leitor). No MVP a UI mostra só o workspace pessoal.
- V1: convidar pessoas para o workspace ou para uma página; link público somente leitura.
- V1: edição simultânea em tempo real com presença e cursores.
- Mesmo conteúdo em todos os dispositivos; alterações aparecem nos outros em segundos (Realtime).
- Indicador discreto de "Salvando… / Salvo" e de "sem conexão".

### 3.2 Sidebar / navegação (MVP)
- Busca rápida (Ctrl/Cmd+K): busca por título, com acentos ignorados. A busca por conteúdo chega
  com o editor (Fase 2, DECISÃO-019).
- "Página inicial" (página definida como home), Favoritos (estrela), Recentes, Páginas (árvore).
- Árvore: expandir/recolher, criar subpágina pelo "+", reordenar e mover arrastando,
  menu "…" (renomear, duplicar, mover para, favoritar, excluir → Lixeira).
- Lixeira com restaurar / excluir definitivamente.
- "Próximos eventos" (V1): próximos itens da agenda com bolinha colorida e horário.
- Mobile: sidebar vira gaveta, aberta **só pelo botão ☰** (sem gesto de arrastar da borda).
- Recolher sidebar no desktop; largura ajustável.

### 3.3 Página (MVP)
- Capa opcional (imagem/GIF enviada ou de galeria), com "Trocar" e "Reposicionar".
- Ícone opcional (emoji ou imagem pequena) e título grande.
- Breadcrumb no topo ("Home / Cantinho de Leitura 2026"), "Editada há X", favoritar, menu "…".
- Hover em link de página mostra prévia (desktop).
- Largura: padrão centralizada; opção "largura total" (as páginas da cliente usam largura total
  com 3 colunas).

### 3.4 Editor de blocos (MVP)
Interações obrigatórias (ver docs/UI-REFERENCE.md):
- Placeholder em bloco vazio: "Digite '/' para comandos".
- Alça do bloco ao passar o mouse: "+" (inserir abaixo) e "⋮⋮" (arrastar / abrir menu do bloco).
  No toque: tocar no bloco mostra a alça; segurar e arrastar move.
- Menu "/" com busca ("Digite para filtrar"), agrupado: Blocos básicos, Mídia, Bases, Avançados;
  atalhos markdown (`#`, `##`, `###`, `-`, `1.`, `[]`, `>`, ```` ``` ````, `---`).
- Menu do bloco: busca de ações, Transformar em ▸, Cor ▸ (texto e fundo), Link para o bloco,
  Duplicar (Ctrl+D), Excluir (Del); rodapé "Última edição por … em …". "Mover para (outra
  página)" fica para a V1 (DECISÃO-021).
- Barra de formatação ao selecionar texto: negrito, itálico, sublinhado, tachado, código, link,
  cor do texto/fundo.

Tipos de bloco:
- MVP: Texto, Título 1–3, Lista com marcadores, Lista numerada, Lista de tarefas (checklist),
  Lista de alternantes (toggle) e Títulos alternantes, Citação, Destaque (callout com emoji e cor
  de fundo), Divisor, Código, Tabela simples, Imagem, Vídeo (upload ou link YouTube/Vimeo),
  Arquivo/PDF, Link/bookmark com prévia, Link para página, Subpágina, Colunas (2–4), Base de dados
  (inline e "vista vinculada" de base existente).
- V1: Equação, Sumário, Botão, Lembrete inline ("@lembrete amanhã 9h"), Menção de data.
- V2: Bloco sincronizado, Comentários, Incorporações genéricas (Figma, Maps, Spotify).

### 3.5 Bases de dados ("planilhas") (MVP / V1)
- Criar base em página própria ou inline em qualquer página. Cada linha é também uma página
  (abre ao clicar, com propriedades no topo e conteúdo livre embaixo).
- Tipos de propriedade — MVP: Título, Texto, Número, Seleção, Seleção múltipla, Status
  (com grupos A fazer / Em andamento / Concluído), Data (com intervalo e horário opcional),
  Caixa de seleção, URL, Arquivo/Imagem (usado como capa; aceita URL e upload), Avaliação (1–5
  com ícone configurável: estrela ou coração, e destaque ❤️ opcional). O formato da data é
  configurável por propriedade (DECISÃO-020). V1: E-mail, Telefone, Pessoa, Criado em / Editado em,
  Relação, Fórmula simples, Rollup (contar/somar).
- Opções de seleção com cores (paleta fixa: padrão, cinza, marrom, laranja, amarelo, verde,
  azul, roxo, rosa, vermelho).
- Visualizações (abas no topo, cada uma com nome e ícone) — MVP: Tabela, Galeria.
  V1: Quadro (kanban por status/seleção), Calendário, Lista.
- Em cada vista: filtros (e/ou), ordenação, agrupamento por status/seleção (MVP), propriedades
  visíveis e ordem,
  largura de coluna, busca, "Nova" (botão azul) com template padrão, contagem de linhas no rodapé.
- Tabela: edição inline das células, adicionar coluna "+", arrastar colunas, rolagem horizontal
  com cabeçalho e primeira coluna fixos, adicionar linha "+ Nova página".
- Galeria: card com capa (propriedade de imagem ou primeira imagem do conteúdo), título e
  propriedades escolhidas (ex.: autor e mês), tamanho de card P/M/G.
- Vista vinculada: inserir em outra página uma vista de uma base existente com filtro próprio
  (ex.: "Leitura atual" = galeria filtrada por Status = Em andamento).
- Exportar base como CSV (V1). Importar CSV (V1).

### 3.6 Agenda (V1)
- Base de sistema "Agenda" (eventos com título, data/hora início–fim, dia inteiro, categoria
  colorida, local, notas, lembrete, repetição simples: diária/semanal/mensal).
- Página Agenda com vistas Mês, Semana, Dia e Lista; criar evento clicando no dia/horário,
  arrastar para mudar data (desktop).
- Qualquer base com propriedade Data pode marcar "Mostrar na agenda".
- Sidebar "Próximos eventos" com os próximos 10 itens ("Amanhã 8:00", "dom. 7:00").
- V1: ler o Google Agenda por URL iCal secreta (somente leitura); depois sincronização em duas
  vias via OAuth (DECISÃO-006).

### 3.7 Lembretes e notificações (V1)
- Lembrete em: página, bloco, evento da agenda e propriedade Data de base
  ("no horário", "5/15/30 min antes", "1 dia antes", horário personalizado).
- Entrega: notificação do sistema no celular e no PC (Web Push no PWA; notificação local no app
  nativo) + central de lembretes dentro do app (sininho com pendentes).
- Ações: abrir a página, adiar 10 min / 1 h, marcar como feito.

### 3.8 Mídia e arquivos (MVP)
- Upload por botão, arrastar e soltar e colar (Ctrl+V de imagem).
- Imagens comprimidas no cliente antes do upload (máx. ~2000px, WebP), GIF preservado.
- Vídeos e arquivos grandes: só por link (YouTube, Google Drive, Vimeo), com player/prévia embutidos.
  Sem upload de vídeo (DECISÃO-007).
- PDF: bloco de arquivo com nome e tamanho; visualização embutida no desktop.
- Arquivos privados por usuário (Storage com RLS).

### 3.9 Outros
- Tema escuro padrão + tema claro (V1). Seguir tema do sistema opcional.
- Atalhos de teclado principais (Ctrl+K, Ctrl+N nova página, Ctrl+D duplicar bloco, Ctrl+Z/Y).
- Templates (V1): "Controle de leituras", "Matéria da faculdade", "Agenda semanal", "Vocabulário".
- Compartilhamento e colaboração em tempo real (V1 — DECISÃO-004).
- IA no editor (V1): escrever, resumir, continuar, traduzir; provedor configurável (Gemini e
  OpenRouter gratuitos, ou chave própria de Claude/GPT/Gemini) — DECISÃO-008.
- Offline-first (DECISÃO-009): abrir e editar páginas sem internet, sincronizando ao reconectar.
- Bloco Planilha estilo Excel com fórmulas (V2 — DECISÃO-010).

## 4. Requisitos não funcionais
- Desempenho: abrir página em < 1 s com cache; digitar sem atraso; tabela com 1.000 linhas
  fluida (virtualização).
- Autosave com debounce (~800 ms) e ao sair da página; nunca perder texto digitado.
- Segurança: RLS em todas as tabelas e no Storage; nenhuma chave secreta no cliente.
- Responsivo: 360 px a 2560 px. Alvos de toque ≥ 44 px no mobile.
- Acessibilidade: WCAG 2.1 AA em contraste e teclado.
- Idioma: pt-BR (datas "15 de out. de 2026", "Amanhã 8:00").
- Custo: rodar no plano gratuito (Supabase Free, Cloudflare Pages) no começo.

## 5. Fora do escopo (por enquanto)
Importação do Notion, upload de vídeo, automações, API pública, apps de loja (futuro) e apps
de desktop nativos (o PWA cobre o PC).
