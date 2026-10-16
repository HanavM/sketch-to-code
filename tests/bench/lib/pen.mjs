/**
 * pen.mjs — which pen colour each mark of a page is drawn in (s2c-015).
 *
 * The overlay already has a mark that carries a VALUE: the pen colour
 * (Alt+P; packages/pipeline/src/palette.ts, "the pen colour IS the
 * instruction"). A ring drawn in green asks for green, with no words. Until
 * now the bench could only draw in the default ink, so s2c-016 concluded that
 * a restyle "needs words" (r03: nothing but a typed note can say green). That
 * was a limit of the bench, not of the product. A page can now say
 *
 *   pens: ['#16a34a']        // one entry per stroke; null = default ink
 *
 * and run.mjs sets the pen through the real UI (Alt+P, the custom colour
 * input) before each mark, resets it with Alt+0 before the page, and checks
 * afterwards that every captured stroke carries the colour it was drawn in.
 *
 * Only `#rrggbb` is accepted: that is what the overlay's <input type=color>
 * produces, so anything else would be a colour no user could pick.
 */

const HEX = /^#[0-9a-f]{6}$/

/** Per-stroke pen colours for a spec, validated; null = default ink. */
export function pensFor(spec) {
  const n = spec.strokes?.length ?? 0
  if (spec.pens === undefined) return Array(n).fill(null)
  if (!Array.isArray(spec.pens) || spec.pens.length !== n) {
    throw new Error(`${spec.id}: pens must list one entry per stroke (${n}), got ${JSON.stringify(spec.pens)}`)
  }
  return spec.pens.map((c, i) => {
    if (c === null) return null
    if (typeof c !== 'string' || !HEX.test(c)) {
      throw new Error(`${spec.id}: pens[${i}] must be #rrggbb lowercase or null, got ${JSON.stringify(c)}`)
    }
    return c
  })
}

/**
 * The pen changes run.mjs has to make while drawing: before stroke `at`, set
 * the pen to `color`. The pen starts at the default ink (run.mjs presses Alt+0
 * first), so a page in default ink needs no changes at all.
 */
export function penChanges(spec) {
  const out = []
  let cur = null
  pensFor(spec).forEach((c, at) => {
    if (c !== cur) out.push({ at, color: c })
    cur = c
  })
  return out
}

/**
 * Did the overlay capture what was drawn? `captured` is
 * __S2C_DEBUG__.strokes(): [{ color }]. Strokes can merge (the overlay bridges
 * a mark that starts where the last ended), so this compares the SET of
 * colours, not stroke by stroke. Returns a problem string or null.
 */
export function penMismatch(spec, captured) {
  const want = new Set(pensFor(spec).map((c) => c ?? 'default'))
  const got = new Set(captured.map((s) => (s.color ? String(s.color).toLowerCase() : 'default')))
  const missing = [...want].filter((c) => !got.has(c))
  const extra = [...got].filter((c) => !want.has(c))
  if (!missing.length && !extra.length) return null
  return `pen colours drawn ${[...got].join(', ')}; spec asked for ${[...want].join(', ')}`
}
