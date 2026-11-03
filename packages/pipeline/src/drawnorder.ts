/**
 * Marks drawn one under another are built in the drawn order, each near its drawn height (n103).
 *
 * Round 37 e4 (team chat, n72 try 2): five message boxes drawn top to bottom (Mia, "On it", Ravi, "Great",
 * image). Ravi's words were typed last, after the image, and the first build put Ravi's bubble second, above
 * "On it": the build followed typing order, not the drawing. Nothing checked it, so the layout part of the
 * likeness fell to 0.36. A person draws a thread, a list of cards or a stack of sections top to bottom on
 * purpose: where a box is drawn is where its words go, whenever they were typed.
 *
 * So, zero tokens:
 *  - A stack is three or more closed marks with their own words (n69 `own`), inside the same container
 *    (the smallest other box holding each, or the page), drawn one under another (their boxes do not share
 *    a band of height). The build is told the stack top to bottom, with each mark's drawn y.
 *  - On the page, each stacked mark's words are found (the text whose words are mostly that mark's copy,
 *    the one with most of them). Two found marks drawn one above the other must be built in that order,
 *    and each must sit within about a box's height (at least 80px) of where it was drawn. Either miss is a
 *    failure sent to the repair rounds, naming the two marks and their drawn heights.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { wordsOf } from './ownwords.js'
import { copyWords } from './linespan.js'

interface NodeLike { id: string; text?: string; rect: BBox; textBox?: BBox; style?: { opacity?: string; fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface DrawnOrderVerdict { satisfied: boolean; unverifiable?: boolean; reason: string; swapped?: Array<[string, string]>; far?: string[]; narrow?: string[] }

const closed = (m: ShapeMark) => (m.shape === 'box' || m.shape === 'ellipse') && !m.area && !m.glyph && !m.card && !m.stat
const holds = (a: BBox, b: BBox) => a !== b && b.x >= a.x - 2 && b.y >= a.y - 2 && b.x + b.w <= a.x + a.w + 2 && b.y + b.h <= a.y + a.h + 2 && a.w * a.h > b.w * b.h
const want = (m: ShapeMark) => [...new Set(copyWords(m.own ?? '').length ? copyWords(m.own ?? '') : wordsOf(m.own ?? ''))]
const short = (m: ShapeMark) => { const s = (m.own ?? '').replace(/\s+/g, ' ').trim(); return `"${s.length > 40 ? `${s.slice(0, 38)}…` : s}"` }
/** Vertically apart: the overlap of their heights is under a quarter of the shorter one. */
const apart = (a: BBox, b: BBox) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) < 0.25 * Math.min(a.h, b.h)

/** Stacks of worded marks drawn one under another, each top to bottom. */
export function drawnStacks(marks: readonly ShapeMark[]): ShapeMark[][] {
  const all = marks.filter((m) => m.shape === 'box' || m.shape === 'ellipse')
  const worded = marks.filter(closed).filter((m) => want(m).length >= 2)
  const byBox = new Map<string, ShapeMark[]>()
  for (const m of worded) {
    const outer = all.filter((o) => holds(o.box, m.box)).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0]
    const key = outer ? outer.strokeId : 'page'
    byBox.set(key, [...(byBox.get(key) ?? []), m])
  }
  const out: ShapeMark[][] = []
  for (const g of byBox.values()) {
    // drop marks held by another member (a box inside a bubble is not a step of the stack)
    const l = g.filter((m) => !g.some((o) => holds(o.box, m.box))).sort((a, b) => a.box.y - b.box.y)
    if (l.length < 3) continue
    let pairs = 0, ok = 0
    for (let i = 0; i + 1 < l.length; i++) { pairs++; if (apart(l[i]!.box, l[i + 1]!.box)) ok++ }
    if (ok / pairs >= 0.75) out.push(l)
  }
  return out
}

export function drawnOrderBrief(actions: Array<{ shapeMarks?: ShapeMark[] }>): string {
  const stacks = drawnStacks(actions.flatMap((a) => a.shapeMarks ?? []))
  if (!stacks.length) return ''
  const lines = stacks.map((l) => `- top to bottom: ${l.map((m, i) => `${i + 1}. ${short(m)} drawn at y ${m.box.y}-${m.box.y + m.box.h}, x ${m.box.x}-${m.box.x + m.box.w} (${m.box.w}px wide)`).join('; ')}.`)
  return `DRAWN ORDER (from the drawing; checked on the page): these marks are drawn one under another. Build them in exactly this ` +
    `order, top to bottom, each one at about its drawn height, whatever order the notes were typed in (a note typed last still goes ` +
    `where its box is drawn). Never move one above or below another to group by sender, side or kind. Each one is as wide as ` +
    `its drawn box (n104: give it that width, or a max-width no narrower, so a message that fits the drawn width stays on one line; ` +
    `never a narrow default bubble that wraps it):\n${lines.join('\n')}\n\n`
}

