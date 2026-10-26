import { createBlockSpec, defaultProps } from '@blocknote/core'
import { parsePageIcon } from '@/features/workspace/page-icon'
import { t } from '@/i18n'

/** Emoji de um destaque novo (e de um valor que não seja emoji). */
export const CALLOUT_DEFAULT_EMOJI = '💡'

/** Fundo de um destaque novo (pelo "/" ou pelo "Transformar em"). */
export const CALLOUT_DEFAULT_BACKGROUND = 'gray'

/** O emoji gravado só é mostrado se for mesmo um emoji curto (o Y.Doc pode vir de outro membro). */
export function calloutEmoji(value: string): string {
  return parsePageIcon({ type: 'emoji', value })?.value ?? CALLOUT_DEFAULT_EMOJI
}

// Quem abre o seletor de emoji de cada editor (o PageEditor registra; o bloco só pede).
const iconPickers = new WeakMap<object, (blockId: string) => void>()

/** Registra quem abre o seletor de emoji quando o emoji de um destaque é clicado. Devolve o "desregistrar". */
export function handleCalloutIconClicks(
  editor: object,
  open: (blockId: string) => void,
): () => void {
  iconPickers.set(editor, open)
  return () => {
    if (iconPickers.get(editor) === open) iconPickers.delete(editor)
  }
}

/**
 * Bloco "Destaque" (callout): emoji à esquerda e texto rico, com fundo da paleta de etiquetas. A cor
 * usa as props `backgroundColor`/`textColor` do BlockNote, então o menu "Cor" e o CSS delas valem aqui.
 *
 * Desenhado em DOM puro (como os blocos nativos), não em React: no WebKit do iPhone o Enter dentro do
 * texto de um node view React quebrava o conteúdo em vez de criar um bloco novo.
 */
export const createCalloutBlock = createBlockSpec(
  {
    type: 'callout',
    propSchema: {
      emoji: { default: CALLOUT_DEFAULT_EMOJI },
      backgroundColor: defaultProps.backgroundColor,
      textColor: defaultProps.textColor,
    },
    content: 'inline',
  },
  {
    render(block, editor) {
      const dom = document.createElement('div')
      dom.className = 'axn-callout'

      const icon = document.createElement('button')
      icon.type = 'button'
      icon.className = 'axn-callout-icon'
      icon.contentEditable = 'false'
      icon.disabled = !editor.isEditable
      icon.setAttribute('aria-label', t('editor.callout.changeIcon'))
      const emoji = document.createElement('span')
      emoji.setAttribute('aria-hidden', 'true')
      emoji.textContent = calloutEmoji(block.props.emoji)
      icon.appendChild(emoji)
      icon.addEventListener('click', () => {
        if (editor.isEditable) iconPickers.get(editor)?.(block.id)
      })

      const text = document.createElement('div')
      text.className = 'axn-callout-text'

      dom.append(icon, text)
      return { dom, contentDOM: text }
    },
  },
)
