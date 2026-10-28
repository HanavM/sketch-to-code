import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { isTextMark, measureTextMark, textStacks } from '../src/textmark.js'
import { buildEvidence, groundInterpretation } from '../src/intent2.js'
import { buildScaffold } from '../src/scaffold.js'
import { instantEligible } from '../src/instant.js'
import { DEFAULT_FIDELITY } from '../src/fidelity.js'
// @ts-expect-error — plain .mjs bench module, no types
import { textLine, textBlock, wave, line, box, circle, hatch, toStrokes } from '../../../tests/bench/lib/draw.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { rbox, rline, rring, rarrow, rtext } from '../../../tests/bench/lib/rough.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import page05 from '../../../tests/bench/sketches/05-logo-wall-testimonial.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import page08 from '../../../tests/bench/sketches/08-newsletter-capture.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import page14 from '../../../tests/bench/sketches/14-dark-gradient-hero.mjs'

type P = { x: number; y: number }

describe('isTextMark — the squiggle that means words', () => {
  it('reads every text squiggle the bench draws as text, tidy and rough', () => {
    expect(isTextMark(textLine(520, 120, 240))).toBe(true)
    expect(isTextMark(textLine(0, 0, 60))).toBe(true)
    for (const p of textBlock(320, 330, 640, 2, 44, { amp: 6, wavelength: 40 })) expect(isTextMark(p)).toBe(true)
    for (const w of [80, 150, 300, 600]) {
      for (const s of [1, 2, 3]) expect(isTextMark(rtext(10, 10, w, { seed: s * 97 + w })), `rtext ${w}/${s}`).toBe(true)
    }
  })

  it('leaves decoration and structure alone', () => {
    // the two decorative waves in the tidy set (pages 08 and 14)
    expect(isTextMark(wave(80, 700, 1120, { amp: 28, crests: 1.5 }))).toBe(false)
    expect(isTextMark(wave(20, 610, 1240, { amp: 22, crests: 2 }))).toBe(false)
    expect(isTextMark(line(0, 0, 400, 0))).toBe(false)
    expect(isTextMark(box(0, 0, 200, 100))).toBe(false)
    expect(isTextMark(circle(100, 100, 30))).toBe(false)
    expect(isTextMark(hatch(0, 0, 200, 60))).toBe(false)
    expect(isTextMark(rring(100, 100, 80, 30))).toBe(false)
    expect(isTextMark(rarrow(0, 0, 300, 10))).toBe(false)
    for (const s of [1, 2, 3]) expect(isTextMark(rbox(0, 0, 300, 120, { seed: s }))).toBe(false)
    // a hurried straight line sways, and that sway is not a crest train
    for (const w of [60, 200, 600, 1100]) {
      for (const s of [1, 2, 3]) {
        expect(isTextMark(rline(10, 100, 10 + w, 100 + (s % 2 ? 6 : -4), { seed: s * 31 + w })), `rline ${w}/${s}`).toBe(false)
      }
    }
  })

  it('separates text from a decorative wave by how hard it oscillates, not by size', () => {
    const t = measureTextMark(textLine(0, 0, 600))!
    const w = measureTextMark(wave(0, 0, 600, { amp: 10, crests: 1.5 }))!
    expect(t.travel).toBeGreaterThan(0.35)
    expect(w.travel).toBeLessThan(0.35)
  })

  it('needs the line to be roughly level — a vertical squiggle is not a line of copy', () => {
    const vertical = (textLine(0, 0, 300) as P[]).map((p) => ({ x: p.y, y: p.x }))
    expect(isTextMark(vertical)).toBe(false)
  })

  it('agrees with the bench pages: decorative waves on 08 and 14 are never text', () => {
    const marks = (pg: { strokes: P[][] }) => pg.strokes.map((s) => isTextMark(s))
    // page 08 stroke 'ONE decorative ribbon' and page 14 'wave divider'
    const decor08 = page08.strokes.findIndex((s: P[]) => (measureTextMark(s)?.chord ?? 0) > 1000)
    const decor14 = page14.strokes.findIndex((s: P[]) => (measureTextMark(s)?.chord ?? 0) > 1000)
    expect(decor08).toBeGreaterThanOrEqual(0)
    expect(decor14).toBeGreaterThanOrEqual(0)
    expect(marks(page08)[decor08]).toBe(false)
    expect(marks(page14)[decor14]).toBe(false)
  })
})

