import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePageMutations } from '@/features/workspace/hooks/use-page-mutations'
import { t } from '@/i18n'

/** Espera depois da última tecla antes de salvar o título. */
export const TITLE_DEBOUNCE_MS = 600

interface PageTitleProps {
  pageId: string
  title: string
  editable: boolean
  /** Foca o campo ao abrir (página recém-criada). */
  focusOnMount: boolean
}

const cleanTitle = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ')

/**
 * Título da página: `<h1>` com o campo dentro. Salva com debounce, também ao sair do campo, ao sair
 * da tela e quando a página fica oculta (`visibilitychange`/`pagehide`: trocar de app, fechar a aba,
 * recarregar), que não desmontam o React. Enquanto houver texto pendente ou salvamento em andamento, o
 * `beforeunload` pede confirmação (e dispara o salvamento antes de abrir o diálogo); se o salvamento
 * falhar, o texto continua pendente e o aviso também. O cache otimista já atualiza a sidebar; a lista
 * só é conferida no servidor uma vez, quando a edição termina (e de novo se falhar). Em caso de erro o
 * texto digitado fica e o aviso aparece.
 */
export function PageTitle({ pageId, title, editable, focusOnMount }: PageTitleProps) {
  const { renamePage, reconcile } = usePageMutations()
  const [value, setValue] = useState(title)
  const [failed, setFailed] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)
  /** Salvamentos já enviados e ainda sem resposta (`dirty` só diz o que NÃO foi enviado). */
  const inFlight = useRef(0)
  const guarded = useRef(false)
  const savedSomething = useRef(false)
  const lastSaved = useRef(title)
  const latest = useRef(value)

  // Sempre a versão mais nova das funções, para o salvamento ao desmontar não usar uma antiga.
  const actions = useRef({ renamePage, reconcile })
  useEffect(() => {
    actions.current = { renamePage, reconcile }
  })

  // Mudança vinda de fora (renomeou na sidebar) vale se não há texto digitado ainda não salvo.
  useEffect(() => {
    if (dirty.current || title === latest.current) return
    latest.current = title
    lastSaved.current = title
    setValue(title)
  }, [title])

  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${String(area.scrollHeight)}px`
  }, [value])

  // Página recém-criada pelo menu: foca o título. No mobile a gaveta ainda está fechando (a armadilha
  // de foco do diálogo e o "devolver foco ao ☰" disputam o foco), então insiste por um instante. A
  // primeira ação do usuário (toque, clique ou tecla) encerra a insistência: senão ela roubaria o foco
  // de um campo que ele acabou de abrir (por exemplo, renomear na sidebar).
  useEffect(() => {
    if (!focusOnMount) return
    const timers = [0, 120, 250, 400, 700].map((delay) =>
      window.setTimeout(() => {
        const area = areaRef.current
        if (area && document.activeElement !== area) area.focus()
      }, delay),
    )
    const stop = () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer)
      })
    }
    document.addEventListener('pointerdown', stop, true)
    document.addEventListener('keydown', stop, true)
    return () => {
      stop()
      document.removeEventListener('pointerdown', stop, true)
      document.removeEventListener('keydown', stop, true)
    }
  }, [focusOnMount])

  /** Registra o aviso de sair da página só enquanto há pendência (não pesa no bfcache sem ela). */
  function syncUnloadGuard() {
    const needed = dirty.current || inFlight.current > 0
    if (needed === guarded.current) return
    guarded.current = needed
    if (needed) window.addEventListener('beforeunload', warnBeforeLeaving.current)
    else window.removeEventListener('beforeunload', warnBeforeLeaving.current)
  }

  /** `leaving`: a página está sendo fechada/recarregada/ocultada; envia de um jeito que sobrevive a isso. */
  async function save(leaving = false) {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    const text = cleanTitle(latest.current)
    dirty.current = false
    if (text === lastSaved.current) {
      syncUnloadGuard()
      return
    }
    inFlight.current += 1
    try {
      const ok = await actions.current.renamePage(pageId, text, {
        silent: true,
        keepalive: leaving,
      })
      if (ok) {
        lastSaved.current = text
        savedSomething.current = true
        setFailed(false)
      } else {
        dirty.current = true
        setFailed(true)
      }
    } finally {
      inFlight.current -= 1
      syncUnloadGuard()
    }
  }

  /** Salva já o que está pendente ao sair (sem esperar o debounce). Não repete o que já foi enviado. */
  function flush() {
    if (dirty.current) void save(true)
  }

  const warnBeforeLeaving = useRef((event: BeforeUnloadEvent) => {
    flush()
    event.preventDefault()
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- navegadores mais antigos só avisam com returnValue
    event.returnValue = ''
  })

  async function finish() {
    await save()
    if (savedSomething.current) {
      savedSomething.current = false
      void actions.current.reconcile()
    }
  }

  // Página oculta (trocou de app/aba, fechou ou recarregou): salva o que está pendente na hora.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `flush` só lê refs e `actions`
  }, [])

  // Ao sair da tela com texto pendente, salva e confere uma vez.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (dirty.current || savedSomething.current) {
        void (async () => {
          await save()
          void actions.current.reconcile()
        })()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `save` só lê refs e `actions`
    [],
  )

  if (!editable) {
    return (
      <h1 className="text-title font-bold break-words text-strong">
        {title === '' ? t('page.titlePlaceholder') : title}
      </h1>
    )
  }

  return (
    <>
      <h1 className="text-title font-bold text-strong">
        <textarea
          ref={areaRef}
          rows={1}
          maxLength={500}
          value={value}
          placeholder={t('page.titlePlaceholder')}
          aria-label={t('page.titleLabel')}
          onChange={(event) => {
            const text = event.currentTarget.value
            latest.current = text
            dirty.current = true
            syncUnloadGuard()
            setValue(text)
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => {
              void save()
            }, TITLE_DEBOUNCE_MS)
          }}
          onBlur={() => {
            void finish()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          className="block w-full resize-none overflow-hidden bg-transparent leading-[1.2] font-bold text-strong outline-none placeholder:text-faint"
        />
      </h1>
      {failed ? (
        <p role="alert" className="mt-1 text-ui text-danger">
          {t('page.saveError')}
        </p>
      ) : null}
    </>
  )
}
