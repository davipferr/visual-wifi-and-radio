import {
  DEFAULT_PASSBAND,
  addSignalNoise,
  bitDifference,
  bitErrorRate,
  constellation,
  createRandom,
  demodulate,
  modulate,
  noiseSigma,
  passbandNoiseSigma,
  slice,
  thresholds,
  type IQ,
  type Scheme,
} from 'visual-wifi-and-radio'
import { useEffect, useRef, useState } from 'react'
import {
  clip,
  fmt,
  fmtProbability,
  grid,
  iqAxes,
  plotArea,
  polyline,
  reachFor,
  squareArea,
  useCanvas,
  useFrames,
  useVisible,
  type Frame,
} from '../canvas'
import { SectionHead, Slider, Swatch } from '../ui'

/**
 * The receiver's view. Every symbol is really modulated onto a carrier,
 * buried in noise, and demodulated again (integrate and dump). Where the
 * recovered point lands decides which symbol the receiver believes was sent:
 * the nearest grid point. Cross a decision line and bits flip.
 */

const CAPACITY = 4000
const RECENT = 4
const SPS = DEFAULT_PASSBAND.samplesPerSymbol

interface Store {
  i: Float32Array
  q: Float32Array
  error: Uint8Array
  head: number
  count: number
  symbols: number
  symbolErrors: number
  bitErrors: number
  carry: number
  recent: { clean: Float64Array; noisy: Float64Array; sent: IQ; received: IQ; error: boolean }[]
}

const emptyStore = (): Store => ({
  i: new Float32Array(CAPACITY),
  q: new Float32Array(CAPACITY),
  error: new Uint8Array(CAPACITY),
  head: 0,
  count: 0,
  symbols: 0,
  symbolErrors: 0,
  bitErrors: 0,
  carry: 0,
  recent: [],
})

