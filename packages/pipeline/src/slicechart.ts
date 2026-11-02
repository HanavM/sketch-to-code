/**
 * Colours tapped round a ring are a slice chart (n226): told as flat slices and checked on the page.
 *
 * Round 47 e5 (budget, n222, n227): a ring with four colours tapped round it came out a square fade in the preview and
 * in every first build, and once lost its hole. The tap reader (markFill) gives the slices from the ink; here the shares
 * typed for them are read, the build told, and the page checked. A chart needs no words for its shares when the rows
 * beside it carry the amounts: "$960; $600; $480; $360" gives the slices in the order the colours were tapped.
 * Zero tokens.
 */
import { sliceCss, sliceShares, type SliceChart } from '@s2c/ink'
import type { DomNode } from '@s2c/dom'
import { deltaE, parseCssColor } from './palette.js'

const r = Math.round
/** A note on the ring asking for a fade keeps it one. */
export function asksFade(texts: readonly string[]): boolean {
  return texts.some((t) => /\b(fade|fades|fading|gradient|ombre|ombré|blend|glow|glowing|sunset)\b/i.test(t))
}

/** "40, 25, 20, 15 percent", "40% 25% 20% 15%", "40/25/20/15": n shares summing to about 100, else null. */
export function typedShares(text: string, n: number): number[] | null {
  if (!/%|percent|\d\s*\/\s*\d/i.test(text)) return null
  const nums = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
  if (nums.length !== n) return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return sum >= 90 && sum <= 110 ? nums : null
}

/** n amounts typed in one note ("Rent, $960; Food, $600; ...") in the order of the rows. */
export function typedAmounts(text: string, n: number): number[] | null {
  const nums = [...text.matchAll(/[$€£]\s?(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1]!.replace(/,/g, '')))
  return nums.length === n && nums.every((x) => x > 0) ? nums : null
}

/**
 * The chart at its typed shares: a note on the ring's own percents, clockwise from the top; else amounts in a note beside
 * it, one per slice, in the order the colours were tapped (as the rows' colour marks are).
 */
export function typedSlices(chart: SliceChart, own: readonly string[], all: readonly string[]): SliceChart {
  const n = chart.parts.length
  for (const t of [...own, ...all]) {
    const s = typedShares(t, n)
    if (s) return sliceShares(chart, s)
  }
  for (const t of all) {
    const a = typedAmounts(t, n)
    if (a) return sliceShares(chart, chart.parts.map((x) => a[x.tapOrder]!))
  }
  return chart
}

const box = (c: SliceChart) => ({ x: r(c.cx - c.d / 2), y: r(c.cy - c.d / 2), w: c.d, h: c.d })
export function sliceHow(c: SliceChart): string {
  const b = box(c)
  return `one element exactly ${String(c.d)}x${String(c.d)}px at x=${String(b.x)}, y=${String(b.y)}, border-radius 50%, no border, background ${sliceCss(c)} exactly` +
    (c.hole ? `, and inside it a solid round disc ${String(c.hole.d)}px across in ${c.hole.color && !isDark(c.hole.color) ? c.hole.color : 'the colour of the surface behind the chart'} centred with left: 50%; top: 50%; transform: translate(-50%, -50%)` : '')
}
function isDark(css: string): boolean {
  const c = parseCssColor(css)
  return !!c && 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 110
}
export function sliceBrief(c: SliceChart, at: string): string {
  return `the ring drawn at ${at} has ${String(c.parts.length)} colours tapped round it: A SLICE CHART (a ${c.hole ? 'donut' : 'pie'}), FLAT SLICES WITH HARD EDGES, never a fade, a linear gradient or a square: ${sliceHow(c)}. ` +
    `Slices clockwise: ${c.parts.map((x) => `${x.color} ${String(r((x.sweepDeg / 360) * 100))}%`).join(', ')}. The pen line of the ring is only where it goes, never a border. ` +
    (c.hole ? 'Words typed in the hole sit centred in that disc. ' : '') + 'Hard stops as written: no colour blends into the next'
}

