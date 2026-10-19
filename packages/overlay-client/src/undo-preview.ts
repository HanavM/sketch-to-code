/**
 * Instant, smooth undo of direct edits (goal loop n9).
 *
 * Ctrl+Z used to ask the server to revert and then wait for the hot reload:
 * a few hundred ms of nothing, then the page jumped. Now every direct edit
 * that landed leaves a visual inverse here, and undo plays it the moment the
 * key goes down: the page glides back to how it was, and the server's revert
 * lands behind it with nothing left to change.
 *
 *   - class edits (resize, move, spacing): every instance of the edited source
 *     element gets its old className back; the boxes it pushes ease from where
 *     they were (settleBoxes). The revert's hot reload writes the same class,
 *     so React changes nothing on screen.
 *   - reorder: the moved child is shown back in its old slot with inline
 *     `order` (LiveReorder, siblings glide), held until the code's children
 *     are back in that order, then the orders come off in the same task.
 *
 * A preview that turns out wrong (the server undid something else, or
 * refused) is taken back smoothly.
 */
import { EASE, FADE_MS, flipFrom, GLIDE_MS, reducedMotion, steady } from './motion.js'
import { contentKeys, LiveReorder } from './live-reorder.js'

export type VisualEdit =
  | { kind: 'class'; srcLoc: string; before: string[] }
  | { kind: 'order'; parent: HTMLElement; key: string; from: number; to: number }
  | { kind: 'restore'; srcLoc: string; like: string; count: number; ghost: HTMLElement; parent: ParentRef; index: number }
  | { kind: 'unadd'; el: HTMLElement; like: string; count: number }

/** Where an erased element lived: its parent node, and how to find that parent again after a remount. */
export interface ParentRef { node: HTMLElement; srcLoc: string | null; instance: number }

const GHOST = 'data-s2c-ghost'
const isGhost = (e: Element) => e.hasAttribute(GHOST)
/** Element children the code put there (an undo ghost is not one). */
const realKids = (p: Element) => [...p.children].filter((k) => !isGhost(k) && k.id !== 's2c-overlay-host')
/** What an element looks like, for "is it back?" (stamps are line numbers: a sibling can inherit one) */
const lookOf = (el: Element) => `${el.tagName}|${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)}`
const countLike = (p: Element, like: string) => realKids(p).filter((k) => lookOf(k) === like).length

function findParent(p: ParentRef): HTMLElement | null {
  if (p.node.isConnected) return p.node
  if (!p.srcLoc) return null
  return instancesOf(p.srcLoc)[p.instance] ?? null
}

/**
 * n12: what a direct erase is about to remove, taken just before it commits.
 * `el` must show the page as the code has it (the caller lifts the instant
 * fade first): the copy kept here is what undo fades back in, so it must be
 * the element as it was, not as it was going.
 */
export function captureErase(srcLoc: string, el: HTMLElement): (() => VisualEdit | null) | null {
  const parentNode = el.parentElement
  if (!parentNode) return null
  const like = lookOf(el)
  const count = countLike(parentNode, like)
  const index = realKids(parentNode).indexOf(el)
  if (index < 0) return null
  const pLoc = parentNode.dataset.s2c ?? null
  const parent: ParentRef = { node: parentNode, srcLoc: pLoc, instance: pLoc ? instancesOf(pLoc).indexOf(parentNode) : 0 }
  const ghost = el.cloneNode(true) as HTMLElement
  ghost.removeAttribute('data-s2c-pending')
  // a ghost is not part of the page the code renders: nothing that reads
  // stamps (snapshots, picks, selection) may find it
  for (const n of [ghost, ...ghost.querySelectorAll<HTMLElement>('[data-s2c]')]) n.removeAttribute('data-s2c')
  ghost.setAttribute(GHOST, srcLoc)
  return () => {
    const p = findParent(parent)
    return p && countLike(p, like) === count - 1 ? { kind: 'restore', srcLoc, like, count, ghost, parent, index } : null
  }
}

/**
 * n15: a direct addition that landed. `get` names the element the code's
 * addition grew in as (null until the hot reload brought it); undo takes that
 * element back off the page.
 */
export function captureInsert(get: () => HTMLElement | null): () => VisualEdit | null {
  return () => {
    const el = get()
    const p = el?.parentElement
    if (!el || !p || !el.isConnected) return null
    const like = lookOf(el)
    return { kind: 'unadd', el, like, count: countLike(p, like) }
  }
}

