/**
 * Fidelity controls — how much of the drawing the output must resemble, and
 * in which respects.
 *
 * The depiction path shipped with one implicit setting per action
 * (`verbatim` | `recognized`) chosen by the interpreter, and a single fixed
 * pass mark. But "how literally should this be taken" is the user's call, not
 * the interpreter's: the same scribble is a rough placement hint one minute
 * and an exact shape the next.
 *
 * The rule from the composition work holds here — prose is not a measurement.
 * A slider that only rewords the prompt ("try to stay close") changes nothing
 * a model is accountable to. So every control below moves a number that
 * verification actually scores:
 *
 *   resemblance → which rung of the rendering ladder is demanded, the
 *                 detail-density band the output must land in, and the score
 *                 the composition check has to clear to pass
 *   keep.*      → whether that specific check can fail the run at all
 *
 * Turning a check off is not "ignore the sketch": it licenses the agent to
 * normalize that one aspect (mirror it, even the pitch, restyle it) while the
 * rest stays measured.
 */

/** What must survive from the drawing, aspect by aspect. */
export interface FidelityKeep {
  /** Lopsidedness: don't mirror one side onto the other. */
  asymmetry: boolean
  /** Uneven pitch/length of repeated parts: don't clone one template. */
  rhythm: boolean
  /** Overall aspect ratio of the drawn form. */
  proportions: boolean
  /** Where the parts sit relative to each other. */
  placement: boolean
}

/**
 * How FINISHED the result should be — a separate axis from resemblance.
 *
 * Resemblance says how closely the drawn geometry is followed. It says nothing
 * about whether the output is line art or a finished thing, and that is the
 * difference between "turn this drawing into code" and "make me something like
 * this". Someone who sketches a side profile wants a face, not their own
 * outline re-emitted as strokes.
 */
export type FillLevel = 'outline' | 'filled' | 'realized'

import { normalizeStyle, STYLES, type StyleId } from './style.js'

export interface FidelityControls {
  /**
   * 0 → reinterpret: substitute a proper icon/asset for the concept
   * 0.5 → rebuild from the measured features (the default)
   * 1 → trace: reproduce the drawn path as drawn
   */
  resemblance: number
  keep: FidelityKeep
  /** Line art, solid shapes, or a finished illustration of the subject. */
  fill: FillLevel
  /** What it should look like: flat, soft, line art, grain, glow, or the app's own. */
  style: StyleId
  /** 'app' snaps colour/size to the app's design system; 'sketch' keeps the
   *  drawing's own look (hand-drawn line, its own proportions). */
  palette: 'app' | 'sketch'
}

export const DEFAULT_FIDELITY: FidelityControls = {
  resemblance: 0.5,
  keep: { asymmetry: true, rhythm: true, proportions: true, placement: true },
  // A sketch is shorthand for a thing, not a request for its outline: solid
  // shapes are the useful default, and 'outline' is the opt-in for line art.
  fill: 'filled',
  // no aesthetic imposed until one is asked for
  style: 'auto',
  palette: 'app',
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Validate whatever the client sent. The overlay is untrusted input like any
 * other request body, and a malformed control must not be able to lower the
 * bar silently — anything unrecognized falls back to the default.
 */
export function normalizeFidelity(raw: unknown): FidelityControls {
  if (!raw || typeof raw !== 'object') return DEFAULT_FIDELITY
  const r = raw as Record<string, unknown>
  const keepRaw = (r.keep ?? {}) as Record<string, unknown>
  const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt)
  return {
    resemblance:
      typeof r.resemblance === 'number' && Number.isFinite(r.resemblance)
        ? clamp01(r.resemblance)
        : DEFAULT_FIDELITY.resemblance,
    keep: {
      asymmetry: bool(keepRaw.asymmetry, DEFAULT_FIDELITY.keep.asymmetry),
      rhythm: bool(keepRaw.rhythm, DEFAULT_FIDELITY.keep.rhythm),
      proportions: bool(keepRaw.proportions, DEFAULT_FIDELITY.keep.proportions),
      placement: bool(keepRaw.placement, DEFAULT_FIDELITY.keep.placement),
    },
    fill: r.fill === 'outline' || r.fill === 'realized' ? r.fill : DEFAULT_FIDELITY.fill,
    style: normalizeStyle(r.style),
    palette: r.palette === 'sketch' ? 'sketch' : 'app',
  }
}

export type RenderRung = 'reinterpret' | 'normalize' | 'rebuild' | 'trace'

/** Where on the rendering ladder the slider lands. */
export function rungFor(resemblance: number): RenderRung {
  if (resemblance >= 0.85) return 'trace'
  if (resemblance >= 0.6) return 'rebuild'
  if (resemblance >= 0.35) return 'normalize'
  return 'reinterpret'
}

/**
 * Direction changes per unit length above which an output reads as traced ink
 * rather than a rebuilt form. Calibrated on this repo's own generated
 * components: rebuilt icons measure 0.00–1.11, paths fitted straight off the
 * strokes measure 3.80–17.27.
 */
const REBUILT_TURNS_PER_UNIT = 2.5

/**
 * Direction changes per unit length the output should land near.
 *
 * At the trace end the drawn wobble IS the subject, so the target is the
 * sketch's own density. Below that the output must be rebuilt.
 */
