/**
 * A radix-2 FFT, used to look at spectra and to filter.
 *
 * All analog signals here repeat exactly once per window (whole numbers of
 * cycles), so the FFT sees them without leakage and a "brick-wall" filter
 * (zeroing bins) is clean.
 */

/** In-place FFT. `re` and `im` must have the same power-of-two length. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length
  if (n & (n - 1)) throw new Error(`FFT length must be a power of two, got ${n}`)

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(angle)
    const wi = Math.sin(angle)
    for (let start = 0; start < n; start += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = start + k
        const b = a + len / 2
        const vr = re[b] * cr - im[b] * ci
        const vi = re[b] * ci + im[b] * cr
        re[b] = re[a] - vr
        im[b] = im[a] - vi
        re[a] += vr
        im[a] += vi
        const next = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = next
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

/**
 * Amplitude of each frequency, in cycles per window: a cosine of amplitude A
 * at k cycles shows up as A in bin k. Returns bins 0 … N/2.
 */
export function amplitudeSpectrum(signal: ArrayLike<number>): Float64Array {
  const n = signal.length
  const re = Float64Array.from(signal)
  const im = new Float64Array(n)
  fft(re, im)
  const out = new Float64Array(n / 2 + 1)
  for (let k = 0; k <= n / 2; k++) {
    const scale = k === 0 || k === n / 2 ? 1 / n : 2 / n
    out[k] = Math.hypot(re[k], im[k]) * scale
  }
  return out
}

/** Keep frequencies up to `cutoff` cycles per window and remove everything above. */
export function lowpass(signal: ArrayLike<number>, cutoff: number): Float64Array {
  const n = signal.length
  const re = Float64Array.from(signal)
  const im = new Float64Array(n)
  fft(re, im)
  for (let k = 0; k < n; k++) {
    const frequency = Math.min(k, n - k)
    if (frequency > cutoff) {
      re[k] = 0
      im[k] = 0
    }
  }
  fft(re, im, true)
  return re
}
