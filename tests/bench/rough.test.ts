import { describe, expect, it } from 'vitest'
import { resampleBySpacing } from '../../packages/ink/src/index'
// @ts-expect-error — plain .mjs bench module, no types
import { rbox, rline, rring, rarrow, rscribble, rtext, sharpTurns, deviation, closingGap } from './lib/rough.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { box, line, circle } from './lib/draw.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { scoreEdits, scoreIntent, hueOf } from './lib/intent.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import rough from './sketches/rough/index.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import tidy from './sketches/index.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { ANCHORS, driftedAnchors } from './sketches/rough/base.mjs'

type P = { x: number; y: number }
const RECT: P[] = [{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 260 }, { x: 100, y: 260 }]
const ringIdeal = (cx: number, cy: number, rx: number, ry: number) =>
  Array.from({ length: 72 }, (_, i) => ({ x: cx + rx * Math.cos((i / 72) * 2 * Math.PI), y: cy + ry * Math.sin((i / 72) * 2 * Math.PI) }))

/** The reader's own count (intent2.ts), via the real resampler. */
function readerTurns(points: P[]) {
  const rs = resampleBySpacing(points.map((p, i) => ({ ...p, t: i })), 8)
  let n = 0
  for (let i = 2; i < rs.length; i++) {
    const a1 = Math.atan2(rs[i - 1]!.y - rs[i - 2]!.y, rs[i - 1]!.x - rs[i - 2]!.x)
    const a2 = Math.atan2(rs[i]!.y - rs[i - 1]!.y, rs[i]!.x - rs[i - 1]!.x)
    let d = Math.abs(a2 - a1)
    if (d > Math.PI) d = 2 * Math.PI - d
    if (d > Math.PI / 3) n++
  }
  return n
}

describe('rough primitives are rougher than tidy ones, by a stated measure', () => {
  // the measure: mean distance (px) of the stroke from the shape it means
  it('a rough box strays >= 3x as far from its rectangle as a tidy box, and does not close', () => {
    const t = box(100, 100, 400, 160)
    for (const opts of [{}, { close: 'overlap' }, { seed: 5 }]) {
      const r = rbox(100, 100, 400, 160, opts)
      expect(deviation(r, RECT)).toBeGreaterThanOrEqual(3 * deviation(t, RECT))
      expect(closingGap(r)).toBeGreaterThan(8)
    }
    expect(closingGap(t)).toBeLessThan(1)
  })
  it('a rough line strays >= 3x as far from its segment as a tidy line', () => {
    const seg = [{ x: 100, y: 300 }, { x: 700, y: 300 }]
    expect(deviation(rline(100, 300, 700, 300), seg, false)).toBeGreaterThanOrEqual(3 * deviation(line(100, 300, 700, 300), seg, false))
  })
  it('a rough ring strays >= 3x as far from its ellipse as a tidy circle', () => {
    const ideal = ringIdeal(640, 300, 60, 60)
    expect(deviation(rring(640, 300, 60, 60), ideal)).toBeGreaterThanOrEqual(3 * deviation(circle(640, 300, 60), ideal))
  })
  it('a partial box covers only the sides asked for', () => {
    const r = rbox(100, 100, 400, 160, { sides: 2 })
    expect(Math.max(...r.map((p: P) => p.y))).toBeGreaterThan(240) // went down the right side
    expect(Math.min(...r.map((p: P) => p.x))).toBeGreaterThan(80) // never came back up the left
    expect(closingGap(r)).toBeGreaterThan(300)
  })
  it('is deterministic', () => {
    expect(rbox(1, 2, 300, 100)).toEqual(rbox(1, 2, 300, 100))
    expect(rarrow(0, 0, 200, 50)).toEqual(rarrow(0, 0, 200, 50))
  })
})

