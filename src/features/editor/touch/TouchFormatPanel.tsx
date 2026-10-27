import { CreateLinkButton, useActiveStyles, useBlockNoteEditor } from '@blocknote/react'
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  StrikethroughIcon,
  UnderlineIcon,
  type LucideIcon,
} from 'lucide-react'
import { BLOCK_COLORS } from '@/features/editor/block-menu/block-menu'
import type { editorSchema } from '@/features/editor/schema'
import { BarButton } from '@/features/editor/touch/BarButton'
import { t } from '@/i18n'

type BasicStyle = 'bold' | 'italic' | 'underline' | 'strike' | 'code'

const BASIC_STYLES: readonly { style: BasicStyle; icon: LucideIcon }[] = [
  { style: 'bold', icon: BoldIcon },
  { style: 'italic', icon: ItalicIcon },
  { style: 'underline', icon: UnderlineIcon },
  { style: 'strike', icon: StrikethroughIcon },
  { style: 'code', icon: CodeIcon },
]

function useAxnEditor() {
  return useBlockNoteEditor<
    typeof editorSchema.blockSchema,
    typeof editorSchema.inlineContentSchema,
    typeof editorSchema.styleSchema
  >()
}

/** Uma fileira de cores (texto ou fundo) com as amostras da paleta do menu do bloco (2c-1). */
function ColorRow({ prop }: { prop: 'textColor' | 'backgroundColor' }) {
  const editor = useAxnEditor()
  const active = useActiveStyles(editor)[prop] ?? 'default'
  const dictionary = editor.dictionary.color_picker
  const title = prop === 'textColor' ? dictionary.text_title : dictionary.background_title
  return (
    <div role="group" aria-label={title} className="axn-touch-row">
      <span aria-hidden="true" className="axn-touch-row-label">
        {title}
      </span>
      {BLOCK_COLORS.map((color) => {
        const name =
          color === 'default' ? t('editor.blockMenu.defaultColor') : dictionary.colors[color]
        return (
          <BarButton
            key={color}
            label={`${title} ${name}`}
            pressed={active === color}
            onClick={() => {
              if (color === 'default') editor.removeStyles({ [prop]: active })
              else editor.addStyles({ [prop]: color })
            }}
          >
            <span aria-hidden="true" className="axn-swatch" data-prop={prop} data-color={color}>
              A
            </span>
          </BarButton>
        )
      })}
    </div>
  )
}

/**
 * Painel "Aa" do toque, não modal, em cima da barra (o teclado continua aberto): negrito, itálico,
 * sublinhado, riscado, código, link (o mesmo botão da barra de formatação do desktop; o endereço passa
 * pelo `isSafeLink` ao desenhar) e as cores do texto selecionado.
 */
export function TouchFormatPanel() {
  const editor = useAxnEditor()
  const styles = useActiveStyles(editor)
  const labels = editor.dictionary.formatting_toolbar
  return (
    <div role="group" aria-label={t('editor.touch.formatPanel')} className="axn-touch-panel">
      <div className="axn-touch-row">
        {BASIC_STYLES.map(({ style, icon }) => (
          <BarButton
            key={style}
            label={labels[style].tooltip}
            icon={icon}
            pressed={styles[style] === true}
            onClick={() => {
              editor.toggleStyles({ [style]: true })
            }}
          />
        ))}
        <CreateLinkButton />
      </div>
      <ColorRow prop="textColor" />
      <ColorRow prop="backgroundColor" />
    </div>
  )
}
