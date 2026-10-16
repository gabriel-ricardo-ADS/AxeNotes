import { generateKeyBetween } from 'fractional-indexing'

/**
 * Chave de ordem (índice fracionário) entre duas chaves vizinhas; `null` é o começo/fim da lista.
 * O alfabeto da biblioteca (A-Z, a-z, 0-9) está em ordem ASCII, a mesma do `collate "C"` da coluna
 * `pages.sort_key`: compare chaves sempre com `<`, nunca com `localeCompare`.
 *
 * Se duas abas gerarem a mesma chave, os vizinhos podem chegar iguais e a biblioteca recusa o par.
 * Nesse caso não se perde o movimento: a página vai logo depois de `before`.
 */
export function keyBetween(before: string | null, after: string | null): string {
  try {
    return generateKeyBetween(before, after)
  } catch {
    return generateKeyBetween(before, null)
  }
}

/** Chave para inserir na posição `index` de uma lista já ordenada de chaves (0 = no começo). */
export function keyAtIndex(keys: readonly string[], index: number): string {
  const at = Math.min(Math.max(index, 0), keys.length)
  return keyBetween(keys[at - 1] ?? null, keys[at] ?? null)
}