describe('roughness never changes what a mark means to the reader', () => {
  // >= 4 sharp turns confined to one element reads as DELETE (intent2.ts)
  it('sharpTurns matches the reader\'s count', () => {
    for (const s of [rbox(100, 100, 400, 160), rscribble(859, 381, 373, 106), rarrow(640, 600, 640, 370), rtext(100, 100, 300)]) {
      expect(sharpTurns(s)).toBe(readerTurns(s))
    }
  })
  it('boxes, lines, rings and arrows stay under the delete threshold; scribbles are over it', () => {
    for (let k = 0; k < 20; k++) {
      expect(readerTurns(rbox(100 + k, 100, 200 + 13 * k, 60 + 7 * k))).toBeLessThan(4)
      expect(readerTurns(rline(100, 100 + k, 600, 140))).toBeLessThan(4)
      expect(readerTurns(rring(640, 309, 60 + 3 * k, 30 + k))).toBeLessThan(4)
      expect(readerTurns(rarrow(600, 600, 620 + k, 370))).toBeLessThan(4)
      expect(readerTurns(rscribble(800 + k, 380, 300, 90))).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('the rough set', () => {
  const marks = (set: any[]) => set.reduce((a, s) => a + s.strokes.length, 0)
  const noteWords = (set: any[]) => set.reduce((a, s) => a + (s.notes ?? []).reduce((b: number, n: any) => b + n.text.split(/\s+/).length, 0), 0)

  it('has >= 10 pages, >= 4 of them edits on an existing page, ids unique', () => {
    expect(rough.length).toBeGreaterThanOrEqual(10)
    expect(rough.filter((s: any) => s.base && s.edits?.length).length).toBeGreaterThanOrEqual(4)
    expect(new Set(rough.map((s: any) => s.id)).size).toBe(rough.length)
  })
  it('stays within a 4-stroke budget a page (the tidy set allows 14)', () => {
    for (const s of rough) expect(s.strokes.length).toBeLessThanOrEqual(4)
    for (const s of tidy) expect(s.strokes.length).toBeLessThanOrEqual(14)
  })
  it('is mostly words: more typed words per mark than the tidy set', () => {
    expect(noteWords(rough) / marks(rough)).toBeGreaterThan(noteWords(tidy) / marks(tidy))
  })
  it('every edit page has a must check, and every mark it draws is on screen', () => {
    for (const s of rough) {
      if (s.edits) expect(s.edits.some((c: any) => c.must)).toBe(true)
      else expect(s.regions.some((r: any) => r.must)).toBe(true)
      for (const poly of s.strokes) for (const p of poly) {
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(s.viewport.width)
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(s.viewport.height)
      }
    }
  })
  it('every edit page anchors to measured base-page positions', () => {
    for (const s of rough.filter((x: any) => x.base)) {
      expect(s.anchors?.length).toBeGreaterThan(0)
      for (const t of s.anchors) expect(ANCHORS[t]).toBeTruthy()
    }
  })
  it('the scribble on r01 stays inside the card it deletes', () => {
    const r01 = rough.find((s: any) => s.id === 'r01-scribble-out-card')
    const card = { x: 859, y: 381, w: 373, h: 106 } // the article around ANCHORS['Usage-based billing']
    for (const p of r01.strokes[0]) {
      expect(p.x).toBeGreaterThan(card.x); expect(p.x).toBeLessThan(card.x + card.w)
      expect(p.y).toBeGreaterThan(card.y); expect(p.y).toBeLessThan(card.y + card.h)
    }
  })
})

describe('driftedAnchors', () => {
  it('passes the recorded layout and flags a moved or missing element', () => {
    expect(driftedAnchors({ 'Get started': { ...ANCHORS['Get started'] } })).toEqual([])
    expect(driftedAnchors({ 'Get started': { ...ANCHORS['Get started'], y: ANCHORS['Get started'].y + 40 } })[0]).toMatch(/moved 40px/)
    expect(driftedAnchors({ 'Get started': null })[0]).toMatch(/not on the page/)
  })
})

// ── scoring edits ───────────────────────────────────────────────────────────

let idx = 0
const el = (tag: string, text: string, y: number, extra: Record<string, unknown> = {}) =>
  ({ tag, text, allText: text, rect: { x: 0, y, w: 300, h: 30 }, parent: -1, children: 0, classes: [], srcLoc: `src/App.tsx:${++idx}:1`, ...extra })
const basePage = () => [
  el('a', 'Features', 24), el('a', 'Pricing', 24), el('a', 'About', 24),
  el('h1', 'Ship faster with Acme', 133), el('button', 'Get started', 285, { bg: 'oklch(0.208 0.042 265.755)' }),
  el('h3', 'Instant previews', 406), el('h3', 'One-click rollbacks', 406), el('h3', 'Usage-based billing', 406),
  el('blockquote', '"We cut our release time in half."', 583), el('p', 'Priya N., CTO at Fieldnote', 627),
]
const spec = (id: string) => rough.find((s: any) => s.id === id)

describe('scoreEdits', () => {
  it('the untouched base page realizes no edit spec', () => {
    for (const s of rough.filter((x: any) => x.edits)) expect(scoreEdits(s, basePage()).realized).toBe(false)
  })
  it('delete: the right card gone is realized; the wrong card gone is not', () => {
    const right = basePage().filter((e) => e.text !== 'Usage-based billing')
    expect(scoreEdits(spec('r01-scribble-out-card'), right).realized).toBe(true)
    const wrong = basePage().filter((e) => e.text !== 'One-click rollbacks')
    expect(scoreEdits(spec('r01-scribble-out-card'), wrong).realized).toBe(false)
  })
  it('delete: words that survive in a leaf wrapper still count as present', () => {
    const page = basePage().filter((e) => e.text !== 'Usage-based billing')
    page.push(el('div', 'Usage-based billing', 406))
    expect(scoreEdits(spec('r01-scribble-out-card'), page).realized).toBe(false)
  })
  it('rewrite: the headline must say the new words, not just lose the old ones', () => {
    const gone = basePage().filter((e) => e.tag !== 'h1')
    expect(scoreEdits(spec('r02-strike-headline'), gone).realized).toBe(false)
    const rewritten = basePage().map((e) => (e.tag === 'h1' ? { ...e, text: 'Sketch it. Ship it.', allText: 'Sketch it. Ship it.' } : e))
    expect(scoreEdits(spec('r02-strike-headline'), rewritten).realized).toBe(true)
  })
  it('restyle: green in sRGB or oklch passes, blue does not', () => {
    const withBg = (bg: string) => basePage().map((e) => (e.tag === 'button' ? { ...e, bg } : e))
    expect(scoreEdits(spec('r03-ring-button-green'), withBg('rgb(22, 163, 74)')).realized).toBe(true)
    expect(scoreEdits(spec('r03-ring-button-green'), withBg('oklch(0.627 0.194 149.214)')).realized).toBe(true)
    expect(scoreEdits(spec('r03-ring-button-green'), withBg('rgb(37, 99, 235)')).realized).toBe(false)
  })
  it('restyle: a transparent button takes its colour from the nearest filled ancestor', () => {
    const page = basePage()
    page.push({ ...el('div', '', 280, { bg: 'rgb(22, 163, 74)', children: 1 }) })
    const parent = page.length - 1
    const b = page.find((e) => e.tag === 'button')!
    b.bg = 'rgba(0, 0, 0, 0)'
    b.parent = parent
    expect(scoreEdits(spec('r03-ring-button-green'), page).realized).toBe(true)
  })
  it('move: the quote must end up above the features', () => {
    const moved = basePage().map((e) => (e.tag === 'blockquote' ? { ...e, rect: { ...e.rect, y: 360 } } : e))
    expect(scoreEdits(spec('r04-arrow-move-quote'), moved).realized).toBe(true)
  })
  it('add: input + a Subscribe control', () => {
    const page = [...basePage(), el('footer', '© 2026 Acme Inc.', 700), el('input', '', 710, { type: 'email' }), el('button', 'Subscribe', 710)]
    expect(scoreEdits(spec('r05-footer-newsletter'), page).realized).toBe(true)
    expect(scoreEdits(spec('r05-footer-newsletter'), page.filter((e) => e.tag !== 'input')).realized).toBe(false)
  })
  it('scoreIntent dispatches edit specs and keeps the result shape', () => {
    const r = scoreIntent(spec('r06-x-out-nav-link'), basePage().filter((e) => e.text !== 'Pricing'))
    expect(r).toMatchObject({ realized: true, intent: 1, content: null, order: null, mustStructure: 1 })
    expect(r.regions.map((x: any) => x.kind)).toEqual(['absent', 'kept', 'kept', 'kept'])
  })
})

describe('hueOf', () => {
  it('reads rgb and oklch, and returns null for grey or transparent', () => {
    expect(hueOf('rgb(255, 0, 0)')).toBe(0)
    expect(hueOf('rgb(22, 163, 74)')).toBeGreaterThan(130)
    expect(hueOf('oklch(0.627 0.194 149.214)')).toBeCloseTo(149.214)
    expect(hueOf('rgb(15, 23, 42)')).toBeNull() // slate-900: a near-grey
    expect(hueOf('rgba(0, 0, 0, 0)')).toBeNull()
    expect(hueOf('oklch(0.208 0.042 265.755)')).toBeNull()
  })
})
