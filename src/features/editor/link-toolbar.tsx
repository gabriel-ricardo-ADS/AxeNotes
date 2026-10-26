import {
  DeleteLinkButton,
  EditLinkButton,
  LinkToolbar,
  useComponentsContext,
  useDictionary,
  type LinkToolbarProps,
} from '@blocknote/react'
import { ExternalLinkIcon } from 'lucide-react'
import { isSafeLink, openSafeLink } from '@/features/editor/safe-links'

/**
 * Barra do link (editar, abrir, remover) com o "Abrir" seguro: só http, https e mailto, e sempre com
 * `noopener` (o botão padrão do BlockNote abre sem ele e aceita outros protocolos).
 */
export function AxnLinkToolbar(props: LinkToolbarProps) {
  const Components = useComponentsContext()
  const dict = useDictionary()
  return (
    <LinkToolbar {...props}>
      <EditLinkButton
        url={props.url}
        text={props.text}
        range={props.range}
        {...(props.setToolbarOpen && { setToolbarOpen: props.setToolbarOpen })}
        {...(props.setToolbarPositionFrozen && {
          setToolbarPositionFrozen: props.setToolbarPositionFrozen,
        })}
      />
      {Components && isSafeLink(props.url) ? (
        <Components.LinkToolbar.Button
          className="bn-button"
          mainTooltip={dict.link_toolbar.open.tooltip}
          label={dict.link_toolbar.open.tooltip}
          isSelected={false}
          onClick={() => {
            openSafeLink(props.url)
          }}
          icon={<ExternalLinkIcon size={16} aria-hidden="true" />}
        />
      ) : null}
      <DeleteLinkButton
        range={props.range}
        {...(props.setToolbarOpen && { setToolbarOpen: props.setToolbarOpen })}
      />
    </LinkToolbar>
  )
}
