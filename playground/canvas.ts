import { onFrame, type Constellation } from 'visual-wifi-and-radio'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface Frame {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  /** Read a CSS custom property, e.g. color('--accent'). Follows light/dark mode. */
  color: (name: string) => string
}

/** Size the backing store for the device pixel ratio and clear it. */
export function prepare(canvas: HTMLCanvasElement): Frame {
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  const css = getComputedStyle(canvas)
  return { ctx, width, height, color: (name) => css.getPropertyValue(name).trim() }
}

/**
 * A canvas that redraws after every render, on resize and on a light/dark
 * switch. Returns the ref plus `redraw` for per-frame updates.
 */
export function useCanvas(draw: (frame: Frame) => void) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  const redraw = useCallback(() => {
    const canvas = ref.current
    if (canvas && canvas.clientWidth > 0) drawRef.current(prepare(canvas))
  }, [])

  useEffect(() => redraw())

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', redraw)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', redraw)
    }
  }, [redraw])

  return { ref, redraw }
}

/** Whether an element is on screen, so animations can pause when scrolled away. */
export function useVisible(ref: RefObject<Element | null>) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return visible
}

/** Run `callback(seconds)` every frame while `active`. */
export function useFrames(active: boolean, callback: (seconds: number) => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  useEffect(() => {
    if (!active) return
    return onFrame((seconds) => callbackRef.current(Math.min(seconds, 1 / 15)))
  }, [active])
}

/** A counter that ticks `perSecond` times a second while `active` (for fresh noise). */
export function useTicker(active: boolean, perSecond: number) {
  const [tick, setTick] = useState(0)
  const elapsed = useRef(0)
  useFrames(active, (seconds) => {
    elapsed.current += seconds
    if (elapsed.current >= 1 / perSecond) {
      elapsed.current = 0
      setTick((t) => t + 1)
    }
  })
  return tick
}

export function polyline(ctx: CanvasRenderingContext2D, points: Iterable<[number, number]>) {
  ctx.beginPath()
  let first = true
  for (const [x, y] of points) {
    if (first) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
    first = false
  }
  ctx.stroke()
}

/** A "nice" grid step (1, 2 or 5 × 10ⁿ) giving roughly `count` divisions of `span`. */
export function niceStep(span: number, count = 5): number {
  const raw = span / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  return (normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10) * magnitude
}

export interface Plot {
  left: number
  top: number
  width: number
  height: number
  x: (value: number) => number
  y: (value: number) => number
}

export interface Padding {
  left: number
  right: number
  top: number
  bottom: number
}

/** Map data ranges onto a padded plot area. */
export function plotArea(
  frame: Frame,
  xRange: [number, number],
  yRange: [number, number],
  pad: Padding = { left: 44, right: 12, top: 12, bottom: 26 },
): Plot {
  const width = frame.width - pad.left - pad.right
  const height = frame.height - pad.top - pad.bottom
  const [x0, x1] = xRange
  const [y0, y1] = yRange
  return {
    left: pad.left,
    top: pad.top,
    width,
    height,
    x: (value) => pad.left + ((value - x0) / (x1 - x0 || 1)) * width,
    y: (value) => pad.top + (1 - (value - y0) / (y1 - y0 || 1)) * height,
  }
}

/** A plot area with equal scales on both axes, centred in the frame. */
export function squareArea(frame: Frame, reach: number, pad: Padding = { left: 36, right: 12, top: 12, bottom: 24 }): Plot {
  const side = Math.min(frame.width - pad.left - pad.right, frame.height - pad.top - pad.bottom)
  const extraX = (frame.width - pad.left - pad.right - side) / 2
  const extraY = (frame.height - pad.top - pad.bottom - side) / 2
  return plotArea(frame, [-reach, reach], [-reach, reach], {
    left: pad.left + extraX,
    right: pad.right + extraX,
    top: pad.top + extraY,
    bottom: pad.bottom + extraY,
  })
}

/** Grid lines with labels along both axes. */
export function grid(
  frame: Frame,
  plot: Plot,
  xRange: [number, number],
  yRange: [number, number],
  format: { x?: (v: number) => string; y?: (v: number) => string } = {},
) {
  const { ctx, color } = frame
  const fx = format.x ?? ((v) => `${+v.toFixed(2)}`)
  const fy = format.y ?? ((v) => `${+v.toFixed(2)}`)
  ctx.lineWidth = 1
  ctx.strokeStyle = color('--grid')
  ctx.fillStyle = color('--muted')

  const xStep = niceStep(xRange[1] - xRange[0], Math.max(2, Math.floor(plot.width / 90)))
  ctx.textAlign = 'center'
  for (const v of ticks(xRange, xStep)) {
    ctx.beginPath()
    ctx.moveTo(plot.x(v), plot.top)
    ctx.lineTo(plot.x(v), plot.top + plot.height)
    ctx.stroke()
    ctx.fillText(fx(v), plot.x(v), plot.top + plot.height + 16)
  }

  const yStep = niceStep(yRange[1] - yRange[0], Math.max(2, Math.floor(plot.height / 50)))
  ctx.textAlign = 'right'
  for (const v of ticks(yRange, yStep)) {
    ctx.beginPath()
    ctx.moveTo(plot.left, plot.y(v))
    ctx.lineTo(plot.left + plot.width, plot.y(v))
    ctx.stroke()
    ctx.fillText(fy(v), plot.left - 6, plot.y(v) + 4)
  }
}