/**
 * What a direct edit is about to change, taken just before it commits; the
 * returned function names the edit's inverse when Ctrl+Z asks for it.
 *
 * Class edits are found again by source location and instance index, not by
 * node: a later reorder can remount the node, and undo runs newest first, so
 * by the time this edit is undone the code (and its line numbers) is exactly
 * what it was right after this edit landed.
 */
export function captureBefore(body: Record<string, unknown>, el: HTMLElement): (() => VisualEdit | null) | null {
  if (body.prop === 'reorder') {
    const parent = el.parentElement
    const from = Number(body.from), to = Number(body.to)
    if (!parent || !Number.isInteger(from) || !Number.isInteger(to)) return null
    const kids = [...parent.children]
    const key = contentKeys(kids)[kids.indexOf(el)]
    if (!key) return null
    return () => (parent.isConnected ? { kind: 'order', parent, key, from, to } : null)
  }
  const srcLoc = typeof body.srcLoc === 'string' ? body.srcLoc : el.dataset.s2c
  if (!srcLoc) return null
  const els = instancesOf(srcLoc)
  if (!els.includes(el)) return null
  const before = els.map((e) => e.className)
  return () => {
    const now = instancesOf(srcLoc)
    return now.length === before.length && now.some((e, i) => e.className !== before[i]) ? { kind: 'class', srcLoc, before } : null
  }
}