const node = (id: string, rect: DomNode['rect'], over: Partial<DomNode> = {}): DomNode => ({
  id, tag: 'section', srcLoc: 'src/App.tsx:5:3', text: '', classes: [], parent: null, depth: 1, rect,
  style: {
    color: 'rgb(17,24,39)', backgroundColor: 'rgb(255,255,255)', display: 'block', position: 'relative',
    zIndex: 'auto', flexDirection: 'row', gap: '', padding: '', margin: '', fontSize: '',
    fontWeight: '', borderRadius: '',
  } as DomNode['style'],
  ...over,
})
const blankPage = (): DomSnapshot => ({
  nodes: [node('e1', { x: 0, y: 0, w: 1280, h: 900 })], truncated: false, url: 'http://x/', takenAt: 0,
  viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 },
})

/**
 * Page 05, the one real product failure in docs/findings.md: the quote and
 * attribution squiggles came back as wavy SVG paths. Reproduce the failing
 * run's reading — one design action over the whole drawing, fidelity
 * 'verbatim' — and follow it to everything that turns ink into paths.
 */
describe('page 05 — a squiggle that means words never becomes a path', () => {
  const strokes: Stroke[] = toStrokes(page05.strokes)
  // strokes: s1 eyebrow, s2-s6 logo boxes, s7-s8 quote, s9 avatar, s10 attribution
  const text = ['s1', 's7', 's8', 's10']
  const shapes = ['s2', 's3', 's4', 's5', 's6', 's9']
  const ground = (fidelity: 'verbatim' | 'recognized' | null, ids = strokes.map((s) => s.id)) => {
    const snap = blankPage()
    const ev = buildEvidence(strokes, snap)
    return groundInterpretation(
      {
        reading: 'logo wall above a quote',
        actions: [{ kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: 'social proof band', strokes: ids, layer: null, depicts: null, fidelity }],
      },
      ev, snap, 'design',
    ).actions[0]!
  }

  it('grounding keeps the squiggles cited but fits no path for them', () => {
    const a = ground('verbatim')
    expect(a.textMarks).toEqual(text)
    // the logo boxes and the avatar ring mark where things go: shape marks, no paths (n7)
    expect(a.svgPaths).toBeUndefined()
    expect(a.shapeMarks!.map((m) => m.strokeId)).toEqual(shapes)
    // the region still covers the words: they are part of what was drawn
    expect(a.region!.y).toBeLessThan(130)
  })

  it('the scaffold written before codegen holds no text squiggle, even at the trace rung', () => {
    const a = ground('verbatim')
    // nothing left to trace: squiggles are words, boxes and the ring are shape marks (n7)
    expect(buildScaffold(a, 0, { ...DEFAULT_FIDELITY, resemblance: 1 })).toBeNull()
  })

  it("an action that is only words loses 'verbatim' — there is nothing left to trace", () => {
    const a = ground('verbatim', ['s7', 's8'])
    expect(a.svgPaths).toBeUndefined()
    expect(a.textMarks).toEqual(['s7', 's8'])
    expect(a.fidelity).toBeUndefined()
    expect(buildScaffold(a, 0, { ...DEFAULT_FIDELITY, resemblance: 1 })).toBeNull()
  })

  it("leaves the interpreter's fidelity alone when there is real geometry", () => {
    // a plain ring is a shape mark now, so 'verbatim' has nothing to trace (n7)
    expect(ground('verbatim', ['s9']).fidelity).toBeUndefined()
    expect(ground('recognized', ['s7', 's9']).fidelity).toBe('recognized')
  })

  it('the instant render declines a drawing that contains a line of text', () => {
    const v = instantEligible(strokes.filter((s) => s.id === 's7' || s.id === 's9'), blankPage())
    expect(v.ok).toBe(false)
    // a plain ring marks a circle: built clean by the interpreted path, never mounted as ink (n7)
    expect(instantEligible(strokes.filter((s) => s.id === 's9'), blankPage()).ok).toBe(false)
  })
})

