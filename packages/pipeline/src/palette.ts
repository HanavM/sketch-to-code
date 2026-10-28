/**
 * Colour intent — the pen colour IS the instruction.
 *
 * Asking a user to name a colour ("make it red") sends a word through the
 * model and gets back whatever red it likes. Drawing in a colour states the
 * value exactly, and the same doctrine as geometry applies: don't hand the
 * model a raw hex and hope. Snap the drawn colour to a colour the app ALREADY
 * uses, and name the utility class that produces it — the answer is then a
 * token from the project's own design system rather than a new arbitrary hue.
 *
 * Everything here is measured off the DOM snapshot we already collect: each
 * node carries its computed `color` / `backgroundColor` and its class list, so
 * the pairing (class ⇄ rendered colour) is observable, not guessed.
 *
 * Parsing has to handle what browsers actually report, which on current
 * Chrome is `oklch(...)` for Tailwind v4 palettes — not just rgb()/hex.
 */
import type { DomSnapshot } from '@s2c/dom'

export interface Rgb { r: number; g: number; b: number }

/** A colour the app already uses, and the utility class that produced it. */
export interface PaletteEntry {
  /** e.g. 'bg-blue-600' or 'text-gray-500'. */
  token: string
  css: string
  rgb: Rgb
  /** How many elements render this pairing — ties break toward common ones. */
  count: number
}

export interface ColorMatch {
  /** The colour as drawn. */
  drawn: string
  /** Nearest colour already in the app, when one is close enough. */
  nearest?: PaletteEntry
  /** Perceptual distance to that nearest colour (CIE76 ΔE). */
  distance?: number
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

/** sRGB companding, linear → gamma-encoded. */
const encodeSrgb = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055

/**
 * Parse the colour syntaxes a browser or a pen can hand us: #rgb, #rrggbb,
 * rgb()/rgba(), and oklch() — which is what Tailwind v4 emits and what
 * getComputedStyle returns for it. Unknown syntaxes return null rather than a
 * wrong colour: a bad match here would rename a design token.
 */
export function parseCssColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase()
  if (!s || s === 'transparent' || s === 'none') return null

  const hex = /^#([0-9a-f]{3,8})$/.exec(s)
  if (hex) {
    const h = hex[1]!
    if (h.length === 3 || h.length === 4) {
      return { r: parseInt(h[0]! + h[0]!, 16), g: parseInt(h[1]! + h[1]!, 16), b: parseInt(h[2]! + h[2]!, 16) }
    }
    if (h.length === 6 || h.length === 8) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
    }
    return null
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(s)
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    // a fully transparent colour is not a colour intent
    if (parts.length >= 4 && Number(parts[3]) === 0) return null
    const n = (v: string) => (v.endsWith('%') ? (Number(v.slice(0, -1)) / 100) * 255 : Number(v))
    const [r, g, b] = [n(parts[0]!), n(parts[1]!), n(parts[2]!)]
    if ([r, g, b].some((v) => !Number.isFinite(v))) return null
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b) }
  }

  const oklch = /^oklch\(([^)]+)\)$/.exec(s)
  if (oklch) {
    const parts = oklch[1]!.split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    if (parts.length >= 4 && Number(parts[3]) === 0) return null
    const L = parts[0]!.endsWith('%') ? Number(parts[0]!.slice(0, -1)) / 100 : Number(parts[0])
    const C = Number(parts[1])
    const hDeg = Number(parts[2])
    if (![L, C, hDeg].every(Number.isFinite)) return null
    return oklchToRgb(L, C, hDeg)
  }
  // n16: Chrome reports a colour with alpha (text-white/70) as oklab(L a b / A)
  const oklab = /^oklab\(([^)]+)\)$/.exec(s)
  if (oklab) {
    const parts = oklab[1]!.split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    if (parts.length >= 4 && Number(parts[3]) === 0) return null
    const L = parts[0]!.endsWith('%') ? Number(parts[0]!.slice(0, -1)) / 100 : Number(parts[0])
    const a = Number(parts[1]), bb = Number(parts[2])
    if (![L, a, bb].every(Number.isFinite)) return null
    const C = Math.hypot(a, bb)
    return oklchToRgb(L, C, (Math.atan2(bb, a) * 180) / Math.PI)
  }
  return null
}

