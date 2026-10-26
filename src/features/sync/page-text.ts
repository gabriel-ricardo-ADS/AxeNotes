import type { Json } from '@/lib/database.types'

/** Limites de `page_texts` no servidor (texto 1 MiB, JSON 256 KiB). */
const PAGE_TEXT_MAX_BYTES = 1024 * 1024
/** Tamanho máximo do JSON das prévias (256 KiB, o limite de `set_page_text`). */
export const PAGE_JSON_MAX_BYTES = 256 * 1024
/** Quantos blocos do topo vão para as prévias. */
export const PREVIEW_BLOCKS = 20

/** O mínimo de um bloco do BlockNote que interessa aqui (o `editor.document`). */
export interface TextBlock {
  content?: unknown
  children?: readonly TextBlock[]
}

/** O que `set_page_text` recebe: texto puro para a busca e os primeiros blocos para prévias. */
export interface PageTextSnapshot {
  text: string
  json: Json | null
}

/**
 * Texto puro de um conteúdo inline do BlockNote: arrays de textos e links, ou o conteúdo de uma
 * tabela (`rows` → `cells`). Formatação e atributos ficam de fora.
 */
function inlineText(content: unknown): string {
  if (Array.isArray(content)) return content.map(inlineText).join('')
  if (typeof content !== 'object' || content === null) return ''
  const node = content as Record<string, unknown>
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.rows)) {
    return node.rows
      .map((row: unknown) => {
        const cells = (row as { cells?: unknown }).cells
        return Array.isArray(cells) ? cells.map(inlineText).join(' ') : ''
      })
      .join('\n')
  }
  return 'content' in node ? inlineText(node.content) : ''
}

/** Uma linha por bloco (filhos em seguida), sem linhas vazias. */
export function blocksToPlainText(blocks: readonly TextBlock[]): string {
  const lines: string[] = []
  const walk = (list: readonly TextBlock[]) => {
    for (const block of list) {
      const line = inlineText(block.content).trim()
      if (line !== '') lines.push(line)
      if (block.children) walk(block.children)
    }
  }
  walk(blocks)
  return lines.join('\n')
}

const encoder = new TextEncoder()
const byteLength = (text: string) => encoder.encode(text).length

/** Corta no limite em bytes UTF-8 sem partir um caractere. */
export function truncateToBytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (byteLength(text.slice(0, middle)) <= maxBytes) low = middle
    else high = middle - 1
  }
  // Não termina no meio de um par substituto (emoji).
  const code = text.charCodeAt(low - 1)
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? low - 1 : low)
}

/** Texto (busca) e primeiros blocos (prévias), já dentro dos limites do servidor. */
export function pageTextSnapshot(blocks: readonly TextBlock[]): PageTextSnapshot {
  const text = truncateToBytes(blocksToPlainText(blocks), PAGE_TEXT_MAX_BYTES)
  for (
    let count = Math.min(blocks.length, PREVIEW_BLOCKS);
    count > 0;
    count = Math.floor(count / 2)
  ) {
    const serialized = JSON.stringify(blocks.slice(0, count))
    if (byteLength(serialized) <= PAGE_JSON_MAX_BYTES) {
      return { text, json: JSON.parse(serialized) as Json }
    }
  }
  return { text, json: null }
}
