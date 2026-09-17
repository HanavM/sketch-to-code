import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIDELITY, detailBand, fidelityDirective, normalizeFidelity, passMark, rungFor,
  type FidelityControls,
} from '../src/fidelity.js'
import { compositionFromSource, compositionFromStrokes, scoreComposition } from '../src/composition.js'
import type { Stroke } from '@s2c/ink'

const controls = (over: Partial<FidelityControls> = {}): FidelityControls => ({
  ...DEFAULT_FIDELITY, ...over,
  keep: { ...DEFAULT_FIDELITY.keep, ...(over.keep ?? {}) },
})

describe('normalizeFidelity', () => {
  it('defaults anything malformed rather than silently lowering the bar', () => {
    expect(normalizeFidelity(undefined)).toEqual(DEFAULT_FIDELITY)
    expect(normalizeFidelity('trace')).toEqual(DEFAULT_FIDELITY)
    expect(normalizeFidelity({ resemblance: 'lots', keep: { asymmetry: 'yes' } })).toEqual(DEFAULT_FIDELITY)
    expect(normalizeFidelity({ resemblance: NaN })).toEqual(DEFAULT_FIDELITY)
  })
  it('clamps the slider and accepts valid locks', () => {
    expect(normalizeFidelity({ resemblance: 4 }).resemblance).toBe(1)
    expect(normalizeFidelity({ resemblance: -2 }).resemblance).toBe(0)
    expect(normalizeFidelity({ keep: { rhythm: false } }).keep).toEqual({
      asymmetry: true, rhythm: false, proportions: true, placement: true,
    })
    expect(normalizeFidelity({ palette: 'sketch' }).palette).toBe('sketch')
    expect(normalizeFidelity({ palette: 'neon' }).palette).toBe('app')
  })
})

describe('the slider moves the bar, not just the wording', () => {
  it('climbs the rendering ladder', () => {
    expect(rungFor(0)).toBe('reinterpret')
    expect(rungFor(0.5)).toBe('normalize')
    expect(rungFor(0.7)).toBe('rebuild')
    expect(rungFor(1)).toBe('trace')
  })
  it('raises the score the output must clear', () => {
    expect(passMark(controls({ resemblance: 0 }))).toBe(0)
    expect(passMark(controls({ resemblance: 0.5 }))).toBeLessThan(passMark(controls({ resemblance: 0.7 })))
    expect(passMark(controls({ resemblance: 1 }))).toBeGreaterThan(passMark(controls({ resemblance: 0.7 })))
  })
  it('inverts the line-quality test at the trace end', () => {
    // rebuilt output: ~0 direction changes per unit; traced ink: high
    expect(detailBand(controls({ resemblance: 0.5 }), 8).max).toBe(2.5)
    const trace = detailBand(controls({ resemblance: 1 }), 8)
    expect(trace.min).toBe(4)
    expect(trace.max).toBe(Infinity)
  })
})

/** A deliberately lopsided form: a big blob left, a small one right. */
const lopsided = (): Stroke[] => {
  const pts = (cx: number, cy: number, r: number) =>
    Array.from({ length: 24 }, (_, i) => {
      const t = (i / 24) * Math.PI * 2
      return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r, t: i }
    })
  return [
    { id: 's0', points: pts(40, 50, 30) },
    { id: 's1', points: pts(110, 50, 8) },
  ]
}

/** The same two blobs rendered symmetric — the mirror failure. */
const MIRRORED_SVG = `
export default function D() {
  return (
    <svg viewBox="0 0 150 100">
      <ellipse cx="40" cy="50" rx="20" ry="20" />
      <ellipse cx="110" cy="50" rx="20" ry="20" />
    </svg>
  )
}
`

describe('keep locks decide what can fail a run', () => {
  const sketch = compositionFromStrokes(lopsided())
  const rendered = compositionFromSource(MIRRORED_SVG)

  it('flags a mirrored rebuild while asymmetry is locked', () => {
    const v = scoreComposition(sketch, rendered, controls())
    expect(v.flaws).toContain('mirrored')
    expect(v.notes.join(' ')).toMatch(/lopsided/)
  })

  it('unlocking asymmetry licenses the mirror and lifts the score', () => {
    const locked = scoreComposition(sketch, rendered, controls())
    const free = scoreComposition(sketch, rendered, controls({ keep: { asymmetry: false } }))
    expect(free.flaws).not.toContain('mirrored')
    expect(free.score).toBeGreaterThan(locked.score)
  })

  it('unlocking placement stops the layout term from sinking the score', () => {
    const elsewhere = compositionFromSource(`
      export default () => <svg viewBox="0 0 150 100"><circle cx="140" cy="95" r="4" /></svg>
    `)
    const locked = scoreComposition(sketch, elsewhere, controls())
    const free = scoreComposition(sketch, elsewhere, controls({ keep: { placement: false, asymmetry: false } }))
    expect(locked.flaws).toContain('displaced')
    expect(free.score).toBeGreaterThan(locked.score)
  })

  it('a free reinterpretation reports the measurement but cannot fail on it', () => {
    const v = scoreComposition(sketch, rendered, controls({ resemblance: 0 }))
    expect(v.score).toBeGreaterThanOrEqual(passMark(controls({ resemblance: 0 })))
  })
})

