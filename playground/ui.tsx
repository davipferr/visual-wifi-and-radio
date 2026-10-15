import type { ReactNode } from 'react'

interface SliderProps {
  label: ReactNode
  value: number
  min: number
  max: number
  step: number
  unit?: string
  /** Shown instead of the raw value. */
  display?: string
  onChange: (value: number) => void
}

export function Slider({ label, value, min, max, step, unit, display, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-label">
        <span>{label}</span>
        <output>
          {display ?? value}
          {display === undefined && unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export function SectionHead({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <div className="section-head">
      <span className="step">{step}</span>
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <i
      className="swatch"
      style={
        dashed
          ? { background: `repeating-linear-gradient(90deg, var(${color}) 0 4px, transparent 4px 7px)` }
          : { background: `var(${color})` }
      }
    />
  )
}
