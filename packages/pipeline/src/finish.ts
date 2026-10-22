/**
 * The finishing pass: cheap deterministic cleanup after codegen, before
 * verification.
 *
 * The clearest finding from studying image pipelines is that their quality
 * does not come from the base model — people reproduce the architecture and
 * get much worse results. It comes from the passes around it: preprocessing
 * before, and post-processing after.
 *
 * This pipeline had none. Its only remedy for a near-miss was another full
 * codegen round, which costs tokens and can regress work that was already
 * right. These are the fixes that need no judgement, so nothing has to be
 * asked: a colour that is nearly a design token becomes that token, and
 * geometry that renders nothing is removed.
 *
 * Deliberately conservative. Anything requiring taste — which shapes should
 * be filled, what an interior should look like — stays with the model and the
 * repair loop, which now has the measurements to ask for it precisely.
 */
import { appPalette, deltaE, hexOf, parseCssColor, type PaletteEntry } from './palette.js'
import type { DomSnapshot } from '@s2c/dom'

export interface FinishEdit {
  kind: 'colour-snapped' | 'empty-path-dropped' | 'duplicate-path-dropped'
  detail: string
}

export interface FinishResult {
  code: string
  edits: FinishEdit[]
}

/**
 * Below this the literal is the same colour as the token to any eye, so
 * writing the literal is just a design-system leak. Tighter than the ΔE 25
 * used when SUGGESTING a token to the model: rewriting someone's code
 * unasked deserves a higher bar than making a recommendation.
 */
const SNAP_MAX_DELTA_E = 6

/**
 * An arbitrary-value colour utility: `text-[#2563eb]`, `bg-[#fff]`. This is
 * the ONLY place a literal can be swapped for a token safely — the context is
 * already a class, so a class is what belongs there. Rewriting a literal
 * inside `fill="#2563eb"` would just trade one literal for another, and
 * rewriting one in arbitrary code could change something that is not a colour
 * at all.
 */
const ARBITRARY_COLOR = /\b(text|bg)-\[(#[0-9a-fA-F]{3,8})\]/g

/**
 * Rewrite near-token colour literals as the token, drop geometry that cannot
 * render, and drop exact duplicate paths.
 */
export function finishSource(code: string, palette: PaletteEntry[], asked: ReadonlySet<string> = new Set()): FinishResult {
  const edits: FinishEdit[] = []
  let out = code

  // ① a one-off literal where the app already has a token for that colour
  if (palette.length > 0) {
    out = out.replace(ARBITRARY_COLOR, (lit, prefix: string, hex: string) => {
      const rgb = parseCssColor(hex)
      if (!rgb) return lit
      // a hex the user typed is an exact request, not a leak: round 7 e5's pale grey (#f3f4f6) header row and
      // #f9fafb page sit ΔE 4 and 1.6 from white, so this pass rewrote both to bg-white after every build and
      // every repair (three runs of "the builder ignores the tint" were this line)
      if (asked.has(hexOf(rgb))) return lit
      let best: PaletteEntry | undefined
      let bestD = Infinity
      for (const entry of palette) {
        // a text- utility must not become a bg- one
        if (!entry.token.startsWith(`${prefix}-`)) continue
        const d = deltaE(rgb, entry.rgb)
        if (d < bestD) { bestD = d; best = entry }
      }
      if (!best || bestD > SNAP_MAX_DELTA_E) return lit
      edits.push({ kind: 'colour-snapped', detail: `${hexOf(rgb)} → ${best.token} (ΔE ${bestD.toFixed(1)})` })
      return best.token
    })
  }

  // ② geometry that renders nothing: a path needs a move plus at least one
  // drawing command to put ink on the page
  out = out.replace(/\s*<path\b[^>]*\bd="([^"]*)"[^>]*\/>\s*\n?/g, (whole, d: string) => {
    const commands = (d.match(/[A-Za-z]/g) ?? []).length
    if (commands >= 2 && d.trim().length > 4) return whole
    edits.push({ kind: 'empty-path-dropped', detail: `d="${d.slice(0, 24)}"` })
    return '\n'
  })

  // ③ the same path emitted twice — invisible, and it doubles stroke weight
  const seen = new Set<string>()
  out = out.replace(/\s*<path\b[^>]*\bd="([^"]+)"[^>]*\/>\s*\n?/g, (whole, d: string) => {
    const key = d.replace(/\s+/g, ' ').trim()
    if (!seen.has(key)) {
      seen.add(key)
      return whole
    }
    edits.push({ kind: 'duplicate-path-dropped', detail: `d="${key.slice(0, 24)}…"` })
    return '\n'
  })

  return { code: out, edits }
}

/** Every hex colour written in the user's words (notes, instructions), normalised to #rrggbb. */
export function askedHexes(texts: Array<string | undefined>): Set<string> {
  const out = new Set<string>()
  for (const t of texts) {
    for (const m of (t ?? '').matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      const rgb = parseCssColor(m[0])
      if (rgb) out.add(hexOf(rgb))
    }
  }
  return out
}

/** The palette to snap against: whatever the app itself renders. */
export const paletteFor = (snap: DomSnapshot): PaletteEntry[] => appPalette(snap)
