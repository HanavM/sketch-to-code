import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import {
  compositionBrief, compositionFromSource, compositionFromStrokes, samplePath, scoreComposition,
} from '../src/composition.js'

const stroke = (id: string, pts: Array<[number, number]>): Stroke => ({
  id,
  points: pts.map(([x, y], i) => ({ x, y, t: i * 16 })),
})

/** A dense polyline along a line, with optional per-point jitter (hand wobble). */
const line = (
  id: string, x1: number, y1: number, x2: number, y2: number, n = 24, jitter = 0,
): Stroke => {
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const w = jitter ? Math.sin(i * 2.7) * jitter : 0
    pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + w])
  }
  return stroke(id, pts)
}

const blob = (id: string, cx: number, cy: number, rx: number, ry: number, jitter = 0): Stroke => {
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const w = jitter ? Math.sin(i * 3.1) * jitter : 0
    pts.push([cx + (rx + w) * Math.cos(a), cy + (ry + w) * Math.sin(a)])
  }
  return stroke(id, pts)
}

// ---------- real generated output, inlined ----------
// Kept here rather than read from examples/demo-app so these tests never
// depend on the demo fixture, which live e2e runs rewrite.

/** CrabDoodle: one side drawn, the other produced by scale(-1,1). */
const MIRRORED_CRAB = `
const side = [
  'M19.5,24 C15,22.5 11,19.5 8.5,15.5',
  'M8.5,15.5 C2.5,13.5 1,6.5 6,4 C10.5,1.8 13.5,6 11.5,9.5 C10.5,11.5 9.5,13.5 8.5,15.5 Z',
  'M24,34 C22,37 19.5,39.5 16.5,41',
  'M29,35 C28,38 26.5,40.5 24.5,42',
]
export default function CrabDoodle() {
  return (
    <svg viewBox="-2 -2 69 49" fill="none">
      <g stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="32.5" cy="26" rx="13" ry="8.5" />
        <path d="M28.5,29.5 C30.5,31.5 34.5,31.5 36.5,29.5" />
        {side.map((d) => (<path key={d} d={d} />))}
        <g transform="translate(65, 0) scale(-1, 1)">
          {side.map((d) => (<path key={d} d={d} />))}
        </g>
      </g>
      <circle cx="28.5" cy="23" r="1.4" fill="currentColor" />
      <circle cx="36.5" cy="23" r="1.4" fill="currentColor" />
    </svg>
  )
}`

/** CornerBadge: fitted cubics dumped straight from the ink — every wobble kept. */
const TRACED_BADGE = `
const doodle = [
  'M9.4,5.6 C3.1,3.5 -0.7,29 0.3,33.3 C3.1,45.3 43.6,45.3 51.5,41 C63.7,34.5 58.7,-0.3 43.7,0 C35.5,0.2 42.5,14.7 43.9,18.4 C44.1,18.7 45.2,20.6 44.7,20.9 C42.7,22 37.4,12.1 36.9,10 C36.5,8.3 36.5,2.9 36.5,4.7 C36.5,10.3 33.5,12.6 34.9,19.1 C35.7,22.7 42.5,26.5 40.2,24.2',
  'M9.6,5.7 C18.2,5.7 14.9,23.1 9.2,24.8 C9,24.8 12,23.4 12,23.4 C13.6,22.6 14.5,21.2 15.5,19.7 C16.4,18.5 17.5,15.7 17.6,14.1 C17.7,13 16.8,9.9 17.7,10.7 C21.9,14.5 15.8,25.6 16.3,25.9 C20.4,28.3 22.5,18.6 25.5,17.8 C29.1,16.8 31.5,25.4 34.3,26.2 C38,27.2 40.6,22.1 34.6,23.6',
  'M22.8,29.5 C22.7,32.9 24.4,29.3 25.5,30.6',
  'M33.9,30.5 C33.9,30.1 31.1,31.5 33.6,31.9 C37,32.4 35,28 30.1,30.4',
]
export default function CornerBadge() {
  return (
    <svg viewBox="-2 -2 63 47" fill="none">
      {doodle.map((d) => (<path key={d} d={d} strokeWidth="1.5" />))}
    </svg>
  )
}`