describe('textStacks — drawn line spacing is the type size (round 1, c1)', () => {
  it('reads a two-line display headline from its line spacing', () => {
    // c1: headline region 1000x240 drawn as two heading squiggles 108px apart
    const ls = textBlock(148, 244 + 72, 900, 2, 108, { amp: 8, wavelength: 50 })
    const st = textStacks(ls.map((points: unknown, i: number) => ({ id: `h${i}`, points })))
    expect(st).toHaveLength(1)
    expect(st[0]!.lines).toBe(2)
    expect(st[0]!.linePitchPx).toBeGreaterThan(100)
    expect(st[0]!.fontPx).toBeGreaterThan(85) // target is 120px; the old build used ~60px
  })
  it('reads body copy at body size', () => {
    const ls = textBlock(100, 300, 500, 4, 24)
    const st = textStacks(ls.map((points: unknown, i: number) => ({ id: `b${i}`, points })))
    expect(st).toHaveLength(1)
    expect(st[0]!.lines).toBe(4)
    expect(st[0]!.fontPx).toBeGreaterThanOrEqual(14)
    expect(st[0]!.fontPx).toBeLessThanOrEqual(18)
  })
  it('sizes a lone heading squiggle drawn tall (round 3, e3 title: 28px)', () => {
    const st = textStacks([{ id: 't', points: textLine(56, 48, 186, { amp: 9.6, wavelength: 46 }) }])
    expect(st).toHaveLength(1)
    expect(st[0]!.lines).toBe(1)
    expect(st[0]!.fontPx).toBeGreaterThanOrEqual(24)
    expect(st[0]!.fontPx).toBeLessThanOrEqual(32)
  })
  it('sizes a giant one-word heading drawn as one tall zigzag (round 2, c2: NOISE at 300px)', () => {
    const z = textLine(6, 250, 800, { amp: 105, wavelength: 315 })
    expect(isTextMark(z)).toBe(true)
    const st = textStacks([{ id: 'z', points: z }])
    expect(st).toHaveLength(1)
    expect(st[0]!.lines).toBe(1)
    expect(st[0]!.fontPx).toBeGreaterThanOrEqual(260)
    expect(st[0]!.fontPx).toBeLessThanOrEqual(340)
  })
  it('a tall zigzag about as wide as tall is not a display line (a scratch-out over a block)', () => {
    expect(isTextMark(textLine(0, 200, 260, { amp: 80, wavelength: 60 }))).toBe(false)
    expect(isTextMark(textLine(0, 200, 300, { amp: 60, wavelength: 140 }))).toBe(false)
  })
  it('sizes a short giant word drawn at full height (round 3 c4: "01" at 420px, round 4 c5: "03" at 360px)', () => {
    for (const [w, font] of [[366, 420], [324, 360], [256, 240]] as const) {
      const z = textLine(20, 300, w, { amp: 0.35 * font, wavelength: (2 * w) / 3 })
      expect(isTextMark(z), `${w}/${font}`).toBe(true)
      const st = textStacks([{ id: 'z', points: z }])
      expect(st).toHaveLength(1)
      expect(Math.abs(st[0]!.fontPx - font) / font, `${w}/${font} read ${st[0]!.fontPx}`).toBeLessThan(0.1)
    }
  })
  it('a short tall zigzag with many tight crests, or a hatch, is still not text', () => {
    expect(isTextMark(textLine(0, 300, 360, { amp: 140, wavelength: 90 }))).toBe(false)
    expect(isTextMark(textLine(0, 300, 360, { amp: 140, wavelength: 140 }))).toBe(false)
    for (const [w, h] of [[248, 268], [360, 300], [300, 200]]) expect(isTextMark(hatch(100, 100, w, h)), `hatch ${w}x${h}`).toBe(false)
  })
  it('makes no size claim for a lone body squiggle, tidy or rough', () => {
    for (const w of [80, 150, 300, 600]) {
      for (let s = 1; s <= 12; s++) {
        expect(textStacks([{ id: 'r', points: rtext(10, 10, w, { seed: s * 97 + w }) }]), `rtext ${w}/${s}`).toEqual([])
      }
    }
  })
  it('makes no size claim for a single line, or for lines in different columns', () => {
    const one = [textLine(100, 300, 400)]
    expect(textStacks(one.map((points: unknown, i: number) => ({ id: `o${i}`, points })))).toEqual([])
    const apart = [textLine(100, 300, 300), textLine(800, 330, 300)]
    expect(textStacks(apart.map((points: unknown, i: number) => ({ id: `a${i}`, points })))).toEqual([])
  })
})

