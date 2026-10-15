import { bitLabel, constellation, slice, type IQ, type Scheme } from 'visual-wifi-and-radio'
import { useRef, useState } from 'react'
import { clip, constellationPoints, fmt, grid, iqAxes, plotArea, polyline, squareArea, useCanvas, type Frame, type Plot } from '../canvas'
import { SectionHead, Swatch } from '../ui'

/**
 * Two knobs, one point. Any amplitude and phase can be built from a cosine
 * and a sine added together:
 *
 *     A·cos(2πft + φ) = I·cos(2πft) − Q·sin(2πft),   I = A·cos φ,  Q = A·sin φ
 *
 * so a symbol is just a point (I, Q). Its distance from the centre is the
 * amplitude, its angle is the phase.
 */

const REACH = 1.4
const CYCLES = 3

export function IQPlane({ scheme }: { scheme: Scheme }) {
  const [point, setPoint] = useState<IQ>({ i: 0.7, q: 0.4 })
  const [snap, setSnap] = useState(false)
  const plane = useRef<Plot | null>(null)
  const dragging = useRef(false)
  const c = constellation(scheme)
  const shown = snap ? c.points[slice(point, c)] : point
  const amplitude = Math.hypot(shown.i, shown.q)
  const phase = (Math.atan2(shown.q, shown.i) * 180) / Math.PI

  const drawPlane = (frame: Frame) => {
    const { ctx, color } = frame
    const plot = squareArea(frame, REACH)
    plane.current = plot
    grid(frame, plot, [-REACH, REACH], [-REACH, REACH], { x: (v) => `${v}`, y: (v) => `${v}` })
    iqAxes(frame, plot, REACH)
    constellationPoints(frame, plot, c, { labels: false, color: color('--target') })

    const x = plot.x(shown.i)
    const y = plot.y(shown.q)
    // Amplitude circle and the I and Q legs
    ctx.strokeStyle = color('--target')
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.arc(plot.x(0), plot.y(0), Math.hypot(x - plot.x(0), y - plot.y(0)), 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineWidth = 3
    ctx.strokeStyle = color('--i')
    polyline(ctx, [[plot.x(0), plot.y(0)], [x, plot.y(0)]])
    ctx.strokeStyle = color('--q')
    polyline(ctx, [[x, plot.y(0)], [x, y]])
    ctx.strokeStyle = color('--text')
    ctx.lineWidth = 2
    polyline(ctx, [[plot.x(0), plot.y(0)], [x, y]])
    ctx.fillStyle = color('--live')
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fill()
  }

  const drawWave = (frame: Frame) => {
    const { ctx, color } = frame
    const plot = plotArea(frame, [0, CYCLES], [-1.6, 1.6], { left: 36, right: 12, top: 10, bottom: 24 })
    grid(frame, plot, [0, CYCLES], [-1.6, 1.6], { x: (v) => (v === 0 ? 'cycles: 0' : `${v}`), y: (v) => `${v}` })
    const series = (fn: (theta: number) => number) =>
      Array.from({ length: 300 }, (_, k) => {
        const t = (k / 299) * CYCLES
        return [plot.x(t), plot.y(fn(2 * Math.PI * t))] as [number, number]
      })
    ctx.save()
    clip(ctx, plot)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = color('--i')
    ctx.setLineDash([5, 4])
    polyline(ctx, series((th) => shown.i * Math.cos(th)))
    ctx.strokeStyle = color('--q')
    polyline(ctx, series((th) => -shown.q * Math.sin(th)))
    ctx.setLineDash([])
    ctx.lineWidth = 3
    ctx.strokeStyle = color('--carrier')
    polyline(ctx, series((th) => shown.i * Math.cos(th) - shown.q * Math.sin(th)))
    ctx.restore()
  }

  const planeCanvas = useCanvas(drawPlane)
  const waveCanvas = useCanvas(drawWave)

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const plot = plane.current
    if (!plot) return
    const rect = event.currentTarget.getBoundingClientRect()
    const clamp = (v: number) => Math.max(-REACH, Math.min(REACH, v))
    const i = ((event.clientX - rect.left - plot.left) / plot.width) * 2 * REACH - REACH
    const q = REACH - ((event.clientY - rect.top - plot.top) / plot.height) * 2 * REACH
    setPoint({ i: clamp(i), q: clamp(q) })
  }

  return (
    <section className="card">
      <SectionHead step={5} title="I and Q: a symbol is a point">
        <p>
          Any amplitude and phase can be made by adding two waves a quarter-cycle apart: a cosine
          (the <b className="i">I</b>n-phase part) and a sine (the <b className="q">Q</b>uadrature part).
          So every possible carrier state is just a point on a plane. <strong>Drag the point</strong>:
          its distance from the centre is the amplitude, its angle is the phase.
        </p>
      </SectionHead>

      <div className="two-col">
        <canvas
          ref={planeCanvas.ref}
          className="canvas canvas-square draggable"
          aria-label="I/Q plane, drag the point"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            dragging.current = true
            move(e)
          }}
          onPointerMove={(e) => dragging.current && move(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        />
        <div className="stack">
          <canvas ref={waveCanvas.ref} className="canvas" aria-label="The wave made by this point" />
          <div className="legend">
            <span><Swatch color="--i" dashed /> I·cos</span>
            <span><Swatch color="--q" dashed /> −Q·sin</span>
            <span><Swatch color="--carrier" /> their sum: what goes on air</span>
          </div>
          <dl className="stats">
            <div>
              <dt>I, Q</dt>
              <dd>{fmt(shown.i, 2)}, {fmt(shown.q, 2)}</dd>
            </div>
            <div>
              <dt>Amplitude √(I² + Q²), phase</dt>
              <dd>{fmt(amplitude, 2)}, {fmt(phase, 0)}°</dd>
            </div>
            <div className="wide">
              <dt>Nearest {scheme} symbol</dt>
              <dd className="mono">{bitLabel(slice(shown, c), c.bitsPerSymbol)}</dd>
            </div>
          </dl>
          <label className="checkbox">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            Snap to the {scheme} points (grey): only these are allowed
          </label>
        </div>
      </div>
      <p className="hint">
        The grey dots are the points the sidebar’s modulation may use. Picking one of {c.order} points
        sends log₂({c.order}) = {c.bitsPerSymbol} bit{c.bitsPerSymbol > 1 ? 's' : ''} at once. That map of
        allowed points is called a <em>constellation</em>.
      </p>
    </section>
  )
}
