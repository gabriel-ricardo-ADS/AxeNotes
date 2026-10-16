import { ptBR } from './pt-BR'

type Messages = typeof ptBR

/** União de todas as chaves "a.b.c" que apontam para um texto em pt-BR. */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>
}[keyof T & string]

export type TranslationKey = Leaves<Messages>

export type TranslationParams = Record<string, string | number>

function lookup(key: string): string | undefined {
  let node: unknown = ptBR
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Traduz uma chave de `src/i18n/pt-BR.ts`, trocando `{nome}` pelos valores de `params`. */
export function t(key: TranslationKey, params?: TranslationParams): string {
  const message = lookup(key)
  if (message === undefined) return key
  if (params === undefined) return message
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name]
    return value === undefined ? placeholder : String(value)
  })
}