function instancesOf(srcLoc: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-s2c="${CSS.escape(srcLoc)}"]`)]
}

/** Overlay nodes and ghosts are never measured or glided. */
const motionSkip = (g: Element) => (e: Element) => e.id === 's2c-overlay-host' || e === g || g.contains(e)

/**
 * n12: undo of an erase. The element fades back in where it was while its
 * neighbours glide apart to make room (FLIP), as a ghost copy; when the
 * revert's hot reload puts the real element back, the ghost comes off in that
 * same task, so nothing flashes or doubles.
 */
function playRestore(e: Extract<VisualEdit, { kind: 'restore' }>, holdMs: number): Played | null {
  const parent = findParent(e.parent)
  if (!parent) return null
  const ghost = e.ghost
  const skip = motionSkip(ghost)
  const flip = flipFrom(document.body, skip)
  const before = realKids(parent)[e.index] ?? null
  parent.insertBefore(ghost, before)
  const smooth = !reducedMotion() && typeof ghost.animate === 'function'
  if (smooth) {
    flip.play()
    const o = getComputedStyle(ghost).opacity
    // the first painted frame already shows it coming back
    ghost.animate(
      [{ opacity: String(Number(o) * 0.3), transform: 'scale(0.97)' }, { opacity: o, transform: 'none' }],
      { duration: GLIDE_MS, easing: EASE },
    )
  }
  let done = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const back = () => parent.isConnected ? countLike(parent, e.like) >= e.count : true
  const stop = () => { done = true; mo.disconnect(); if (timer) clearTimeout(timer) }
  // exact, in the hot reload's own task: the real element takes the ghost's place
  const land = () => { if (done) return; stop(); ghost.remove() }
  const mo = new MutationObserver(() => { if (back()) land() })
  mo.observe(document.body, { childList: true, subtree: true })
  return {
    confirm() {
      if (done) return
      if (back()) { land(); return }
      // the code says it is back; if no reload shows it, stop pretending
      timer = setTimeout(() => { if (!done) { stop(); fadeAway(ghost) } }, holdMs)
    },
    revert() {
      if (done) return
      stop()
      fadeAway(ghost)
    },
  }
}

/** Take a ghost off smoothly: it fades, then its neighbours glide into the gap. */
function fadeAway(ghost: HTMLElement): void {
  if (!ghost.isConnected) return
  if (reducedMotion() || typeof ghost.animate !== 'function') { ghost.remove(); return }
  const a = ghost.animate([{ opacity: getComputedStyle(ghost).opacity }, { opacity: '0' }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' })
  a.finished.then(() => {
    const flip = flipFrom(document.body, motionSkip(ghost))
    ghost.remove()
    flip.play()
  }, () => ghost.remove())
}

/** Layout and colour a class swap can change, eased so the page rides along frame by frame. */
const EASED = [
  'width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap',
  'translate', 'transform', 'color', 'backgroundColor', 'opacity',
] as const
type Eased = (typeof EASED)[number]
const styleOf = (el: HTMLElement) => {
  const cs = getComputedStyle(el)
  const out: Partial<Record<Eased, string>> = {}
  for (const p of EASED) out[p] = cs[p] as string
  return out
}

/** Swap classes, easing every changed property from its old value (WAAPI, no layout jumps). */
function easeClasses(els: HTMLElement[], to: string[], srcLoc?: string): void {
  const was = els.map(styleOf)
  els.forEach((e, i) => { if (to[i] !== undefined) e.className = to[i]! })
  if (reducedMotion()) return
  // every end value is read before any ease starts: an ease on one box holds
  // the row it sits in, and a sibling read after that would aim short (n18)
  const ends = els.map(styleOf)
  els.forEach((e, i) => {
    if (typeof e.animate !== 'function') return
    const now = ends[i]!
    const k0: Keyframe = {}, k1: Keyframe = {}
    let any = false
    for (const p of EASED) {
      if (was[i]![p] === now[p]) continue
      // auto sizes resolve to px in computed style, so both ends are animatable
      k0[p] = was[i]![p]!; k1[p] = now[p]!; any = true
    }
    // width/height/margins ease on the main thread: paced by frames, so a stall never leaps (n18)
    // and a reload that remounts it mid-way carries the ease over to its new node
    if (any) steady(e.animate([k0, k1], { duration: GLIDE_MS, easing: EASE }), srcLoc ? () => instancesOf(srcLoc)[i] ?? null : undefined)
  })
}

export interface Played {
  /** the server undid exactly this: keep what is shown (a reorder's hold comes off when its code lands) */
  confirm(): void
  /** the server did something else or nothing: put the page back, smoothly */
  revert(): void
}

/** Play an edit's inverse right now. Null when its elements are gone. */
export function playInverse(e: VisualEdit, holdMs = 4000): Played | null {
  if (e.kind === 'restore') return playRestore(e, holdMs)
  if (e.kind === 'unadd') return playUnadd(e, holdMs)
  if (e.kind === 'class') {
    const els = instancesOf(e.srcLoc)
    if (els.length !== e.before.length) return null
    const after = els.map((x) => x.className)
    easeClasses(els, e.before, e.srcLoc)
    return {
      confirm() {},
      revert: () => { const live = els.filter((x) => x.isConnected); if (live.length === els.length) easeClasses(els, after, e.srcLoc) },
    }
  }
  const { parent, key, from } = e
  if (!parent.isConnected) return null
  const kids = [...parent.children] as HTMLElement[]
  const at = contentKeys(kids).indexOf(key)
  const child = kids[at]
  if (!child || at === from) return null
  const live = new LiveReorder(child)
  const was = child.getBoundingClientRect()
  live.set(from)
  // the moved child glides too (in a drag it is under the pointer; here it is not)
  const now = child.getBoundingClientRect()
  const dx = was.left - now.left, dy = was.top - now.top
  if ((Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) && typeof child.animate === 'function' && !reducedMotion()) {
    child.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: EASE, composite: 'add' })
  }
  const seen = live.seen()
  let done = false
  let mo: MutationObserver | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const stop = () => { done = true; mo?.disconnect(); if (timer) clearTimeout(timer) }
  const backInOrder = () => {
    const now = [...parent.children]
    return contentKeys(now).indexOf(key) === from
  }
  const finish = () => { if (done) return; stop(); live.settle(seen) }
  // watching from now: the revert's hot reload can beat the server's reply
  mo = new MutationObserver(() => { if (backInOrder()) finish() })
  mo.observe(parent, { childList: true, subtree: true, characterData: true })
  return {
    confirm() {
      if (done) return
      if (backInOrder()) { finish(); return }
      timer = setTimeout(finish, holdMs)
    },
    revert() {
      if (done) return
      stop()
      live.restore()
    },
  }
}

const UNADD = 'data-s2c-unadd'

/**
 * n15: undo of an addition. A copy of the added element takes its place and
 * shrinks out while the real one leaves the layout at once (hidden); when the
 * copy is gone the row glides shut. The revert's hot reload then takes the
 * real one out of the code; in an unkeyed row React does that by rewriting
 * the later items' words in place and dropping the last node, so in that same
 * task the hide comes off whichever node it is now on, and any node that now
 * says something else glides from where those words were last painted.
 */
function playUnadd(e: Extract<VisualEdit, { kind: 'unadd' }>, holdMs: number): Played | null {
  const el = e.el
  const parent = el.parentElement
  if (!parent || !el.isConnected || lookOf(el) !== e.like) return null
  const smooth = !reducedMotion() && typeof el.animate === 'function'
  const ghost = el.cloneNode(true) as HTMLElement
  for (const n of [ghost, ...ghost.querySelectorAll<HTMLElement>('[data-s2c]')]) n.removeAttribute('data-s2c')
  ghost.removeAttribute('data-s2c-pending')
  ghost.setAttribute(GHOST, 'unadd')
  ghost.style.pointerEvents = 'none'
  for (const a of el.getAnimations()) a.cancel()
  const wasDisplay = el.style.getPropertyValue('display')
  const wasPrio = el.style.getPropertyPriority('display')
  parent.insertBefore(ghost, el)
  el.style.setProperty('display', 'none', 'important')
  el.setAttribute(UNADD, '')
  // where each thing the row says was last painted, for a reload that shifts words
  const painted = new Map<string, DOMRect[]>()
  let raf = 0
  const watchPaint = () => {
    painted.clear()
    for (const k of realKids(parent)) {
      if (k.hasAttribute(UNADD)) continue
      const key = lookOf(k)
      painted.set(key, [...(painted.get(key) ?? []), k.getBoundingClientRect()])
    }
    raf = requestAnimationFrame(watchPaint)
  }
  watchPaint()
  const said = new Map<Element, string>(realKids(parent).map((k) => [k, lookOf(k)]))
  let ghostGone = false
  const dropGhost = () => {
    if (ghostGone) return
    ghostGone = true
    if (!ghost.isConnected) return
    const flip = flipFrom(document.body, motionSkip(ghost))
    ghost.remove()
    if (smooth) flip.play()
  }
  if (smooth) {
    const o = getComputedStyle(ghost).opacity
    // the first painted frame already shows it going
    ghost.animate(
      [{ opacity: String(Number(o) * 0.7), transform: 'scale(0.99)' }, { opacity: '0', transform: 'scale(0.9)' }],
      { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' },
    ).finished.then(dropGhost, () => undefined)
  } else dropGhost()

  let done = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const unhide = () => {
    for (const n of document.querySelectorAll<HTMLElement>(`[${UNADD}]`)) {
      n.removeAttribute(UNADD)
      if (n === el && wasDisplay) n.style.setProperty('display', wasDisplay, wasPrio)
      else n.style.removeProperty('display')
    }
  }
  const back = () => !parent.isConnected || countLike(parent, e.like) < e.count
  const stop = () => { done = true; mo.disconnect(); cancelAnimationFrame(raf); if (timer) clearTimeout(timer) }
  const land = () => {
    if (done) return
    stop()
    unhide()
    if (!smooth || !parent.isConnected) return
    // nodes the reload rewrote in place glide from where their words were painted
    for (const k of realKids(parent) as HTMLElement[]) {
      const now = lookOf(k)
      if (said.get(k) === now) continue
      const from = painted.get(now)?.shift()
      if (!from) continue
      for (const a of k.getAnimations()) a.cancel()
      const r = k.getBoundingClientRect()
      const dx = from.left - r.left, dy = from.top - r.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
      k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: GLIDE_MS * 0.7, easing: EASE })
    }
  }
  const mo = new MutationObserver(() => { if (back()) land() })
  mo.observe(document.body, { childList: true, subtree: true, characterData: true })
  const showAgain = () => {
    stop()
    const flip = flipFrom(document.body, motionSkip(ghost))
    ghost.remove()
    ghostGone = true
    unhide()
    if (smooth) { flip.play(); growBack(el) }
  }
  return {
    confirm() {
      if (done) return
      if (back()) { land(); return }
      // the code says it is gone; if no reload shows it, stop pretending
      timer = setTimeout(() => { if (!done) showAgain() }, holdMs)
    },
    revert() { if (!done) showAgain() },
  }
}

function growBack(el: HTMLElement): void {
  if (!el.isConnected || typeof el.animate !== 'function') return
  el.animate([{ opacity: '0.3', transform: 'scale(0.9)' }, { opacity: getComputedStyle(el).opacity, transform: 'none' }], { duration: GLIDE_MS, easing: EASE })
}
