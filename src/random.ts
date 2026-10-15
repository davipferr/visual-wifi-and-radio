/**
 * Seeded randomness, so every noisy experiment can be replayed exactly.
 */

export type Random = () => number

/** mulberry32: a tiny, fast 32-bit generator. Returns numbers in [0, 1). */
export function createRandom(seed = 1): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A standard normal sample (mean 0, variance 1), Box–Muller. */
export function gaussian(random: Random): number {
  let u = 0
  while (u === 0) u = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}

export function randomBits(count: number, random: Random): number[] {
  return Array.from({ length: count }, () => (random() < 0.5 ? 0 : 1))
}
