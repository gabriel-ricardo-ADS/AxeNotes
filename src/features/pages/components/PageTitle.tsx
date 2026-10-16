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
 * Título da página: `<h1>` com o campo dentro. Salva com debounce, também ao sair do campo e ao sair
 * da tela. O cache otimista já atualiza a sidebar; a lista só é conferida no servidor uma vez, quando
 * a edição termina (e de novo se falhar). Em caso de erro o texto digitado fica e o aviso aparece.
 */
export function PageTitle({ pageId, title, editable, focusOnMount }: PageTitleProps) {
  const { renamePage, reconcile } = usePageMutations()
  const [value, setValue] = useState(title)
  const [failed, setFailed] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)
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
  // de foco do diálogo e o "devolver foco ao ☰" disputam o foco), então insiste por um instante.
  useEffect(() => {
    if (!focusOnMount) return
    const timers = [0, 120, 250, 400, 700].map((delay) =>
      window.setTimeout(() => {
        const area = areaRef.current
        if (area && document.activeElement !== area) area.focus()
      }, delay),
    )
    return () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer)
      })
    }
  }, [focusOnMount])

  async function save() {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    const text = cleanTitle(latest.current)
    dirty.current = false
    if (text === lastSaved.current) return
    const ok = await actions.current.renamePage(pageId, text, { silent: true })
    if (ok) {
      lastSaved.current = text
      savedSomething.current = true
      setFailed(false)
    } else {
      dirty.current = true
      setFailed(true)
    }
  }

  async function finish() {
    await save()
    if (savedSomething.current) {
      savedSomething.current = false
      void actions.current.reconcile()
    }
  }

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
