import {
  bitsToBytes,
  constellation,
  createRandom,
  printable,
  repeatDecode,
  repeatEncode,
  textToBits,
  transmit,
  type Scheme,
} from 'visual-wifi-and-radio'
import { useMemo, useRef, useState } from 'react'
import { fmtProbability, useCanvas, useTicker, useVisible, type Frame } from '../canvas'
import { SectionHead, Swatch } from '../ui'

/**
 * A real message through the noisy channel: text → bytes → bits → symbols →
 * noise → decisions → bits → bytes → text. Optionally protected by the
 * simplest error-correcting code: send every bit three times and take a vote.
 */

const COLUMNS = 64
const CELL_HEIGHT = 11
const REPEAT = 3

export function MessageThroughChannel({ scheme, snrDb }: { scheme: Scheme; snrDb: number }) {
  const [text, setText] = useState('Hello from the router! Every letter is 8 bits on air.')
  const [protect, setProtect] = useState(false)
  const [live, setLive] = useState(false)
  const [seed, setSeed] = useState(1)
  const anchor = useRef<HTMLDivElement>(null)
  const visible = useVisible(anchor)
  const tick = useTicker(live && visible, 2)

  const result = useMemo(() => {
    const bits = textToBits(text.slice(0, 160))
    const air = protect ? repeatEncode(bits, REPEAT) : bits
    const tx = transmit(air, scheme, snrDb, createRandom(seed * 1000 + tick))
    const decoded = protect ? repeatDecode(tx.receivedBits, REPEAT) : tx.receivedBits
    const states = bits.map((bit, b) => {
      if (decoded[b] !== bit) return 'wrong' as const
      if (protect) {
        for (let k = 0; k < REPEAT; k++) if (tx.receivedBits[b * REPEAT + k] !== bit) return 'fixed' as const
      }
      return 'ok' as const
    })
    const sent = bitsToBytes(bits)
    const got = bitsToBytes(decoded)
    return {
      bits,
      states,
      sent,
      got,
      airBits: air.length,
      symbols: tx.symbols.length,
      airErrors: tx.bitErrors,
      wrongBits: states.filter((s) => s === 'wrong').length,
      wrongChars: sent.filter((byte, k) => byte !== got[k]).length,
    }
  }, [text, protect, scheme, snrDb, seed, tick])

  const draw = ({ ctx, width, color }: Frame) => {
    const cell = width / COLUMNS
    const fill = { ok: [color('--bit0'), color('--bit1')], wrong: [color('--error'), color('--error')], fixed: [color('--fixed'), color('--fixed')] }
    result.bits.forEach((bit, b) => {
      const x = (b % COLUMNS) * cell
      const y = Math.floor(b / COLUMNS) * CELL_HEIGHT
      ctx.fillStyle = fill[result.states[b]][bit]
      ctx.fillRect(x + 0.5, y + 0.5, cell - 1, CELL_HEIGHT - 1)
      // A thin gap between bytes
      if (b % 8 === 0 && b % COLUMNS !== 0) {
        ctx.fillStyle = color('--surface')
        ctx.fillRect(x - 0.5, y, 1.5, CELL_HEIGHT)
      }
    })
  }

  const { ref } = useCanvas(draw)
  const rows = Math.max(1, Math.ceil(result.bits.length / COLUMNS))
  const c = constellation(scheme)

  return (
    <section className="card">
      <SectionHead step={8} title="A message through the noise">
        <p>
          Type something. It is turned into bytes, then bits, then {scheme} symbols ({c.bitsPerSymbol} bits
          each), sent through the noisy channel at {snrDb} dB, and decoded back. One flipped bit changes a
          whole letter.
        </p>
      </SectionHead>

      <div className="row" ref={anchor}>
        <label className="select grow">
          Message
          <input className="text" value={text} maxLength={160} onChange={(e) => setText(e.target.value)} />
        </label>
        <button className="primary" onClick={() => setSeed((s) => s + 1)}>Send again</button>
        <label className="checkbox">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Keep sending
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />
          Send every bit 3× and vote
        </label>
      </div>

      <div className="message-box">
        <div>
          <span className="canvas-title">Sent</span>
          <p className="message mono">{result.sent.map(printable).join('')}</p>
        </div>
        <div>
          <span className="canvas-title">Received</span>
          <p className="message mono">
            {result.got.map((byte, k) => (
              <span key={k} className={byte !== result.sent[k] ? 'flipped' : undefined}>
                {printable(byte)}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="stack">
        <span className="canvas-title">Every bit of the message</span>
        <canvas ref={ref} className="canvas bit-grid" style={{ height: rows * CELL_HEIGHT }} aria-label="Bits of the message, errors highlighted" />
        <div className="legend">
          <span><Swatch color="--bit0" /> 0</span>
          <span><Swatch color="--bit1" /> 1</span>
          <span><Swatch color="--error" /> arrived wrong</span>
          {protect && <span><Swatch color="--fixed" /> hit by noise, fixed by the vote</span>}
        </div>
      </div>

      <dl className="stats stats-4">
        <div>
          <dt>Bits on air</dt>
          <dd>{result.airBits.toLocaleString('en-US')} <span className="muted small">({result.symbols} symbols)</span></dd>
        </div>
        <div>
          <dt>Flipped by noise</dt>
          <dd className={result.airErrors ? 'bad' : 'good'}>{result.airErrors}</dd>
        </div>
        <div>
          <dt>Wrong after decoding</dt>
          <dd className={result.wrongBits ? 'bad' : 'good'}>
            {result.wrongBits} <span className="muted small">({fmtProbability(result.wrongBits / result.bits.length)})</span>
          </dd>
        </div>
        <div>
          <dt>Letters damaged</dt>
          <dd className={result.wrongChars ? 'bad' : 'good'}>{result.wrongChars} of {result.sent.length}</dd>
        </div>
      </dl>
      <p className="hint">
        Repeating every bit fixes any single flip in a group of three, but takes three times as long. Wi-Fi
        uses far smarter codes (LDPC) that add only 20–100% extra bits; that is the “coding rate” such as
        3/4 or 5/6 in the Wi-Fi section below.
      </p>
    </section>
  )
}
