/**
 * Dono dos dados locais (bancos `axenotes-page-*` e `axenotes-sync`): o id do usuário que os gravou,
 * num marcador de nome fixo no localStorage. É síncrono de propósito: o callback do
 * `onAuthStateChange` não pode esperar o IndexedDB para decidir se apaga os dados de outra conta.
 *
 * Fecha a troca de conta sem `SIGNED_OUT` no meio (a sessão de A expira com o app fechado e B entra):
 * o `AuthProvider` vê que o dono gravado não é quem entrou e roda `resetClientState` antes de liberar
 * o app; o reenvio em segundo plano só envia quando o dono é o usuário da sessão (o JWT do envio).
 * Sem localStorage (bloqueado), não há dono: o segundo plano não envia nada (só a página aberta).
 */
export const LOCAL_DATA_OWNER_KEY = 'axenotes-local-owner'

/** Id do dono gravado dos dados locais; `null` se não há (ou se não há localStorage). */
export function readLocalDataOwner(): string | null {
  try {
    return localStorage.getItem(LOCAL_DATA_OWNER_KEY)
  } catch {
    return null
  }
}

/**
 * Marca os dados locais como do usuário. Não toma dados de outra conta: se o dono gravado é outro
 * (a limpeza falhou), mantém o marcador e devolve `false`. Sem localStorage devolve `true` (não há
 * dono de outra conta; o segundo plano é que fica sem enviar).
 */
export function claimLocalData(userId: string): boolean {
  const owner = readLocalDataOwner()
  if (owner !== null) return owner === userId
  try {
    localStorage.setItem(LOCAL_DATA_OWNER_KEY, userId)
  } catch {
    // Sem localStorage: segue sem dono.
  }
  return true
}

/** Esquece o dono. Só depois de apagar o IndexedDB: antes disso, os dados ainda são de alguém. */
export function clearLocalDataOwner(): void {
  try {
    localStorage.removeItem(LOCAL_DATA_OWNER_KEY)
  } catch {
    // Sem localStorage não há marcador para apagar.
  }
}

/** Os dados locais são deste usuário? Dono desconhecido conta como "não". */
export function localDataBelongsTo(userId: string | null): boolean {
  return userId !== null && readLocalDataOwner() === userId
}
