import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

interface Props {
  /** Muda a cada navegação: sair da tela que falhou tenta de novo. */
  resetKey: string
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Última barreira das rotas: em vez de tela em branco, avisa e oferece recarregar. É o que aparece
 * quando um chunk não carrega nem depois da recarga automática (`lazyWithReload`).
 */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
        <main id="conteudo" role="alert" className="w-full max-w-sm text-center">
          <h1 className="text-h3 font-semibold text-strong">{t('routeError.title')}</h1>
          <p className="mt-2 text-muted-foreground">{t('routeError.description')}</p>
          <Button
            className="mt-6"
            onClick={() => {
              window.location.reload()
            }}
          >
            {t('routeError.reload')}
          </Button>
        </main>
      </div>
    )
  }
}
