import { act, render, screen } from '@testing-library/react'
import { SAVING_DELAY_MS, SyncIndicator } from '@/features/sync/components/SyncIndicator'
import type { SyncStatus } from '@/features/sync/content-sync'

const TEXTS: [SyncStatus, string][] = [
  ['saved', 'Salvo'],
  ['offline', 'Offline — será sincronizado'],
  ['error', 'Erro ao salvar (tentando de novo)'],
  ['tooLarge', 'Página grande demais para sincronizar (salva só neste aparelho)'],
  ['blocked', 'Sem permissão para salvar (página na lixeira ou acesso removido)'],
]

describe('SyncIndicator', () => {
  it.each(TEXTS)('mostra %s como status educado (aria-live polite)', (status, text) => {
    render(<SyncIndicator status={status} />)
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent(text)
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('leitor e lixeira (readonly) não mostram nada', () => {
    const { container } = render(<SyncIndicator status="readonly" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('"Salvando…" só aparece se o envio demorar, sem piscar em envios rápidos', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<SyncIndicator status="saved" />)
      rerender(<SyncIndicator status="saving" />)
      expect(screen.getByRole('status')).toHaveTextContent('Salvo')
      act(() => {
        vi.advanceTimersByTime(SAVING_DELAY_MS)
      })
      expect(screen.getByRole('status')).toHaveTextContent('Salvando…')

      rerender(<SyncIndicator status="saved" />)
      rerender(<SyncIndicator status="saving" />)
      act(() => {
        vi.advanceTimersByTime(SAVING_DELAY_MS - 1)
      })
      rerender(<SyncIndicator status="saved" />)
      expect(screen.getByRole('status')).toHaveTextContent('Salvo')
    } finally {
      vi.useRealTimers()
    }
  })
})
