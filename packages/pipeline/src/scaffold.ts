/**
 * Supply the geometry; don't ask for it.
 *
 * This is the lesson of ControlNet, translated. A sketch-to-image pipeline
 * does not put the drawing in the prompt and hope: a preprocessor turns the
 * strokes into a conditioning signal that is injected into every step, so
 * structure is enforced mechanically and the model only contributes what it
 * alone can do — surfaces, light, the parts nobody can specify.
 *
 * This pipeline had it backwards. It measured the ink beautifully — fitted
 * beziers, a composition signature, asymmetry and spacing figures — then
 * pasted those numbers into a prompt, ASKED for them to be honoured, and
 * scored the answer afterwards. That is why a face needed two attempts: the
 * first scored 50% not because the model is weak but because structure was a
 * request rather than a constraint.
 *
 * So: write the geometry into a real component file BEFORE codegen runs, and
 * hand the model something that is already the right shape. What is left for
 * it is exactly what it is good at — naming the thing, mounting it in the
 * right place, choosing tokens, inventing the interior. Structure becomes
 * correct by construction instead of by luck plus scoring, and there is less
 * to generate, so the run is cheaper too.
 */
import type { BBox } from '@s2c/ink'
import type { GroundedAction } from './intent2.js'
import { rungFor, type FidelityControls } from './fidelity.js'

export interface Scaffold {
  /** Component name, e.g. 'SideProfile'. */
  name: string
  /** Path relative to the app root, e.g. 'src/components/SideProfile.tsx'. */
  rel: string
  code: string
  /** Which action this was built for. */
  actionIndex: number
}

/** Words that carry no identity in a depiction phrase. */
const STOP = new Set([
  'a', 'an', 'the', 'of', 'with', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
  'its', 'it', 'this', 'that', 'some', 'very', 'small', 'little', 'big', 'large',
  'simple', 'rough', 'quick', 'hand', 'drawn', 'sketch', 'sketched', 'doodle',
  'looking', 'facing', 'style', 'like',
])

/**
 * A component name from what the drawing depicts.
 *
 * `depicts` is a model-written phrase and can be a whole sentence ("a small
 * cartoon crab-like doodle creature (rounded body with two eyes…)"), so take
 * the first couple of words that actually carry identity.
 */
export function componentName(depicts: string | undefined, fallback = 'SketchShape'): string {
  const words = (depicts ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()))
    .slice(0, 2)
  if (words.length === 0) return fallback
  const name = words.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join('')
  // a leading digit or an empty result would not be a valid component
  return /^[A-Za-z]/.test(name) ? name : fallback
}

/** A path that closes is a shape and can be filled; an open one is a line. */
const isClosed = (d: string): boolean => /z\s*$/i.test(d.trim())

/**
 * The two strokes of an X drawn corner to corner across the region: the
 * sketch's sign for "a picture goes here", not geometry. Kept as "the user's
 * strokes, keep them" they were built as two thin diagonal lines over a
 * gradient block (round 5 c4: both tilted photos crossed out in the build).
 * Returns the stroke ids of the X, or an empty set when the drawing has no
 * full X (one diagonal alone may be a real line, so it stays).
 */
export function pictureCrossIds(paths: Array<{ strokeId: string; d: string }>, region: { w: number; h: number }): Set<string> {
  const tx = Math.max(12, region.w * 0.2), ty = Math.max(12, region.h * 0.2)
  const near = (p: [number, number], x: number, y: number): boolean => Math.abs(p[0] - x) <= tx && Math.abs(p[1] - y) <= ty
  const down: string[] = [], up: string[] = []
  for (const { d, strokeId } of paths) {
    if (isClosed(d)) continue
    const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number)
    if (nums.length < 4) continue
    const a: [number, number] = [nums[0]!, nums[1]!], b: [number, number] = [nums[nums.length - 2]!, nums[nums.length - 1]!]
    const { w, h } = region
    if ((near(a, 0, 0) && near(b, w, h)) || (near(b, 0, 0) && near(a, w, h))) down.push(strokeId)
    else if ((near(a, w, 0) && near(b, 0, h)) || (near(b, w, 0) && near(a, 0, h))) up.push(strokeId)
  }
  return down.length === 1 && up.length === 1 ? new Set([...down, ...up]) : new Set()
}

