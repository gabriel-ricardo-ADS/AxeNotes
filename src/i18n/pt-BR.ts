// Todo texto visível ao usuário mora aqui; componentes usam t('chave.aninhada').
// Use {nome} para valores interpolados: t('chave', { nome: 'Ana' }).
export const ptBR = {
  app: {
    name: 'AxeNotes',
  },
  common: {
    close: 'Fechar',
  },
  layout: {
    skipToContent: 'Ir para o conteúdo',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    sidebar: {
      label: 'Navegação principal',
      drawerTitle: 'Menu de navegação',
      drawerDescription: 'Navegue entre as páginas do AxeNotes.',
      home: 'Página inicial',
      recents: 'Recentes',
      recentsEmpty: 'As páginas que você abrir aparecem aqui.',
    },
  },
  home: {
    title: 'Página inicial',
    empty: 'Suas páginas vão aparecer aqui.',
  },
  notFound: {
    title: 'Página não encontrada',
    description: 'O endereço que você abriu não existe.',
    backHome: 'Voltar para a página inicial',
  },
} as const
