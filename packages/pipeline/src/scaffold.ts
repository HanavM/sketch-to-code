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
  const paths = action.svgPaths ?? []
  const region: BBox | undefined = action.region
  if (paths.length === 0 || !region || region.w < 1 || region.h < 1) return null
  if (rungFor(fidelity.resemblance) === 'reinterpret') return null

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
  const filled = fidelity.fill !== 'outline'
  // a colour the user actually drew in beats currentColor; a token the app
  // already uses beats a literal
  const token = action.color?.nearest?.token
  const literal = action.color?.drawn
  const cls = token && /^text-|^fill-/.test(token) ? token : token ? `text-[${literal ?? 'currentColor'}]` : ''

  const body = paths
    .map(({ d, strokeId }) => {
      const closed = isClosed(d)
      const attrs = filled && closed
        ? 'fill="currentColor"'
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
    `${body}\n` +
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
