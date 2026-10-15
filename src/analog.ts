/**
 * Analog radio: AM and FM.
 *
 * Everything happens in one window of `samples` samples that repeats forever,
 * with frequencies counted in cycles per window. The carrier sits at
 * `carrier` cycles; the channel lets through `bandwidth` cycles either side.
 *
 *     AM:  s(t) = (1 + μ·m(t)) · cos(2π f_c t)
 *     FM:  s(t) = cos(2π f_c t + 2π Δf ∫ m(t) dt)
 *
 * The receiver mixes the signal down to (I, Q) around the carrier, filters to
 * the channel, then reads the message from the length of (I, Q) (AM: the
 * envelope) or from how fast it turns (FM: the instantaneous frequency).
 */

import { dbToLinear } from './channel'
import { lowpass } from './fft'

export interface AnalogLink {
  samples: number
  carrier: number
  bandwidth: number
}

export const DEFAULT_LINK: AnalogLink = { samples: 2048, carrier: 32, bandwidth: 20 }

export type MessageShape = 'tone' | 'chord' | 'voice'

const harmonics: Record<MessageShape, [multiple: number, amplitude: number, phase: number][]> = {
  tone: [[1, 1, 0]],
  chord: [
    [1, 1, 0],
    [2, 0.6, 1.1],
  ],
  voice: [
    [1, 1, 0],
    [2, 0.55, 2.1],
    [3, 0.4, 0.7],
  ],
}

/** The highest frequency in a message, in cycles per window. */
export function messageBandwidth(shape: MessageShape, frequency: number): number {
  return frequency * Math.max(...harmonics[shape].map(([multiple]) => multiple))
}

/** A zero-mean message scaled to peak at exactly ±1. */
export function messageSignal(shape: MessageShape, frequency: number, samples = DEFAULT_LINK.samples): Float64Array {
  const out = new Float64Array(samples)
  for (let n = 0; n < samples; n++) {
    const t = n / samples
    for (const [multiple, amplitude, phase] of harmonics[shape]) {
      out[n] += amplitude * Math.cos(2 * Math.PI * multiple * frequency * t + phase)
    }
  }
  let peak = 0
  for (const x of out) peak = Math.max(peak, Math.abs(x))
  for (let n = 0; n < samples; n++) out[n] /= peak
  return out
}

export function amModulate(message: ArrayLike<number>, depth: number, link = DEFAULT_LINK): Float64Array {
  return Float64Array.from(
    { length: link.samples },
    (_, n) => (1 + depth * message[n]) * Math.cos((2 * Math.PI * link.carrier * n) / link.samples),
  )
}

/** `deviation` is how far (in cycles per window) a full-scale message pushes the frequency. */
export function fmModulate(message: ArrayLike<number>, deviation: number, link = DEFAULT_LINK): Float64Array {
  const out = new Float64Array(link.samples)
  let phase = 0
  for (let n = 0; n < link.samples; n++) {
    out[n] = Math.cos(phase)
    phase += (2 * Math.PI * (link.carrier + deviation * message[n])) / link.samples
  }
  return out
}

/**
 * Per-sample noise for a channel SNR, measured inside the channel bandwidth
 * (carrier power against the noise the receiver filter lets in).
 */
export function channelNoiseSigma(snrDb: number, link = DEFAULT_LINK): number {
  return Math.sqrt(link.samples / (4 * (2 * link.bandwidth + 1) * dbToLinear(snrDb)))
}

/** Mix down to (I, Q) around the carrier and keep only the channel. */
export function downconvert(signal: ArrayLike<number>, link = DEFAULT_LINK) {
  const i = new Float64Array(link.samples)
  const q = new Float64Array(link.samples)
  for (let n = 0; n < link.samples; n++) {
    const theta = (2 * Math.PI * link.carrier * n) / link.samples
    i[n] = 2 * signal[n] * Math.cos(theta)
    q[n] = -2 * signal[n] * Math.sin(theta)
  }
  return { i: lowpass(i, link.bandwidth), q: lowpass(q, link.bandwidth) }
}

/** Envelope detector: the length of (I, Q), DC removed, scaled back by the depth. */
export function amDemodulate(
  signal: ArrayLike<number>,
  depth: number,
  audioBandwidth: number,
  link = DEFAULT_LINK,
): Float64Array {
  const { i, q } = downconvert(signal, link)
  const envelope = Float64Array.from(i, (x, n) => Math.hypot(x, q[n]))
  let mean = 0
  for (const x of envelope) mean += x / envelope.length
  const audio = envelope.map((x) => (depth > 0 ? (x - mean) / depth : 0))
  return lowpass(audio, audioBandwidth)
}

/** Frequency discriminator: how fast (I, Q) turns, sample to sample. */
export function fmDemodulate(
  signal: ArrayLike<number>,
  deviation: number,
  audioBandwidth: number,
  link = DEFAULT_LINK,
): Float64Array {
  const { i, q } = downconvert(signal, link)
  const n = link.samples
  const audio = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    // The turn from sample k to k + 1 is what the message at sample k produced.
    const next = (k + 1) % n
    const turn = Math.atan2(q[next] * i[k] - i[next] * q[k], i[next] * i[k] + q[next] * q[k])
    audio[k] = deviation > 0 ? (turn * n) / (2 * Math.PI) / deviation : 0
  }
  return lowpass(audio, audioBandwidth)
}

/** How clean the recovered message is: message power over error power, in dB. */
export function outputSnrDb(reference: ArrayLike<number>, received: ArrayLike<number>): number {
  let signal = 0
  let error = 0
  for (let n = 0; n < reference.length; n++) {
    signal += reference[n] ** 2
    error += (reference[n] - received[n]) ** 2
  }
  return 10 * Math.log10(signal / Math.max(error, 1e-30))
}
