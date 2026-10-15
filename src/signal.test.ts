import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LINK,
  amDemodulate,
  amModulate,
  channelNoiseSigma,
  fmDemodulate,
  fmModulate,
  messageBandwidth,
  messageSignal,
  outputSnrDb,
} from './analog'
import { bitsToBytes, printable, repeatDecode, repeatEncode, textToBits } from './bits'
import { constellation } from './constellation'
import { amplitudeSpectrum, lowpass } from './fft'
import { createRandom } from './random'
import { addSignalNoise, demodulate, keyed, modulate, passbandNoiseSigma } from './waveform'
import { bestMcs, linkSnrDb } from './wifi'

describe('FFT', () => {
  it('finds a cosine at its frequency and amplitude', () => {
    const n = 256
    const signal = Float64Array.from({ length: n }, (_, k) => 0.7 * Math.cos((2 * Math.PI * 9 * k) / n))
    const spectrum = amplitudeSpectrum(signal)
    expect(spectrum[9]).toBeCloseTo(0.7, 10)
    expect(spectrum[10]).toBeCloseTo(0, 10)
  })

  it('lowpass removes only what is above the cutoff', () => {
    const n = 256
    const low = (k: number) => Math.cos((2 * Math.PI * 3 * k) / n)
    const mixed = Float64Array.from({ length: n }, (_, k) => low(k) + Math.sin((2 * Math.PI * 40 * k) / n))
    const filtered = lowpass(mixed, 10)
    filtered.forEach((x, k) => expect(x).toBeCloseTo(low(k), 10))
  })
})

describe('digital passband', () => {
  it('demodulates exactly what was modulated', () => {
    const points = constellation('16-QAM').points
    const back = demodulate(modulate(points))
    back.forEach((p, k) => {
      expect(p.i).toBeCloseTo(points[k].i, 10)
      expect(p.q).toBeCloseTo(points[k].q, 10)
    })
  })

  it('noise per sample turns into the per-axis noise of the constellation view', () => {
    const random = createRandom(5)
    const sps = 32
    const zeros = new Float64Array(sps * 20_000)
    const noisy = demodulate(addSignalNoise(zeros, passbandNoiseSigma(10, sps), random))
    const variance = noisy.reduce((sum, p) => sum + p.i ** 2, 0) / noisy.length
    expect(variance).toBeCloseTo(1 / (2 * 10), 2)
  })

  it('keys bits onto a carrier', () => {
    const ask = keyed([1, 0], 'ASK')
    expect(ask[0]).toBeCloseTo(1)
    expect(ask[40]).toBe(0)
    const psk = keyed([1, 0], 'PSK')
    expect(psk[32]).toBeCloseTo(-1)
  })
})

describe('analog radio', () => {
  const m = messageSignal('voice', 3)
  const audio = messageBandwidth('voice', 3)

  it('messages peak at ±1', () => {
    expect(Math.max(...m.map(Math.abs))).toBeCloseTo(1)
  })

  it('AM and FM recover the message on a clean channel', () => {
    expect(outputSnrDb(m, amDemodulate(amModulate(m, 0.8), 0.8, audio))).toBeGreaterThan(40)
    expect(outputSnrDb(m, fmDemodulate(fmModulate(m, 6), 6, audio))).toBeGreaterThan(25)
  })

  it('AM overmodulation distorts the envelope', () => {
    const tone = messageSignal('tone', 2)
    expect(outputSnrDb(tone, amDemodulate(amModulate(tone, 1.5), 1.5, 2))).toBeLessThan(20)
  })

  it('wide FM beats AM at good SNR, and falls apart at poor SNR', () => {
    const tone = messageSignal('tone', 2)
    const run = (snrDb: number) => {
      const random = createRandom(11)
      const sigma = channelNoiseSigma(snrDb)
      const am = amDemodulate(addSignalNoise(amModulate(tone, 1), sigma, random), 1, 2)
      const fm = fmDemodulate(addSignalNoise(fmModulate(tone, 8), sigma, random), 8, 2)
      return { am: outputSnrDb(tone, am), fm: outputSnrDb(tone, fm) }
    }
    const good = run(25)
    expect(good.fm).toBeGreaterThan(good.am + 6)
    const poor = run(-2)
    expect(poor.fm).toBeLessThan(good.fm - 20)
  })

  it('uses a power-of-two window', () => {
    expect(Math.log2(DEFAULT_LINK.samples) % 1).toBe(0)
  })
})

describe('bits', () => {
  it('turns text into bits and back', () => {
    const bits = textToBits('Hi!')
    expect(bits.slice(0, 8)).toEqual([0, 1, 0, 0, 1, 0, 0, 0])
    expect(bitsToBytes(bits).map(printable).join('')).toBe('Hi!')
  })

  it('repetition code fixes a single flip per group', () => {
    const coded = repeatEncode([1, 0, 1], 3)
    coded[1] = 0
    coded[5] = 1
    expect(repeatDecode(coded, 3)).toEqual([1, 0, 1])
  })
})

describe('Wi-Fi', () => {
  it('slows down with distance and walls', () => {
    const near = linkSnrDb({ band: '5 GHz', distance: 2, walls: 0 })
    const far = linkSnrDb({ band: '5 GHz', distance: 40, walls: 2 })
    expect(bestMcs(near)!.index).toBe(11)
    expect(bestMcs(far)!.mbps).toBeLessThan(bestMcs(near)!.mbps)
    expect(linkSnrDb({ band: '2.4 GHz', distance: 20, walls: 1 })).toBeGreaterThan(
      linkSnrDb({ band: '5 GHz', distance: 20, walls: 1 }),
    )
    expect(bestMcs(0)).toBeNull()
  })
})