function found(m: ShapeMark, texts: Array<{ n: NodeLike; w: string[]; b: BBox }>): { b: BBox; n: NodeLike } | null {
  const need = new Set(want(m))
  let best: { hit: number; area: number; b: BBox; n: NodeLike } | null = null
  for (const t of texts) {
    const hit = t.w.filter((x) => need.has(x)).length
    if (hit < Math.min(3, need.size) || hit / t.w.length < 0.8) continue
    const area = t.b.w * t.b.h
    if (!best || hit > best.hit || (hit === best.hit && area < best.area)) best = { hit, area, b: t.b, n: t.n }
  }
  return best ? { b: best.b, n: best.n } : null
}

export function verifyDrawnOrder(marks: readonly ShapeMark[], after: Snap): DrawnOrderVerdict {
  const stacks = drawnStacks(marks)
  if (!stacks.length) return { satisfied: true, unverifiable: true, reason: 'no marks drawn one under another' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const texts = after.nodes
    .filter((n) => (n.text ?? '').trim().length > 1 && !(n.style?.opacity && Number(n.style.opacity) < 0.15))
    .map((n) => ({ n, w: wordsOf(n.text!), b: n.textBox ?? n.rect }))
    .filter((t) => t.w.length > 0 && t.b.w > 1 && t.b.h > 1)
  const swapped: Array<[string, string]> = []
  const far: string[] = []
  const narrow: string[] = []
  let judged = 0
  for (const l of stacks) {
    const got = l.map((m) => { const f = found(m, texts); return { m, b: f?.b ?? null, n: f?.n ?? null } })
      .filter((x): x is { m: ShapeMark; b: BBox; n: NodeLike } => !!x.b)
    // one text claimed by two marks is no evidence for either
    const uniq = got.filter((x) => got.filter((y) => y.b === x.b).length === 1)
    if (uniq.length < 2) continue
    judged++
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const A = uniq[i]!, B = uniq[j]! // A drawn above B
        if (!apart(A.m.box, B.m.box)) continue
        if (A.b.y + A.b.h / 2 > B.b.y + B.b.h / 2 + 4) swapped.push([short(A.m), short(B.m)])
      }
    }
    for (const x of uniq) {
      const dy = Math.round((x.b.y + x.b.h / 2) - (x.m.box.y + x.m.box.h / 2))
      if (Math.abs(dy) > Math.max(80, x.m.box.h)) far.push(`${short(x.m)} drawn at y ${x.m.box.y}-${x.m.box.y + x.m.box.h} is built ${Math.abs(dy)}px ${dy > 0 ? 'lower' : 'higher'}`)
      // n104: words wrapped onto more lines inside a bubble built much narrower than its drawn box
      const fs = parseFloat(x.n.style?.fontSize ?? '') || 0
      if (fs > 0 && x.b.h > fs * 2.1 && x.m.box.h < fs * 4 && x.b.w < 0.75 * (x.m.box.w - 32)) {
        narrow.push(`${short(x.m)} drawn ${x.m.box.w}px wide is built ${Math.round(x.b.w)}px wide and wraps onto ${Math.max(2, Math.round(x.b.h / (fs * 1.35)))} lines`)
      }
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'stacked marks not found on the page' }
  if (!swapped.length && !far.length && !narrow.length) return { satisfied: true, reason: `${stacks.reduce((s, l) => s + l.length, 0)} marks drawn one under another built in the drawn order, each near its drawn height` }
  const parts = [
    ...swapped.slice(0, 4).map(([a, b]) => `${a} is drawn above ${b} but built below it`),
    ...far.slice(0, 4),
    ...narrow.slice(0, 4),
  ]
  const fix = [swapped.length || far.length ? 'put each one back at its drawn height, in the drawn order top to bottom' : '', narrow.length ? 'make each narrow one as wide as its drawn box (width or max-width), so its words keep to the drawn lines' : ''].filter(Boolean).join('; ')
  return { satisfied: false, swapped, far, narrow, reason: `${parts.join('; ')}: ${fix}, changing nothing else` }
}