describe('samplePath', () => {
  it('walks absolute M/L/Z into a closed polyline', () => {
    const pts = samplePath('M0,0 L10,0 L10,10 Z')
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts).toContainEqual({ x: 10, y: 0 })
    expect(pts[pts.length - 1]).toEqual({ x: 0, y: 0 }) // Z returns to start
  })

  it('treats trailing pairs after M as implicit linetos', () => {
    const pts = samplePath('M0,0 5,5 10,0')
    expect(pts).toContainEqual({ x: 5, y: 5 })
    expect(pts).toContainEqual({ x: 10, y: 0 })
  })

  it('handles relative commands and H/V', () => {
    const pts = samplePath('M10,10 h10 v10 l-10,0 z')
    expect(pts).toContainEqual({ x: 20, y: 10 })
    expect(pts).toContainEqual({ x: 20, y: 20 })
    expect(pts).toContainEqual({ x: 10, y: 20 })
  })

  it('flattens cubics through their endpoints', () => {
    const pts = samplePath('M0,0 C0,10 10,10 10,0')
    expect(pts[pts.length - 1]!.x).toBeCloseTo(10, 5)
    expect(pts[pts.length - 1]!.y).toBeCloseTo(0, 5)
    expect(pts.length).toBeGreaterThan(5) // actually flattened, not just endpoints
  })
})

describe('compositionFromSource', () => {
  it('resolves path data hoisted into a const array and rendered via .map()', () => {
    const sig = compositionFromSource(TRACED_BADGE)
    expect(sig.partCount).toBe(4)
  })

  it('applies a scale(-1,1) mirror group instead of reading it as one-sided', () => {
    const sig = compositionFromSource(MIRRORED_CRAB)
    // 4 side paths drawn twice + ellipse + mouth + 2 eyes
    expect(sig.partCount).toBe(12)
    // the whole point: a mirrored rebuild measures as perfectly symmetric
    expect(sig.lateralAsymmetry).toBeLessThan(0.02)
  })

  it('reads ellipse, circle, rect, line and polyline primitives', () => {
    const src = `<svg>
      <ellipse cx="10" cy="10" rx="5" ry="3" />
      <circle cx="30" cy="10" r="4" />
      <rect x="0" y="20" width="10" height="6" />
      <line x1="0" y1="30" x2="20" y2="30" />
      <polyline points="0,40 10,45 20,40" />
    </svg>`
    expect(compositionFromSource(src).partCount).toBe(5)
  })

  it('returns an empty signature for source with no drawn geometry', () => {
    const sig = compositionFromSource('export default function X() { return <div className="p-4" /> }')
    expect(sig.partCount).toBe(0)
    expect(sig.grid.every((v) => v === 0)).toBe(true)
  })
})

describe('detailDensity separates a traced scan from a rebuilt form', () => {
  it('ranks real traced ink far above a real rebuilt icon', () => {
    const traced = compositionFromSource(TRACED_BADGE).detailDensity
    const rebuilt = compositionFromSource(MIRRORED_CRAB).detailDensity
    expect(traced).toBeGreaterThan(rebuilt * 3)
  })
})

describe('normalization invariance', () => {
  it('is unchanged by translation and uniform scale', () => {
    const base = [blob('a', 40, 30, 18, 12), line('b', 10, 30, 30, 30)]
    const moved = base.map((s) => ({
      id: s.id,
      points: s.points.map((p) => ({ x: p.x * 2.5 + 400, y: p.y * 2.5 + 180, t: p.t })),
    }))
    const A = compositionFromStrokes(base)
    const B = compositionFromStrokes(moved)
    expect(B.aspect).toBeCloseTo(A.aspect, 6)
    expect(B.lateralAsymmetry).toBeCloseTo(A.lateralAsymmetry, 6)
    for (let i = 0; i < A.grid.length; i++) expect(B.grid[i]).toBeCloseTo(A.grid[i]!, 6)
  })

  it('scores a correctly-snapped rebuild highly despite a size change', () => {
    // same arrangement, rendered 3x larger — what "snap to the spacing scale" does
    const drawn = [blob('a', 40, 30, 18, 12), line('b', 6, 30, 22, 30)]
    const rendered = `<svg><ellipse cx="120" cy="90" rx="54" ry="36" /><line x1="18" y1="90" x2="66" y2="90" /></svg>`
    const v = scoreComposition(compositionFromStrokes(drawn), compositionFromSource(rendered))
    expect(v.massSimilarity).toBeGreaterThan(0.6)
    expect(v.flaws).not.toContain('displaced')
  })
})