/**
 * Points ON a fitted path (absolute M/L/C/Q/Z, what the ink fitter writes),
 * sampled along each segment. Control points are not on the curve: a rounded
 * corner's handles overshoot the box, so they can't be used to measure it.
 */
function densePointsOf(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let cur: [number, number] = [0, 0], start: [number, number] = [0, 0]
  const T = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
  const line = (to: [number, number]) => { for (const t of T) out.push([cur[0] + (to[0] - cur[0]) * t, cur[1] + (to[1] - cur[1]) * t]); cur = to }
  for (const m of d.matchAll(/([MLCQZ])([^MLCQZ]*)/gi)) {
    const cmd = m[1]!.toUpperCase()
    const n = (m[2]!.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number)
    if (cmd === 'M' && n.length >= 2) {
      cur = [n[0]!, n[1]!]; start = cur; out.push(cur)
      for (let i = 2; i + 1 < n.length; i += 2) line([n[i]!, n[i + 1]!])
    } else if (cmd === 'L') for (let i = 0; i + 1 < n.length; i += 2) line([n[i]!, n[i + 1]!])
    else if (cmd === 'C') for (let i = 0; i + 5 < n.length; i += 6) {
      const p0 = cur, p1 = [n[i]!, n[i + 1]!], p2 = [n[i + 2]!, n[i + 3]!], p3: [number, number] = [n[i + 4]!, n[i + 5]!]
      for (const t of T) {
        const u = 1 - t
        out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0]! + 3 * u * t * t * p2[0]! + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1]! + 3 * u * t * t * p2[1]! + t * t * t * p3[1]])
      }
      cur = p3
    } else if (cmd === 'Q') for (let i = 0; i + 3 < n.length; i += 4) {
      const p0 = cur, p1 = [n[i]!, n[i + 1]!], p2: [number, number] = [n[i + 2]!, n[i + 3]!]
      for (const t of T) { const u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * p1[0]! + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1]! + t * t * p2[1]]) }
      cur = p2
    } else if (cmd === 'Z') line(start)
  }
  return out
}

/**
 * Is this drawn path a plain primitive whose whole geometry is its box: a
 * straight line, an upright (rounded) rectangle, or a small round dot? Those
 * carry nothing the region and the words don't already say. A tilted band, a
 * polygon, a silhouette, a heart or a big circle is real geometry and isn't.
 */
export function isPrimitivePath(d: string): boolean {
  const pts = densePointsOf(d)
  if (pts.length < 2) return false
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const bw = x1 - x0, bh = y1 - y0
  if (!isClosed(d)) {
    // straight: every point near the chord from first to last
    const [a, b] = [pts[0]!, pts[pts.length - 1]!]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 4) return false
    const tol = Math.max(3, 0.06 * len)
    return pts.every(([x, y]) => Math.abs((b[0] - a[0]) * (a[1] - y) - (a[0] - x) * (b[1] - a[1])) / len <= tol)
  }
  if (bw < 4 || bh < 4) return false
  // upright rectangle, corners rounded or not: every point hugs an edge of its box
  // capped: a torn or skewed photo edge 16px deep on a 450px block is real geometry
  const tol = Math.min(14, Math.max(7, 0.1 * Math.min(bw, bh)))
  const hugs = pts.every(([x, y]) => Math.min(x - x0, x1 - x, y - y0, y1 - y) <= tol)
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].every(([cx, cy]) =>
    pts.some(([x, y]) => Math.abs(x - cx!) <= 2 * tol && Math.abs(y - cy!) <= 2 * tol))
  if (hugs && corners) return true
  // a small round dot (a swatch, an avatar): every point near the ellipse of its box
  if (Math.max(bw, bh) > 80) return false
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return pts.every(([x, y]) => {
    const r = Math.hypot((x - cx) / (bw / 2), (y - cy) / (bh / 2))
    return r >= 0.7 && r <= 1.3
  })
}

