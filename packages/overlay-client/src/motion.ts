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

/** The most of its curve a steadied animation may move on in one painted frame. */
export const STEP_CAP_MS = 25
const FIRST_STEP_MS = 1000 / 60

/**
 * n18: layout animations (width, height, margins: what a resize or its undo
 * eases) run on the main thread, and WAAPI times them by the clock, not by the
 * frames painted. When the browser misses frames (a busy machine: the dev
 * server writing the code on the same cores), the next frame catches up the
 * whole stall at once and the box leaps 60% of its way. A steadied animation
 * is paused and paced by painted frames instead: each frame moves it on by the
 * time since the last frame, but never more than STEP_CAP_MS of its curve. It
 * takes a little longer on a stalling machine, and never jumps. (Compositor
 * animations, transform and opacity, keep running through a main-thread
 * stall, so they are left on the clock.)
 */
interface Steadied { t: number; relocate?: () => Element | null }
const steadied = new Map<Animation, Steadied>()
let steadyRaf = 0
let lastFrame = 0
let remountWatch: MutationObserver | null = null
/**
 * Pace `a` by painted frames. `relocate` finds its element again when a hot
 * reload remounts it mid-way (the code's own node replaces the one being
 * eased): the ease carries on, on the new node, from where it was, in the
 * reload's own task, so no frame shows the end state early.
 */
export function steady(a: Animation | null, relocate?: () => Element | null): Animation | null {
  if (!a || typeof requestAnimationFrame !== 'function') return a
  // the first painted frame already shows it on its way (one frame in)
  a.pause()
  a.currentTime = FIRST_STEP_MS
  steadied.set(a, { t: FIRST_STEP_MS, relocate })
  if (relocate && !remountWatch && typeof MutationObserver === 'function' && typeof document !== 'undefined') {
    remountWatch = new MutationObserver(carryOver)
    remountWatch.observe(document.body, { childList: true, subtree: true })
  }
  if (!steadyRaf) {
    lastFrame = performance.now()
    steadyRaf = requestAnimationFrame(steadyTick)
  }
  return a
}
/** An eased element was replaced: start the same ease on its replacement, at the same point. */
function carryOver(): void {
  for (const [a, s] of [...steadied]) {
    const fx = a.effect as KeyframeEffect | null
    const old = fx?.target
    if (!s.relocate || !old || old.isConnected) continue
    const now = s.relocate()
    steadied.delete(a)
    if (!now || now === old || typeof (now as HTMLElement).animate !== 'function') continue
    const b = (now as HTMLElement).animate(fx.getKeyframes(), fx.getTiming() as KeyframeAnimationOptions)
    b.pause()
    b.currentTime = s.t
    steadied.set(b, s)
    remounts++
  }
}
/** How many eases moved to a remounted node (tests read it as __s2cRemounts). */
let remounts = 0
export const remountCount = () => remounts
/** How much of its curve a steadied animation moves on in a frame `gap` ms after the last. */
export function frameStep(gap: number, cap = STEP_CAP_MS): number {
  return Math.max(0, Math.min(gap, cap))
}
function steadyTick(now: number): void {
  const step = frameStep(now - lastFrame)
  lastFrame = now
  carryOver()
  for (const [a, s] of steadied) {
    // cancelled, finished or taken over (played again) by someone else
    if (a.playState !== 'paused' || Math.abs(Number(a.currentTime) - s.t) > 0.5) { steadied.delete(a); continue }
    const end = Number(a.effect?.getComputedTiming().endTime ?? 0)
    const t = s.t + step
    if (t >= end) { steadied.delete(a); a.finish(); continue }
    a.currentTime = t
    s.t = t
  }
  if (steadied.size) steadyRaf = requestAnimationFrame(steadyTick)
  else { steadyRaf = 0; remountWatch?.disconnect(); remountWatch = null }
}

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
  play(duration?: number, exclude?: (el: Element) => boolean): Animation[]
  /**
   * n11: a hot reload of an unkeyed list adds by SHIFTING: React rewrites each
   * later sibling's words in place and appends one node at the end, so the
   * node that is new is not the item that is new. Glide the siblings of
   * `fresh` by what they SAY (each from where those words stood at lift) and
   * return the one whose words are new, to grow in. Null when nothing shifted.
   */
  playShifted(fresh: HTMLElement[], duration?: number): { anims: Animation[]; grow: HTMLElement[] } | null
}