describe('trace rung', () => {
  it('fails an output that smoothed the drawn line away', () => {
    const sketch = compositionFromStrokes(lopsided())
    // primitives only: zero direction changes, far under the traced band
    const v = scoreComposition(sketch, compositionFromSource(MIRRORED_SVG), controls({ resemblance: 1 }))
    expect(v.flaws).toContain('smoothed')
    expect(v.notes.join(' ')).toMatch(/traced likeness/)
    expect(v.score).toBeLessThan(passMark(controls({ resemblance: 1 })))
  })
})

describe('fidelityDirective', () => {
  it('names the rung and separates what is scored from what is free', () => {
    const d = fidelityDirective(controls({ resemblance: 0.95, keep: { rhythm: false } }))
    expect(d).toMatch(/^TRACE \(resemblance 95%\)/)
    expect(d).toMatch(/MUST SURVIVE \(scored\).*lopsidedness/s)
    expect(d).toMatch(/Free to normalize \(not scored\).*uniform pitch/s)
  })
  it('states the styling source', () => {
    expect(fidelityDirective(controls())).toMatch(/app's existing palette/)
    expect(fidelityDirective(controls({ palette: 'sketch' }))).toMatch(/hand-drawn line quality/)
  })
  it('never leaves an unfilled placeholder in the prompt', () => {
    for (const r of [0, 0.4, 0.7, 1]) expect(fidelityDirective(controls({ resemblance: r }))).not.toMatch(/\{\w+\}/)
  })
})

describe('fill — "make me the thing", not a drawing of it', () => {
  const LINE_ART = `
    export default () => (
      <svg viewBox="0 0 100 100" fill="none">
        <path d="M20,80 C20,40 40,20 60,20 C80,20 85,50 70,80 Z" stroke="currentColor" />
        <path d="M35,50 C40,45 45,45 50,50" stroke="currentColor" />
      </svg>
    )
  `
  const REALIZED = `
    export default () => (
      <svg viewBox="0 0 100 100">
        <path d="M20,80 C20,40 40,20 60,20 C80,20 85,50 70,80 Z" fill="#f3d3b5" />
        <ellipse cx="46" cy="46" rx="4" ry="5" fill="#2b2b2b" />
        <path d="M36,38 C40,34 48,34 52,37" fill="#5b4636" />
        <path d="M44,58 C48,62 54,62 58,58" fill="#c98b7a" />
        <path d="M62,30 C74,36 78,52 70,66" fill="#e9c3a3" />
      </svg>
    )
  `

  it('measures whether the output is actually filled', () => {
    expect(compositionFromSource(LINE_ART).fillRatio).toBe(0)
    expect(compositionFromSource(REALIZED).fillRatio).toBe(1)
  })

  it('fails line art when solid shapes were asked for', () => {
    const sketch = compositionFromStrokes(lopsided())
    const v = scoreComposition(sketch, compositionFromSource(LINE_ART), controls({ fill: 'filled' }))
    expect(v.flaws).toContain('unfilled')
    expect(v.notes.join(' ')).toMatch(/solid shapes were asked for/)
  })

  it('accepts line art when line art was asked for', () => {
    const sketch = compositionFromStrokes(lopsided())
    const v = scoreComposition(sketch, compositionFromSource(LINE_ART), controls({ fill: 'outline' }))
    expect(v.flaws).not.toContain('unfilled')
  })

  it('wants elaboration, not just fills, at the realized end', () => {
    const sketch = compositionFromStrokes(lopsided())
    const sparse = compositionFromSource(`
      export default () => <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#f3d3b5" /></svg>
    `)
    const v = scoreComposition(sketch, sparse, controls({ fill: 'realized' }))
    expect(v.flaws).toContain('unfilled')
    expect(v.notes.join(' ')).toMatch(/ELABORATE/)

    const rich = scoreComposition(sketch, compositionFromSource(REALIZED), controls({ fill: 'realized' }))
    expect(rich.flaws).not.toContain('unfilled')
  })

  it('gives a finished illustration room for the detail it was told to add', () => {
    const f = controls({ fill: 'realized' })
    expect(detailBand(f, 8).max).toBeGreaterThan(detailBand(controls({ fill: 'outline' }), 8).max)
    // …but solid shapes add fills, not wobble: tracing is still tracing
    expect(detailBand(controls({ fill: 'filled' }), 8).max).toBe(detailBand(controls({ fill: 'outline' }), 8).max)
    expect(passMark(f)).toBeLessThan(passMark(controls({ fill: 'filled' })))
  })

  it('states the result level in the directive, and defaults to solid', () => {
    expect(DEFAULT_FIDELITY.fill).toBe('filled')
    expect(fidelityDirective(controls({ fill: 'realized' }))).toMatch(/FINISHED ILLUSTRATION/)
    expect(fidelityDirective(controls({ fill: 'outline' }))).toMatch(/LINE ART/)
    expect(normalizeFidelity({ fill: 'nonsense' }).fill).toBe('filled')
  })
})
