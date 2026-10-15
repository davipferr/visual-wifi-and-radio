/**
 * Constellations: the alphabet of digital radio.
 *
 * A symbol is a point (I, Q) on a plane. The transmitter sends it as
 *
 *     s(t) = I·cos(2πf t) − Q·sin(2πf t)
 *
 * so I sets how much cosine and Q how much sine goes on air. Square M-QAM puts
 * √M amplitude levels on each axis; half the bits pick the I level, half the Q
 * level. Levels are Gray coded, so neighbouring points differ by exactly one
 * bit: the most likely mistake (landing next door) costs a single bit error.
 *
 * Every constellation is scaled to an average symbol energy of 1, so a given
 * SNR means the same noise for all of them.
 */

export interface IQ {
  i: number
  q: number
}

export type Scheme = 'BPSK' | 'QPSK' | '16-QAM' | '64-QAM' | '256-QAM' | '1024-QAM'

export const SCHEMES: readonly Scheme[] = ['BPSK', 'QPSK', '16-QAM', '64-QAM', '256-QAM', '1024-QAM']

const orders: Record<Scheme, number> = {
  BPSK: 2,
  QPSK: 4,
  '16-QAM': 16,
  '64-QAM': 64,
  '256-QAM': 256,
  '1024-QAM': 1024,
}

export interface Constellation {
  scheme: Scheme
  /** Number of points, M. */
  order: number
  bitsPerSymbol: number
  /** Amplitude levels per axis. BPSK has two levels on I and nothing on Q. */
  levels: number
  /** Level j sits at (2j − (levels − 1))·scale, so neighbours are 2·scale apart. */
  scale: number
  /** points[symbol] is where that symbol (read as bits, MSB first) is drawn. */
  points: IQ[]
}

export const grayEncode = (n: number) => n ^ (n >> 1)

export function grayDecode(gray: number): number {
  let n = gray
  for (let shift = gray >> 1; shift; shift >>= 1) n ^= shift
  return n
}

const cache = new Map<Scheme, Constellation>()

export function constellation(scheme: Scheme): Constellation {
  const cached = cache.get(scheme)
  if (cached) return cached

  const order = orders[scheme]
  const bitsPerSymbol = Math.log2(order)
  let result: Constellation
  if (scheme === 'BPSK') {
    result = { scheme, order, bitsPerSymbol, levels: 2, scale: 1, points: [{ i: -1, q: 0 }, { i: 1, q: 0 }] }
  } else {
    const half = bitsPerSymbol / 2
    const levels = 2 ** half
    // Average energy of a square grid with spacing 2 is 2(M − 1)/3.
    const scale = 1 / Math.sqrt((2 * (order - 1)) / 3)
    const level = (gray: number) => (2 * grayDecode(gray) - (levels - 1)) * scale
    const points = Array.from({ length: order }, (_, symbol) => ({
      i: level(symbol >> half),
      q: level(symbol & (levels - 1)),
    }))
    result = { scheme, order, bitsPerSymbol, levels, scale, points }
  }
  cache.set(scheme, result)
  return result
}

/** Amplitudes halfway between neighbouring levels: the receiver's decision lines. */
export function thresholds(c: Constellation): number[] {
  return Array.from({ length: c.levels - 1 }, (_, j) => (2 * j + 2 - c.levels) * c.scale)
}

/** The receiver's decision: the symbol whose point is nearest to `point`. */
export function slice(point: IQ, c: Constellation): number {
  const axis = (x: number) => {
    const index = Math.round((x / c.scale + c.levels - 1) / 2)
    return grayEncode(Math.min(c.levels - 1, Math.max(0, index)))
  }
  if (c.scheme === 'BPSK') return axis(point.i)
  return (axis(point.i) << (c.bitsPerSymbol / 2)) | axis(point.q)
}

/** The bits of a symbol, most significant first. */
export function symbolBits(symbol: number, bitsPerSymbol: number): number[] {
  return Array.from({ length: bitsPerSymbol }, (_, b) => (symbol >> (bitsPerSymbol - 1 - b)) & 1)
}

export function bitLabel(symbol: number, bitsPerSymbol: number): string {
  return symbol.toString(2).padStart(bitsPerSymbol, '0')
}

/** Group bits into symbols, padding the last group with zeros. */
export function bitsToSymbols(bits: ArrayLike<number>, c: Constellation): number[] {
  const k = c.bitsPerSymbol
  const symbols: number[] = []
  for (let start = 0; start < bits.length; start += k) {
    let symbol = 0
    for (let b = 0; b < k; b++) symbol = (symbol << 1) | (bits[start + b] ?? 0)
    symbols.push(symbol)
  }
  return symbols
}

export function symbolsToBits(symbols: readonly number[], c: Constellation): number[] {
  return symbols.flatMap((symbol) => symbolBits(symbol, c.bitsPerSymbol))
}

/** How many bits two symbols disagree on. */
export function bitDifference(a: number, b: number): number {
  let x = a ^ b
  let count = 0
  while (x) {
    count += x & 1
    x >>= 1
  }
  return count
}