export function NoisyConstellation({ scheme, snrDb }: { scheme: Scheme; snrDb: number }) {
  const [rate, setRate] = useState(300)
  const [playing, setPlaying] = useState(true)
  const store = useRef<Store>(emptyStore())
  const random = useRef(createRandom(42))
  const panel = useRef<HTMLDListElement>(null)
  const c = constellation(scheme)
  const sigma = noiseSigma(snrDb)

  useEffect(() => {
    store.current = emptyStore()
  }, [scheme, snrDb])

  const send = (count: number) => {
    const s = store.current
    const sampleSigma = passbandNoiseSigma(snrDb, SPS)
    for (let k = 0; k < count; k++) {
      const symbol = Math.floor(random.current() * c.order)
      const sent = c.points[symbol]
      const clean = modulate([sent])
      const noisy = addSignalNoise(clean, sampleSigma, random.current)
      const received = demodulate(noisy)[0]
      const decided = slice(received, c)
      const errors = bitDifference(symbol, decided)
      s.i[s.head] = received.i
      s.q[s.head] = received.q
      s.error[s.head] = errors > 0 ? 1 : 0
      s.head = (s.head + 1) % CAPACITY
      s.count = Math.min(CAPACITY, s.count + 1)
      s.symbols++
      s.bitErrors += errors
      if (errors) s.symbolErrors++
      if (k >= count - RECENT) {
        s.recent.push({ clean, noisy, sent, received, error: errors > 0 })
        if (s.recent.length > RECENT) s.recent.shift()
      }
    }
  }

  const drawPlane = (frame: Frame) => {
    const { ctx, color } = frame
    const s = store.current
    const outer = Math.max(...c.points.map((p) => Math.abs(p.i)))
    const reach = Math.min(2.2, Math.max(reachFor(c, 0.3), outer + 3 * sigma))
    const plot = squareArea(frame, reach)
    grid(frame, plot, [-reach, reach], [-reach, reach], { x: (v) => `${v}`, y: (v) => `${v}` })
    iqAxes(frame, plot, reach)

    ctx.save()
    clip(ctx, plot)
    // Decision lines: the receiver picks whichever box the point lands in.
    // Dense constellations get lighter lines so the cloud stays visible.
    const spacing = plot.x(2 * c.scale) - plot.x(0)
    const dense = spacing < 18
    ctx.strokeStyle = color('--decision')
    ctx.lineWidth = dense ? 0.75 : 1.5
    ctx.globalAlpha = dense ? 0.6 : 1
    for (const t of thresholds(c)) {
      polyline(ctx, [[plot.x(t), plot.top], [plot.x(t), plot.top + plot.height]])
      if (scheme !== 'BPSK') polyline(ctx, [[plot.left, plot.y(t)], [plot.left + plot.width, plot.y(t)]])
    }
    ctx.globalAlpha = 1

    const dot = Math.max(1.2, Math.min(2.5, spacing / 10))
    ctx.fillStyle = color('--ok')
    ctx.globalAlpha = 0.55
    for (let k = 0; k < s.count; k++) {
      if (s.error[k]) continue
      ctx.fillRect(plot.x(s.i[k]) - dot / 2, plot.y(s.q[k]) - dot / 2, dot, dot)
    }
    ctx.globalAlpha = 0.95
    ctx.fillStyle = color('--error')
    for (let k = 0; k < s.count; k++) {
      if (!s.error[k]) continue
      ctx.beginPath()
      ctx.arc(plot.x(s.i[k]), plot.y(s.q[k]), dot + 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Ideal points (crosses would hide the cloud on dense grids: the box centres say enough)
    ctx.strokeStyle = color('--text')
    ctx.lineWidth = 1.5
    const cross = Math.min(5, spacing / 6)
    for (const p of dense ? [] : c.points) {
      const x = plot.x(p.i)
      const y = plot.y(p.q)
      polyline(ctx, [[x - cross, y], [x + cross, y]])
      polyline(ctx, [[x, y - cross], [x, y + cross]])
    }

    // The newest symbol and the noise that pushed it
    const last = s.recent[s.recent.length - 1]
    if (last) {
      ctx.strokeStyle = color('--live')
      ctx.lineWidth = 2
      polyline(ctx, [[plot.x(last.sent.i), plot.y(last.sent.q)], [plot.x(last.received.i), plot.y(last.received.q)]])
      ctx.fillStyle = color('--live')
      ctx.beginPath()
      ctx.arc(plot.x(last.received.i), plot.y(last.received.q), 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  const drawWave = (frame: Frame) => {
    const { ctx, color } = frame
    const recent = store.current.recent
    const reach = 2.4
    const plot = plotArea(frame, [0, RECENT], [-reach, reach], { left: 36, right: 12, top: 10, bottom: 10 })
    grid(frame, plot, [0, RECENT], [-reach, reach], { x: () => '', y: (v) => `${v}` })
    ctx.save()
    clip(ctx, plot)
    const series = (signal: Float64Array, slot: number) =>
      Array.from(signal, (v, n) => [plot.x(slot + n / (SPS - 1)), plot.y(v)] as [number, number])
    recent.forEach((r, slot) => {
      if (r.error) {
        ctx.fillStyle = color('--error')
        ctx.globalAlpha = 0.12
        ctx.fillRect(plot.x(slot), plot.top, plot.x(1) - plot.x(0), plot.height)
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = color('--noise')
      ctx.lineWidth = 1
      polyline(ctx, series(r.noisy, slot))
      ctx.strokeStyle = color('--carrier')
      ctx.lineWidth = 2
      polyline(ctx, series(r.clean, slot))
    })
    ctx.restore()
  }

  const plane = useCanvas(drawPlane)
  const wave = useCanvas(drawWave)
  const visible = useVisible(plane.ref)

  const updatePanel = () => {
    const el = panel.current
    if (!el) return
    const s = store.current
    const set = (slot: string, text: string) => {
      const node = el.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
      if (node) node.textContent = text
    }
    const bits = s.symbols * c.bitsPerSymbol
    set('symbols', s.symbols.toLocaleString('en-US'))
    set('symbolErrors', s.symbolErrors.toLocaleString('en-US'))
    set('bits', bits.toLocaleString('en-US'))
    set('bitErrors', s.bitErrors.toLocaleString('en-US'))
    set('measured', bits ? fmtProbability(s.bitErrors / bits) : '–')
  }

  useFrames(playing && visible, (seconds) => {
    const s = store.current
    s.carry += rate * seconds
    const count = Math.floor(s.carry)
    s.carry -= count
    if (count > 0) send(count)
    plane.redraw()
    wave.redraw()
    updatePanel()
  })

  useEffect(updatePanel)

  return (
    <section className="card">
      <SectionHead step={7} title="Add noise: watch the bit errors appear">
        <p>
          Every symbol below is really sent: modulated onto a carrier, buried in noise, and demodulated
          again. Noise smears each point into a cloud. The receiver decides by which box (bounded by the{' '}
          <span className="decision">decision lines</span>) the point lands in. A point that lands in the
          wrong box is a <b className="error">symbol error</b>, and some of its bits come out wrong. Lower
          the SNR or pick a denser constellation in the sidebar.
        </p>
      </SectionHead>

      <div className="two-col">
        <canvas ref={plane.ref} className="canvas canvas-square" aria-label={`Received ${scheme} symbols with noise`} />
        <div className="stack">
          <span className="canvas-title">The last {RECENT} symbols on air</span>
          <canvas ref={wave.ref} className="canvas canvas-short" aria-label="Recent symbols, clean and noisy" />
          <div className="legend">
            <span><Swatch color="--carrier" /> sent</span>
            <span><Swatch color="--noise" /> received</span>
            <span><Swatch color="--ok" /> decided right</span>
            <span><Swatch color="--error" /> decided wrong</span>
            <span><Swatch color="--live" /> newest noise push</span>
          </div>
          <Slider label="Symbols per second" value={rate} min={10} max={3000} step={10} onChange={setRate} />
          <div className="presets">
            <button className="chip" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
            <button className="chip" onClick={() => (store.current = emptyStore())}>Clear</button>
            <button className="chip" onClick={() => { send(1); plane.redraw(); wave.redraw(); updatePanel() }}>Send one</button>
          </div>
          <dl className="stats" ref={panel}>
            <div>
              <dt>Symbols sent</dt>
              <dd data-slot="symbols">0</dd>
            </div>
            <div>
              <dt>Symbol errors</dt>
              <dd data-slot="symbolErrors" className="bad">0</dd>
            </div>
            <div>
              <dt>Bits sent</dt>
              <dd data-slot="bits">0</dd>
            </div>
            <div>
              <dt>Bit errors</dt>
              <dd data-slot="bitErrors" className="bad">0</dd>
            </div>
            <div>
              <dt>Measured bit error rate</dt>
              <dd data-slot="measured">–</dd>
            </div>
            <div>
              <dt>Theory says</dt>
              <dd>{fmtProbability(bitErrorRate(scheme, snrDb))}</dd>
            </div>
          </dl>
        </div>
      </div>
      <p className="hint">
        Noise spreads each point by σ = {fmt(sigma, 3)}, while the distance to a decision line is{' '}
        {fmt(c.scale, 3)}. Errors become common once σ is more than about a quarter of that gap. Denser
        constellations pack points closer together, so the same noise causes far more errors.
      </p>
    </section>
  )
}
