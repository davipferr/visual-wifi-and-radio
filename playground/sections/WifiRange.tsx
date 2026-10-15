import { BANDS, WIFI_MCS, bestMcs, linkSnrDb, pathLossDb, type Band, type Scheme } from 'visual-wifi-and-radio'
import { useState } from 'react'
import { clip, fmt, plotArea, polyline, useCanvas, type Frame } from '../canvas'
import { SectionHead, Slider, Swatch } from '../ui'

/**
 * Why Wi-Fi slows down in the far bedroom. Signal fades with distance and
 * walls, SNR drops, and the radio steps down to a sparser constellation (and
 * stronger coding) so the bits still arrive.
 */

const MAX_DISTANCE = 60
const BAND_COLORS: Record<Band, string> = { '2.4 GHz': '--s4', '5 GHz': '--s1', '6 GHz': '--s2' }

export function WifiRange({ onApply }: { onApply: (patch: { scheme: Scheme; snrDb: number }) => void }) {
  const [distance, setDistance] = useState(8)
  const [walls, setWalls] = useState(1)
  const [band, setBand] = useState<Band>('5 GHz')
  const snrDb = linkSnrDb({ band, distance, walls })
  const mcs = bestMcs(snrDb)
  const loss = pathLossDb({ band, distance, walls })

  const draw = (frame: Frame) => {
    const { ctx, color } = frame
    const xRange: [number, number] = [0, MAX_DISTANCE]
    const yRange: [number, number] = [0, 150]
    const plot = plotArea(frame, xRange, yRange, { left: 48, right: 14, top: 14, bottom: 30 })

    ctx.lineWidth = 1
    ctx.strokeStyle = color('--grid')
    ctx.fillStyle = color('--muted')
    ctx.textAlign = 'right'
    for (let y = 0; y <= 150; y += 25) {
      polyline(ctx, [[plot.left, plot.y(y)], [plot.left + plot.width, plot.y(y)]])
      ctx.fillText(`${y}`, plot.left - 6, plot.y(y) + 4)
    }
    ctx.textAlign = 'center'
    for (let x = 0; x <= MAX_DISTANCE; x += 10) {
      polyline(ctx, [[plot.x(x), plot.top], [plot.x(x), plot.top + plot.height]])
      ctx.fillText(`${x} m`, plot.x(x), plot.top + plot.height + 16)
    }
    ctx.save()
    ctx.translate(12, plot.top + plot.height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Mbit/s', 0, 0)
    ctx.restore()

    ctx.save()
    clip(ctx, plot)
    for (const b of Object.keys(BANDS) as Band[]) {
      ctx.strokeStyle = color(BAND_COLORS[b])
      ctx.lineWidth = b === band ? 3 : 1.5
      ctx.globalAlpha = b === band ? 1 : 0.5
      polyline(
        ctx,
        Array.from({ length: 400 }, (_, k) => {
          const d = 0.5 + (k / 399) * (MAX_DISTANCE - 0.5)
          const rate = bestMcs(linkSnrDb({ band: b, distance: d, walls }))?.mbps ?? 0
          return [plot.x(d), plot.y(rate)] as [number, number]
        }),
      )
    }
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.strokeStyle = color('--text')
    ctx.lineWidth = 1.5
    polyline(ctx, [[plot.x(distance), plot.top], [plot.x(distance), plot.top + plot.height]])
    ctx.fillStyle = color('--live')
    ctx.beginPath()
    ctx.arc(plot.x(distance), plot.y(mcs?.mbps ?? 0), 6, 0, Math.PI * 2)
    ctx.fill()
  }

  const { ref } = useCanvas(draw)

  return (
    <section className="card">
      <SectionHead step={10} title="Wi-Fi: walking away from the router">
        <p>
          A Wi-Fi radio measures the SNR and picks a <em>modulation and coding scheme</em> (MCS) for every
          packet: the densest constellation that will still get through, plus some extra error-correction
          bits (the coding rate, e.g. 5/6 means 1 extra bit for every 5 data bits). Walk away and it steps
          down, one constellation at a time.
        </p>
      </SectionHead>

      <div className="split">
        <div className="stack">
          <Slider label="Distance to the router" value={distance} min={1} max={MAX_DISTANCE} step={1} unit=" m" onChange={setDistance} />
          <Slider label="Walls in between" value={walls} min={0} max={5} step={1} onChange={setWalls} />
          <label className="select">
            Band
            <select value={band} onChange={(e) => setBand(e.target.value as Band)}>
              {(Object.keys(BANDS) as Band[]).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <dl className="stats">
            <div>
              <dt>Signal lost on the way</dt>
              <dd>{fmt(loss, 0)} dB</dd>
            </div>
            <div>
              <dt>SNR at the laptop</dt>
              <dd>{fmt(snrDb)} dB</dd>
            </div>
            <div className="wide">
              <dt>Chosen</dt>
              <dd>{mcs ? `MCS ${mcs.index}: ${mcs.scheme}, rate ${mcs.codeRate} → ${mcs.mbps} Mbit/s` : 'No connection'}</dd>
            </div>
          </dl>
          <button
            className="primary"
            disabled={!mcs}
            onClick={() => mcs && onApply({ scheme: mcs.scheme, snrDb: Math.round(Math.min(40, Math.max(-5, snrDb)) * 2) / 2 })}
          >
            Use this SNR and modulation on the page
          </button>
        </div>
        <div className="stack">
          <canvas ref={ref} className="canvas" aria-label="Wi-Fi data rate against distance" />
          <div className="legend">
            {(Object.keys(BANDS) as Band[]).map((b) => (
              <span key={b}><Swatch color={BAND_COLORS[b]} /> {b}</span>
            ))}
          </div>
        </div>
      </div>

      <table className="table compact">
        <thead>
          <tr>
            <th>MCS</th>
            <th>Modulation</th>
            <th>Coding</th>
            <th>Needs SNR ≈</th>
            <th>Speed</th>
          </tr>
        </thead>
        <tbody>
          {WIFI_MCS.map((m) => (
            <tr key={m.index} className={m === mcs ? 'selected' : snrDb < m.minSnrDb ? 'unreachable' : undefined}>
              <td>{m.index}</td>
              <td>{m.scheme}</td>
              <td>{m.codeRate}</td>
              <td>{m.minSnrDb} dB</td>
              <td>
                <span className="rate-bar" style={{ width: `${(m.mbps / 143.4) * 100}%` }} />
                {m.mbps} Mbit/s
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Speeds are Wi-Fi 6 for one antenna stream on a 20 MHz channel; real routers multiply them with
        wider channels (up to 160 MHz) and several antennas. SNR thresholds and the path-loss model
        (about 9 dB lost every time the distance doubles, plus 5 dB per wall) are typical, not exact.
        2.4 GHz reaches further; 5 and 6 GHz have far more room for wide channels.
      </p>
    </section>
  )
}
