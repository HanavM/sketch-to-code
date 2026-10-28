/**
 * The instant render: a sketch becomes a real component in under a second,
 * before any model is asked anything.
 *
 * The geometry was already being written before codegen (see scaffold.ts) —
 * it was just hidden until the agent finished polishing, which is two minutes
 * of watching a status line. But the slow part is the polish, not the shape.
 * The shape is ours, it is exact, and it costs nothing.
 *
 * So: write the component and mount it the moment the pen rests. The page
 * updates through the dev server's own hot reload, and the agent then refines
 * that file in place rather than creating one. Nothing is thrown away and
 * nothing is faked — what appears is the real artifact, just not yet dressed.
 *
 * The hard part is not speed, it is RESTRAINT. Writing to someone's source
 * without asking is only defensible when the drawing cannot plausibly mean
 * anything else, so this refuses far more often than it fires: a scribble
 * over an element might be a delete, a ring around one might be a note, and
 * neither is a thing to create. When in doubt it declines and the normal
 * interpreted path handles it.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import { bboxOf, bboxUnion, pathLength, resampleBySpacing, toSvgPath, type BBox, type Stroke } from '@s2c/ink'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { importAnchor } from './imports.js'
import type { FidelityControls } from './fidelity.js'
import { buildScaffold, scaffoldDir, type Scaffold } from './scaffold.js'
import { isTextMark } from './textmark.js'
import { isShapeMark } from './shapemark.js'
import type { GroundedAction } from './intent2.js'

export interface InstantPlan {
  scaffold: Scaffold
  /** Where the component gets mounted: a positioned, stamped ancestor. */
  container: { srcLoc: string; rect: BBox }
  /** Offset of the ink inside that container, in CSS px. */
  offset: { left: number; top: number }
}

export type InstantVerdict =
  | { ok: true; plan: InstantPlan }
  | { ok: false; reason: string }

/** Direction reversals per stroke above which it reads as a delete scribble. */
const SCRIBBLE_REVERSALS = 4
/** Ink smaller than this is a gesture or a slip, not a drawing. */
const MIN_SPAN = 24

const area = (b: BBox) => Math.max(0, b.w) * Math.max(0, b.h)
const contains = (outer: BBox, inner: BBox) =>
  outer.x <= inner.x + 1 && outer.y <= inner.y + 1 &&
  outer.x + outer.w >= inner.x + inner.w - 1 && outer.y + outer.h >= inner.y + inner.h - 1

/**
 * Is this drawing unambiguously something to CREATE?
 *
 * Deliberately narrow. Every rejection here costs nothing (the interpreted
 * path still runs); a false accept writes a component the user never asked
 * for, over a gesture that meant something else entirely.
 */
export function instantEligible(strokes: Stroke[], snap: DomSnapshot): InstantVerdict | { ok: 'maybe' } {
  if (strokes.length === 0) return { ok: false, reason: 'nothing drawn' }
  if (snap.truncated) return { ok: false, reason: 'the page snapshot was truncated' }

  let ink: BBox | null = null
  for (const s of strokes) {
    if (s.points.length < 2) continue
    const b = bboxOf(s.points)
    ink = ink ? bboxUnion(ink, b) : b
  }
  if (!ink) return { ok: false, reason: 'nothing drawn' }
  if (Math.max(ink.w, ink.h) < MIN_SPAN) return { ok: false, reason: 'too small to be a drawing' }

  // Is the drawing ON something, or in the space around it?
  //
  // The centre decides. A drawing made in empty space sits inside nothing but
  // big layout containers; ink whose middle lands inside an actual piece of
  // content is a mark ABOUT that content — a strike, a ring, a scribble — and
  // creating a component from it would be inventing an instruction the user
  // never gave. (An earlier version asked whether an element CONTAINED the
  // ink and skipped those, which let a line drawn straight through a card
  // read as a drawing.)
  const viewArea = snap.viewport.w * snap.viewport.h
  const cx = ink.x + ink.w / 2
  const cy = ink.y + ink.h / 2
  let on: DomNode | null = null
  for (const n of snap.nodes) {
    const r = n.rect
    if (area(r) < 16 || area(r) > viewArea * 0.5) continue
    if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) continue
    if (!on || area(r) < area(on.rect)) on = n
  }
  if (on) {
    return { ok: false, reason: `the drawing sits on <${on.tag}> — that could be a mark about it, not a new thing` }
  }

  for (const s of strokes) {
    if (s.points.length < 3) continue
    const rs = resampleBySpacing(s.points, 8)
    if (rs.length === 0) continue
    // a dense back-and-forth is a scratch-out wherever it is
    let turns = 0
    for (let i = 2; i < rs.length; i++) {
      const a1 = Math.atan2(rs[i - 1]!.y - rs[i - 2]!.y, rs[i - 1]!.x - rs[i - 2]!.x)
      const a2 = Math.atan2(rs[i]!.y - rs[i - 1]!.y, rs[i]!.x - rs[i - 1]!.x)
      let d = Math.abs(a2 - a1)
      if (d > Math.PI) d = 2 * Math.PI - d
      if (d > Math.PI / 3) turns++
    }
    const len = pathLength(s.points)
    if (turns >= SCRIBBLE_REVERSALS && len > 0 && (turns / len) * 100 > 2) {
      return { ok: false, reason: 'that looks like a scratch-out, which usually means delete' }
    }
  }
  // a squiggle standing for words would be mounted as a wavy line — the exact
  // page-05 failure, shown instantly. The interpreted path writes real copy.
  if (strokes.some((s) => s.points.length >= 4 && isTextMark(s.points))) {
    return { ok: false, reason: 'part of it reads as a line of text, which needs words, not a drawing' }
  }
  // a box, a straight line or a ring marks where something goes: mounting the
  // ink itself is the pasted-pen-marks failure (shapemark.ts, n7)
  if (strokes.some((s) => s.points.length >= 2 && isShapeMark(s.points))) {
    return { ok: false, reason: 'it reads as a box, line or ring marking where something goes, which gets built, not traced' }
  }
  return { ok: 'maybe' }
}