describe('scoreComposition', () => {
  /** A lopsided creature: fat body right of centre, three legs on an uneven pitch. */
  const lopsided = (): Stroke[] => [
    blob('body', 70, 26, 20, 14, 1.2),
    line('spine', 46, 30, 10, 30, 20, 0.8),
    line('l1', 12, 30, 9, 44, 8, 0.6),
    line('l2', 22, 30, 20, 44, 8, 0.6),
    line('l3', 38, 30, 34, 44, 8, 0.6),
  ]

  it('flags a mirrored rebuild of a lopsided sketch', () => {
    const v = scoreComposition(compositionFromStrokes(lopsided()), compositionFromSource(MIRRORED_CRAB))
    expect(v.flaws).toContain('mirrored')
    expect(v.notes.join(' ')).toMatch(/lopsided|mirror/i)
    expect(v.score).toBeLessThan(0.6)
  })

  it('flags a traced output that emits the fitted stroke paths', () => {
    const v = scoreComposition(compositionFromStrokes(lopsided()), compositionFromSource(TRACED_BADGE))
    expect(v.flaws).toContain('traced')
    expect(v.notes.join(' ')).toMatch(/direction changes per unit length/)
  })

  it('does not excuse a traced output just because the sketch was shaky', () => {
    // "rectify, don't reproduce" is absolute: a very wobbly sketch still owes
    // a smooth rebuild, so the traced flag must not scale with the input.
    const shaky = compositionFromStrokes([blob('a', 30, 30, 20, 20, 4)])
    expect(scoreComposition(shaky, compositionFromSource(TRACED_BADGE)).flaws).toContain('traced')
  })

  it('accepts a smooth rebuild of a very shaky sketch', () => {
    const shaky = compositionFromStrokes([blob('a', 30, 30, 20, 20, 4)])
    const clean = compositionFromSource('<svg><ellipse cx="30" cy="30" rx="20" ry="20" /></svg>')
    const v = scoreComposition(shaky, clean)
    expect(v.flaws).not.toContain('traced')
  })

  it('flags evened-out spacing when uneven repeats become a uniform pitch', () => {
    // drawn: legs at x = 9, 22, 41 (uneven). rendered: 9, 17, 25 (8px pitch).
    const drawn = compositionFromStrokes([
      line('l1', 9, 0, 9, 14, 8), line('l2', 22, 0, 22, 14, 8), line('l3', 41, 0, 41, 14, 8),
    ])
    const rendered = compositionFromSource(
      `<svg><path d="M9,0 L9,14"/><path d="M17,0 L17,14"/><path d="M25,0 L25,14"/></svg>`,
    )
    const v = scoreComposition(drawn, rendered)
    expect(v.flaws).toContain('evened')
    expect(v.notes.join(' ')).toMatch(/uneven pitch/)
  })

  it('reports nothing found when the source has no geometry', () => {
    const v = scoreComposition(compositionFromStrokes(lopsided()), compositionFromSource('<div />'))
    expect(v.score).toBe(0)
    expect(v.notes[0]).toMatch(/no drawn geometry/)
  })

  it('passes a faithful rebuild with no flaws', () => {
    const drawn = lopsided()
    const sig = compositionFromStrokes(drawn)
    // rebuild the same arrangement smoothly: body right, uneven legs left
    const rendered = compositionFromSource(`<svg>
      <ellipse cx="70" cy="26" rx="20" ry="14" />
      <path d="M46,30 L10,30" />
      <path d="M12,30 L9,44" /><path d="M22,30 L20,44" /><path d="M38,30 L34,44" />
    </svg>`)
    const v = scoreComposition(sig, rendered)
    expect(v.flaws).toEqual([])
    expect(v.score).toBeGreaterThan(0.85)
  })
})

describe('compositionBrief', () => {
  it('states asymmetry and quadrant mass in terms the agent can act on', () => {
    const brief = compositionBrief(compositionFromStrokes([
      blob('body', 70, 26, 20, 14), line('spine', 46, 30, 10, 30),
    ]))
    expect(brief).toMatch(/left-right asymmetry/)
    expect(brief).toMatch(/do not mirror/)
    expect(brief).toMatch(/ink mass by quadrant/)
  })

  it('mentions repeat spacing only when there are repeats to preserve', () => {
    const one = compositionBrief(compositionFromStrokes([blob('a', 10, 10, 5, 5)]))
    expect(one).not.toMatch(/repeated parts/)
    const many = compositionBrief(compositionFromStrokes([
      line('l1', 9, 0, 9, 14), line('l2', 22, 0, 22, 14), line('l3', 41, 0, 41, 14),
    ]))
    expect(many).toMatch(/repeated parts/)
  })
})
