import { SideMenuExtension } from '@blocknote/core/extensions'
import {
  AddBlockButton,
  SideMenu,
  useComponentsContext,
  useExtension,
  useExtensionState,
  type SideMenuProps,
} from '@blocknote/react'
import { GripVerticalIcon } from 'lucide-react'
import { useContext } from 'react'
import { OpenBlockMenuContext } from '@/features/editor/block-menu/open-block-menu-context'
import { t } from '@/i18n'

/**
 * A alça ⋮⋮ do AxeNotes: arrasta como a do BlockNote, mas o clique abre o NOSSO menu do bloco (com
 * busca, "Transformar em", "Cor", link do bloco…). O side menu fica congelado enquanto o menu está aberto.
 */
function AxnDragHandle() {
  const Components = useComponentsContext()
  const sideMenu = useExtension(SideMenuExtension)
  const block = useExtensionState(SideMenuExtension, { selector: (state) => state?.block })
  const openBlockMenu = useContext(OpenBlockMenuContext)

  if (!Components || block === undefined) return null
  return (
    <Components.SideMenu.Button
      label={t('editor.blockMenu.handle')}
      draggable
      onDragStart={(event) => {
        sideMenu.blockDragStart(event, block)
      }}
      onDragEnd={() => {
        sideMenu.blockDragEnd()
      }}
      onClick={(event) => {
        sideMenu.freezeMenu()
        openBlockMenu?.(block.id, event.currentTarget as HTMLElement)
      }}
      className="bn-button axn-drag-handle"
      icon={<GripVerticalIcon size={20} aria-hidden="true" />}
    />
  )
}

/** Side menu do editor: "+" (inserir bloco pelo "/") e a alça ⋮⋮ com o menu do AxeNotes. */
export function AxnSideMenu(props: SideMenuProps) {
  return (
    <SideMenu {...props}>
      <AddBlockButton />
      <AxnDragHandle />
    </SideMenu>
  )
}
