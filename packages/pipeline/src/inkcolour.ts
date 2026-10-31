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

import { barBriefLine, barBuilt, barPitchBrief, barRowsHint, barsOf, isBarInk } from './barlabels.js'
const hex = (c: string) => { const p = parseCssColor(c); return p ? hexOf(p) : c }

/**
 * n94: a big box drawn and filled with a plain colour is a FLAT panel, built as drawn: square corners, no
 * shadow, one solid colour. Round 36 c4 (florist): the pink panel drawn with square corners and one tap came
 * out a rounded card with a drop shadow (try 1) and flat on try 2, a coin toss worth ~3 points of layout.
 * Words typed on it asking for a card, rounding, a shadow or a lift keep the model's say.
 */
const ASKS_LOOK = /\b(card|round|rounded|curved|soft|shadow|shadowed|lifted|raised|floating|elevated|glass|frosted|blur|glow|pill|bubble)\b/i
export function plainPanel(c: InkColour, a: Pick<GroundedAction, 'notes' | 'shapeMarks'>): boolean {
  if (c.paint !== 'background' || c.mark !== 'box' || c.fade || c.split || c.bands) return false
  if (c.box.w < 200 || c.box.h < 150) return false
  const m = a.shapeMarks?.find((k) => k.strokeId === c.strokeId)
  if (m && (m.pill || m.tilt || m.outline || m.glyph)) return false
  return !(a.notes ?? []).some((n) => ASKS_LOOK.test(n))
}
const pxOf = (v: string | undefined) => { const m = /^\s*([\d.]+)px/.exec(v ?? ''); return m ? Number(m[1]) : 0 }
/** n94: what makes a built panel not flat (corners rounder than 6px, a drop shadow, a gradient); '' when flat. */
export function notFlat(n: DomNode): string {
  const why: string[] = []
  if (pxOf(n.style.borderRadius) > 6) why.push(`corners rounded ${n.style.borderRadius}`)
  if (n.style.boxShadow && !/^\s*none/.test(n.style.boxShadow) && !/^\s*(?:rgba?\([^)]*\)\s*)?0px 0px 0px/.test(n.style.boxShadow)) why.push('a drop shadow')
  if (/gradient\(/i.test(n.style.backgroundImage ?? '')) why.push('a gradient')
  return why.join(', ')
}

