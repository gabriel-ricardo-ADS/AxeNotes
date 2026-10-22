/** Pedaço por chamada de `String.fromCharCode` (muitos argumentos estouram a pilha). */
const CHUNK = 0x8000

/** Bytes → base64 (o formato dos updates Yjs no fio; o servidor guarda `bytea`). */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK))
  }
  return btoa(binary)
}

/** base64 → bytes. Lança se o texto não for base64. */
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