/** Oklch → Oklab → linear sRGB → sRGB (Björn Ottosson's matrices). */
function oklchToRgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const bb = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb
  const s_ = L - 0.0894841775 * a - 1.291485548 * bb
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return { r: clamp255(encodeSrgb(lr) * 255), g: clamp255(encodeSrgb(lg) * 255), b: clamp255(encodeSrgb(lb) * 255) }
}

/** sRGB → CIE Lab (D65), the space distances are meaningful in. */
function toLab({ r, g, b }: Rgb): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** CIE76 ΔE. ~2.3 is a just-noticeable difference; ~25 is "a different colour". */
export function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

export const hexOf = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** Class prefixes whose utility maps onto a computed colour we can observe. */
const COLOR_PROPS: Array<{ prefix: string; style: 'color' | 'backgroundColor' }> = [
  { prefix: 'text-', style: 'color' },
  { prefix: 'bg-', style: 'backgroundColor' },
]

/**
 * Every (utility class ⇄ rendered colour) pairing the page actually shows.
 *
 * Read off the live snapshot rather than a bundled Tailwind table: it stays
 * correct under a custom theme, arbitrary values and a different CSS
 * framework, and it can only ever suggest a token this project already uses.
 */
export function appPalette(snap: DomSnapshot): PaletteEntry[] {
  const byToken = new Map<string, PaletteEntry>()
  for (const node of snap.nodes) {
    for (const { prefix, style } of COLOR_PROPS) {
      const css = node.style[style]
      if (!css) continue
      const rgb = parseCssColor(css)
      if (!rgb) continue
      for (const cls of node.classes) {
        // size/weight utilities share the text- prefix ('text-sm'); only keep
        // classes whose value plausibly names a colour
        if (!cls.startsWith(prefix) || !isColorClass(cls, prefix)) continue
        const existing = byToken.get(cls)
        if (existing) existing.count++
        else byToken.set(cls, { token: cls, css, rgb, count: 1 })
      }
    }
  }
  return [...byToken.values()].sort((a, b) => b.count - a.count)
}

/**
 * 'text-red-600' / 'bg-white' / 'text-[#ff0000]' are colours; 'text-sm',
 * 'text-center' and 'bg-cover' are not. Tailwind colour utilities end in a
 * numeric shade, name a bare colour keyword, or carry an arbitrary value.
 */
function isColorClass(cls: string, prefix: string): boolean {
  const rest = cls.slice(prefix.length)
  if (rest.startsWith('[')) return true
  if (/-\d{2,3}$/.test(rest)) return true
  return ['white', 'black', 'transparent', 'current', 'inherit'].includes(rest)
}

/**
 * Beyond this ΔE the "nearest" colour is a different colour, and snapping to
 * it would silently overrule what the user drew. At that point the honest
 * answer is the raw value.
 */
const SNAP_MAX_DELTA_E = 25

/** Snap a drawn colour onto the app's own palette, when something is close. */
export function matchColor(drawn: string, palette: PaletteEntry[]): ColorMatch | null {
  const rgb = parseCssColor(drawn)
  if (!rgb) return null
  let best: PaletteEntry | undefined
  let bestD = Infinity
  for (const entry of palette) {
    const d = deltaE(rgb, entry.rgb)
    if (d < bestD) {
      bestD = d
      best = entry
    }
  }
  if (!best || bestD > SNAP_MAX_DELTA_E) return { drawn: hexOf(rgb) }
  return { drawn: hexOf(rgb), nearest: best, distance: bestD }
}

/** The colour instruction handed to codegen — a token when we have one. */
export function colorDirective(m: ColorMatch): string {
  if (m.nearest) {
    return (
      `COLOUR: drawn in ${m.drawn}. The app already renders that colour as \`${m.nearest.token}\` ` +
      `(${m.nearest.css}, ΔE ${m.distance!.toFixed(1)}) — use that class rather than a new literal value.`
    )
  }
  return (
    `COLOUR: drawn in ${m.drawn}, which nothing in the app currently uses. Apply it as an ` +
    `arbitrary value in the project's idiom (e.g. a \`[${m.drawn}]\` utility) rather than inventing a token.`
  )
}
