import { fromBase64, toBase64 } from '@/features/sync/base64'

describe('base64', () => {
  it('ida e volta com todos os bytes e com blocos maiores que o pedaço interno', () => {
    const all = Uint8Array.from({ length: 256 }, (_, index) => index)
    expect(fromBase64(toBase64(all))).toEqual(all)
    const big = Uint8Array.from({ length: 200_000 }, (_, index) => (index * 31) % 256)
    expect(fromBase64(toBase64(big))).toEqual(big)
    expect(toBase64(new Uint8Array([1]))).toBe('AQ==')
  })
})
