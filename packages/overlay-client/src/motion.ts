/**
 * The motion layer (goal loop: "edits feel instant and physical", approach n1).
 *
 * An instant change that lands in one frame still reads as a jump: an erased
 * card vanishes and everything under it snaps up. This makes the same change
 * move like a physical thing:
 *
 *   - erase: the element fades (and settles a touch smaller) where it is, then
 *     leaves the layout while its neighbours GLIDE into the gap (FLIP).
 *   - undo of an erase: the gap opens smoothly and the element fades back in.
 *
 * FLIP = First, Last, Invert, Play: measure every box before the layout
 * change, make the change, measure again, then start each box that moved at
 * its old spot (an inverse transform) and animate it home. The layout itself
 * changes at once — what the code will produce — only the paint glides, so a
 * snapshot taken mid-glide sees the final layout.
 *
 * Nested boxes: a child that moved with its parent must not get its own
 * transform too (it would travel twice). flipDeltas() gives each box only the
 * part of its move its nearest moving ancestor does not already give it.
 *
 * Everything runs on the compositor (opacity, transform) through the Web
 * Animations API, so it holds 60 fps on a busy page. With
 * prefers-reduced-motion the change is applied at once, as before.
 */
import { applyPatch, type Applied, type Box, type Patchable, type QuickReading } from './optimistic.js'

export const FADE_MS = 130
export const GLIDE_MS = 220
/** Standard decelerate: quick off the mark, soft landing. */
export const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

// ---- the pure part -----------------------------------------------------------

export interface Delta<K> { key: K; dx: number; dy: number }

/**
 * Which boxes moved, and by how much each must be put back so it starts where
 * it was: the inverse of its own move minus the inverse its nearest moved
 * ancestor already applies. Boxes that appeared, vanished or moved under half
 * a pixel (relative to that ancestor) are left alone.
 */
export function flipDeltas<K>(
  before: Map<K, Box>,
  after: Map<K, Box>,
  parentOf: (k: K) => K | null,
  min = 0.5,
): Delta<K>[] {
  const own = new Map<K, { dx: number; dy: number }>()
  for (const [k, a] of after) {
    const b = before.get(k)
    if (!b || a.w === 0 || a.h === 0) continue
    own.set(k, { dx: b.x - a.x, dy: b.y - a.y })
  }
  const applied = new Map<K, { dx: number; dy: number }>()
  const inherited = (k: K): { dx: number; dy: number } => {
    let p = parentOf(k)
    while (p !== null) {
      const got = applied.get(p)
      if (got) return got
      p = parentOf(p)
    }
    return { dx: 0, dy: 0 }
  }
  // parents before children: depth order, so `applied` is filled top down
  const depth = (k: K): number => { let d = 0; for (let p = parentOf(k); p !== null; p = parentOf(p)) d++; return d }
  const keys = [...own.keys()].sort((a, b) => depth(a) - depth(b))
  const out: Delta<K>[] = []
  for (const k of keys) {
    const o = own.get(k)!
    const up = inherited(k)
    const dx = o.dx - up.dx, dy = o.dy - up.dy
    if (Math.abs(dx) < min && Math.abs(dy) < min) continue
    // what this box's subtree now carries: its own full move
    applied.set(k, o)
    out.push({ key: k, dx, dy })
  }
  return out
}

// ---- the DOM part ------------------------------------------------------------

