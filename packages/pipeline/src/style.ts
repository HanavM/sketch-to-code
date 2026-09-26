/**
 * Style: what the result should LOOK like.
 *
 * The other controls answer different questions. Resemblance says how closely
 * the drawn geometry is followed; RESULT says how finished the thing is.
 * Neither says anything about aesthetic, so every output came back in the
 * same register — the house style of whatever the model reaches for by
 * default.
 *
 * Image tools solve this with trained styles: a handful of reference images
 * become an adapter that biases every generation. The code equivalent is not
 * a trained weight, it is a rendering CONVENTION — which SVG techniques are
 * in play and which are forbidden. Flat means no gradients. Line means no
 * fills. Grain means a limited palette plus real texture. Those are all
 * observable in the emitted source, which means a style can be checked rather
 * than merely requested, exactly like every other dial here.
 */

export type StyleId = 'auto' | 'flat' | 'soft' | 'line' | 'grain' | 'glow'

export const STYLE_IDS: StyleId[] = ['auto', 'flat', 'soft', 'line', 'grain', 'glow']

export interface StyleSpec {
  id: StyleId
  label: string
  /** One line, as the user reads it. */
  hint: string
  /** What the agent is told to do. */
  directive: string
  /** What the source must show for the style to have been honoured. */
  expect: {
    /** Fewest distinct fill values; overrides the RESULT level's own floor. */
    tones?: number
    /** At least this many gradient definitions. */
    gradients?: number
    /** No gradients at all. */
    noGradients?: boolean
    /** Strokes carry the drawing; fills are not the medium. */
    strokesOnly?: boolean
    /** SVG filter primitives that must appear, e.g. feTurbulence. */
    filters?: string[]
  }
}

export const STYLES: Record<StyleId, StyleSpec> = {
  auto: {
    id: 'auto', label: 'match the app',
    hint: 'no aesthetic imposed — follow whatever the surrounding UI already does',
    directive:
      `STYLE — MATCH THE APP: take the aesthetic from the code around it. Look at how nearby ` +
      `components render (stroke weights, corner radii, shadow use, how much colour they carry) ` +
      `and make this belong beside them.`,
    expect: {},
  },
  flat: {
    id: 'flat', label: 'flat',
    hint: 'solid shapes, no gradients — modern flat illustration',
    directive:
      `STYLE — FLAT: solid colour only. NO gradients, no blurs, no soft shadows. Build form by ` +
      `stacking distinct flat shapes in different values, the way a paper cut-out does — a lighter ` +
      `plane against a darker one, hard edges between them. Depth comes from shape and value, ` +
      `never from interpolation.`,
    expect: { tones: 3, noGradients: true },
  },
  soft: {
    id: 'soft', label: 'soft',
    hint: 'gradients and soft shadows — rounded, lit, dimensional',
    directive:
      `STYLE — SOFT: dimensional and lit. Use gradients across curved surfaces, a soft shadow ` +
      `where forms overlap, and a highlight where light lands. Edges should feel rounded rather ` +
      `than cut. At least one linearGradient or radialGradient carries the main form.`,
    expect: { tones: 4, gradients: 1 },
  },
  line: {
    id: 'line', label: 'line art',
    hint: 'uniform strokes, no fills — drawn, not painted',
    directive:
      `STYLE — LINE ART: the line is the medium. Uniform stroke weight, no fills (fill="none" ` +
      `throughout), no gradients. Convey form with contour and with hatching where a surface ` +
      `turns away. This overrides the RESULT level's fills: do not fill shapes in this style.`,
    expect: { strokesOnly: true, noGradients: true },
  },
  grain: {
    id: 'grain', label: 'grain',
    hint: 'a few flat colours plus visible texture — printed, risograph',
    directive:
      `STYLE — GRAIN: printed, not rendered. Restrict yourself to three or four flat inks and let ` +
      `them overlap with slight misregistration and multiply-style blending. Add real texture with ` +
      `an SVG filter — feTurbulence (fractalNoise) into feDisplacementMap or a grain overlay — so ` +
      `the surface is visibly noisy rather than clean. No smooth gradients.`,
    expect: { tones: 3, filters: ['feTurbulence'] },
  },
  glow: {
    id: 'glow', label: 'glow',
    hint: 'dark ground, saturated colour, luminous edges — neon',
    directive:
      `STYLE — GLOW: luminous against dark. Put the form on a dark ground, draw it in saturated ` +
      `colour, and make the edges emit — an feGaussianBlur bloom behind a brighter core stroke, ` +
      `stacked so the centre reads hotter than the halo. Colour is the subject here: nothing ` +
      `muted or grey.`,
    expect: { tones: 3, filters: ['feGaussianBlur'] },
  },
}

export function normalizeStyle(raw: unknown): StyleId {
  return STYLE_IDS.includes(raw as StyleId) ? (raw as StyleId) : 'auto'
}

/** What the source shows about how it was rendered. */
export interface RenderTraits {
  gradients: number
  filters: string[]
  /** Shapes carrying a real fill. */
  filled: number
  shapes: number
}

export function renderTraits(code: string): RenderTraits {
  const gradients = (code.match(/<(?:linear|radial)Gradient\b/gi) ?? []).length
  const filters = [...new Set(
    [...code.matchAll(/<(fe[A-Z][A-Za-z]+)\b/g)].map((m) => m[1]!),
  )]
  const shapes = (code.match(/<\s*(?:path|ellipse|circle|rect|polygon)\b/gi) ?? []).length
  const filled = (code.match(/\bfill\s*=\s*["'{]?\s*(?!none|transparent)[^"'}\s>]+/gi) ?? []).length
  return { gradients, filters, filled, shapes }
}

/**
 * Was the style actually honoured? Returns the complaints, in the same
 * numeric-and-actionable register the composition notes use.
 */
export function styleFaults(style: StyleId, code: string, tones: number | null): string[] {
  const spec = STYLES[style]
  const traits = renderTraits(code)
  const faults: string[] = []

  if (spec.expect.noGradients && traits.gradients > 0) {
    faults.push(
      `${spec.label} style forbids gradients, and the output has ${traits.gradients} — ` +
      `build the form from flat shapes in different values instead`,
    )
  }
  if (spec.expect.gradients && traits.gradients < spec.expect.gradients) {
    faults.push(
      `${spec.label} style wants gradients carrying the form, and the output has ` +
      `${traits.gradients} — a flat fill cannot read as a lit surface`,
    )
  }
  if (spec.expect.strokesOnly && traits.filled > 0) {
    faults.push(
      `${spec.label} style is drawn, not painted, but ${traits.filled} shape(s) carry a fill — ` +
      `use fill="none" and let contour and hatching do the work`,
    )
  }
  for (const f of spec.expect.filters ?? []) {
    if (!traits.filters.includes(f)) {
      faults.push(
        `${spec.label} style needs a real ${f} filter and the output has none` +
        (traits.filters.length ? ` (it uses ${traits.filters.join(', ')})` : ''),
      )
    }
  }
  if (spec.expect.tones && tones !== null && tones < spec.expect.tones) {
    faults.push(
      `${spec.label} style wants at least ${spec.expect.tones} distinct values and the output ` +
      `uses ${tones}`,
    )
  }
  return faults
}