/**
 * The mount point: the tightest STAMPED and POSITIONED ancestor of the ink.
 *
 * Positioned matters — the component is placed where it was drawn, and an
 * absolutely positioned child resolves against its nearest positioned
 * ancestor. Picking a container that does not establish one would drop the
 * drawing somewhere else entirely, which is worse than being slow.
 */
export function mountPoint(ink: BBox, snap: DomSnapshot): DomNode | null {
  let best: DomNode | null = null
  for (const n of snap.nodes) {
    if (!n.srcLoc) continue
    if (!contains(n.rect, ink)) continue
    if (!['relative', 'absolute', 'fixed', 'sticky'].includes(n.style.position)) continue
    // a click-through decoration layer is a place things are drawn ON TOP of,
    // not a place to put new content — mounting into one buries the component
    // inside someone's background flourish
    if (n.classes.includes('pointer-events-none')) continue
    if (!best || area(n.rect) < area(best.rect)) best = n
  }
  return best
}

/** Everything needed to write the component, or the reason it was declined. */
export function planInstant(
  strokes: Stroke[],
  snap: DomSnapshot,
  fidelity: FidelityControls,
  opts: { taken?: Set<string>; name?: string } = {},
): InstantVerdict {
  const gate = instantEligible(strokes, snap)
  if (gate.ok !== 'maybe') return gate

  let ink: BBox | null = null
  for (const s of strokes) {
    if (s.points.length < 2) continue
    const b = bboxOf(s.points)
    ink = ink ? bboxUnion(ink, b) : b
  }
  if (!ink) return { ok: false, reason: 'nothing drawn' }

  const container = mountPoint(ink, snap)
  if (!container?.srcLoc) {
    return { ok: false, reason: 'no positioned container around the drawing to mount into' }
  }

  const paths: Array<{ strokeId: string; d: string }> = []
  for (const s of strokes) {
    const fit = toSvgPath(s.points, { tolerance: 2, origin: { x: ink.x, y: ink.y } })
    if (fit) paths.push({ strokeId: s.id, d: fit.d })
  }
  if (paths.length === 0) return { ok: false, reason: 'no geometry could be fitted' }

  // A synthetic action: the geometry is real, the naming is not yet — the
  // interpretation that follows is what knows WHAT this is, and the agent
  // renames it then.
  const action: GroundedAction = {
    kind: 'design', targets: [], instruction: 'drawn by the user', needsConfirm: false,
    region: ink, svgPaths: paths, fidelity: 'recognized',
    depicts: opts.name,
  }
  const scaffold = buildScaffold(action, 0, fidelity, {
    dir: scaffoldDir(container.srcLoc),
    taken: opts.taken,
  })
  if (!scaffold) return { ok: false, reason: 'nothing to scaffold at this fidelity' }

  return {
    ok: true,
    plan: {
      scaffold,
      container: { srcLoc: container.srcLoc, rect: container.rect },
      offset: { left: Math.round(ink.x - container.rect.x), top: Math.round(ink.y - container.rect.y) },
    },
  }
}