/** Take the "First" measurement; call play() right after the layout change. */
export function flipFrom(root: Element, skip: (el: Element) => boolean): Flip {
  const before = layoutBoxes(root, skip)
  // page coordinates: a scroll between the two measurements is not a move
  const sx0 = typeof scrollX === 'number' ? scrollX : 0
  const sy0 = typeof scrollY === 'number' ? scrollY : 0
  // words at lift, for the small leaves an unkeyed reload may rewrite in place
  const said = new Map<Element, string>()
  const parentAt = new Map<Element, Element | null>()
  for (const el of before.keys()) {
    if (el.childElementCount > 2) continue
    said.set(el, textKey(el))
    parentAt.set(el, el.parentElement)
  }
  const flip: Flip = {
    play(duration = GLIDE_MS, exclude) {
      const after = new Map<Element, Box>()
      const ddx = (typeof scrollX === 'number' ? scrollX : 0) - sx0
      const ddy = (typeof scrollY === 'number' ? scrollY : 0) - sy0
      for (const el of before.keys()) {
        if (!el.isConnected) continue
        if (exclude?.(el)) continue
        const r = el.getBoundingClientRect()
        after.set(el, { x: r.left + ddx, y: r.top + ddy, w: r.width, h: r.height })
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
    playShifted(fresh, duration = GLIDE_MS) {
      const box = fresh[0]?.parentElement
      if (!box || fresh.some((f) => f.parentElement !== box)) return null
      const kids = [...box.children]
      // shifted: an old node now says something else, or a node the row had
      // at lift was swapped for a new one (a remount when a type changed)
      const shifted = kids.some((k) => !fresh.includes(k as HTMLElement) &&
        (said.has(k) ? said.get(k) !== textKey(k) : !before.has(k)))
      if (!shifted) return null
      const ddx = (typeof scrollX === 'number' ? scrollX : 0) - sx0
      const ddy = (typeof scrollY === 'number' ? scrollY : 0) - sy0
      // where each thing the row said stood at lift
      const pool = new Map<string, Box[]>()
      // (by the row as it stood at lift: a remount took some of its nodes away)
      for (const [k, w] of said) {
        const b = before.get(k)
        if (parentAt.get(k) !== box || !b) continue
        pool.set(w, [...(pool.get(w) ?? []), b])
      }
      const anims = flip.play(duration, (el) => box.contains(el) && el !== box)
      const grow: HTMLElement[] = []
      for (const k of kids) {
        const el = k as HTMLElement
        const from = pool.get(textKey(el))?.shift()
        if (!from) { grow.push(el); continue }
        if (typeof el.animate !== 'function') continue
        const r = el.getBoundingClientRect()
        const dx = from.x - (r.left + ddx)
        const dy = from.y - (r.top + ddy)
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
        const cs = getComputedStyle(el)
        if (cs.display === 'inline' || cs.display === 'contents') continue
        const base = cs.transform === 'none' ? '' : cs.transform
        anims.push(el.animate(
          [{ transform: `translate(${dx}px, ${dy}px) ${base}`.trim() }, { transform: base || 'none' }],
          { duration, easing: EASE },
        ))
      }
      return { anims, grow }
    },
  }
  return flip
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
  if (r.kind === 'recolour' && !instant && canMix()) return recolourMoving(r, el)
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

// ---- n7: recolour eases, additions grow in ------------------------------------

export const RECOLOUR_MS = 160
export const GROW_MS = 200
/** How far toward the new colour the very first frame already is. */
export const RECOLOUR_FIRST = 0.55

/** p in [0,1] of the way from `from` to `to`, as one CSS colour. */
export function mixColour(from: string, to: string, p: number): string {
  if (p >= 1) return to
  if (p <= 0) return from
  return `color-mix(in srgb, ${to} ${(p * 100).toFixed(1)}%, ${from})`
}

/** Ease-out progress of a colour change at `t` ms: already RECOLOUR_FIRST at 0. */
export function recolourProgress(t: number, duration = RECOLOUR_MS): number {
  if (t >= duration) return 1
  const u = Math.max(0, t) / duration
  return RECOLOUR_FIRST + (1 - RECOLOUR_FIRST) * (1 - (1 - u) ** 3)
}

function canMix(): boolean {
  try { return typeof CSS !== 'undefined' && CSS.supports('color', 'color-mix(in srgb, red 50%, blue)') } catch { return false }
}

/**
 * A recolour that cross-fades instead of popping. The patch goes on at once
 * (inline !important, pending mark) at a colour already most of the way
 * there, then eases to the exact colour over a few frames. Animations can't
 * beat an !important inline value, so the frames write the inline value
 * themselves: one element, one property, cheap.
 */
function recolourMoving(r: Extract<QuickReading<Patchable>, { kind: 'recolour' }>, el: HTMLElement): Moving {
  const prop = r.prop
  const from = getComputedStyle(el).getPropertyValue(prop)
  let a: Applied | null = applyPatch(r)
  let raf = 0
  let t0 = performance.now()
  let undone = false
  let settle: () => void = () => undefined
  const settled = new Promise<void>((res) => { settle = res })
  const paint = (p: number) => { el.style.setProperty(prop, mixColour(from, r.color, p), 'important') }
  const tick = () => {
    raf = 0
    if (undone || !a) return
    const p = recolourProgress(performance.now() - t0)
    paint(p)
    if (p < 1) raf = requestAnimationFrame(tick)
    else settle()
  }
  paint(RECOLOUR_FIRST)
  raf = requestAnimationFrame(tick)
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }
  const undo = () => {
    if (undone) return
    undone = true
    stop()
    a?.undo()
    a = null
    settle()
  }
  return {
    kind: r.kind, srcLoc: r.target.srcLoc, undo, settled,
    suspend() {
      if (undone || !a) return () => undefined
      const elapsed = performance.now() - t0
      stop()
      a.undo()
      a = null
      return () => {
        if (undone) return
        a = applyPatch(r)
        t0 = performance.now() - elapsed
        paint(recolourProgress(elapsed))
        if (elapsed < RECOLOUR_MS) raf = requestAnimationFrame(tick)
      }
    },
    undoSmooth() {
      if (undone) return
      if (!a || !el.isConnected) { undo(); return }
      stop()
      const shown = getComputedStyle(el).getPropertyValue(prop)
      const patched = a
      // what the page has without the patch: the old colour, or the code's
      // new one if it landed (then this is a no-op ease from X to X)
      patched.undo()
      const target = getComputedStyle(el).getPropertyValue(prop)
      if (target === shown) { a = null; undone = true; settle(); return }
      a = applyPatch(r)
      const back = performance.now()
      const step = () => {
        raf = 0
        if (undone || !a) return
        const p = recolourProgress(performance.now() - back)
        if (p >= 1) { undo(); return }
        el.style.setProperty(prop, mixColour(shown, target, p), 'important')
        raf = requestAnimationFrame(step)
      }
      el.style.setProperty(prop, mixColour(shown, target, RECOLOUR_FIRST), 'important')
      raf = requestAnimationFrame(step)
    },
  }
}

const textKey = (el: Element) => `${el.tagName}|${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`

/**
 * Elements a burst of DOM changes (a hot reload) really ADDED: outermost
 * added elements that are on the page, have a box, and are not one that was
 * removed in the same burst (a remount puts the same element back: that is
 * not new and must not grow in).
 */
export function freshAdded(records: MutationRecord[], skip: (el: Element) => boolean): HTMLElement[] {
  const added = new Set<HTMLElement>()
  const gone = new Map<string, number>()
  for (const rec of records) {
    for (const n of rec.removedNodes) if (n.nodeType === 1) { const k = textKey(n as Element); gone.set(k, (gone.get(k) ?? 0) + 1) }
    for (const n of rec.addedNodes) if (n.nodeType === 1) added.add(n as HTMLElement)
  }
  const out: HTMLElement[] = []
  for (const el of added) {
    if (!el.isConnected || skip(el)) continue
    let nested = false
    for (let p = el.parentElement; p; p = p.parentElement) if (added.has(p as HTMLElement)) { nested = true; break }
    if (nested) continue
    const k = textKey(el)
    const g = gone.get(k) ?? 0
    if (g > 0) { gone.set(k, g - 1); continue }
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    out.push(el)
  }
  return out
}

/** A new element grows into place: the first frame already shows it arriving. */
export function growIn(el: HTMLElement, duration = GROW_MS): Animation | null {
  if (typeof el.animate !== 'function' || reducedMotion()) return null
  const base = baseTransform(el)
  const o = getComputedStyle(el).opacity
  return el.animate(
    [
      { opacity: String(Number(o) * 0.25), transform: `${base} scale(0.94)`.trim(), transformOrigin: 'center top' },
      { opacity: o, transform: base || 'none', transformOrigin: 'center top' },
    ],
    { duration, easing: EASE },
  )
}
