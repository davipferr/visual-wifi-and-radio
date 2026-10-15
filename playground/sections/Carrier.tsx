import { useRef, useState } from 'react'
import { fmt, polyline, useCanvas, useFrames, useVisible, type Frame } from '../canvas'
import { SectionHead, Slider, Swatch } from '../ui'

/**
 * The carrier: a pure sine wave, drawn as the shadow of a spinning arrow.
 *
 *     s(t) = A·sin(2π·f·t + φ)
 *
 * The arrow (a "phasor") has length A, spins f times a second and starts at
 * angle φ. Its height over time is the wave. A radio carries information by
 * changing exactly these three numbers.
 */

const HISTORY = 4 // seconds of wave shown

export function Carrier() {
  const [amplitude, setAmplitude] = useState(0.8)
  const [frequency, setFrequency] = useState(0.5)
  const [phase, setPhase] = useState(0)
  const [playing, setPlaying] = useState(true)
  const time = useRef(0)
  const settings = useRef({ amplitude, frequency, phase })
  settings.current = { amplitude, frequency, phase }

  const draw = ({ ctx, width, height, color }: Frame) => {
    const { amplitude: A, frequency: f, phase: phiDeg } = settings.current
    const phi = (phiDeg * Math.PI) / 180
    const t = time.current
    const radius = height / 2 - 22
    const cx = 22 + radius
    const cy = height / 2
    const waveLeft = cx + radius + 30
    const pxPerSecond = (width - waveLeft - 12) / HISTORY
    const theta = 2 * Math.PI * f * t + phi
    const tipX = cx + A * radius * Math.cos(theta)
    const tipY = cy - A * radius * Math.sin(theta)

    // Circle for amplitude 1 and the current amplitude
    ctx.lineWidth = 1
    ctx.strokeStyle = color('--grid')
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = color('--target')
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.arc(cx, cy, A * radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Axis of the wave
    ctx.strokeStyle = color('--grid')
    polyline(ctx, [[cx - radius, cy], [width - 12, cy]])
    ctx.strokeStyle = color('--grid')
    polyline(ctx, [[waveLeft, cy - radius], [waveLeft, cy + radius]])

    // Reference: the wave as it started (A = 1, f = 0.5, φ = 0)
    ctx.strokeStyle = color('--target')
    ctx.lineWidth = 1.2
    ctx.setLineDash([5, 5])
    polyline(
      ctx,
      Array.from({ length: 200 }, (_, k) => {
        const tau = (k / 199) * HISTORY
        return [waveLeft + tau * pxPerSecond, cy - radius * Math.sin(2 * Math.PI * 0.5 * (t - tau))] as [number, number]
      }),
    )
    ctx.setLineDash([])

    // The wave: the arrow's height, newest on the left
    ctx.strokeStyle = color('--carrier')
    ctx.lineWidth = 2.5
    polyline(
      ctx,
      Array.from({ length: 400 }, (_, k) => {
        const tau = (k / 399) * HISTORY
        return [waveLeft + tau * pxPerSecond, cy - A * radius * Math.sin(2 * Math.PI * f * (t - tau) + phi)] as [number, number]
      }),
    )

    // Projection line from the arrow tip to the wave
    ctx.strokeStyle = color('--muted')
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    polyline(ctx, [[tipX, tipY], [waveLeft, tipY]])
    ctx.setLineDash([])

    // The arrow
    ctx.strokeStyle = color('--text')
    ctx.lineWidth = 2.5
    polyline(ctx, [[cx, cy], [tipX, tipY]])
    ctx.fillStyle = color('--live')
    ctx.beginPath()
    ctx.arc(tipX, tipY, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(waveLeft, tipY, 5, 0, Math.PI * 2)
    ctx.fill()

    // Phase angle arc
    ctx.strokeStyle = color('--accent')
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, 18, 0, -(((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)), true)
    ctx.stroke()

    ctx.fillStyle = color('--muted')
    ctx.textAlign = 'left'
    ctx.fillText('now', waveLeft + 4, cy + radius + 14)
    ctx.textAlign = 'right'
    ctx.fillText(`${HISTORY} s ago`, width - 12, cy + radius + 14)
  }

  const { ref, redraw } = useCanvas(draw)
  const visible = useVisible(ref)
  useFrames(playing && visible, (seconds) => {
    time.current += seconds
    redraw()
  })

  return (
    <section className="card">
      <SectionHead step={1} title="The carrier: a spinning arrow">
        <p>
          A radio transmitter starts with a pure sine wave, the <em>carrier</em>. Picture it as an arrow
          spinning around a circle: its height over time draws the wave. Only three things describe it,
          and they are the only three things a radio can change to carry information.
        </p>
      </SectionHead>

      <div className="split">
        <div className="stack">
          <Slider label={<>Amplitude <var>A</var></>} value={amplitude} min={0.1} max={1} step={0.05} onChange={setAmplitude} />
          <Slider label={<>Frequency <var>f</var></>} value={frequency} min={0.25} max={2} step={0.05} unit=" Hz" onChange={setFrequency} />
          <Slider label={<>Phase <var>φ</var></>} value={phase} min={0} max={360} step={15} unit="°" onChange={setPhase} />
          <div className="presets">
            <button className="chip" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              className="chip"
              onClick={() => {
                setAmplitude(1)
                setFrequency(0.5)
                setPhase(0)
              }}
            >
              Reset
            </button>
          </div>
          <div className="formula">
            <var>s</var>(<var>t</var>) = {fmt(amplitude, 2)}·sin(2π·{fmt(frequency, 2)}·<var>t</var> + {phase}°)
          </div>
        </div>
        <canvas ref={ref} className="canvas canvas-carrier" aria-label="A spinning arrow drawing a sine wave" />
      </div>

      <div className="legend">
        <span><Swatch color="--carrier" /> the carrier</span>
        <span><Swatch color="--target" dashed /> where it started (A = 1, f = 0.5 Hz, φ = 0°)</span>
      </div>
      <dl className="trio">
        <div>
          <dt>Change <var>A</var></dt>
          <dd><b>Amplitude modulation</b>: AM radio, and half of what QAM does.</dd>
        </div>
        <div>
          <dt>Change <var>f</var></dt>
          <dd><b>Frequency modulation</b>: FM radio, Bluetooth.</dd>
        </div>
        <div>
          <dt>Change <var>φ</var></dt>
          <dd><b>Phase modulation</b>: GPS, and the other half of QAM.</dd>
        </div>
      </dl>
      <p className="hint">
        Real carriers spin billions of times a second (2.4 or 5 GHz for Wi-Fi, about 100 MHz for FM
        radio). Everything here is slowed down so you can watch.
      </p>
    </section>
  )
}