export interface SliceVerdict { ok: boolean; why: string }
/** Stops of a computed conic-gradient, colour and end angle, in order. */
export function conicStops(css: string): Array<{ color: string; from: number | null; to: number | null }> {
  const body = /conic-gradient\((.*)\)\s*$/i.exec(css)?.[1]
  if (!body) return []
  const out: Array<{ color: string; from: number | null; to: number | null }> = []
  const re = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})((?:\s+-?[\d.]+(?:deg|%|turn|rad))*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const pos = [...m[2]!.matchAll(/(-?[\d.]+)(deg|%|turn|rad)/g)].map((p) => {
      const v = Number(p[1])
      return p[2] === '%' ? v * 3.6 : p[2] === 'turn' ? v * 360 : p[2] === 'rad' ? (v * 180) / Math.PI : v
    })
    out.push({ color: m[1]!, from: pos[0] ?? null, to: pos[1] ?? pos[0] ?? null })
  }
  return out
}
const same = (a: string, b: string) => { const x = parseCssColor(a), y = parseCssColor(b); return !!x && !!y && deltaE(x, y) <= 12 }

export function sliceVerdict(c: SliceChart, nodes: readonly DomNode[]): SliceVerdict {
  const near = (n: DomNode, size: number, off: number) => Math.abs(n.rect.w - size) <= 0.2 * size && Math.abs(n.rect.h - size) <= 0.2 * size &&
    Math.hypot(n.rect.x + n.rect.w / 2 - c.cx, n.rect.y + n.rect.h / 2 - c.cy) <= off
  const chart = nodes.filter((n) => near(n, c.d, 25))
  const faded = chart.find((n) => /(?:linear|radial)-gradient\(/i.test(n.style.backgroundImage ?? ''))
  const conic = chart.find((n) => /conic-gradient\(/i.test(n.style.backgroundImage ?? ''))
  if (!conic) {
    if (faded) return { ok: false, why: 'it is built as a fade, not flat slices' }
    // an svg chart: every colour painted by a shape within the drawn circle
    const R = c.d / 2 + 12
    const shapes = nodes.filter((n) => (n.style.svgFill || n.style.svgStroke) && Math.hypot(n.rect.x + n.rect.w / 2 - c.cx, n.rect.y + n.rect.h / 2 - c.cy) <= R)
    const missing = c.parts.filter((x) => !shapes.some((n) => [n.style.svgFill, n.style.svgStroke].some((v) => v && same(v, x.color))))
    if (shapes.length && !missing.length) return { ok: true, why: '' }
    return { ok: false, why: `no round chart with those ${String(c.parts.length)} colours about ${String(c.d)}px across at x=${String(c.cx)}, y=${String(c.cy)}` }
  }
  const stops = conicStops(conic.style.backgroundImage ?? '')
  // collapse to flat runs: a colour's start and end
  const runs: Array<{ color: string; a: number; z: number }> = []
  let blended = false
  stops.forEach((s, k) => {
    const prev = runs[runs.length - 1]
    if (prev && same(prev.color, s.color)) { prev.z = s.to ?? prev.z; return }
    const a = s.from ?? (k === 0 ? 0 : prev?.z ?? 0)
    if (prev && a - prev.z > 3) blended = true
    runs.push({ color: s.color, a, z: s.to ?? a })
  })
  if (blended) return { ok: false, why: 'its colours blend into each other: the slices must have hard edges' }
  if (runs.length !== c.parts.length) return { ok: false, why: `it has ${String(runs.length)} slices, ${String(c.parts.length)} were tapped` }
  for (const [k, x] of c.parts.entries()) {
    if (!same(runs[k]!.color, x.color)) return { ok: false, why: `slice ${String(k + 1)} clockwise should be ${x.color}, it is ${runs[k]!.color}` }
    const sweep = runs[k]!.z - runs[k]!.a
    if (Math.abs(sweep - x.sweepDeg) > 10) return { ok: false, why: `the ${x.color} slice takes ${String(r(sweep))} degrees, it should take ${String(x.sweepDeg)}` }
  }
  if (c.hole) {
    const hole = c.hole.d
    const disc = nodes.find((n) => n !== conic && Math.abs(n.rect.w - hole) <= 0.3 * hole && Math.abs(n.rect.h - hole) <= 0.3 * hole &&
      Math.hypot(n.rect.x + n.rect.w / 2 - c.cx, n.rect.y + n.rect.h / 2 - c.cy) <= 12 && !/^(?:transparent|rgba\(0, 0, 0, 0\))$/.test(n.style.backgroundColor))
    if (!disc) return { ok: false, why: `its hole is lost: no disc about ${String(hole)}px across on its centre` }
    const off = r(Math.hypot(disc.rect.x + disc.rect.w / 2 - c.cx, disc.rect.y + disc.rect.h / 2 - c.cy))
    if (off > 12) return { ok: false, why: `the hole sits ${String(off)}px off the centre` }
  }
  return { ok: true, why: '' }
}