/**
 * A drawing that is only plain primitives in a repeated set is a widget, not a
 * form: a column of thumbnails, a row of swatch dots, a grid of size boxes. So
 * is one primitive in a button-sized region (an icon button's square, an
 * avatar dot). Handing those over as "the user's strokes, keep them" made the
 * build read and edit a file per cluster and keep the wobbly outlines and the
 * picture X's (round 7 e4: eight drawn-shape files, an 8-minute build turn, no
 * time left to repair). A set is three or more closed primitives of about one
 * size, plus any straight lines (the X's). One or two big boxes keep their
 * scaffold: on creative pages those are tilted photos, cubes and skylines the
 * words reshape, and they built well with it.
 */
export function onlyPrimitives(paths: Array<{ d: string }>, region: { w: number; h: number }): boolean {
  if (!paths.length || !paths.every((p) => isPrimitivePath(p.d))) return false
  if (paths.length === 1) return region.w <= 80 && region.h <= 80
  const boxes = paths.filter((p) => isClosed(p.d)).map((p) => {
    const pts = densePointsOf(p.d)
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  })
  if (boxes.length < 3) return false
  const med = (v: number[]) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)]!
  const mw = med(boxes.map((b) => b.w)), mh = med(boxes.map((b) => b.h))
  return boxes.every((b) => Math.abs(b.w - mw) <= 0.25 * mw + 4 && Math.abs(b.h - mh) <= 0.25 * mh + 4)
}

/**
 * Build the component that already has the drawing in it.
 *
 * Returns null when there is nothing worth scaffolding: no geometry, or the
 * user asked for a free reinterpretation, where handing over the outline
 * would contradict what they asked for.
 */
