import { addSignalNoise, createRandom, keyed, passbandNoiseSigma, type Keying as KeyingKind } from 'visual-wifi-and-radio'
import { useMemo, useState } from 'react'
import { polyline, useCanvas, type Frame } from '../canvas'
import { SectionHead, Slider, Swatch } from '../ui'

/**
 * Digital on a carrier: the same bits sent three ways. Instead of smoothly
 * following a sound, the carrier jumps between a few fixed states.
 */

const SPS = 64
const LANES: { kind: KeyingKind | 'bits'; label: string }[] = [
  { kind: 'bits', label: 'Bits' },
  { kind: 'ASK', label: 'ASK (amplitude)' },
  { kind: 'FSK', label: 'FSK (frequency)' },
  { kind: 'PSK', label: 'PSK (phase)' },
]

export function Keying({ snrDb }: { snrDb: number }) {
  const [text, setText] = useState('10110010')
  const [cycles, setCycles] = useState(2)
  const [noise, setNoise] = useState(false)
  const [seed, setSeed] = useState(1)
  const bits = useMemo(() => [...text].filter((ch) => ch === '0' || ch === '1').map(Number).slice(0, 24), [text])

  const waves = useMemo(() => {
    const options = { samplesPerSymbol: SPS, cyclesPerSymbol: cycles }
    const random = createRandom(seed)
    const sigma = passbandNoiseSigma(snrDb, SPS)
    const make = (kind: KeyingKind) => {
      const clean = keyed(bits, kind, options)
      return { clean, noisy: noise ? addSignalNoise(clean, sigma, random) : null }
    }
    return { ASK: make('ASK'), FSK: make('FSK'), PSK: make('PSK') }
  }, [bits, cycles, noise, snrDb, seed])

  const draw = ({ ctx, width, height, color }: Frame) => {
    const left = 120
    const right = width - 12
    const laneHeight = height / LANES.length
    const amp = laneHeight * 0.36
    const total = Math.max(1, bits.length)
    const x = (sample: number) => left + (sample / (total * SPS)) * (right - left)

    // Bit boundaries and labels
    ctx.strokeStyle = color('--grid')
    ctx.lineWidth = 1
    for (let b = 0; b <= bits.length; b++) polyline(ctx, [[x(b * SPS), 4], [x(b * SPS), height - 4]])

    LANES.forEach(({ kind, label }, lane) => {
      const cy = laneHeight * (lane + 0.5)
      ctx.fillStyle = color('--muted')
      ctx.textAlign = 'left'
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(label, 8, cy + 4)
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      if (lane > 0) {
        ctx.strokeStyle = color('--border')
        polyline(ctx, [[8, laneHeight * lane], [right, laneHeight * lane]])
      }

      if (kind === 'bits') {
        ctx.strokeStyle = color('--text')
        ctx.lineWidth = 2
        const points: [number, number][] = []
        bits.forEach((bit, b) => {
          const y = cy + (bit ? -amp : amp) * 0.8
          points.push([x(b * SPS), y], [x((b + 1) * SPS), y])
        })
        polyline(ctx, points)
        ctx.fillStyle = color('--text')
        ctx.textAlign = 'center'
        ctx.font = '600 13px ui-monospace, Consolas, monospace'
        bits.forEach((bit, b) => ctx.fillText(String(bit), x((b + 0.5) * SPS), cy + 5))
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
        return
      }

      const wave = waves[kind]
      const series = (signal: Float64Array) =>
        Array.from(signal, (v, n) => [x(n), cy - v * amp] as [number, number])
      if (wave.noisy) {
        ctx.strokeStyle = color('--noise')
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.7
        polyline(ctx, series(wave.noisy))
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = color('--carrier')
      ctx.lineWidth = 1.8
      polyline(ctx, series(wave.clean))
    })
  }

  const { ref } = useCanvas(draw)

  return (
    <section className="card">
      <SectionHead step={4} title="Digital: ones and zeros on a carrier">
        <p>
          To send bits instead of sound, the carrier switches between a few fixed states, one per bit
          period. Switch the amplitude (ASK), the frequency (FSK) or the phase (PSK). PSK is the hardest
          for noise to fool: the two states are as different as a wave can be, exact opposites.
        </p>
      </SectionHead>

      <div className="row">
        <label className="select grow">
          Bits
          <input className="text mono" value={text} maxLength={24} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="grow">
          <Slider label="Carrier cycles per bit" value={cycles} min={1} max={6} step={1} onChange={setCycles} />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} />
          Add noise ({snrDb} dB)
        </label>
        {noise && (
          <button className="chip" onClick={() => setSeed((s) => s + 1)}>
            New noise
          </button>
        )}
      </div>

      <canvas ref={ref} className="canvas canvas-tall" aria-label="The same bits sent with ASK, FSK and PSK" />
      <div className="legend">
        <span><Swatch color="--carrier" /> transmitted wave</span>
        {noise && <span><Swatch color="--noise" /> received with noise</span>}
      </div>
      <p className="hint">
        In PSK a 0 is the same wave as a 1, flipped upside down (shifted by 180°). Look for the sudden
        jumps at the boundaries where the bit changes. Old dial-up modems used FSK; Wi-Fi’s slowest,
        most robust rate (BPSK) is exactly this PSK.
      </p>
    </section>
  )
}
