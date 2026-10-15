import {
  DEFAULT_LINK,
  addSignalNoise,
  amDemodulate,
  amModulate,
  amplitudeSpectrum,
  channelNoiseSigma,
  createRandom,
  fmDemodulate,
  fmModulate,
  messageBandwidth,
  messageSignal,
  outputSnrDb,
  type MessageShape,
} from 'visual-wifi-and-radio'
import { useMemo, useRef, useState } from 'react'
import { clip, fmt, grid, plotArea, polyline, useCanvas, useTicker, useVisible, type Frame, type Plot } from '../canvas'
import { SectionHead, Slider, Swatch } from '../ui'

/**
 * AM and FM side by side in structure: message → modulated carrier → noisy
 * channel → receiver → recovered message, plus the spectrum on air.
 *
 * One window is 1 ms, so frequencies read as kHz. The carrier is slowed to
 * 32 kHz so the cycles stay visible.
 */

type Kind = 'AM' | 'FM'
const link = DEFAULT_LINK
const N = link.samples
const SPAN = 24 // kHz either side of the carrier in the spectrum

function useRadio(kind: Kind, shape: MessageShape, tone: number, knob: number, snrDb: number, tick: number) {
  return useMemo(() => {
    const message = messageSignal(shape, tone, N)
    const audio = messageBandwidth(shape, tone)
    const sigma = channelNoiseSigma(snrDb, link)
    const random = createRandom(tick * 7919 + 1)
    const tx = kind === 'AM' ? amModulate(message, knob, link) : fmModulate(message, knob, link)
    const rx = addSignalNoise(tx, sigma, random)
    const out = kind === 'AM' ? amDemodulate(rx, knob, audio, link) : fmDemodulate(rx, knob, audio, link)
    // The same message through AM at full depth, same noise level, for comparison.
    const amRx = addSignalNoise(amModulate(message, 1, link), sigma, createRandom(tick * 7919 + 2))
    const amOut = amDemodulate(amRx, 1, audio, link)
    return {
      message,
      audio,
      tx,
      rx,
      out,
      spectrum: amplitudeSpectrum(rx),
      outSnr: outputSnrDb(message, out),
      amSnr: outputSnrDb(message, amOut),
      messagePower: message.reduce((sum, x) => sum + x * x, 0) / N,
    }
  }, [kind, shape, tone, knob, snrDb, tick])
}

function timeAxis(frame: Frame, yRange: [number, number]): Plot {
  const plot = plotArea(frame, [0, 1], yRange, { left: 36, right: 12, top: 10, bottom: 24 })
  grid(frame, plot, [0, 1], yRange, { x: (v) => `${fmt(v, 1)} ms`, y: (v) => `${v}` })
  return plot
}

function trace(ctx: CanvasRenderingContext2D, plot: Plot, signal: ArrayLike<number>, scale = 1) {
  polyline(
    ctx,
    Array.from({ length: signal.length }, (_, n) => [plot.x(n / signal.length), plot.y(signal[n] * scale)] as [number, number]),
  )
}