export function buildScaffold(
  action: GroundedAction,
  actionIndex: number,
  fidelity: FidelityControls,
  opts: { dir: string; taken?: Set<string> } = { dir: 'src/components' },
): Scaffold | null {
  const region: BBox | undefined = action.region
  const cross = region ? pictureCrossIds(action.svgPaths ?? [], region) : new Set<string>()
  const paths = (action.svgPaths ?? []).filter((p) => !cross.has(p.strokeId))
  if (paths.length === 0 || !region || region.w < 1 || region.h < 1) return null
  if (rungFor(fidelity.resemblance) === 'reinterpret') return null
  // Only a drawn THING or a drawn decoration has geometry worth keeping. A
  // widget (fidelity unset: a card box, a button outline, an input line) is a
  // request for the app's own component, and the contract says rectify it,
  // don't reproduce it. Writing its wobbly outline as "the user's strokes,
  // keep them" would hand codegen a traced box on every design page.
  //
  // Trace rung: run2 rewrites every action with paths to 'verbatim' before
  // this is called, so widgets ARE scaffolded there. That is deliberate: at
  // resemblance >= 0.85 the user has said "reproduce what I drew", widgets
  // included. Text squiggles are still never in `paths` (grounding drops them).
  if (action.fidelity !== 'recognized' && action.fidelity !== 'verbatim') return null
  // the trace rung asked for widgets as drawn too (above), so only below it
  if (rungFor(fidelity.resemblance) !== 'trace' && onlyPrimitives(paths, region)) return null

  let name = componentName(action.depicts)
  const taken = opts.taken ?? new Set<string>()
  if (taken.has(name)) {
    let n = 2
    while (taken.has(`${name}${n}`)) n++
    name = `${name}${n}`
  }
  taken.add(name)

  const w = Math.round(region.w)
  const h = Math.round(region.h)
  // the style is visible from the first frame: line art never fills, flat
  // never interpolates. The instant render should already look like the thing
  // that was asked for, not like a default that changes under the user later.
  // a shape asked for as an outline (a ring, a hollow circle, an outlined pill)
  // is only its edge: a tinted inside turned round-3 c3's orbit rings into
  // lit discs over the headline
  const asOutline = /\b(outline[sd]?|outlined|hollow|ring)\b/i.test(`${action.instruction} ${action.depicts ?? ''}`)
  const filled = fidelity.fill !== 'outline' && fidelity.style !== 'line' && !asOutline
  const gradientOk = fidelity.style !== 'flat'
  // a colour the user actually drew in beats currentColor; a token the app
  // already uses beats a literal
  const token = action.color?.nearest?.token
  const literal = action.color?.drawn
  const cls = token && /^text-|^fill-/.test(token) ? token : token ? `text-[${literal ?? 'currentColor'}]` : ''

  // A flat one-colour cut-out reads as a wireframe, not as a thing. Even the
  // instant version gets a body tone, a shadow side and a rim: three values
  // is the minimum that makes a shape look like it has form, and all of it is
  // derived, so it costs nothing.
  const gradId = `${name.toLowerCase()}-form`
  // ...but a shape asked for as a strong colour (a vivid blurred blob, a solid
  // disc) is that colour. At 0.42 falling to 0.16 a hot-pink blob behind a
  // dark page renders as a faint tint (round 2 c3), so the stops go opaque.
  // A block asked for as a colour gradient ("orange-to-brown gradient fill")
  // names its colours: the form fade on top washed round-5 c4's vivid orange
  // photo to peach, so it is strong too unless the words soften it.
  const said = `${action.instruction} ${action.depicts ?? ''}`
  const strong = /\b(vivid|bright|solid|saturated|neon|bold colou?r)\b/i.test(said) ||
    (/\bgradient\b/i.test(said) && !/\b(subtle|soft|faint|translucent|tint(ed)?)\s+(\S+\s+){0,2}?gradient\b|\bfaint\b/i.test(said))
  const [o1, o2, o3] = strong ? ['1', '0.94', '0.86'] : ['0.42', '0.26', '0.16']
  const defs = filled && gradientOk
    ? `      <defs>\n` +
      `        <linearGradient id="${gradId}" x1="0" y1="0" x2="0.35" y2="1">\n` +
      `          <stop offset="0%" stopColor="currentColor" stopOpacity="${o1}" />\n` +
      `          <stop offset="60%" stopColor="currentColor" stopOpacity="${o2}" />\n` +
      `          <stop offset="100%" stopColor="currentColor" stopOpacity="${o3}" />\n` +
      `        </linearGradient>\n` +
      `      </defs>\n`
    : ''

  const body = paths
    .map(({ d, strokeId }) => {
      const closed = isClosed(d)
      const fillAttr = gradientOk ? `url(#${gradId})` : 'currentColor'
      const flatOpacity = gradientOk ? '' : ` fillOpacity="${strong ? '1' : '0.26'}"`
      const attrs = filled && closed
        // filled AND outlined: the drawn edge survives as the form's contour
        ? `fill="${fillAttr}"${flatOpacity} stroke="currentColor" strokeOpacity="0.55" strokeWidth={1.5} strokeLinejoin="round"`
        : 'fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"'
      return `      {/* ${strokeId}: drawn by the user — measured geometry, keep it */}\n` +
        `      <path d="${d}" ${attrs} />`
    })
    .join('\n')

  const note = filled
    ? `  * The paths below are the user's own strokes, fitted. They are the SPEC:\n` +
      `  * keep them. Build the finished thing AROUND them — fills, interior\n` +
      `  * detail, shading — rather than replacing them with your own shapes.`
    : `  * The paths below are the user's own strokes, fitted. They are the SPEC:\n` +
      `  * keep them as they are.`

  const code =
    `/**\n` +
    `  * ${action.depicts ?? 'Sketched form'} — scaffolded from the drawing by sketch2code.\n` +
    `  *\n` +
    `${note}\n` +
    `  */\n` +
    // takes className so whoever mounts it can place it — the instant render
    // positions it at the ink's own offset, and dropping the prop would drop
    // both the position and the draw-on animation
    `export default function ${name}({ className = '' }: { className?: string }) {\n` +
    `  return (\n` +
    `    <svg\n` +
    `      aria-hidden\n` +
    `      viewBox="0 0 ${w} ${h}"\n` +
    `      width={${w}}\n` +
    `      height={${h}}\n` +
    `      className={\`pointer-events-none${cls ? ` ${cls}` : ''} \${className}\`}\n` +
    `    >\n` +
    `${defs}${body}\n` +
    `    </svg>\n` +
    `  )\n` +
    `}\n`

  return { name, rel: `${opts.dir}/${name}.tsx`, code, actionIndex }
}