type TraverseFn = (
  ast: unknown,
  visitor: { JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => void },
) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

export interface InstantResult {
  /** The component that now exists, relative to the app root. */
  file: string
  name: string
  /** The file it was mounted into. */
  mountedIn: string
}

/**
 * Write the component and mount it where it was drawn.
 *
 * Two edits, both deterministic: the component file, and one JSX child plus
 * an import in the container. The placement is absolute at the ink's offset
 * inside that container, which is why planInstant insists the container is
 * positioned.
 */
export function applyInstant(root: string, plan: InstantPlan): InstantResult {
  const { scaffold, container, offset } = plan
  const abs = join(root, scaffold.rel)
  if (existsSync(abs)) throw new Error(`${scaffold.rel} already exists`)

  // the component paints itself on: the drawing appears the way it was made,
  // which is what makes this read as "etched in" rather than "popped in"
  const etched = scaffold.code.replace(
    '    >\n',
    `    >\n` +
    `      <style>{\`@keyframes s2cDraw{to{stroke-dashoffset:0}}\n` +
    `@keyframes s2cFade{from{opacity:0}to{opacity:1}}\n` +
    `.s2c-etch [stroke]{stroke-dasharray:2000;stroke-dashoffset:2000;animation:s2cDraw .7s ease-out forwards}\n` +
    `.s2c-etch [fill]:not([fill="none"]){animation:s2cFade .5s .25s ease-out backwards}\n` +
    // The drawing is not REPLACED by the finished thing — it BECOMES it. The
    // agent edits this same file, so every save hot-reloads a slightly more
    // finished version of elements that are already on screen. Transitioning
    // the paint properties makes colour, shading and opacity tween from what
    // was there to what just arrived, so each refinement reads as the sketch
    // developing rather than as a swap.
    `.s2c-etch *{transition:fill .5s ease,stroke .5s ease,fill-opacity .5s ease,stroke-opacity .5s ease,opacity .5s ease}\n` +
    `@media (prefers-reduced-motion:reduce){.s2c-etch [stroke],.s2c-etch [fill]{animation:none;stroke-dashoffset:0}\n` +
    `.s2c-etch *{transition:none}}\`}</style>\n`,
  )
  // the container gets a parse check below; the component deserves the same,
  // and an unparseable one takes the whole page down with it
  parse(etched, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, etched)

  const m = /^(.+):(\d+):(\d+)$/.exec(container.srcLoc)
  if (!m) throw new Error(`bad container srcLoc "${container.srcLoc}"`)
  const [, rel, lineS, colS] = m
  const file = resolve(root, rel!)
  if (!file.startsWith(resolve(root))) throw new Error('container escapes the app root')
  const code = readFileSync(file, 'utf8')
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })

  let open: t.JSXOpeningElement | null = null
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (loc && loc.start.line === Number(lineS) && loc.start.column + 1 === Number(colS)) open = path.node
    },
  })
  if (!open) throw new Error(`no JSX element at ${container.srcLoc} (stale stamp?)`)
  const end = (open as t.JSXOpeningElement).end
  if (end == null) throw new Error('container has no source range')

  const cls = `absolute left-[${String(offset.left)}px] top-[${String(offset.top)}px] s2c-etch`
  const child = `\n      <${scaffold.name} className="${cls}" />`
  // import specifier from the container's own directory, POSIX-style
  const spec = relative(dirname(file), join(root, scaffold.rel)).replace(/\\/g, '/').replace(/\.tsx?$/, '')
  const importLine = `import ${scaffold.name} from '${spec.startsWith('.') ? spec : `./${spec}`}'\n`
  const importAt = importAnchor(ast, code)

  // child FIRST, import second: imports sit above the JSX, so inserting the
  // later offset first leaves the earlier one valid and no arithmetic is
  // needed to keep them in step
  const withChild = code.slice(0, end) + child + code.slice(end)
  const next = withChild.slice(0, importAt) + importLine + withChild.slice(importAt)

  // never hand back something that will not compile
  parse(next, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  writeFileSync(file, next)
  return { file: scaffold.rel, name: scaffold.name, mountedIn: rel! }
}

/** Undo an instant render: remove the component and its mount. */
export function revertInstant(root: string, cp: { sha: string }, result: InstantResult): void {
  execFileSync('git', ['restore', '--source', cp.sha, '--', result.mountedIn], { cwd: root })
  rmSync(join(root, result.file), { force: true })
}