export function inkColoursBrief(interp: Pick<GroundedInterpretation, 'actions' | 'pageFill'>, skip: ReadonlySet<string> = new Set()): string {
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
      // n122: an arc of a drawn ring chart is told with the chart, never as a filled blob of its own
      if (skip.has(c.strokeId)) continue
      const at = `x ${String(c.box.x)}, y ${String(c.box.y)}, ${String(c.box.w)}x${String(c.box.h)}`
      if (c.paint === 'background' && c.split) {
        const sp = c.split, L = sp.line
        lines.push(`- action ${String(i)}, the ${c.mark} drawn at ${at}: a straight divider is drawn across it from (${String(L.a.x)},${String(L.a.y)}) to (${String(L.z.x)},${String(L.z.y)}) and a different colour was tapped on each side, so it is TWO SOLID FILLS meeting at that line, never a fade: ` +
          `${hex(sp.colors[0])} on the side tapped first (around (${String(Math.round(centroid(sp.sides[0]).x))},${String(Math.round(centroid(sp.sides[0]).y))})), ${hex(sp.colors[1])} on the other side (around (${String(Math.round(centroid(sp.sides[1]).x))},${String(Math.round(centroid(sp.sides[1]).y))})). ` +
          `Paint the block itself background ${sp.css.replace(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi, (m) => hex(m))} exactly (a hard stop, measured in the block's own frame, so it stays right when the block is turned), ` +
          `or build the two parts as two blocks with those solid backgrounds that meet at the divider; any line or dashes on the divider are drawn on that edge`)
        continue
      }
      if (c.paint === 'background' && c.bands) {
        const tapped = c.bands.filter((b) => b.color), bare = c.bands.filter((b) => !b.color)
        lines.push(`- action ${String(i)}, the ${c.mark} drawn at ${at}: straight lines are ruled across it, cutting it into ${String(c.bands.length)} bands, and colour was tapped only in some of them, so ONLY THOSE BANDS are filled, never the whole block: ` +
          tapped.map((b) => `the band from y ${String(b.y0)} to y ${String(b.y1)} (the row(s) built there, e.g. a header or total row) background ${hex(b.color!)}`).join('; ') +
          `; the band${bare.length > 1 ? 's' : ''} ${bare.map((b) => `from y ${String(b.y0)} to y ${String(b.y1)}`).join(' and ')} stay${bare.length > 1 ? '' : 's'} unfilled (white / the block's plain surface, no ${hex(tapped[0]!.color!)}). Keep the ruled lines as thin borders between the bands`)
        continue
      }
      if (c.paint === 'background' && c.fade) {
        lines.push(`- action ${String(i)}, the ${c.mark} drawn at ${at}: the block built for it is filled with background linear-gradient(${String(c.fade.angle ?? 180)}deg, ${c.fade.colors.map(hex).join(', ')}) exactly (its own background${c.mark === 'outline' ? ', in the drawn outline\'s shape' : ''}): ${hex(c.fade.colors[0]!)} where it was tapped first, fading to ${hex(c.fade.colors.at(-1)!)} where it was tapped last; keep that direction and those stops, at full strength`)
        continue
      }
      // n129: a ring noted as an arc / track / progress is the ring's line: hollow, the words in its hole
      if (c.paint === 'border' && c.hollow) {
        const h = c.hollow, d = Math.round((c.box.w + c.box.h) / 2)
        lines.push(`- action ${String(i)}, the ring drawn at ${at} in ${hex(c.color)} (no colour tapped) and noted as an arc / track / progress: a HOLLOW RING, never a filled disc: ` +
          `outer edge exactly the drawn box (${String(d)}px across, centred where drawn), the ring's line about ${String(h.thickness)}px thick, its inside the surface under it (the panel or page colour), NEVER filled ${hex(c.color)}. ` +
          `${h.share !== null ? `The ${hex(c.color)} arc covers ${String(Math.round(h.share * 100))}% of the ring clockwise from 12 o'clock with round ends; the rest is the track` : `The ${hex(c.color)} arc runs over the ring (as much of it as the notes say)`}, ` +
          `on a track ring of the same thickness in ${h.track ? `${h.track} (a pale ${h.track})` : `a pale tint of ${hex(c.color)}`}. ` +
          `Build it as an SVG (two <circle> elements, fill="none", stroke-width ${String(h.thickness)}, the arc with stroke-dasharray and stroke-linecap round, rotated -90deg) ` +
          `or as a conic-gradient disc with an INNER DISC element on top in the surface colour leaving only the ${String(h.thickness)}px band showing. Words typed on the ring sit centred in its hole in dark or ink-coloured text, never white on the colour`)
        continue
      }
      if (c.paint === 'border' && c.frame) {
        lines.push(`- action ${String(i)}, the box drawn at ${at} in a light grey pen (no colour tapped): an OUTLINED block exactly there (a card, an input field, a panel or a button, whatever it holds): a thin 1px border in ${hex(c.color)}, background white or the surface under it, NEVER filled ${hex(c.color)} or any grey; its words, images and controls sit inside the frame`)
        continue
      }
      if (c.paint === 'border') {
        lines.push(`- action ${String(i)}, the small box drawn at ${at} in dark ink (no colour tapped): an OUTLINED small control (an arrow / pager button, a checkbox, an icon button), about the drawn size: a thin 1px border (light grey, or ${hex(c.color)} if it reads as a strong outline), white or transparent background, never a dark or solid fill; a chevron or symbol typed next to it (‹ ›, +, ×) sits inside it in dark text`)
        continue
      }
      // n121: a coloured level line with no words is a bar; its label and amount stay dark
      if (isBarInk(c, a)) { lines.push(barBriefLine(i, c)); continue }
      if (plainPanel(c, a)) {
        lines.push(`- action ${String(i)}, the box drawn at ${at}: a PLAIN FLAT PANEL, built as drawn: one block exactly there, background ${hex(c.color)} solid at full strength (opacity 1, no gradient, no fade, no tint), square corners (border-radius 0), no box-shadow, no border; it is a coloured area of the page, not a floating card. Its words and images sit inside it; text on it must stay readable against it`)
        continue
      }
      lines.push(c.paint === 'background'
        ? `- action ${String(i)}, the ${c.mark} drawn at ${at}: the block built for it is filled with ${hex(c.color)} (its own background${c.mark === 'outline' ? ', in the drawn outline\'s shape' : ''}) at full strength: opacity 1 and that exact colour in its middle; if it is a glow or blurred shape, soften only its edge (blur at most ${String(maxBlur(c.box))}px) and never fade it with opacity, a see-through colour or a paler tint; text on it must stay readable against it`
        : `- action ${String(i)}, the ${c.mark} drawn at ${at}: that ${c.mark === 'line' ? 'text or rule' : 'text'} is coloured ${hex(c.color)}`)
    }
  })
  if (!lines.length) return ''
  // n122: bars stacked in one column are rows at the drawn pitch
  for (const l of barPitchBrief(interp.actions)) lines.push(l)
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
  skip: ReadonlySet<string> = new Set(),
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
      // n122: an arc of a drawn ring chart is checked with the chart (drawn-rings), never as a block per arc
      if (skip.has(c.strokeId)) continue
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
      // n59: two solid fills either side of a drawn divider: a hard-stop gradient on the block, or two solid parts
      if (c.split && c.paint === 'background') {
        const v = splitVerdict(c.split, near, after.nodes)
        checks.push({ what: `${what} (two fills at a divider)`, want: c.split.css, best: v.worst, ok: v.ok })
        if (!v.ok) misses.push(`action ${String(i)}: ${what} has a divider drawn across it with ${c.split.colors.map(hex).join(' tapped on one side and ')} on the other: two solid fills meeting at the divider, not a fade; ${v.why}: paint the block itself background ${c.split.css.replace(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi, (m) => hex(m))}`)
        continue
      }
      // n91: tapped bands carry their colour; untapped bands do not
      if (c.bands && c.paint === 'background') {
        for (const bd of c.bands) {
          const bb = { x: b.x, y: bd.y0, w: b.w, h: bd.y1 - bd.y0 }
          const inBand = after.nodes.filter((n) => centreIn(n, bb, 8) && n.rect.w >= b.w * 0.5 && n.rect.h >= Math.min(bb.h * 0.4, 24))
          const wantC = bd.color ?? c.color
          const at = closestAt(wantC, inBand, 'background')
          const hit = !!at && at.de <= SOLID_OK_DE
          const ok = bd.color ? hit : !hit
          checks.push({ what: `${what} band y ${String(bd.y0)}-${String(bd.y1)}`, want: bd.color ? hex(bd.color) : `not ${hex(c.color)}`, best: at?.de ?? null, ok })
          if (!ok) misses.push(bd.color
            ? `action ${String(i)}: ${what}: the band from y ${String(bd.y0)} to y ${String(bd.y1)} was tapped ${hex(bd.color)}; paint the row(s) there background ${hex(bd.color)}`
            : `action ${String(i)}: ${what}: the band from y ${String(bd.y0)} to y ${String(bd.y1)} had no tap but is painted ${hex(c.color)}; leave it white / plain (only the tapped bands are ${hex(c.color)})`)
        }
        continue
      }
      // n51: a fade from taps: every stop shows on the block, and it runs the way it was tapped
      if (c.fade && c.paint === 'background') {
        const v = fadeVerdict(c.fade, near)
        checks.push({ what: `${what} (fade)`, want: c.fade.css, best: v.worst, ok: v.ok })
        if (!v.ok) misses.push(`action ${String(i)}: ${what} was tapped as a fade, ${c.fade.colors.map(hex).join(' to ')} (first tap to last); ${v.why}: paint the block itself background linear-gradient(${String(c.fade.angle ?? 180)}deg, ${c.fade.colors.map(hex).join(', ')})`)
        continue
      }
      // n129: a hollow ring: nothing about the drawn size there is a disc filled with the pen colour unless a hole sits on it
      if (c.paint === 'border' && c.hollow) {
        const v = hollowBuilt(c, after.nodes)
        checks.push({ what: `${what} (hollow ring)`, want: `ring ${String(c.hollow.thickness)}px, no ${hex(c.color)} fill`, best: null, ok: v.ok })
        if (!v.ok) misses.push(`action ${String(i)}: ${what} was drawn in ${hex(c.color)} and noted as an arc / track / progress: a hollow ring about ${String(c.hollow.thickness)}px thick, its words in the hole; ${v.why}: ` +
          `build it as an SVG ring (circles with fill="none", stroke-width ${String(c.hollow.thickness)}) or put an inner disc in the surface colour on top so only a ${String(c.hollow.thickness)}px band shows; keep its size, place, colours and words`)
        continue
      }
      // n78: a grey-pen frame: the block there has a border and is not filled with the pen's grey
      if (c.paint === 'border' && c.frame) {
        const own = after.nodes.filter((n) => centreIn(n, b, pad) && n.rect.w >= b.w * 0.7 && n.rect.w <= b.w * 1.3 + 16 && n.rect.h >= b.h * 0.6 && n.rect.h <= b.h * 1.5 + 16)
        const pen = parseCssColor(c.color)
        const grey = own.filter((n) => { const g = parseCssColor(n.style.backgroundColor); return !!g && !!pen && alphaOf(n.style.backgroundColor) > 0.5 && deltaE(pen, g) <= SOLID_OK_DE })
        const framed = own.some((n) => hasFrame(n))
        const ok = !grey.length && framed
        checks.push({ what: `${what} (grey outline)`, want: `1px border ${hex(c.color)}, no grey fill`, best: null, ok })
        if (!ok) misses.push(`action ${String(i)}: ${what} was drawn in a light grey pen with no tap: an outlined block (thin ${hex(c.color)} border, white background); ${grey.length ? `it was built filled ${hex(c.color)}` : 'nothing that size with a border was built there'}: give it a 1px ${hex(c.color)} border and a white / transparent background, keep its content inside`)
        continue
      }
      // n92: an outlined control: something about the drawn size there with a border and no dark fill
      if (c.paint === 'border') {
        const own = after.nodes.filter((n) => centreIn(n, b, Math.max(10, pad)) && n.rect.w >= b.w * 0.5 && n.rect.w <= b.w * 2 + 16 && n.rect.h >= b.h * 0.5 && n.rect.h <= b.h * 2 + 16)
        const dark = own.filter((n) => { const p = parseCssColor(n.style.backgroundColor); return !!p && alphaOf(n.style.backgroundColor) > 0.5 && (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) < 110 })
        const framed = own.some((n) => !!n.style.border && !/^0px/.test(n.style.border))
        const ok = !dark.length && framed
        checks.push({ what: `${what} (outlined control)`, want: 'border, no dark fill', best: null, ok })
        if (!ok) misses.push(`action ${String(i)}: ${what} was drawn in dark ink with no tap: an outlined small button (1px light border, white or transparent background); ${dark.length ? 'it was built with a dark solid fill' : 'nothing with a border was built there'}: give it a thin border and no dark fill, keep its symbol dark`)
        continue
      }
      // n121: a bar is checked as a thin block of its colour on the drawn line, never as text of that colour
      if (isBarInk(c, a)) {
        const bar = barsOf([a]).find((x) => x.strokeId === c.strokeId)!
        const v = barBuilt(bar, after.nodes)
        checks.push({ what: `${what} (bar)`, want: hex(c.color), best: v.de, ok: v.ok })
        if (!v.ok) misses.push(v.offBy !== undefined
          ? `action ${String(i)}: ${what} was drawn in ${hex(c.color)} with no words on it: a bar; it was built ${String(Math.abs(v.offBy))}px ${v.offBy > 0 ? 'below' : 'above'} its drawn line (its centre at y ${String(bar.y + v.offBy)}, drawn at y ${String(bar.y)}): ${barRowsHint(barsOf([a]), after.nodes) ?? 'move its row so the bar sits on the drawn line'}; keep its colour, label and amount`
          : `action ${String(i)}: ${what} was drawn in ${hex(c.color)} with no words on it: a bar; ${v.de === null ? 'no thin block was built on that line' : `the nearest thin block on it is ΔE ${v.de.toFixed(0)} away`}: build a thin strip (6-10px tall) there with background ${hex(c.color)}; its label and amount stay dark text`)
        continue
      }
      const at = closestAt(c.color, near, c.paint)
      const best = at?.de ?? null
      const hit = best !== null && best <= SOLID_OK_DE
      // n94: a plain drawn panel is built flat: the block carrying its colour has square corners, no shadow, no fade
      if (hit && at && plainPanel(c, a)) {
        const why = notFlat(at.node)
        checks.push({ what: `${what} (flat panel)`, want: 'square corners, no shadow, no gradient', best: null, ok: !why })
        if (why) misses.push(`action ${String(i)}: ${what} is a plain panel drawn with square corners and filled ${hex(c.color)}; it was built with ${why}: make it flat, border-radius 0, box-shadow none, one solid background ${hex(c.color)}`)
      }
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