export function detailBand(f: FidelityControls, sketchDensity: number): { min: number; max: number } {
  const rung = rungFor(f.resemblance)
  // Only a FINISHED illustration earns headroom here. It invents interior
  // detail the ink never had, so the ceiling that catches "you traced the
  // wobble" has to rise or every realized result is flagged for the detail it
  // was told to add. Solid shapes add fills, not direction changes, so
  // 'filled' keeps the same ceiling as line art — tracing is still tracing.
  const room = f.fill === 'realized' ? 2.5 : 1
  if (rung === 'trace') return { min: sketchDensity * 0.5, max: Infinity }
  if (rung === 'rebuild') return { min: 0, max: Math.max(REBUILT_TURNS_PER_UNIT, sketchDensity * 0.5) * room }
  return { min: 0, max: REBUILT_TURNS_PER_UNIT * room }
}

/**
 * Score the composition check must clear. Asking for a close likeness means
 * accepting a stricter bar; asking for a free reinterpretation means
 * composition is advisory and should not fail the run.
 */
export function passMark(f: FidelityControls): number {
  const rung = rungFor(f.resemblance)
  const base = rung === 'reinterpret' ? 0 : rung === 'normalize' ? 0.5 : rung === 'rebuild' ? 0.65 : 0.75
  // added detail moves ink mass around by design; don't fail a realized
  // illustration for the elaboration it was asked for
  return f.fill === 'realized' ? Math.max(0, base - 0.1) : base
}

/** The instruction the codegen agent gets, stated as a rung plus its licences. */
export function fidelityDirective(f: FidelityControls): string {
  const rung = rungFor(f.resemblance)
  const pct = Math.round(f.resemblance * 100)
  const head: Record<RenderRung, string> = {
    trace:
      `TRACE (resemblance ${pct}%): the drawn line itself is the subject. Emit the supplied ` +
      `svgPath geometry as real SVG, preserving its wobble and irregularity. Do NOT substitute ` +
      `an icon and do NOT smooth the form into primitives.`,
    rebuild:
      `REBUILD FAITHFULLY (resemblance ${pct}%): redraw the form with clean continuous curves — ` +
      `no traced jitter — but hit every measured number below. The silhouette a viewer remembers ` +
      `must be the one that was drawn.`,
    normalize:
      `NORMALIZE (resemblance ${pct}%): rebuild with pristine geometry from the drawn features. ` +
      `Straighten, close and align what is nearly so, while keeping the measured composition.`,
    reinterpret:
      `REINTERPRET (resemblance ${pct}%): the sketch names a concept and marks a place. Use a ` +
      `proper icon or asset for the depicted concept, in the app's own idiom; the drawn outline ` +
      `is a hint, not a spec. Composition is reported but is not scored against you.`,
  }
  const kept: string[] = []
  const free: string[] = []
  ;(
    [
      ['asymmetry', 'left/right lopsidedness (never mirror one side onto the other)', 'may be evened into a symmetric form'],
      ['rhythm', 'the uneven spacing and length of repeated parts', 'repeated parts may sit on a uniform pitch'],
      ['proportions', "the drawn form's aspect ratio", 'may be re-proportioned to suit the layout'],
      ['placement', 'where each part sits relative to the others', 'parts may be rearranged'],
    ] as Array<[keyof FidelityKeep, string, string]>
  ).forEach(([k, keepText, freeText]) => {
    if (f.keep[k]) kept.push(keepText)
    else free.push(freeText)
  })

  const fill: Record<FillLevel, string> = {
    outline:
      `RESULT — LINE ART: strokes only, no fills. Reproduce it as the drawing is: lines.`,
    filled:
      `RESULT — SOLID: build it out of filled shapes, not outlines, in at least two values so the ` +
      `form reads as an object rather than a flat cut-out — a body tone and a shadow side at ` +
      `minimum. Use strokes only where a line is genuinely the subject.`,
    realized:
      `RESULT — FINISHED ILLUSTRATION: the drawing is the brief, not the artwork. Produce the ` +
      `thing it depicts, complete: filled shapes, shading or tonal separation, and the detail ` +
      `the subject implies but the sketch only gestures at — a sketched side profile comes back ` +
      `as an actual face with brow, eye, nose, lips and jaw, not a line drawing of one. Read the ` +
      `subject from the reading and from what surrounds it, and add what it needs to read as that ` +
      `thing at a glance. Keep the drawn silhouette and proportions; invent the interior. Use at ` +
      `least three values — base, shadow, highlight — and gradients where a surface curves.`,
  }
  const lines = [head[rung], fill[f.fill], STYLES[f.style].directive]
  if (kept.length) lines.push(`MUST SURVIVE (scored): ${kept.join('; ')}.`)
  if (free.length) lines.push(`Free to normalize (not scored): ${free.join('; ')}.`)
  lines.push(
    f.palette === 'app'
      ? `Styling: use the app's existing palette, stroke weights and spacing scale for CHROME — ` +
        `frames, borders, labels, anything that belongs to the UI. A depicted SUBJECT is not ` +
        `chrome: give it the colours the thing actually has (skin, hair, foliage, metal, sky), ` +
        `harmonised with the app rather than flattened into one of its greys. A palette is a ` +
        `constraint on the interface, not a reason for a face to be grey.`
      : `Styling: keep the sketch's own look — hand-drawn line quality and its own colours — rather than snapping to the app's design tokens.`,
  )
  return lines.join('\n')
}

/** One-line summary for the run summary and the HUD preview. */
export function fidelitySummary(f: FidelityControls): string {
  const off = (Object.keys(f.keep) as Array<keyof FidelityKeep>).filter((k) => !f.keep[k])
  return (
    `${rungFor(f.resemblance)} ${Math.round(f.resemblance * 100)}% · ${f.fill}` +
    (f.style === 'auto' ? '' : ` · ${f.style}`) +
    (off.length ? ` · free: ${off.join(',')}` : '') +
    (f.palette === 'sketch' ? ' · sketch styling' : '')
  )
}
