/**
 * Text ↔ bits, and the simplest error-correcting code there is.
 */

/** UTF-8 bytes, 8 bits each, most significant bit first. */
export function textToBits(text: string): number[] {
  return bytesToBits(new TextEncoder().encode(text))
}

export function bytesToBits(bytes: ArrayLike<number>): number[] {
  const bits: number[] = []
  for (let b = 0; b < bytes.length; b++) {
    for (let k = 7; k >= 0; k--) bits.push((bytes[b] >> k) & 1)
  }
  return bits
}

export function bitsToBytes(bits: readonly number[]): number[] {
  const bytes: number[] = []
  for (let start = 0; start + 8 <= bits.length; start += 8) {
    let byte = 0
    for (let k = 0; k < 8; k++) byte = (byte << 1) | bits[start + k]
    bytes.push(byte)
  }
  return bytes
}

/** A byte as something printable: itself if it is plain ASCII, otherwise a placeholder. */
export function printable(byte: number): string {
  return byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '·'
}

/** Repetition code: send every bit `times` times. */
export function repeatEncode(bits: readonly number[], times: number): number[] {
  return bits.flatMap((bit) => Array<number>(times).fill(bit))
}

/** Majority vote over each group of `times` copies. */
export function repeatDecode(bits: readonly number[], times: number): number[] {
  const out: number[] = []
  for (let start = 0; start + times <= bits.length; start += times) {
    let ones = 0
    for (let k = 0; k < times; k++) ones += bits[start + k]
    out.push(ones * 2 > times ? 1 : 0)
  }
  return out
}