type XY = { x: number; y: number }
function centroid(poly: XY[]): XY {
  return poly.reduce((t, p) => ({ x: t.x + p.x / poly.length, y: t.y + p.y / poly.length }), { x: 0, y: 0 })
}
function polyArea(poly: XY[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.y - b.x * a.y }
  return Math.abs(s) / 2
}
function inPoly(p: XY, poly: XY[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Colour stops of a computed linear-gradient with their positions (%, or null when not written). */
export function stopsOf(img: string | undefined): Array<{ css: string; at: number | null }> {
  const m = /linear-gradient\((.*)\)\s*$/i.exec((img ?? '').split(/,\s*(?=(?:linear|radial|conic)-gradient)/i)[0]!.trim())
  if (!m) return []
  const out: Array<{ css: string; at: number | null }> = []
  for (const x of m[1]!.matchAll(/((?:rgba?|oklch|oklab|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b)\s*(-?[\d.]+%)?(?:\s+(-?[\d.]+%))?/gi)) {
    out.push({ css: x[1]!, at: x[2] ? Number(x[2].slice(0, -1)) : null })
    if (x[3]) out.push({ css: x[1]!, at: Number(x[3].slice(0, -1)) })
  }
  return out
}

/**
 * n59: is the block painted as two solid fills meeting at the divider? Either a gradient on the block that
 * carries both colours with a hard stop between them (the two stops at the same place), or two solid parts,
 * one centred on each side of the divider and covering a good share of it.
 */
export function splitVerdict(split: NonNullable<InkColour['split']>, near: DomNode[], all: DomNode[]): { ok: boolean; worst: number | null; why: string } {
  const want = split.colors.map((c) => parseCssColor(c))
  if (!want[0] || !want[1]) return { ok: true, worst: null, why: '' }
  let worstSeen: number | null = null
  let fadeSeen = false
  for (const n of near) {
    const st = stopsOf(n.style.backgroundImage)
    if (st.length < 2) continue
    const parsed = st.map((s) => ({ c: parseCssColor(s.css), at: s.at }))
    const de = want.map((w) => Math.min(...parsed.map((p) => (p.c ? deltaE(w!, p.c) : 999))))
    const worst = Math.max(...de)
    worstSeen = worstSeen === null ? worst : Math.min(worstSeen, worst)
    if (worst > OK_DE) continue
    // a hard stop: two neighbouring stops of the two colours at (about) the same place
    let hard = false
    for (let k = 1; k < parsed.length; k++) {
      const p = parsed[k - 1]!, q = parsed[k]!
      if (!p.c || !q.c || p.at === null || q.at === null) continue
      if (deltaE(p.c, q.c) > OK_DE && Math.abs(q.at - p.at) <= 1.5) hard = true
    }
    if (hard) return { ok: true, worst, why: '' }
    fadeSeen = true
  }
  // or two solid parts, one on each side
  const sideOk = split.sides.map((side, k) => {
    const A = polyArea(side)
    return all.some((n) => {
      const cx = n.rect.x + n.rect.w / 2, cy = n.rect.y + n.rect.h / 2
      if (!inPoly({ x: cx, y: cy }, side)) return false
      const area = n.rect.w * n.rect.h
      if (area < A * 0.35 || area > A * 2.2) return false
      const g = parseCssColor(n.style.backgroundColor)
      return !!g && alphaOf(n.style.backgroundColor) >= 0.8 && deltaE(want[k]!, g) <= 6
    })
  })
  if (sideOk[0] && sideOk[1]) return { ok: true, worst: 0, why: '' }
  return {
    ok: false,
    worst: worstSeen,
    why: fadeSeen
      ? 'it is built as a fade from one colour into the other (no hard stop at the divider)'
      : `${!sideOk[0] ? `the side tapped ${hex(split.colors[0])}` : `the side tapped ${hex(split.colors[1])}`} is not painted that solid colour`,
  }
}

/**
 * n92: a box no bigger than a small control (both sides at most 64px), drawn in dark, nearly neutral ink with no tap,
 * is an outline: the person drew a square with the pen they write with, not a dark fill. Round 36 e3 (timesheet):
 * the two pager squares beside the date range were built as dark filled buttons, three builds in a row.
 */
export function inkOutlineBox(color: string | null | undefined, box: { w: number; h: number }): boolean {
  if (!color || box.w > 64 || box.h > 64 || box.w < 8 || box.h < 8) return false
  const p = parseCssColor(color)
  if (!p) return false
  const max = Math.max(p.r, p.g, p.b), min = Math.min(p.r, p.g, p.b)
  const lum = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b
  return lum < 70 && max - min < 48
}

/**
 * n78: a box drawn in a light grey pen with no tap is an OUTLINE: a card, a field, a panel or a button with a thin
 * grey border, never a grey block. A person reaches for a light grey pen to draw the faint frame they see, and taps
 * when they want a fill. Round 38 e1 (hotel booking), e2 (contacts), e4 (job board): grey-pen room cards, the
 * calendar, the search field and the Email / Call buttons were all built solid grey on a white page. Only a nearly
 * neutral grey counts (a coloured pen still fills), and not the palest greys (a #f3f4f6 sidebar is a fill).
 */
export function inkGreyOutline(color: string | null | undefined, box: { w: number; h: number }): boolean {
  if (!color || box.w < 16 || box.h < 12) return false
  const p = parseCssColor(color)
  if (!p) return false
  const max = Math.max(p.r, p.g, p.b), min = Math.min(p.r, p.g, p.b)
  const lum = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b
  return max - min <= 20 && lum >= 150 && lum <= 236
}

/** n78: the block draws a frame: a visible border, an outline, or a 1px ring shadow. */
export function hasFrame(n: DomNode): boolean {
  const b = n.style.border
  if (b && !/^\s*0px/.test(b) && !/\bnone\b/.test(b)) return true
  const o = (n.style as Record<string, string | undefined>).outline
  if (o && !/^\s*0px/.test(o) && !/\bnone\b/.test(o)) return true
  const sh = n.style.boxShadow
  return !!sh && /0px 0px 0px [1-3](?:\.\d+)?px/.test(sh)
}

/**
 * n129: a ring noted as an arc / track / progress is built hollow. Fails when a disc about the drawn size, centred on
 * the drawn ring, paints the pen colour (a solid background, or a gradient carrying it) and nothing covers its middle
 * (an inner element at most 97% and at least 50% of its size, centred, with an opaque fill of another colour), or when
 * nothing at all about the drawn size was built there. An SVG ring (circles with fill none) paints no background and passes.
 */
export function hollowBuilt(c: Pick<InkColour, 'box' | 'color'>, nodes: readonly DomNode[]): { ok: boolean; why: string } {
  const b = c.box, d = (b.w + b.h) / 2, cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const pen = parseCssColor(c.color)
  if (!pen) return { ok: true, why: '' }
  const centred = (n: DomNode, lo: number, hi: number, off: number) => {
    const w = n.rect.w, h = n.rect.h
    return w >= d * lo && w <= d * hi && h >= d * lo && h <= d * hi && Math.hypot(n.rect.x + w / 2 - cx, n.rect.y + h / 2 - cy) <= d * off
  }
  const near = nodes.filter((n) => centred(n, 0.7, 1.3, 0.2))
  if (!near.length) return { ok: false, why: `nothing about ${String(Math.round(d))}px across was built centred on it` }
  for (const n of near) {
    const paints = painted(n, 'background').filter((css) => css && alphaOf(css) >= 0.6)
    const penFill = paints.some((css) => { const g = parseCssColor(css); return !!g && deltaE(pen, g) <= 12 })
    if (!penFill) continue
    const R = n.rect, nd = (R.w + R.h) / 2, ncx = R.x + R.w / 2, ncy = R.y + R.h / 2
    const hole = nodes.some((m) => {
      if (m === n) return false
      const md = (m.rect.w + m.rect.h) / 2
      if (md > nd * 0.97 || md < nd * 0.5 || Math.abs(m.rect.w - m.rect.h) > 0.12 * md) return false
      if (Math.hypot(m.rect.x + m.rect.w / 2 - ncx, m.rect.y + m.rect.h / 2 - ncy) > nd * 0.08) return false
      const bg = m.style.backgroundColor
      const g = parseCssColor(bg)
      return !!g && alphaOf(bg) >= 0.9 && deltaE(pen, g) > 12
    })
    if (!hole) return { ok: false, why: `it was built as a solid ${hex(c.color)} disc ${String(Math.round(R.w))}px across with nothing covering its middle` }
  }
  return { ok: true, why: '' }
}
