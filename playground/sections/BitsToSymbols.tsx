import { bitLabel, constellation, createRandom, type Scheme } from 'visual-wifi-and-radio'
import { useRef, useState } from 'react'
import {
  clip,
  constellationPoints,
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
 * The transmitter, one symbol at a time: chop the bit stream into groups of
 * log₂(M) bits, look each group up in the constellation, and send that point's
 * I and Q for one symbol period.
 */

const WINDOW = 5 // symbols visible on the waveform
const CYCLES = 2 // carrier cycles per symbol

/** A repeatable "random" symbol for every position in the stream. */
const symbolAt = (n: number, order: number) => Math.floor(createRandom(n * 2654435761 + 17)() * order)

export function BitsToSymbols({ scheme }: { scheme: Scheme }) {
  const [speed, setSpeed] = useState(0.8)
  const [playing, setPlaying] = useState(true)
  const [current, setCurrent] = useState(0)
  const time = useRef(0.5)
  const c = constellation(scheme)

  const drawConstellation = (frame: Frame) => {
    const { ctx, color } = frame
    const reach = reachFor(c, 0.3)
    const plot = squareArea(frame, reach)
    grid(frame, plot, [-reach, reach], [-reach, reach], { x: (v) => `${v}`, y: (v) => `${v}` })
    iqAxes(frame, plot, reach)
    constellationPoints(frame, plot, c, { color: color('--target') })

    const n = Math.floor(time.current)
    // Fading trail through the last few symbols
    ctx.strokeStyle = color('--accent')
    ctx.lineWidth = 1.5
    for (let k = 4; k >= 1; k--) {
      const a = c.points[symbolAt(n - k, c.order)]
      const b = c.points[symbolAt(n - k + 1, c.order)]
      ctx.globalAlpha = 0.5 * (1 - k / 5)
      polyline(ctx, [[plot.x(a.i), plot.y(a.q)], [plot.x(b.i), plot.y(b.q)]])
    }
    ctx.globalAlpha = 1
    const p = c.points[symbolAt(n, c.order)]
    ctx.strokeStyle = color('--text')
    ctx.lineWidth = 2
    polyline(ctx, [[plot.x(0), plot.y(0)], [plot.x(p.i), plot.y(p.q)]])
    ctx.fillStyle = color('--live')
    ctx.beginPath()
    ctx.arc(plot.x(p.i), plot.y(p.q), 7, 0, Math.PI * 2)
    ctx.fill()
  }

  const drawWave = (frame: Frame) => {
    const { ctx, color } = frame
    const t = time.current
    const reach = reachFor(c, 0.15) * Math.SQRT2
    const xRange: [number, number] = [t - WINDOW, t]
    const plot = plotArea(frame, xRange, [-reach, reach], { left: 36, right: 12, top: 26, bottom: 10 })
    grid(frame, plot, xRange, [-reach, reach], { x: () => '', y: (v) => `${v}` })

    ctx.save()
    clip(ctx, plot)
    // Symbol boundaries
    ctx.strokeStyle = color('--border')
    ctx.lineWidth = 1
    for (let n = Math.ceil(t - WINDOW); n <= t; n++) polyline(ctx, [[plot.x(n), plot.top], [plot.x(n), plot.top + plot.height]])

    const series = (fn: (tau: number, n: number) => number) =>
      Array.from({ length: 600 }, (_, k) => {
        const tau = t - WINDOW + (k / 599) * WINDOW
        const n = Math.floor(tau)
        return [plot.x(tau), plot.y(fn(tau, n))] as [number, number]
      })
    const at = (n: number) => c.points[symbolAt(n, c.order)]
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = color('--i')
    polyline(ctx, series((_, n) => at(n).i))
    ctx.strokeStyle = color('--q')
    polyline(ctx, series((_, n) => at(n).q))
    ctx.setLineDash([])
    ctx.lineWidth = 2.5
    ctx.strokeStyle = color('--carrier')
    polyline(ctx, series((tau, n) => {
      const theta = 2 * Math.PI * CYCLES * tau
      return at(n).i * Math.cos(theta) - at(n).q * Math.sin(theta)
    }))
    ctx.restore()

    // Bits of each symbol above its slot
    ctx.fillStyle = color('--text')
    ctx.textAlign = 'center'
    ctx.font = `${c.bitsPerSymbol > 8 ? 10 : 12}px ui-monospace, Consolas, monospace`
    for (let n = Math.floor(t - WINDOW); n <= t; n++) {
      const centre = plot.x(n + 0.5)
      if (centre < plot.left + 20 || centre > plot.left + plot.width - 20) continue
      ctx.globalAlpha = n === Math.floor(t) ? 1 : 0.55
      ctx.fillText(bitLabel(symbolAt(n, c.order), c.bitsPerSymbol), centre, 16)
    }
    ctx.globalAlpha = 1
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  }

  const constellationCanvas = useCanvas(drawConstellation)
  const waveCanvas = useCanvas(drawWave)
  const visible = useVisible(waveCanvas.ref)

  useFrames(playing && visible, (seconds) => {
    time.current += seconds * speed
    const n = Math.floor(time.current)
    if (n !== current) setCurrent(n)
    constellationCanvas.redraw()
    waveCanvas.redraw()
  })

  const step = () => {
    time.current = Math.floor(time.current) + 1.5
    setCurrent(Math.floor(time.current))
  }

  return (
    <section className="card">
      <SectionHead step={6} title="From bits to symbols to a wave">
        <p>
          The transmitter reads the bits {c.bitsPerSymbol} at a time ({scheme} has {c.order} points, and
          2<sup>{c.bitsPerSymbol}</sup> = {c.order}). Each group picks one point; that point’s{' '}
          <b className="i">I</b> and <b className="q">Q</b> shape the carrier for one symbol period. Neighbouring
          points differ by just one bit (Gray code), so a small slip costs only one bit.
        </p>
      </SectionHead>

      <div className="bitstream mono" aria-label="Bit stream grouped into symbols">
        {Array.from({ length: 9 }, (_, k) => {
          const n = current - 3 + k
          return (
            <span key={n} className={`bitgroup${n < current ? ' past' : n === current ? ' current' : ''}`}>
              {bitLabel(symbolAt(n, c.order), c.bitsPerSymbol)}
            </span>
          )
        })}
        <span className="muted">…</span>
      </div>

      <div className="two-col wide-right">
        <canvas ref={constellationCanvas.ref} className="canvas canvas-square" aria-label={`${scheme} constellation with the current symbol`} />
        <div className="stack">
          <canvas ref={waveCanvas.ref} className="canvas" aria-label="The waveform, symbol by symbol" />
          <div className="legend">
            <span><Swatch color="--i" dashed /> I level</span>
            <span><Swatch color="--q" dashed /> Q level</span>
            <span><Swatch color="--carrier" /> transmitted wave (newest on the right)</span>
          </div>
          <Slider label="Speed" value={speed} min={0.2} max={4} step={0.1} unit=" symbols/s" onChange={setSpeed} />
          <div className="presets">
            <button className="chip" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
            <button className="chip" onClick={step}>Next symbol</button>
          </div>
        </div>
      </div>
      <p className="hint">
        Wi-Fi does this on hundreds of carriers at once (OFDM), each sending its own symbol about 70,000
        times a second. With 1024-QAM that is 10 bits per carrier per symbol.
      </p>
    </section>
  )
}
