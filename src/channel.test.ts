import { describe, expect, it } from 'vitest'
import { bitErrorRate, erfc, qFunction, shannonCapacity, snrForBer, symbolErrorRate } from './ber'
import { addNoise, measureBer, noiseSigma, transmit } from './channel'
import { SCHEMES } from './constellation'
import { createRandom } from './random'

describe('noise', () => {
  it('has the requested variance per axis', () => {
    const random = createRandom(7)
    const sigma = noiseSigma(10)
    let sum = 0
    const n = 50_000
    for (let k = 0; k < n; k++) sum += addNoise({ i: 0, q: 0 }, sigma, random).i ** 2
    expect(sum / n).toBeCloseTo(sigma ** 2, 3)
    expect(sigma ** 2).toBeCloseTo(0.05)
  })

  it('leaves a clean channel error-free', () => {
    const bits = Array.from({ length: 400 }, (_, n) => (n % 3) & 1)
    const result = transmit(bits, '64-QAM', 60, createRandom(1))
    expect(result.bitErrors).toBe(0)
    expect(result.receivedBits).toEqual(bits)
  })
})

describe('theory', () => {
  it('erfc and Q match known values', () => {
    expect(erfc(0)).toBeCloseTo(1, 6)
    expect(erfc(1)).toBeCloseTo(0.157299207, 6)
    expect(qFunction(3)).toBeCloseTo(0.0013499, 6)
  })

  it('BPSK and QPSK follow the textbook formulas', () => {
    for (const snrDb of [0, 5, 10]) {
      const snr = 10 ** (snrDb / 10)
      expect(bitErrorRate('BPSK', snrDb)).toBeCloseTo(qFunction(Math.sqrt(2 * snr)), 8)
      expect(bitErrorRate('QPSK', snrDb)).toBeCloseTo(qFunction(Math.sqrt(snr)), 8)
    }
  })

  it('denser constellations need more SNR', () => {
    const needed = SCHEMES.map((scheme) => snrForBer(scheme, 1e-5))
    for (let k = 1; k < needed.length; k++) expect(needed[k]).toBeGreaterThan(needed[k - 1])
    expect(needed[0]).toBeCloseTo(9.6, 1) // the classic BPSK number
  })

  it('tends to coin-flipping at very low SNR', () => {
    expect(bitErrorRate('QPSK', -40)).toBeCloseTo(0.5, 2)
    expect(symbolErrorRate('16-QAM', -40)).toBeCloseTo(15 / 16, 2)
  })

  it('agrees with simulation', () => {
    const random = createRandom(3)
    for (const scheme of SCHEMES) {
      const snrDb = snrForBer(scheme, 1e-2)
      const { ber } = measureBer(scheme, snrDb, 200_000, random)
      expect(ber).toBeGreaterThan(0.008)
      expect(ber).toBeLessThan(0.012)
    }
  })

  it('Shannon capacity is log2(1 + SNR)', () => {
    expect(shannonCapacity(0)).toBeCloseTo(1)
    expect(shannonCapacity(30)).toBeCloseTo(Math.log2(1001))
  })
})