describe('textSize survives how the reading splits the page (round 1, c2)', () => {
  // c2: "MAKE IT LOUD" drawn as two heading squiggles 172px apart, then body copy
  const head = textBlock(48, 200, 900, 2, 172, { amp: 8, wavelength: 50 })
  const body = textBlock(48, 600, 500, 2, 24)
  const strokes: Stroke[] = toStrokes([...head, ...body]) // s1 s2 headline, s3 s4 body
  const ground = (actions: Array<{ strokes: string[]; instruction: string }>) => {
    const snap = blankPage()
    const ev = buildEvidence(strokes, snap)
    return groundInterpretation(
      {
        reading: 'poster page',
        actions: actions.map((a) => ({ kind: 'design' as const, elements: null, destElement: 'e1', position: 'into' as const, instruction: a.instruction, strokes: a.strokes, layer: null, depicts: null, fidelity: null })),
      },
      ev, snap, 'design',
    ).actions
  }
  it('a headline split over two actions still carries its drawn size on both', () => {
    const [a1, a2] = ground([
      { strokes: ['s1'], instruction: 'MAKE IT' },
      { strokes: ['s2'], instruction: 'LOUD' },
    ])
    for (const a of [a1!, a2!]) {
      expect(a.textSize).toHaveLength(1)
      expect(a.textSize![0]!.fontPx).toBeGreaterThan(140)
    }
  })
  it('a text-only action spans its drawn lines\' boxes, not just the ink (round 4 c1 headline built half a line low)', () => {
    const [a] = ground([{ strokes: ['s1', 's2'], instruction: 'MAKE IT LOUD' }])
    // line centres 200 and 372, pitch 172: lines run from 114 to 458
    expect(Math.abs(a!.region!.y - 114)).toBeLessThanOrEqual(4)
    expect(Math.abs(a!.region!.y + a!.region!.h - 458)).toBeLessThanOrEqual(4)
    expect(a!.region!.x).toBe(48)
  })
  it('headline and body cited together keep two sizes, not one blended one', () => {
    const [a] = ground([{ strokes: ['s1', 's2', 's3', 's4'], instruction: 'hero' }])
    const sizes = a!.textSize!.map((t) => t.fontPx).sort((x, y) => x - y)
    expect(sizes).toHaveLength(2)
    expect(sizes[0]).toBeLessThan(20)
    expect(sizes[1]).toBeGreaterThan(140)
  })
  it('an action citing no squiggle gets no size', () => {
    const extra = toStrokes([box(100, 100, 200, 80)])[0]!
    const snap = blankPage()
    const ev = buildEvidence([...strokes, { ...extra, id: 's9' }], snap)
    const [a] = groundInterpretation(
      { reading: 'x', actions: [{ kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: 'box', strokes: ['s9'], layer: null, depicts: null, fidelity: null }] },
      ev, snap, 'design',
    ).actions
    expect(a!.textSize).toBeUndefined()
  })
})
