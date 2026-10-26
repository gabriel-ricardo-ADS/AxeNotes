import { useEffect } from 'react'
import { parseBlockHash, revealBlock } from '@/features/editor/block-link'
import type { AxnEditor } from '@/features/editor/schema'

/** Quanto tempo esperar o bloco do link chegar (do aparelho ou do servidor) antes de desistir. */
const WAIT_FOR_BLOCK_MS = 5000

/**
 * Abriu `/p/:id#bloco-<id>` (ou o hash mudou na mesma página): rola até o bloco e o destaca. Se o bloco
 * ainda não está no documento (página aberta num aparelho novo, o conteúdo vem do servidor), espera as
 * mudanças do editor por até 5 s.
 */
export function useRevealBlock(editor: AxnEditor, hash: string) {
  useEffect(() => {
    const blockId = parseBlockHash(hash)
    if (blockId === null) return

    const tryReveal = () => {
      const root = editor.domElement
      return root !== undefined && revealBlock(root, blockId)
    }
    // Um quadro depois: o BlockNote termina de desenhar os blocos.
    let stop: (() => void) | undefined
    let timer: number | undefined
    const frame = window.requestAnimationFrame(() => {
      if (tryReveal()) return
      const unsubscribe = editor.onChange(() => {
        if (tryReveal()) finish()
      })
      timer = window.setTimeout(finish, WAIT_FOR_BLOCK_MS)
      stop = unsubscribe
    })
    function finish() {
      stop?.()
      stop = undefined
      window.clearTimeout(timer)
    }
    return () => {
      window.cancelAnimationFrame(frame)
      finish()
    }
  }, [editor, hash])
}
