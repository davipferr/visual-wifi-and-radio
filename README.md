# Wi-Fi and radio, visually

How Wi-Fi and radio work: modulation (AM, FM, QAM) drawn as waveforms and constellations. Add
noise and watch the bit errors appear.

A small TypeScript signal-processing library (no DSP dependencies: the FFT, modulators,
demodulators, noise and error-rate maths are written by hand) plus an interactive React 19
playground built on `<canvas>`.

```ts
import { createRandom, textToBits, transmit, bitErrorRate } from 'visual-wifi-and-radio'

const result = transmit(textToBits('Hello'), '64-QAM', 18, createRandom(1))
result.bitErrors // bits flipped by the noise
bitErrorRate('64-QAM', 18) // what theory predicts (exact, Gray-coded, AWGN)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | The interactive playground (see below) |
| `npm test` | Vitest: constellations, noise, error rates, FFT, AM/FM, passband modem, Wi-Fi |
| `npm run build` | Library build (ESM + CJS + `.d.ts`) into `dist/` |
| `npm run build:playground` | Static playground build into `dist-playground/` |
| `npm run typecheck` | `tsc --noEmit` over library and playground |

## Playground

`npm run dev` opens an interactive page. The sidebar sets the **modulation** (BPSK → 1024-QAM) and
the **signal-to-noise ratio**, and every section follows it:

1. **The carrier**: a spinning arrow (phasor) whose height draws a sine wave; amplitude, frequency
   and phase are the three things a radio can change.
2. **AM**: the message as the envelope, the spectrum with carrier and sidebands, overmodulation, and
   what an envelope detector recovers through noise.
3. **FM**: the message as the speed of the carrier, Bessel sidebands and Carson's rule, the FM noise
   advantage over AM and the threshold below which FM collapses.
4. **ASK, FSK and PSK**: the same bits keyed onto a carrier three ways, with optional noise.
5. **I and Q**: drag a point and see how a cosine and a sine add up to any amplitude and phase.
6. **Bits → symbols → wave**: the bit stream cut into groups, each group a Gray-coded constellation
   point, each point one stretch of waveform.
7. **Add noise**: symbols really modulated, buried in noise and demodulated; received clouds,
   decision lines, errors in red, and live bit error rate against theory.
8. **A message through the noise**: type text, watch letters get corrupted, and try a repetition
   code with majority voting.
9. **Speed versus reliability**: bit error rate against SNR for every modulation (theory and
   simulation); click to set the SNR.
10. **Wi-Fi range**: distance, walls and band → SNR → the 802.11ax MCS a router would pick, and the
    data rate you get.

## How it works

| File | What it does |
| --- | --- |
| [`src/constellation.ts`](src/constellation.ts) | Square Gray-coded QAM (and BPSK) at unit average energy, bit ↔ symbol mapping, the nearest-point slicer |
| [`src/channel.ts`](src/channel.ts) | Additive white Gaussian noise with σ² = 1 / (2·SNR) per axis, `transmit`, Monte Carlo BER |
| [`src/ber.ts`](src/ber.ts) | Exact BER/SER: each axis is a PAM signal, so sum Q-function probabilities of every decision region times its Gray bit distance |
| [`src/waveform.ts`](src/waveform.ts) | `s = I·cos − Q·sin` modulator, integrate-and-dump demodulator, ASK/FSK/PSK keying |
| [`src/analog.ts`](src/analog.ts) | AM and FM modulators, down-conversion to I/Q, envelope detector, frequency discriminator |
| [`src/fft.ts`](src/fft.ts) | Radix-2 FFT, amplitude spectrum, brick-wall low-pass |
| [`src/bits.ts`](src/bits.ts) | Text ↔ bits, repetition code |
| [`src/wifi.ts`](src/wifi.ts) | Wi-Fi 6 MCS table and a log-distance path-loss model |

Noise levels are defined so the views agree: the per-sample noise on a waveform is scaled so that,
after the receiver averages over a symbol (or filters to the channel), the recovered I/Q has
exactly the noise the constellation view and the theory assume.
