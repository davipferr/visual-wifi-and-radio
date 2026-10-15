import {
  SCHEMES,
  bitErrorRate,
  constellation,
  createRandom,
  measureBer,
  snrForBer,
  type Scheme,
} from 'visual-wifi-and-radio'
import { useMemo, useRef } from 'react'
import { clip, fmt, fmtProbability, plotArea, polyline, superscript, useCanvas, type Frame, type Plot } from '../canvas'
import { SectionHead } from '../ui'

/**
 * The trade-off in one chart: bit error rate against SNR for every
 * constellation, theory as lines and a quick simulation as dots. Each extra
 * bit per symbol costs roughly 3 dB (BPSK→QPSK is free: Q is a second,
 * independent BPSK).
 */

const SNR_RANGE: [number, number] = [-5, 40]
const LOG_RANGE: [number, number] = [-7, 0]
const TARGET = 1e-5

const schemeColor = (scheme: Scheme) => `--s${SCHEMES.indexOf(scheme)}`

function useSimulation() {
  return useMemo(() => {
    const random = createRandom(2024)
    const points: { scheme: Scheme; snrDb: number; ber: number }[] = []
    for (const scheme of SCHEMES) {
      for (let snrDb = SNR_RANGE[0]; snrDb <= SNR_RANGE[1]; snrDb += 2.5) {
        const theory = bitErrorRate(scheme, snrDb)
        if (theory < 3e-5) continue
        const { ber } = measureBer(scheme, snrDb, 60_000, random)
        if (ber > 0) points.push({ scheme, snrDb, ber })
      }
    }
    return points
  }, [])
}

export function BerCurves({
  scheme,
  snrDb,
  onPick,
}: {
  scheme: Scheme
  snrDb: number
  onPick: (patch: { scheme?: Scheme; snrDb?: number }) => void
}) {
  const simulated = useSimulation()
  const plotRef = useRef<Plot | null>(null)
  const needed = useMemo(() => Object.fromEntries(SCHEMES.map((s) => [s, snrForBer(s, TARGET)])) as Record<Scheme, number>, [])

  const draw = (frame: Frame) => {
    const { ctx, color } = frame
    const plot = plotArea(frame, SNR_RANGE, LOG_RANGE, { left: 48, right: 14, top: 12, bottom: 30 })
    plotRef.current = plot

    // Grid: decades on y, 5 dB on x
    ctx.lineWidth = 1
    ctx.strokeStyle = color('--grid')
    ctx.fillStyle = color('--muted')
    ctx.textAlign = 'right'
    for (let e = LOG_RANGE[0]; e <= LOG_RANGE[1]; e++) {
      polyline(ctx, [[plot.left, plot.y(e)], [plot.left + plot.width, plot.y(e)]])
      ctx.fillText(e === 0 ? '1' : `10${superscript(e)}`, plot.left - 6, plot.y(e) + 4)
    }
    ctx.textAlign = 'center'
    for (let x = SNR_RANGE[0]; x <= SNR_RANGE[1]; x += 5) {
      polyline(ctx, [[plot.x(x), plot.top], [plot.x(x), plot.top + plot.height]])
      ctx.fillText(`${x} dB`, plot.x(x), plot.top + plot.height + 16)
    }

    // Target line
    ctx.strokeStyle = color('--target')
    ctx.setLineDash([4, 4])
    polyline(ctx, [[plot.left, plot.y(Math.log10(TARGET))], [plot.left + plot.width, plot.y(Math.log10(TARGET))]])
    ctx.setLineDash([])
    ctx.textAlign = 'left'
    ctx.fillStyle = color('--muted')
    ctx.fillText('1 error in 100,000 bits', plot.left + 6, plot.y(Math.log10(TARGET)) - 5)

    ctx.save()
    clip(ctx, plot)
    for (const s of SCHEMES) {
      const selected = s === scheme
      ctx.strokeStyle = color(schemeColor(s))
      ctx.lineWidth = selected ? 3.5 : 1.8
      ctx.globalAlpha = selected ? 1 : 0.75
      polyline(
        ctx,
        Array.from({ length: 181 }, (_, k) => {
          const x = SNR_RANGE[0] + (k / 180) * (SNR_RANGE[1] - SNR_RANGE[0])
          return [plot.x(x), plot.y(Math.log10(Math.max(1e-9, bitErrorRate(s, x))))] as [number, number]
        }),
      )
    }
    ctx.globalAlpha = 1
    for (const p of simulated) {
      ctx.fillStyle = color(schemeColor(p.scheme))
      ctx.strokeStyle = color('--surface')
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(plot.x(p.snrDb), plot.y(Math.log10(p.ber)), p.scheme === scheme ? 4.5 : 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()

    // Current SNR
    ctx.strokeStyle = color('--text')
    ctx.lineWidth = 1.5
    polyline(ctx, [[plot.x(snrDb), plot.top], [plot.x(snrDb), plot.top + plot.height]])
    const ber = bitErrorRate(scheme, snrDb)
    if (ber > 10 ** LOG_RANGE[0]) {
      ctx.fillStyle = color('--live')
      ctx.beginPath()
      ctx.arc(plot.x(snrDb), plot.y(Math.log10(ber)), 6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = color('--text')
    ctx.textAlign = plot.x(snrDb) > plot.left + plot.width - 80 ? 'right' : 'left'
    ctx.fillText(`you: ${snrDb} dB`, plot.x(snrDb) + (ctx.textAlign === 'right' ? -6 : 6), plot.top + 12)
  }

  const { ref } = useCanvas(draw)

  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const plot = plotRef.current
    if (!plot) return
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientX - rect.left - plot.left) / plot.width
    const value = SNR_RANGE[0] + fraction * (SNR_RANGE[1] - SNR_RANGE[0])
    onPick({ snrDb: Math.round(Math.max(SNR_RANGE[0], Math.min(SNR_RANGE[1], value)) * 2) / 2 })
  }

  return (
    <section className="card">
      <SectionHead step={9} title="Speed versus reliability">
        <p>
          Every constellation, every SNR. Lines are the exact theory, dots are a quick simulation of 60,000
          bits each. Denser constellations carry more bits per symbol but need a cleaner signal: each extra
          bit costs about 3 dB, that is, twice the signal power. <strong>Click the chart</strong> to set the SNR.
        </p>
      </SectionHead>

      <canvas ref={ref} className="canvas canvas-tall clickable" onClick={pick} aria-label="Bit error rate against SNR for each modulation" />

      <table className="table clickable-rows">
        <thead>
          <tr>
            <th>Modulation</th>
            <th>Bits per symbol</th>
            <th>Bit error rate at {snrDb} dB</th>
            <th>SNR for 1 in 100,000</th>
          </tr>
        </thead>
        <tbody>
          {SCHEMES.map((s) => {
            const ber = bitErrorRate(s, snrDb)
            return (
              <tr key={s} className={s === scheme ? 'selected' : undefined} onClick={() => onPick({ scheme: s })}>
                <td>
                  <i className="swatch" style={{ background: `var(${schemeColor(s)})` }} /> {s}
                </td>
                <td>{constellation(s).bitsPerSymbol}</td>
                <td className={ber > 1e-3 ? 'bad' : ber > TARGET ? 'warn' : 'good'}>{fmtProbability(ber)}</td>
                <td>{fmt(needed[s])} dB</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="hint">
        Click a row to switch the whole page to that modulation. The best choice is the densest one whose
        error rate is still acceptable at your SNR, which is exactly what Wi-Fi does, packet by packet.
      </p>
    </section>
  )
}
