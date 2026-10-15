/**
 * Error rates in theory.
 *
 * Square QAM is two independent PAM signals (I and Q) with the same noise, so
 * it is enough to work out one axis exactly: for each sent level, the chance
 * the noise carries it into each decision region, times how many bits that
 * mistake flips under Gray coding.
 *
 *     P(decide j | sent a) = Q((t_low − a)/σ) − Q((t_high − a)/σ)
 */

import { linearToDb, noiseSigma } from './channel'
import { bitDifference, constellation, grayEncode, thresholds, type Scheme } from './constellation'

/** Complementary error function (Numerical Recipes, relative error < 1.2·10⁻⁷). */
export function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  return x >= 0 ? r : 2 - r
}

/** Q(x): the chance a standard normal sample is larger than x. */
export function qFunction(x: number): number {
  return 0.5 * erfc(x / Math.SQRT2)
}

function axisErrors(scheme: Scheme, snrDb: number) {
  const c = constellation(scheme)
  const sigma = noiseSigma(snrDb)
  const lines = [-Infinity, ...thresholds(c), Infinity]
  const bitsPerAxis = Math.log2(c.levels)
  let bitErrors = 0
  let symbolErrors = 0
  for (let sent = 0; sent < c.levels; sent++) {
    const a = (2 * sent - (c.levels - 1)) * c.scale
    for (let got = 0; got < c.levels; got++) {
      const p = qFunction((lines[got] - a) / sigma) - qFunction((lines[got + 1] - a) / sigma)
      if (got !== sent) {
        symbolErrors += p
        bitErrors += p * bitDifference(grayEncode(sent), grayEncode(got))
      }
    }
  }
  return { ber: bitErrors / (c.levels * bitsPerAxis), ser: symbolErrors / c.levels }
}

/** Exact bit error rate with Gray coding over AWGN. */
export function bitErrorRate(scheme: Scheme, snrDb: number): number {
  return axisErrors(scheme, snrDb).ber
}

/** Exact symbol error rate over AWGN. */
export function symbolErrorRate(scheme: Scheme, snrDb: number): number {
  const p = axisErrors(scheme, snrDb).ser
  return scheme === 'BPSK' ? p : 1 - (1 - p) ** 2
}

/** Energy per bit over N₀: the SNR shared out among the bits of one symbol. */
export function ebN0Db(scheme: Scheme, snrDb: number): number {
  return snrDb - linearToDb(constellation(scheme).bitsPerSymbol)
}

/** Shannon's limit: the most bits per second per hertz any scheme could carry error-free. */
export function shannonCapacity(snrDb: number): number {
  return Math.log2(1 + 10 ** (snrDb / 10))
}

/** The SNR (dB) at which `scheme` reaches the target bit error rate. */
export function snrForBer(scheme: Scheme, target: number): number {
  let low = -20
  let high = 80
  for (let n = 0; n < 60; n++) {
    const mid = (low + high) / 2
    if (bitErrorRate(scheme, mid) > target) low = mid
    else high = mid
  }
  return (low + high) / 2
}
