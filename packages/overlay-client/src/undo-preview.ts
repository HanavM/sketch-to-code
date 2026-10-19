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
import { EASE, GLIDE_MS, reducedMotion } from './motion.js'
import { contentKeys, LiveReorder } from './live-reorder.js'

export type VisualEdit =
  | { kind: 'class'; srcLoc: string; before: string[] }
  | { kind: 'order'; parent: HTMLElement; key: string; from: number; to: number }

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
function easeClasses(els: HTMLElement[], to: string[]): void {
  const was = els.map(styleOf)
  els.forEach((e, i) => { if (to[i] !== undefined) e.className = to[i]! })
  if (reducedMotion()) return
  els.forEach((e, i) => {
    if (typeof e.animate !== 'function') return
    const now = styleOf(e)
    const k0: Keyframe = {}, k1: Keyframe = {}
    let any = false
    for (const p of EASED) {
      if (was[i]![p] === now[p]) continue
      // auto sizes resolve to px in computed style, so both ends are animatable
      k0[p] = was[i]![p]!; k1[p] = now[p]!; any = true
    }
    if (any) e.animate([k0, k1], { duration: GLIDE_MS, easing: EASE })
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
  if (e.kind === 'class') {
    const els = instancesOf(e.srcLoc)
    if (els.length !== e.before.length) return null
    const after = els.map((x) => x.className)
    easeClasses(els, e.before)
    return {
      confirm() {},
      revert: () => { const live = els.filter((x) => x.isConnected); if (live.length === els.length) easeClasses(els, after) },
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
