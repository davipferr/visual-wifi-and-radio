/**
 * The channel: additive white Gaussian noise (AWGN).
 *
 * Every received point is the sent point plus a random nudge, independent on I
 * and Q. With average symbol energy Es = 1 and SNR = Es/N₀, each axis gets a
 * normal nudge with variance σ² = N₀/2 = 1/(2·SNR).
 */

import { bitDifference, constellation, slice, symbolsToBits, bitsToSymbols, type IQ, type Scheme } from './constellation'
import { gaussian, type Random } from './random'

export const dbToLinear = (db: number) => 10 ** (db / 10)
export const linearToDb = (value: number) => 10 * Math.log10(value)

/** Noise standard deviation per axis for a given SNR (Es/N₀) in dB. */
export function noiseSigma(snrDb: number): number {
  return Math.sqrt(1 / (2 * dbToLinear(snrDb)))
}

export function addNoise(point: IQ, sigma: number, random: Random): IQ {
  return { i: point.i + sigma * gaussian(random), q: point.q + sigma * gaussian(random) }
}

export interface Transmission {
  scheme: Scheme
  bits: number[]
  symbols: number[]
  sent: IQ[]
  received: IQ[]
  decided: number[]
  /** Same length as `bits` (padding dropped). */
  receivedBits: number[]
  bitErrors: number
  symbolErrors: number
}

/** Send bits through the noisy channel and decide what arrived. */
export function transmit(bits: number[], scheme: Scheme, snrDb: number, random: Random): Transmission {
  const c = constellation(scheme)
  const sigma = noiseSigma(snrDb)
  const symbols = bitsToSymbols(bits, c)
  const sent = symbols.map((symbol) => c.points[symbol])
  const received = sent.map((point) => addNoise(point, sigma, random))
  const decided = received.map((point) => slice(point, c))
  const receivedBits = symbolsToBits(decided, c).slice(0, bits.length)
  let bitErrors = 0
  for (let b = 0; b < bits.length; b++) if (bits[b] !== receivedBits[b]) bitErrors++
  const symbolErrors = decided.filter((symbol, n) => symbol !== symbols[n]).length
  return { scheme, bits, symbols, sent, received, decided, receivedBits, bitErrors, symbolErrors }
}

/** Monte Carlo bit error rate: send random symbols until about `bitCount` bits have gone through. */
export function measureBer(scheme: Scheme, snrDb: number, bitCount: number, random: Random) {
  const c = constellation(scheme)
  const sigma = noiseSigma(snrDb)
  const symbols = Math.ceil(bitCount / c.bitsPerSymbol)
  let errors = 0
  for (let n = 0; n < symbols; n++) {
    const symbol = Math.floor(random() * c.order)
    const decided = slice(addNoise(c.points[symbol], sigma, random), c)
    errors += bitDifference(symbol, decided)
  }
  const bits = symbols * c.bitsPerSymbol
  return { bits, errors, ber: errors / bits }
}