/** Honour the person's motion setting. */
export function reducedMotion(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Elements whose box can move when the layout changes, near the viewport. */
function layoutBoxes(root: Element, skip: (el: Element) => boolean, cap = 1500): Map<Element, Box> {
  const out = new Map<Element, Box>()
  const vh = typeof innerHeight === 'number' ? innerHeight : 1000
  const walk = (el: Element) => {
    for (const c of el.children) {
      if (out.size >= cap) return
      if (skip(c)) continue
      const r = c.getBoundingClientRect()
      // far off-screen boxes can glide unseen: don't spend animations on them
      if ((r.width > 0 || r.height > 0) && r.bottom >= -vh && r.top <= 2 * vh) {
        out.set(c, { x: r.left, y: r.top, w: r.width, h: r.height })
      }
      walk(c)
    }
  }
  walk(root)
  return out
}

export interface Flip {
  /** Measure again and glide everything that moved from where it was. */
  play(duration?: number): Animation[]
}

/** Take the "First" measurement; call play() right after the layout change. */
export function flipFrom(root: Element, skip: (el: Element) => boolean): Flip {
  const before = layoutBoxes(root, skip)
  return {
    play(duration = GLIDE_MS) {
      const after = new Map<Element, Box>()
      for (const el of before.keys()) {
        if (!el.isConnected) continue
        const r = el.getBoundingClientRect()
        after.set(el, { x: r.left, y: r.top, w: r.width, h: r.height })
      }
      const anims: Animation[] = []
      const parentOf = (el: Element): Element | null => {
        for (let p = el.parentElement; p; p = p.parentElement) if (before.has(p)) return p
        return null
      }
      for (const d of flipDeltas(before, after, parentOf)) {
        const el = d.key as HTMLElement
        if (typeof el.animate !== 'function') continue
        const cs = getComputedStyle(el)
        if (cs.display === 'inline' || cs.display === 'contents') continue
        const base = cs.transform === 'none' ? '' : cs.transform
        anims.push(el.animate(
          [{ transform: `translate(${d.dx}px, ${d.dy}px) ${base}`.trim() }, { transform: base || 'none' }],
          { duration, easing: EASE },
        ))
      }
      return anims
    },
  }
}

export interface Moving extends Applied {
  /** Put the element back with the same motion, reversed. */
  undoSmooth(): void
  /**
   * Take the change off the page for a synchronous read (the run's snapshot)
   * and return a function that puts it back exactly mid-motion. Nothing paints
   * in between, so nothing visibly stops.
   */
  suspend(): () => void
  /** Resolves when the change has finished moving (instant ones at once). */
  settled: Promise<void>
}

export interface MotionOpts {
  /** The overlay's own nodes: never measured, never animated. */
  skip: (el: Element) => boolean
  root?: Element
  /** Force instant (tests, reduced motion). */
  instant?: boolean
}

/** Cancel animations, keeping what is needed to restart them at the same moment. */
function freeze(anims: Animation[]): () => Animation[] {
  const kept = anims.map((a) => {
    const fx = a.effect as KeyframeEffect | null
    return fx?.target ? { target: fx.target, kf: fx.getKeyframes(), timing: fx.getTiming(), t: a.currentTime } : null
  })
  for (const a of anims) a.cancel()
  return () => kept.flatMap((k) => {
    if (!k || !k.target.isConnected) return []
    const a = k.target.animate(k.kf, k.timing as KeyframeAnimationOptions)
    if (k.t !== null) a.currentTime = k.t
    return [a]
  })
}

/**
 * applyPatch, with motion. A hide fades the element where it stands, then
 * takes it out of the layout while the neighbours glide into the gap. A
 * recolour is applied at once (the colour change itself is the motion).
 *
 * `undo()` stays instant and exact; `undoSmooth()` is the visible reverse;
 * `suspend()` lifts it for a synchronous read of the page as the code has it.
 */
export function applyMoving(r: QuickReading<Patchable>, opts: MotionOpts): Moving {
  const instant = opts.instant ?? reducedMotion()
  const el = r.target.ref as unknown as HTMLElement
  if (r.kind !== 'hide' || instant || typeof el.animate !== 'function') {
    let a = applyPatch(r)
    return {
      kind: a.kind, srcLoc: a.srcLoc, settled: Promise.resolve(),
      undo: () => a.undo(), undoSmooth: () => a.undo(),
      suspend() { a.undo(); return () => { a = applyPatch(r) } },
    }
  }
  const root = opts.root ?? el.ownerDocument.body
  const skipFor = (n: Element) => opts.skip(n) || n === el || el.contains(n)
  const hadMark = el.getAttribute(PENDING)
  let patched: Applied | null = null
  let fade: Animation | null = null
  let glides: Animation[] = []
  let undone = false
  let settle: () => void = () => undefined
  const settled = new Promise<void>((res) => { settle = res })
  const unmark = () => { if (hadMark === null) el.removeAttribute(PENDING); else el.setAttribute(PENDING, hadMark) }

  const collapse = () => {
    if (undone || patched) return
    const flip = flipFrom(root, skipFor)
    unmark() // applyPatch records the mark it finds, and puts that back on undo
    patched = applyPatch(r)
    fade?.cancel()
    fade = null
    glides = flip.play()
    void Promise.all(glides.map((g) => g.finished.catch(() => undefined))).then(() => settle())
  }
  const startFade = (a: Animation) => {
    fade = a
    a.finished.then(() => { if (fade === a) collapse() }, () => undefined)
  }
  // marked pending at once: the change is on the page from the first frame
  el.setAttribute(PENDING, 'hide')
  const o = getComputedStyle(el).opacity
  const base = baseTransform(el)
  startFade(el.animate(
    // the first painted frame already shows it going (a dip, not a held
    // opacity: 1 frame), then it eases the rest of the way out
    [{ opacity: String(Number(o) * 0.7), transform: `${base} scale(0.99)`.trim() }, { opacity: '0', transform: `${base} scale(0.97)`.trim() }],
    { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' },
  ))

  const undo = () => {
    if (undone) return
    undone = true
    fade?.cancel()
    fade = null
    for (const g of glides) g.cancel()
    glides = []
    if (patched) patched.undo()
    else unmark()
    settle()
  }
  return {
    kind: r.kind,
    srcLoc: r.target.srcLoc,
    undo,
    settled,
    suspend() {
      if (undone) return () => undefined
      const fading = fade
      const thawFade = fading ? freeze([fading]) : null
      fade = null
      const thawGlides = freeze(glides)
      glides = []
      if (patched) patched.undo()
      else unmark()
      return () => {
        if (undone) return
        if (patched) patched = applyPatch(r)
        else el.setAttribute(PENDING, 'hide')
        glides = thawGlides()
        if (thawFade) { const [a] = thawFade(); if (a) startFade(a); else collapse() }
      }
    },
    undoSmooth() {
      if (undone) return
      if (!patched || !el.isConnected) { undo(); return }
      const flip = flipFrom(root, skipFor)
      undo()
      flip.play()
      const ob = baseTransform(el)
      el.animate(
        [{ opacity: '0', transform: `${ob} scale(0.97)`.trim() }, { opacity: getComputedStyle(el).opacity, transform: ob || 'none' }],
        { duration: GLIDE_MS, easing: EASE, delay: GLIDE_MS * 0.4, fill: 'backwards' },
      )
    },
  }
}

const PENDING = 'data-s2c-pending'

function baseTransform(el: HTMLElement): string {
  const t = getComputedStyle(el).transform
  return t === 'none' ? '' : t
}
