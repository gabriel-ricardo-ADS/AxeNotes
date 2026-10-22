import { z } from 'zod'

/** Ícone de página guardado em `pages.icon` (jsonb, até 2048 bytes). Só emoji por enquanto. */
export const pageIconSchema = z.object({
  type: z.literal('emoji'),
  value: z
    .string()
    .min(1)
    .max(16)
    .refine((value) => /\p{Extended_Pictographic}/u.test(value)),
})

export type PageIcon = z.infer<typeof pageIconSchema>

/** Lê o jsonb do banco; qualquer coisa fora do formato vira "sem ícone" (nunca lança). */
export function parsePageIcon(value: unknown): PageIcon | null {
  const result = pageIconSchema.safeParse(value)
  return result.success ? result.data : null
}

/** Emojis do seletor (conjunto simples, sem biblioteca). */
export const ICON_CHOICES: readonly string[] = [
  '📄',
  '📝',
  '📚',
  '📖',
  '📓',
  '📔',
  '📒',
  '📕',
  '📗',
  '📘',
  '📙',
  '🔖',
  '✨',
  '🌿',
  '🌱',
  '🌸',
  '🌼',
  '🌻',
  '🍀',
  '🍃',
  '🌙',
  '⭐',
  '☀️',
  '🌈',
  '❤️',
  '💜',
  '💙',
  '💚',
  '🧡',
  '💛',
  '🤍',
  '🖤',
  '🎯',
  '🎨',
  '🎵',
  '🎬',
  '🏠',
  '💼',
  '📅',
  '⏰',
  '✅',
  '📌',
  '📎',
  '💡',
  '🔍',
  '🔔',
  '🎁',
  '🎓',
  '☕',
  '🍵',
  '🍰',
  '🍎',
  '🥑',
  '🍓',
  '🧠',
  '💪',
  '🏃',
  '🧘',
  '🐱',
  '🐶',
  '🐰',
  '🦋',
  '🌍',
  '✈️',
  '🚗',
  '💻',
  '📱',
  '🛒',
  '💰',
  '📈',
  '🔥',
  '🎉',
]
