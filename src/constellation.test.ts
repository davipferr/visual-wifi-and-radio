import { describe, expect, it } from 'vitest'
import {
  SCHEMES,
  bitDifference,
  bitsToSymbols,
  constellation,
  grayDecode,
  grayEncode,
  slice,
  symbolsToBits,
} from './constellation'

describe('Gray code', () => {
  it('round-trips and changes one bit per step', () => {
    for (let n = 0; n < 64; n++) {
      expect(grayDecode(grayEncode(n))).toBe(n)
      expect(bitDifference(grayEncode(n), grayEncode(n + 1))).toBe(1)
    }
  })
})

describe.each(SCHEMES)('%s', (scheme) => {
  const c = constellation(scheme)

  it('has unit average energy', () => {
    const energy = c.points.reduce((sum, p) => sum + p.i ** 2 + p.q ** 2, 0) / c.order
    expect(energy).toBeCloseTo(1, 10)
  })

  it('decides every clean point correctly', () => {
    c.points.forEach((point, symbol) => expect(slice(point, c)).toBe(symbol))
  })

  it('puts points one bit apart from their nearest neighbours', () => {
    const spacing = 2 * c.scale
    c.points.forEach((a, s) => {
      c.points.forEach((b, t) => {
        if (Math.abs(Math.hypot(a.i - b.i, a.q - b.q) - spacing) < 1e-9) expect(bitDifference(s, t)).toBe(1)
      })
    })
  })

  it('maps bits to symbols and back', () => {
    const bits = Array.from({ length: c.bitsPerSymbol * 5 }, (_, n) => (n * 7) % 3 === 0 ? 1 : 0)
    expect(symbolsToBits(bitsToSymbols(bits, c), c)).toEqual(bits)
  })
})

it('slices noisy points to the nearest one, clamping the outer ring', () => {
  const c = constellation('16-QAM')
  const corner = c.points[0]
  expect(slice({ i: corner.i * 3, q: corner.q * 3 }, c)).toBe(0)
  expect(slice({ i: corner.i + 0.9 * c.scale, q: corner.q }, c)).toBe(0)
})
