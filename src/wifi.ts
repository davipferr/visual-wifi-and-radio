/**
 * Wi-Fi link adaptation in miniature.
 *
 * A Wi-Fi 6 (802.11ax) radio picks a "modulation and coding scheme" (MCS) for
 * every packet: the densest constellation the current SNR can carry. Walk away
 * from the router and the signal fades, SNR drops, and it steps down to
 * sparser constellations: slower, but still reliable.
 *
 * The SNR thresholds are typical rule-of-thumb values; real radios vary.
 */

import type { Scheme } from './constellation'

export interface Mcs {
  index: number
  scheme: Scheme
  /** Share of transmitted bits that are data (the rest is error correction). */
  codeRate: string
  /** Data rate for one 20 MHz, single-antenna stream with 0.8 µs guard interval. */
  mbps: number
  /** Roughly the lowest SNR (dB) the MCS works at. */
  minSnrDb: number
}

export const WIFI_MCS: readonly Mcs[] = [
  { index: 0, scheme: 'BPSK', codeRate: '1/2', mbps: 8.6, minSnrDb: 2 },
  { index: 1, scheme: 'QPSK', codeRate: '1/2', mbps: 17.2, minSnrDb: 5 },
  { index: 2, scheme: 'QPSK', codeRate: '3/4', mbps: 25.8, minSnrDb: 9 },
  { index: 3, scheme: '16-QAM', codeRate: '1/2', mbps: 34.4, minSnrDb: 11 },
  { index: 4, scheme: '16-QAM', codeRate: '3/4', mbps: 51.6, minSnrDb: 15 },
  { index: 5, scheme: '64-QAM', codeRate: '2/3', mbps: 68.8, minSnrDb: 18 },
  { index: 6, scheme: '64-QAM', codeRate: '3/4', mbps: 77.4, minSnrDb: 20 },
  { index: 7, scheme: '64-QAM', codeRate: '5/6', mbps: 86.0, minSnrDb: 25 },
  { index: 8, scheme: '256-QAM', codeRate: '3/4', mbps: 103.2, minSnrDb: 29 },
  { index: 9, scheme: '256-QAM', codeRate: '5/6', mbps: 114.7, minSnrDb: 31 },
  { index: 10, scheme: '1024-QAM', codeRate: '3/4', mbps: 129.0, minSnrDb: 34 },
  { index: 11, scheme: '1024-QAM', codeRate: '5/6', mbps: 143.4, minSnrDb: 37 },
]

/** The fastest MCS that works at this SNR, or null when even MCS 0 fails. */
export function bestMcs(snrDb: number): Mcs | null {
  let best: Mcs | null = null
  for (const mcs of WIFI_MCS) if (snrDb >= mcs.minSnrDb) best = mcs
  return best
}

export type Band = '2.4 GHz' | '5 GHz' | '6 GHz'

export const BANDS: Record<Band, number> = { '2.4 GHz': 2.437e9, '5 GHz': 5.5e9, '6 GHz': 6.5e9 }

export interface LinkBudget {
  band: Band
  /** Metres between router and device. */
  distance: number
  walls: number
  txPowerDbm?: number
  /** Thermal noise in 20 MHz (−101 dBm) plus a 6 dB receiver noise figure. */
  noiseFloorDbm?: number
  /** How fast the signal fades with distance indoors (2 = open air). */
  exponent?: number
  wallLossDb?: number
}

/**
 * Log-distance path loss: free space up to 1 m, then 10·n·log₁₀(d) beyond,
 * plus a fixed loss per wall. Higher frequencies lose more in the first metre.
 */
export function pathLossDb({ band, distance, walls, exponent = 3, wallLossDb = 5 }: LinkBudget): number {
  const freeSpaceAt1m = 20 * Math.log10(BANDS[band]) - 147.55
  return freeSpaceAt1m + 10 * exponent * Math.log10(Math.max(1, distance)) + walls * wallLossDb
}

export function linkSnrDb(budget: LinkBudget): number {
  const { txPowerDbm = 20, noiseFloorDbm = -95 } = budget
  return txPowerDbm - pathLossDb(budget) - noiseFloorDbm
}
