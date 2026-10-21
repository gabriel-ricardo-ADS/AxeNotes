// Leitor MÍNIMO do public/_headers do Cloudflare Pages, para o `pnpm preview` servir os mesmos
// headers da produção. Aceita só o que o arquivo usa: comentários (#), linhas em branco, a regra
// `/*` e linhas `Nome: valor` indentadas abaixo dela. Qualquer outra coisa é erro, para o preview
// nunca divergir em silêncio do que o Cloudflare aplica.

export function parseHeadersFile(source: string): Record<string, string> {
  const headers: Record<string, string> = {}
  let inRule = false

  for (const [index, raw] of source.split('\n').entries()) {
    const line = raw.replace(/\r$/, '')
    const where = `public/_headers:${String(index + 1)}`
    if (line.trim() === '' || line.trim().startsWith('#')) continue

    if (!/^\s/.test(line)) {
      if (line !== '/*' || inRule) {
        throw new Error(`${where}: só uma regra, exatamente "/*", é suportada (achei "${line}")`)
      }
      inRule = true
      continue
    }

    if (!inRule) throw new Error(`${where}: header fora da regra "/*"`)
    const match = /^\s+([A-Za-z0-9-]+):\s*(\S.*)$/.exec(line)
    if (!match) throw new Error(`${where}: linha de header inválida (use "  Nome: valor")`)
    const [, name = '', value = ''] = match
    const key = name.toLowerCase()
    if (Object.keys(headers).some((existing) => existing.toLowerCase() === key)) {
      throw new Error(`${where}: header repetido "${name}"`)
    }
    headers[name] = value.trim()
  }

  if (!inRule || Object.keys(headers).length === 0) {
    throw new Error('public/_headers: falta a regra "/*" com pelo menos um header')
  }
  return headers
}
