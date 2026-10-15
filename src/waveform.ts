/**
 * From symbols to a waveform on air, and back.
 *
 * Each symbol lasts `samplesPerSymbol` samples and holds a whole number of
 * carrier cycles. The receiver multiplies by cos and −sin and averages over the
 * symbol ("integrate and dump"): because cos·sin averages to zero over whole
 * cycles, the two halves come apart again and (I, Q) falls out.
 */

import { dbToLinear } from './channel'
import type { IQ } from './constellation'
import { gaussian, type Random } from './random'

export interface PassbandOptions {
  samplesPerSymbol: number
  cyclesPerSymbol: number
}

export const DEFAULT_PASSBAND: PassbandOptions = { samplesPerSymbol: 32, cyclesPerSymbol: 2 }

const carrierPhase = (n: number, { samplesPerSymbol, cyclesPerSymbol }: PassbandOptions) =>
  (2 * Math.PI * cyclesPerSymbol * n) / samplesPerSymbol

/** s[n] = I·cos(θ) − Q·sin(θ), symbol after symbol. */
export function modulate(points: readonly IQ[], options = DEFAULT_PASSBAND): Float64Array {
  const sps = options.samplesPerSymbol
  const out = new Float64Array(points.length * sps)
  for (let s = 0; s < points.length; s++) {
    for (let n = 0; n < sps; n++) {
      const theta = carrierPhase(n, options)
      out[s * sps + n] = points[s].i * Math.cos(theta) - points[s].q * Math.sin(theta)
    }
  }
  return out
}

/** Integrate and dump: recover one (I, Q) per symbol. */
export function demodulate(signal: ArrayLike<number>, options = DEFAULT_PASSBAND): IQ[] {
  const sps = options.samplesPerSymbol
  const points: IQ[] = []
  for (let start = 0; start + sps <= signal.length; start += sps) {
    let i = 0
    let q = 0
    for (let n = 0; n < sps; n++) {
      const theta = carrierPhase(n, options)
      i += signal[start + n] * Math.cos(theta)
      q -= signal[start + n] * Math.sin(theta)
    }
    points.push({ i: (2 * i) / sps, q: (2 * q) / sps })
  }
  return points
}

/**
 * Per-sample noise for a given SNR. Integrating over a symbol averages noise
 * down: with σ² = sps / (4·SNR) the recovered (I, Q) gets exactly the per-axis
 * variance 1/(2·SNR) the constellation view uses.
 */
export function passbandNoiseSigma(snrDb: number, samplesPerSymbol: number): number {
  return Math.sqrt(samplesPerSymbol / (4 * dbToLinear(snrDb)))
}

export function addSignalNoise(signal: ArrayLike<number>, sigma: number, random: Random): Float64Array {
  return Float64Array.from(signal, (x) => x + sigma * gaussian(random))
}

/** The three oldest ways to send bits on a carrier. */
export type Keying = 'ASK' | 'FSK' | 'PSK'

/**
 * ASK: carrier on for 1, off for 0. FSK: twice the frequency for 1.
 * PSK: the carrier flipped upside down (180°) for 0.
 */
export function keyed(bits: readonly number[], keying: Keying, options = DEFAULT_PASSBAND): Float64Array {
  const { samplesPerSymbol: sps, cyclesPerSymbol: cps } = options
  const out = new Float64Array(bits.length * sps)
  let phase = 0
  for (let b = 0; b < bits.length; b++) {
    const bit = bits[b]
    for (let n = 0; n < sps; n++) {
      const theta = carrierPhase(n, options)
      let value: number
      if (keying === 'ASK') value = bit ? Math.cos(theta) : 0
      else if (keying === 'PSK') value = bit ? Math.cos(theta) : -Math.cos(theta)
      else {
        // Phase-continuous FSK: integrate the frequency so the wave never jumps.
        value = Math.cos(phase)
        phase += (2 * Math.PI * cps * (bit ? 2 : 1)) / sps
      }
      out[b * sps + n] = value
    }
  }
  return out
}