function AnalogRadio({ kind, snrDb }: { kind: Kind; snrDb: number }) {
  const [shape, setShape] = useState<MessageShape>('tone')
  const [tone, setTone] = useState(2)
  const [depth, setDepth] = useState(0.8)
  const [deviation, setDeviation] = useState(6)
  const [live, setLive] = useState(true)
  const knob = kind === 'AM' ? depth : deviation
  const anchor = useRef<HTMLDivElement>(null)
  const visible = useVisible(anchor)
  const tick = useTicker(live && visible, 6)
  const radio = useRadio(kind, shape, tone, knob, snrDb, tick)

  const drawAir = (frame: Frame) => {
    const { ctx, color } = frame
    const reach = kind === 'AM' ? Math.max(1.4, 1 + depth + 0.2) : 1.6
    const plot = timeAxis(frame, [-reach, reach])
    ctx.save()
    clip(ctx, plot)
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1
    ctx.strokeStyle = color('--noise')
    trace(ctx, plot, radio.rx)
    ctx.globalAlpha = 1
    ctx.lineWidth = 1.5
    ctx.strokeStyle = color('--carrier')
    trace(ctx, plot, radio.tx)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = color('--message')
    ctx.setLineDash([6, 4])
    if (kind === 'AM') {
      trace(ctx, plot, radio.message.map((m) => 1 + depth * m))
      trace(ctx, plot, radio.message.map((m) => -(1 + depth * m)))
    } else {
      trace(ctx, plot, radio.message, 1.3)
    }
    ctx.setLineDash([])
    ctx.restore()
  }

  const drawSpectrum = (frame: Frame) => {
    const { ctx, color } = frame
    const c = link.carrier
    const xRange: [number, number] = [-SPAN, SPAN]
    const yRange: [number, number] = [-50, 0]
    const plot = plotArea(frame, xRange, yRange, { left: 40, right: 12, top: 22, bottom: 24 })

    // The channel the receiver listens to
    ctx.fillStyle = color('--chip')
    ctx.fillRect(plot.x(-link.bandwidth - 0.5), plot.top, plot.x(link.bandwidth + 0.5) - plot.x(-link.bandwidth - 0.5), plot.height)
    grid(frame, plot, xRange, yRange, {
      x: (v) => (v === 0 ? 'carrier' : `${v > 0 ? '+' : ''}${v}`),
      y: (v) => `${v} dB`,
    })

    // The bandwidth the signal really needs
    const half = kind === 'AM' ? radio.audio : deviation + radio.audio
    ctx.strokeStyle = color('--message')
    ctx.fillStyle = color('--message')
    ctx.lineWidth = 1.5
    const y = plot.top - 10
    polyline(ctx, [[plot.x(-half), y + 4], [plot.x(-half), y], [plot.x(half), y], [plot.x(half), y + 4]])
    ctx.textAlign = 'center'
    ctx.fillText(`${kind === 'AM' ? 'needs' : 'Carson’s rule'}: ${2 * half} kHz`, plot.x(0), y - 3)

    ctx.save()
    clip(ctx, plot)
    ctx.strokeStyle = color('--carrier')
    ctx.lineWidth = Math.max(1.5, plot.width / (4 * SPAN))
    for (let k = -SPAN; k <= SPAN; k++) {
      const amplitude = radio.spectrum[c + k]
      const db = Math.max(-60, 20 * Math.log10(amplitude + 1e-12))
      polyline(ctx, [[plot.x(k), plot.y(-60)], [plot.x(k), plot.y(db)]])
    }
    ctx.restore()
  }

  const drawOut = (frame: Frame) => {
    const { ctx, color } = frame
    const plot = timeAxis(frame, [-1.6, 1.6])
    ctx.save()
    clip(ctx, plot)
    ctx.lineWidth = 2
    ctx.strokeStyle = color('--message')
    ctx.setLineDash([6, 4])
    trace(ctx, plot, radio.message)
    ctx.setLineDash([])
    ctx.lineWidth = 2
    ctx.strokeStyle = color('--accent')
    trace(ctx, plot, radio.out)
    ctx.restore()
  }

  const air = useCanvas(drawAir)
  const spectrum = useCanvas(drawSpectrum)
  const out = useCanvas(drawOut)

  const overmodulated = kind === 'AM' && depth > 1
  const carrierShare = 1 / (1 + depth * depth * radio.messagePower)
  const beta = deviation / radio.audio

  return (
    <section className="card">
      {kind === 'AM' ? (
        <SectionHead step={2} title="AM: the message rides on the height">
          <p>
            Amplitude modulation makes the carrier taller and shorter following the sound,{' '}
            <var>s</var>(<var>t</var>) = (1 + <var>μ</var>·<var>m</var>(<var>t</var>))·cos(2π<var>f</var>
            <sub>c</sub><var>t</var>). The outline of the wave (the <em>envelope</em>) <strong>is</strong> the
            message, so a receiver only has to trace it. Noise adds straight onto that height.
          </p>
        </SectionHead>
      ) : (
        <SectionHead step={3} title="FM: the message rides on the speed">
          <p>
            Frequency modulation keeps the height fixed and makes the carrier spin faster or slower
            following the sound. Noise mostly changes the height, which FM ignores, so it sounds cleaner
            than AM. The price: it takes up much more spectrum, and below a certain SNR it falls apart.
          </p>
        </SectionHead>
      )}

      <div className="split" ref={anchor}>
        <div className="stack">
          <label className="select">
            Message
            <select value={shape} onChange={(e) => setShape(e.target.value as MessageShape)}>
              <option value="tone">Pure tone</option>
              <option value="chord">Two notes</option>
              <option value="voice">Voice-like</option>
            </select>
          </label>
          <Slider label="Message pitch" value={tone} min={1} max={4} step={1} unit=" kHz" onChange={setTone} />
          {kind === 'AM' ? (
            <Slider label={<>Modulation depth <var>μ</var></>} value={depth} min={0} max={1.5} step={0.05} display={`${Math.round(depth * 100)}%`} onChange={setDepth} />
          ) : (
            <Slider label={<>Frequency deviation <var>Δf</var></>} value={deviation} min={1} max={10} step={0.5} unit=" kHz" onChange={setDeviation} />
          )}
          <label className="checkbox">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Live noise (SNR from the sidebar: {snrDb} dB)
          </label>
          <dl className="stats">
            {kind === 'AM' ? (
              <>
                <div>
                  <dt>Bandwidth used</dt>
                  <dd>{2 * radio.audio} kHz</dd>
                </div>
                <div>
                  <dt>Power spent on the bare carrier</dt>
                  <dd>{Math.round(carrierShare * 100)}%</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Bandwidth used (Carson)</dt>
                  <dd>{fmt(2 * (deviation + radio.audio), 0)} kHz</dd>
                </div>
                <div>
                  <dt>Modulation index β = Δf ÷ pitch</dt>
                  <dd>{fmt(beta, 2)}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Sound quality out (SNR)</dt>
              <dd className={radio.outSnr < 10 ? 'bad' : radio.outSnr < 25 ? 'warn' : 'good'}>{fmt(radio.outSnr)} dB</dd>
            </div>
            <div>
              <dt>{kind === 'AM' ? 'Channel SNR' : 'AM at 100%, same noise'}</dt>
              <dd>{kind === 'AM' ? `${snrDb} dB` : `${fmt(radio.amSnr)} dB`}</dd>
            </div>
          </dl>
        </div>
        <div className="stack">
          <span className="canvas-title">On air (clean and with noise)</span>
          <canvas ref={air.ref} className="canvas" aria-label={`${kind} signal on air`} />
        </div>
      </div>

      <div className="legend">
        <span><Swatch color="--carrier" /> transmitted</span>
        <span><Swatch color="--noise" /> what the antenna picks up</span>
        <span><Swatch color="--message" dashed /> the message{kind === 'AM' ? ' (as the envelope)' : ''}</span>
        <span><Swatch color="--accent" /> what the receiver recovers</span>
      </div>

      <div className="two-col">
        <div className="stack">
          <span className="canvas-title">Spectrum around the carrier (kHz)</span>
          <canvas ref={spectrum.ref} className="canvas canvas-short" aria-label={`${kind} spectrum`} />
        </div>
        <div className="stack">
          <span className="canvas-title">After the receiver</span>
          <canvas ref={out.ref} className="canvas canvas-short" aria-label={`${kind} recovered message`} />
        </div>
      </div>

      <p className="callout">
        {kind === 'AM'
          ? overmodulated
            ? 'Over 100%: the envelope tries to go below zero and folds back up. The receiver cannot tell, so the sound comes out distorted, even with no noise at all.'
            : `The spectrum shows the carrier with one copy of the sound on each side (the sidebands). Most power goes into the carrier, which carries no information: that is why AM is wasteful.`
          : radio.outSnr < radio.amSnr
            ? 'Below the FM threshold: noise now knocks the arrow all the way around, and each slip becomes a loud click. AM degrades gently; FM falls off a cliff.'
            : `FM is ${fmt(radio.outSnr - radio.amSnr, 0)} dB cleaner than AM here. More deviation means more bandwidth and more noise immunity: FM trades spectrum for quality.`}
      </p>
    </section>
  )
}

export const AmRadio = ({ snrDb }: { snrDb: number }) => <AnalogRadio kind="AM" snrDb={snrDb} />
export const FmRadio = ({ snrDb }: { snrDb: number }) => <AnalogRadio kind="FM" snrDb={snrDb} />
