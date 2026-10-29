/**
 * Colour from ink, told to codegen and checked on the page (n10).
 *
 * The ink states colours exactly (a tap with a colour picked, or a mark drawn
 * in a colour; @s2c/ink inkfill.ts decides what each one colours). Codegen is
 * given each as a hex on that mark's geometry, and the built page is checked:
 * the element built for the mark must paint that colour (its own background,
 * or for text its own colour), and a tapped page must paint it behind
 * everything. A miss is a failure a repair round can act on. Zero tokens.
 */
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { GroundedAction, GroundedInterpretation, InkColour } from './intent2.js'
import { deltaE, hexOf, parseCssColor } from './palette.js'

const hex = (c: string) => { const p = parseCssColor(c); return p ? hexOf(p) : c }

export function inkColoursBrief(interp: Pick<GroundedInterpretation, 'actions' | 'pageFill'>): string {
  const lines: string[] = []
  if (interp.pageFill) {
    const f = interp.pageFill
    lines.push(f.radial
      ? `- the whole page (body / outermost wrapper, full viewport height, behind every block): background ${f.css} exactly — a centre spotlight: ${hex(f.colors[0]!)} glowing at x ${String(f.radial.x)}, y ${String(f.radial.y)} and fading out to ${f.colors.slice(1).map(hex).join(' then ')} by ${String(f.radial.r)}px from there, that colour everywhere beyond. A radial-gradient on the page itself (not a linear fade, not a small blurred blob, not a pale overlay); keep the stops and the centre as given`
      : f.colors.length > 1
      ? `- the whole page (body / outermost wrapper, full viewport height, behind every block): background ${`linear-gradient(${String(f.angle)}deg, ${f.colors.map(hex).join(', ')})`} exactly`
      : `- the whole page (body / outermost wrapper, full viewport height, behind every block): background ${hex(f.colors[0]!)} exactly`)
  }
  interp.actions.forEach((a, i) => {
    for (const c of a.inkColours ?? []) {
      const at = `x ${String(c.box.x)}, y ${String(c.box.y)}, ${String(c.box.w)}x${String(c.box.h)}`
      if (c.paint === 'background' && c.fade) {
        lines.push(`- action ${String(i)}, the ${c.mark} drawn at ${at}: the block built for it is filled with background linear-gradient(${String(c.fade.angle ?? 180)}deg, ${c.fade.colors.map(hex).join(', ')}) exactly (its own background${c.mark === 'outline' ? ', in the drawn outline\'s shape' : ''}): ${hex(c.fade.colors[0]!)} where it was tapped first, fading to ${hex(c.fade.colors.at(-1)!)} where it was tapped last; keep that direction and those stops, at full strength`)
        continue
      }
      lines.push(c.paint === 'background'
        ? `- action ${String(i)}, the ${c.mark} drawn at ${at}: the block built for it is filled with ${hex(c.color)} (its own background${c.mark === 'outline' ? ', in the drawn outline\'s shape' : ''}) at full strength: opacity 1 and that exact colour in its middle; if it is a glow or blurred shape, soften only its edge (blur at most ${String(maxBlur(c.box))}px) and never fade it with opacity, a see-through colour or a paler tint; text on it must stay readable against it`
        : `- action ${String(i)}, the ${c.mark} drawn at ${at}: that ${c.mark === 'line' ? 'text or rule' : 'text'} is coloured ${hex(c.color)}`)
    }
  })
  if (!lines.length) return ''
  return `COLOURS FROM THE INK (the user coloured these in with a picked colour, so the value is exact; ` +
    `use these hex values as they are, never a palette near-miss and never a paler or brighter version; ` +
    `a typed colour word about the same block is overruled by these):\n${lines.join('\n')}\n\n`
}

/** n12: the largest blur (px) that still leaves a block of this size at about 90% of its colour in the middle. */
export function maxBlur(b: { w: number; h: number }): number {
  return Math.max(4, Math.round(Math.min(b.w, b.h) / 2 / 2.2))
}

/**
 * n12: how much of its colour a block shows in its middle, 0..1: its own and every ancestor's opacity, the
 * background's alpha, and a blur (a Gaussian of radius s over a block of half-size R keeps 1 - e^(-R²/2s²)
 * of the colour at its centre). A tapped glow came out the exact hex but at about half strength (n10: pink
 * #ec4899 painted rgb(133,49,113) in the middle), and the hex check passed it.
 */