/**
 * Where a scaffolded component should live: alongside the app's other
 * components when the destination's own file suggests a directory, else a
 * conventional default.
 */
export function scaffoldDir(destSrcLoc: string | null | undefined): string {
  const file = destSrcLoc?.split(':')[0]
  if (!file) return 'src/components'
  const dir = file.slice(0, file.lastIndexOf('/'))
  if (!dir) return 'src/components'
  // App.tsx lives at src/, and its siblings are not where components go
  return /\/components$/.test(dir) ? dir : `${dir}/components`
}

/**
 * Drawn strokes a scaffold handed over that the build no longer draws in place.
 *
 * A kept stroke survives when some <path> in the file still has its exact `d`
 * and no transform of its own. Round 5 c4: codegen added a hard shadow as a
 * translate(24,24) copy of the photo's outline and the outline itself was gone,
 * so a light gradient photo was built as a solid dark brown block, and every
 * check passed (the shadow sat on the drawing). Zero tokens.
 */
export function lostStrokes(scaffoldCode: string, current: string): string[] {
  const kept = [...scaffoldCode.matchAll(/\{\/\* (\S+): drawn by the user[^*]*\*\/\}\s*<path d="([^"]+)"/g)].map((m) => ({ id: m[1]!, d: m[2]! }))
  const paths = [...current.matchAll(/<path\b[^>]*>/g)].map((m) => m[0])
  return kept.filter(({ d }) => !paths.some((el) => el.includes(`d="${d}"`) && !/\btransform\s*=/.test(el))).map((k) => k.id)
}

/**
 * Put lost drawn strokes back, zero tokens: the scaffold's own <path> for each id goes
 * right after its "drawn by the user" comment (so it sits on top of any shadow copy
 * drawn before it), or before the last </svg>. A fill pointing at a gradient the build
 * removed falls back to currentColor. Round 4 c1: the build kept only the shadow copy
 * of the blue photo, the repair turn said it restored it and didn't, so a grey slab
 * was built. Returns the new source, or null when a stroke can't be placed.
 */
export function restoreLostStrokes(scaffoldCode: string, current: string, ids: string[]): string | null {
  let out = current
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = scaffoldCode.match(new RegExp(`\\{/\\* ${esc}: drawn by the user[^*]*\\*/\\}\\s*(<path d="[^"]+"[^>]*/>)`))
    if (!m) return null
    let el = m[1]!
    const ref = el.match(/url\(#([^)]+)\)/)?.[1]
    if (ref && !new RegExp(`id=["']${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(out)) el = el.replace(`url(#${ref})`, 'currentColor')
    const comment = new RegExp(`(\\{/\\* ${esc}: drawn by the user[^*]*\\*/\\})`)
    if (comment.test(out)) out = out.replace(comment, (c) => `${c}\n      ${el}`)
    else {
      const at = out.lastIndexOf('</svg>')
      if (at < 0) return null
      out = `${out.slice(0, at)}      {/* ${id}: drawn by the user, put back */}\n      ${el}\n    ${out.slice(at)}`
    }
  }
  return out
}