/** Tick values as whole multiples of `step`, so 0.1 + 0.2 never shows up as 0.30000000000000004. */
function ticks([from, to]: [number, number], step: number): number[] {
  const result: number[] = []
  for (let i = Math.ceil(from / step - 1e-9); i * step <= to + 1e-9; i++) {
    result.push(Number((i * step).toPrecision(12)))
  }
  return result
}

export function clip(ctx: CanvasRenderingContext2D, plot: Plot) {
  ctx.beginPath()
  ctx.rect(plot.left, plot.top, plot.width, plot.height)
  ctx.clip()
}

/** The I and Q axes through the origin, labelled. */
export function iqAxes(frame: Frame, plot: Plot, reach: number) {
  const { ctx, color } = frame
  ctx.strokeStyle = color('--target')
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(plot.x(-reach), plot.y(0))
  ctx.lineTo(plot.x(reach), plot.y(0))
  ctx.moveTo(plot.x(0), plot.y(-reach))
  ctx.lineTo(plot.x(0), plot.y(reach))
  ctx.stroke()
  ctx.fillStyle = color('--i')
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('I →', plot.left + plot.width - 4, plot.y(0) - 6)
  ctx.fillStyle = color('--q')
  ctx.textAlign = 'left'
  ctx.fillText('↑ Q', plot.x(0) + 6, plot.top + 12)
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
}

/** How far the I/Q view should reach to fit a constellation with some room around it. */
export function reachFor(c: Constellation, margin = 0.35) {
  return Math.max(...c.points.map((p) => Math.max(Math.abs(p.i), Math.abs(p.q)))) + margin
}

/** Draw every point of a constellation, with bit labels when they fit. */
export function constellationPoints(
  frame: Frame,
  plot: Plot,
  c: Constellation,
  options: { labels?: boolean; color?: string; size?: number } = {},
) {
  const { ctx, color } = frame
  const pixelsBetween = plot.x(2 * c.scale) - plot.x(0)
  const size = options.size ?? Math.max(1.5, Math.min(5, pixelsBetween / 5))
  ctx.fillStyle = options.color ?? color('--text')
  for (const p of c.points) {
    ctx.beginPath()
    ctx.arc(plot.x(p.i), plot.y(p.q), size, 0, Math.PI * 2)
    ctx.fill()
  }
  const labels = options.labels ?? true
  // A label needs roughly 7px per bit to be readable.
  if (labels && pixelsBetween > c.bitsPerSymbol * 6.5) {
    ctx.fillStyle = color('--muted')
    ctx.textAlign = 'center'
    ctx.font = `${pixelsBetween > 60 ? 11 : 9}px ui-monospace, Consolas, monospace`
    c.points.forEach((p, symbol) => {
      ctx.fillText(symbol.toString(2).padStart(c.bitsPerSymbol, '0'), plot.x(p.i), plot.y(p.q) - size - 4)
    })
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  }
}

/** Compact number formatting for readouts. */
export function fmt(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits))
  return (Object.is(rounded, -0) ? 0 : rounded).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Probabilities like 3.2 × 10⁻⁵, readable at a glance. */
export function fmtProbability(p: number): string {
  if (p <= 0) return '0'
  if (p >= 0.01) return p.toFixed(3)
  const exponent = Math.floor(Math.log10(p))
  const mantissa = p / 10 ** exponent
  if (exponent < -15) return '< 10⁻¹⁵'
  return `${mantissa.toFixed(1)} × 10${superscript(exponent)}`
}

const superscripts: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

export function superscript(n: number): string {
  return String(n)
    .split('')
    .map((ch) => superscripts[ch] ?? ch)
    .join('')
}

/** "1 in 31,000" style wording for an error rate. */
export function oneIn(p: number): string {
  if (p <= 1e-15) return 'practically never'
  const n = 1 / p
  if (n < 1.5) return 'almost every bit'
  const rounded = Number(n.toPrecision(2))
  return `1 in ${rounded.toLocaleString('en-US')}`
}