export function strengthOf(n: DomNode, css: string, byId: Map<string, DomNode>): { strength: number; opacity: number; blur: number } {
  let opacity = 1
  for (let m: DomNode | undefined = n, k = 0; m && k < 64; m = m.parent ? byId.get(m.parent) : undefined, k++) {
    if (m.style.opacity !== undefined) opacity *= Number(m.style.opacity)
  }
  const blurM = /blur\(\s*([\d.]+)px/.exec(n.style.filter ?? '')
  const blur = blurM ? Number(blurM[1]) : 0
  const R = Math.min(n.rect.w, n.rect.h) / 2
  const kept = blur > 0 ? 1 - Math.exp(-(R * R) / (2 * blur * blur)) : 1
  return { strength: opacity * alphaOf(css) * kept, opacity, blur }
}
const STRONG = 0.8

const centreIn = (n: DomNode, b: { x: number; y: number; w: number; h: number }, pad: number) => {
  const cx = n.rect.x + n.rect.w / 2, cy = n.rect.y + n.rect.h / 2
  return cx >= b.x - pad && cx <= b.x + b.w + pad && cy >= b.y - pad && cy <= b.y + b.h + pad
}

const crosses = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/** Colours an element paints: its background (or a gradient's stops) and its text. */
function painted(n: DomNode, what: 'background' | 'text'): string[] {
  if (what === 'text') return [n.style.color]
  const out = [n.style.backgroundColor]
  const img = n.style.backgroundImage
  if (img) for (const m of img.matchAll(/(?:rgba?|oklch|oklab|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b/gi)) out.push(m[0])
  return out
}

function alphaOf(css: string): number {
  const m = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(css) ?? /\/\s*([\d.]+%?)\s*\)/.exec(css)
  if (!m) return 1
  return m[1]!.endsWith('%') ? Number(m[1]!.slice(0, -1)) / 100 : Number(m[1])
}

export interface InkColourVerdict {
  satisfied: boolean
  unverifiable?: boolean
  reason: string
  checks: Array<{ what: string; want: string; best: number | null; ok: boolean; strength?: number }>
}

const OK_DE = 18
/**
 * A single tapped colour is exact, so it is checked as exact: ΔE 18 let a white page pass for a tapped pale
 * grey (#f3f4f6 is ΔE 4 from white, n18 r1 e1-login), and nothing asked for the grey again. Gradient stops
 * keep the loose bar (a stop is read where the gradient passes, not at one pixel).
 */
const SOLID_OK_DE = 2.5

/** Every colour the ink states (taps, coloured pens, the page), as #rrggbb strings for the finishing pass. */
export function inkHexes(interp: Pick<GroundedInterpretation, 'actions' | 'pageFill'>): string[] {
  const out: string[] = []
  for (const c of interp.pageFill?.colors ?? []) out.push(c)
  for (const a of interp.actions) for (const c of a.inkColours ?? []) out.push(c.color)
  return out
}

function closestAt(want: string, nodes: DomNode[], what: 'background' | 'text'): { de: number; node: DomNode; css: string } | null {
  const w = parseCssColor(want)
  if (!w) return null
  let best: { de: number; node: DomNode; css: string } | null = null
  for (const n of nodes) for (const css of painted(n, what)) {
    if (!css || (what === 'background' && alphaOf(css) < 0.35)) continue
    const g = parseCssColor(css)
    if (!g) continue
    const de = deltaE(w, g)
    if (!best || de < best.de) best = { de, node: n, css }
  }
  return best
}
function closest(want: string, nodes: DomNode[], what: 'background' | 'text'): number | null {
  return closestAt(want, nodes, what)?.de ?? null
}

/** Did each colour the ink stated reach the built page, on its mark? */
export function verifyInkColours(
  actions: GroundedAction[],
  pageFill: GroundedInterpretation['pageFill'],
  after: DomSnapshot,
): InkColourVerdict {
  const checks: InkColourVerdict['checks'] = []
  const misses: string[] = []
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated', checks }
  const vw = after.viewport.w, vh = after.viewport.h
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  if (pageFill) {
    // the page colour: something at least most of the viewport paints it
    const big = after.nodes.filter((n) => n.rect.w >= vw * 0.8 && n.rect.h >= vh * 0.6)
    if (pageFill.radial) {
      // n33: a spotlight is a radial glow; a linear fade carries the same stops and passed the hex check
      const ok = big.some((n) => /radial-gradient/i.test(n.style.backgroundImage ?? ''))
      checks.push({ what: 'page spotlight', want: 'radial-gradient', best: ok ? 0 : null, ok })
      if (!ok) misses.push(`the page should be a centre spotlight: background ${pageFill.css} on the page itself (a radial-gradient glowing at x ${String(pageFill.radial.x)}, y ${String(pageFill.radial.y)}); no page-sized element paints a radial-gradient`)
    }
    for (const c of pageFill.colors) {
      const best = closest(c, big, 'background')
      const ok = best !== null && best <= (pageFill.colors.length > 1 ? OK_DE : SOLID_OK_DE)
      checks.push({ what: 'page', want: hex(c), best, ok })
      if (!ok) misses.push(`the whole page should paint ${hex(c)}${pageFill.colors.length > 1 ? ` (in the gradient ${pageFill.css})` : ''} behind everything, full viewport height; ${best === null ? 'no page-sized element paints any colour' : `the nearest page-sized colour is ΔE ${best.toFixed(0)} away`}`)
    }
  }
  actions.forEach((a, i) => {
    if (a.onScreen) return
    for (const c of a.inkColours ?? []) {
      const b = c.box
      const pad = Math.max(12, Math.min(b.w, b.h) * 0.25)
      // the built element for that mark: about its size, centred on it (text: anything inside it)
      // text: any element with words whose box crosses the drawn line's band
      // (a two-line heading's box is centred between its lines, not on the first)
      const band = { x: b.x, y: b.y - 40, w: b.w, h: b.h + 80 }
      const near = after.nodes.filter((n) => c.paint === 'text'
        ? n.text.length > 0 && crosses(n.rect, band)
        : centreIn(n, b, pad) && n.rect.w >= b.w * 0.6 && n.rect.w <= b.w * 1.5 + 20 && n.rect.h >= b.h * 0.6 && n.rect.h <= b.h * 1.5 + 20)
      const what = `the ${c.mark} drawn at (${String(b.x)},${String(b.y)}) ${String(b.w)}x${String(b.h)}`
      // n51: a fade from taps: every stop shows on the block, and it runs the way it was tapped
      if (c.fade && c.paint === 'background') {
        const v = fadeVerdict(c.fade, near)
        checks.push({ what: `${what} (fade)`, want: c.fade.css, best: v.worst, ok: v.ok })
        if (!v.ok) misses.push(`action ${String(i)}: ${what} was tapped as a fade, ${c.fade.colors.map(hex).join(' to ')} (first tap to last); ${v.why}: paint the block itself background linear-gradient(${String(c.fade.angle ?? 180)}deg, ${c.fade.colors.map(hex).join(', ')})`)
        continue
      }
      const at = closestAt(c.color, near, c.paint)
      const best = at?.de ?? null
      const hit = best !== null && best <= SOLID_OK_DE
      // n12: the right hex is not enough for a fill: it has to show at (nearly) full strength in the middle
      const st = hit && c.paint === 'background' && at ? strengthOf(at.node, at.css, byId) : null
      const ok = hit && (!st || st.strength >= STRONG)
      checks.push({ what, want: hex(c.color), best, ok, ...(st ? { strength: Math.round(st.strength * 100) / 100 } : {}) })
      if (hit && st && !ok) {
        misses.push(`action ${String(i)}: ${what} was coloured ${hex(c.color)}; the block has that colour but shows only about ${String(Math.round(st.strength * 100))}% of it in its middle (${[st.opacity < 1 ? `opacity ${st.opacity.toFixed(2)}` : '', st.blur ? `blur ${String(Math.round(st.blur))}px` : '', alphaOf(at!.css) < 1 ? `see-through colour ${alphaOf(at!.css).toFixed(2)}` : ''].filter(Boolean).join(', ')}), so it reads faint: make it opacity 1 with the solid colour, and soften only its edge (blur at most ${String(maxBlur(b))}px)`)
        continue
      }
      if (!ok) misses.push(`action ${String(i)}: ${what} was coloured ${hex(c.color)}${c.paint === 'text' ? ' (text colour)' : ' (fill)'}; ${best === null ? 'nothing that size was built there carrying a colour' : `what was built there is ΔE ${best.toFixed(0)} away`}: paint ${c.paint === 'text' ? 'its text' : 'the block itself'} exactly ${hex(c.color)}`)
    }
  })
  if (!checks.length) return { satisfied: true, unverifiable: true, reason: 'no colours from the ink', checks }
  return misses.length
    ? { satisfied: false, reason: misses.join('; '), checks }
    : { satisfied: true, reason: `${String(checks.length)} colour${checks.length > 1 ? 's' : ''} from the ink on the page`, checks }
}

/** CSS angle (deg) of a computed linear-gradient, and its stop colours in order. 180deg when no angle is written. */
export function gradientOf(img: string | undefined): { angle: number; stops: string[] } | null {
  if (!img) return null
  const m = /linear-gradient\((.*)\)\s*$/i.exec(img.split(/,\s*(?=(?:linear|radial|conic)-gradient)/i)[0]!.trim())
  if (!m) return null
  const body = m[1]!
  let angle = 180
  const a = /^\s*(-?[\d.]+)(deg|turn|rad)/i.exec(body)
  if (a) angle = a[2] === 'turn' ? Number(a[1]) * 360 : a[2] === 'rad' ? Number(a[1]) * 180 / Math.PI : Number(a[1])
  else {
    const t = /^\s*to\s+([a-z ]+?)\s*,/i.exec(body)
    if (t) {
      const w = t[1]!.toLowerCase()
      const x = w.includes('right') ? 1 : w.includes('left') ? -1 : 0, y = w.includes('bottom') ? 1 : w.includes('top') ? -1 : 0
      angle = (Math.atan2(x, -y) * 180) / Math.PI
    }
  }
  const stops = [...body.matchAll(/(?:rgba?|oklch|oklab|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b/gi)].map((x) => x[0])
  return stops.length >= 2 ? { angle: ((angle % 360) + 360) % 360, stops } : null
}

/** n51: does a block near the mark paint this fade: every stop close, the first tap's colour at the start, the right way round? */
export function fadeVerdict(fade: { colors: string[]; angle?: number }, near: DomNode[]): { ok: boolean; worst: number | null; why: string } {
  let best: { ok: boolean; worst: number | null; why: string } | null = null
  for (const n of near) {
    const g = gradientOf(n.style.backgroundImage)
    if (!g) continue
    const parsed = g.stops.map((c) => parseCssColor(c)).filter((c): c is NonNullable<typeof c> => !!c)
    if (parsed.length < 2) continue
    let worst = 0
    for (const want of fade.colors) {
      const w = parseCssColor(want)
      if (!w) continue
      worst = Math.max(worst, Math.min(...parsed.map((p) => deltaE(w, p))))
    }
    // which way it runs: the first tap's colour should be nearer the gradient's start than its end
    const first = parseCssColor(fade.colors[0]!), last = parseCssColor(fade.colors.at(-1)!)
    let flipped = false
    if (first && last) {
      const s0 = parsed[0]!, s1 = parsed.at(-1)!
      const along = deltaE(first, s0) + deltaE(last, s1), against = deltaE(first, s1) + deltaE(last, s0)
      const turn = Math.abs((((g.angle - (fade.angle ?? 180)) % 360) + 540) % 360 - 180)
      // the same stops the other way round, or the stops right but the angle turned round
      flipped = (against + 4 < along && turn < 90) || (along + 4 < against && turn > 90)
    }
    const v = worst > OK_DE
      ? { ok: false, worst, why: `the nearest gradient there is ΔE ${worst.toFixed(0)} off one of the tapped colours` }
      : flipped
        ? { ok: false, worst, why: 'the gradient there runs the wrong way (the first tap\'s colour ends up where the last tap was)' }
        : { ok: true, worst, why: '' }
    if (v.ok) return v
    if (!best || (best.worst ?? 999) > (v.worst ?? 999)) best = v
  }
  return best ?? { ok: false, worst: null, why: 'nothing that size there paints a gradient' }
}
