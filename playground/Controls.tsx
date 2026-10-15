import {
  SCHEMES,
  bitErrorRate,
  constellation,
  ebN0Db,
  noiseSigma,
  shannonCapacity,
  symbolErrorRate,
  type Scheme,
} from 'visual-wifi-and-radio'
import { fmt, fmtProbability, oneIn } from './canvas'
import { Slider } from './ui'

export interface Params {
  scheme: Scheme
  /** Signal-to-noise ratio (Es/N₀) in dB. */
  snrDb: number
}

export const defaultParams: Params = { scheme: '16-QAM', snrDb: 16 }

const presets: Record<string, Partial<Params>> = {
  'Next to the router': { snrDb: 38 },
  'Next room': { snrDb: 24 },
  'Far bedroom': { snrDb: 12 },
  'Out in the garden': { snrDb: 5 },
}

export function Controls({ params, onChange }: { params: Params; onChange: (params: Params) => void }) {
  const set = (patch: Partial<Params>) => onChange({ ...params, ...patch })
  const c = constellation(params.scheme)
  const ber = bitErrorRate(params.scheme, params.snrDb)
  const ser = symbolErrorRate(params.scheme, params.snrDb)
  const sigma = noiseSigma(params.snrDb)
  const capacity = shannonCapacity(params.snrDb)

  return (
    <aside className="card controls">
      <div>
        <h2>The radio link</h2>
        <p className="muted small">These settings drive every experiment on the page.</p>
      </div>

      <div className="scheme-picker" role="radiogroup" aria-label="Modulation">
        {SCHEMES.map((scheme) => (
          <button
            key={scheme}
            role="radio"
            aria-checked={scheme === params.scheme}
            className={`chip${scheme === params.scheme ? ' selected' : ''}`}
            onClick={() => set({ scheme })}
          >
            {scheme}
          </button>
        ))}
      </div>

      <Slider
        label={<>Signal-to-noise ratio</>}
        value={params.snrDb}
        min={-5}
        max={40}
        step={0.5}
        unit=" dB"
        onChange={(snrDb) => set({ snrDb })}
      />
      <div className="presets">
        {Object.entries(presets).map(([name, preset]) => (
          <button key={name} className="chip" onClick={() => set(preset)}>
            {name}
          </button>
        ))}
      </div>

      <dl className="stats">
        <div>
          <dt>Bits per symbol</dt>
          <dd>{c.bitsPerSymbol}</dd>
        </div>
        <div>
          <dt>Points</dt>
          <dd>{c.order}</dd>
        </div>
        <div>
          <dt>Signal power ÷ noise</dt>
          <dd>{fmt(10 ** (params.snrDb / 10), params.snrDb < 10 ? 1 : 0)}×</dd>
        </div>
        <div>
          <dt>Per bit (Eb/N₀)</dt>
          <dd>{fmt(ebN0Db(params.scheme, params.snrDb))} dB</dd>
        </div>
        <div>
          <dt>Noise σ ÷ gap to decision line</dt>
          <dd className={sigma / c.scale > 0.5 ? 'bad' : sigma / c.scale > 0.25 ? 'warn' : 'good'}>
            {fmt(sigma / c.scale, 2)}
          </dd>
        </div>
        <div>
          <dt>Symbol error rate</dt>
          <dd>{fmtProbability(ser)}</dd>
        </div>
        <div className="wide">
          <dt>Bit error rate (theory)</dt>
          <dd className={ber > 1e-3 ? 'bad' : ber > 1e-6 ? 'warn' : 'good'}>
            {fmtProbability(ber)} <span className="muted small">· {oneIn(ber)}</span>
          </dd>
        </div>
        <div className="wide">
          <dt>Shannon limit at this SNR</dt>
          <dd>
            {fmt(capacity, 2)} bits/symbol{' '}
            <span className="muted small">
              (using {c.bitsPerSymbol}
              {c.bitsPerSymbol > capacity ? ', too greedy' : ''})
            </span>
          </dd>
        </div>
      </dl>
    </aside>
  )
}
