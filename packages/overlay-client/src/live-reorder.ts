/**
 * Live reflow while dragging, and holding what you saw until the code lands
 * (goal loop: Canva-like edits, approach n1, step n5).
 *
 * LiveReorder: dragging a child of a flex/grid parent over a sibling's slot
 * reorders the row RIGHT THEN: every child gets an inline `order`, so the real
 * layout reflows and the siblings glide aside (FLIP) to open the gap. Nothing
 * in the DOM moves (React owns that); only `order`, which React never writes.
 *
 * Hold: after release the visual edit stays the truth on screen (the
 * reorder's `order`s, a move's transform) until the dev server's hot reload
 * shows the code's version. Then, inside the same task as React's commit
 * (a MutationObserver callback runs before the next paint), the hold comes
 * off: if the code matches, nothing moves; if not, the difference glides.
 */
import { EASE, GLIDE_MS, flipDeltas, reducedMotion } from './motion.js'
import type { Box } from './optimistic.js'

/** Visual position of each DOM child when `from` is moved to `to`. */
export function orderFor(n: number, from: number, to: number): number[] {
  const seq = [...Array(n).keys()]
  if (from < 0 || from >= n || to < 0 || to >= n) return seq
  seq.splice(from, 1)
  seq.splice(to, 0, from)
  const pos = new Array<number>(n)
  seq.forEach((child, p) => { pos[child] = p })
  return pos
}

/**
 * A key for a child that survives a hot reload: React may move the node
 * (keyed lists) or keep the node and swap its contents (unkeyed), so the
 * element itself is not a stable name for "the card that says X".
 */
export function contentKeys(els: Element[]): string[] {
  const seen = new Map<string, number>()
  return els.map((el) => {
    const base = `${el.tagName}|${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)}`
    const k = seen.get(base) ?? 0
    seen.set(base, k + 1)
    return `${base}#${k}`
  })
}

const rectOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }
/** Layout box, ignoring transforms (so a glide still in flight is not a difference). */
const layoutOf = (el: Element): Box => {
  const h = el as HTMLElement
  return { x: h.offsetLeft ?? 0, y: h.offsetTop ?? 0, w: h.offsetWidth ?? 0, h: h.offsetHeight ?? 0 }
}

/** Glide each element from `before` (by key) to where it is now. */
function glideFrom(els: Element[], keys: string[], before: Map<string, Box>, measure = rectOf, duration = GLIDE_MS): Animation[] {
  const after = new Map<string, Box>()
  els.forEach((el, i) => after.set(keys[i]!, measure(el)))
  const byKey = new Map(els.map((el, i) => [keys[i]!, el] as const))
  const out: Animation[] = []
  for (const d of flipDeltas(before, after, () => null)) {
    const el = byKey.get(d.key) as HTMLElement | undefined
    if (!el || typeof el.animate !== 'function') continue
    out.push(el.animate(
      [{ transform: `translate(${d.dx}px, ${d.dy}px)` }, { transform: 'none' }],
      { duration, easing: EASE, composite: 'add' },
    ))
  }
  return out
}

export class LiveReorder {
  readonly parent: HTMLElement
  readonly el: HTMLElement
  readonly from: number
  to: number
  private prev: Array<{ el: HTMLElement; v: string; p: string }>
  private lifted = false

  constructor(el: HTMLElement) {
    this.el = el
    this.parent = el.parentElement!
    const kids = [...this.parent.children] as HTMLElement[]
    this.from = kids.indexOf(el)
    this.to = this.from
    this.prev = kids.map((k) => ({ el: k, v: k.style.getPropertyValue('order'), p: k.style.getPropertyPriority('order') }))
  }

  private kids(): HTMLElement[] { return this.prev.map((x) => x.el).filter((k) => k.isConnected) }

  /**
   * Show the row as it would be with the dragged child at `to`. Returns how
   * far the dragged child's own slot moved (the drag's transform subtracts
   * it, so the element stays under the pointer).
   */
  set(to: number): { dx: number; dy: number } {
    if (to === this.to) return { dx: 0, dy: 0 }
    const kids = this.kids()
    const others = kids.filter((k) => k !== this.el)
    const keys = others.map((_, i) => String(i))
    const before = new Map<string, Box>()
    others.forEach((k, i) => before.set(keys[i]!, rectOf(k)))
    const slot0 = { x: this.el.offsetLeft, y: this.el.offsetTop }
    const pos = orderFor(this.prev.length, this.from, to)
    this.prev.forEach((x, i) => { if (x.el.isConnected) x.el.style.setProperty('order', String(pos[i]), 'important') })
    this.lifted = true
    this.to = to
    if (!reducedMotion()) glideFrom(others, keys, before)
    return { dx: this.el.offsetLeft - slot0.x, dy: this.el.offsetTop - slot0.y }
  }

  /** Back to the row as the code has it, gliding. */
  restore(): void {
    if (!this.lifted) return
    const kids = this.kids()
    const keys = kids.map((_, i) => String(i))
    const before = new Map<string, Box>()
    kids.forEach((k, i) => before.set(keys[i]!, rectOf(k)))
    this.clear()
    this.to = this.from
    if (!reducedMotion()) glideFrom(kids, keys, before)
  }

  /** Remove every inline order this put on (the original values come back). */
  clear(): void {
    for (const x of this.prev) {
      if (x.v) x.el.style.setProperty('order', x.v, x.p)
      else x.el.style.removeProperty('order')
      if (x.el.getAttribute('style') === '') x.el.removeAttribute('style')
    }
    this.lifted = false
  }

  /** Where each child sits in the layout now, by content (see contentKeys). */
  seen(): Map<string, Box> {
    const kids = [...this.parent.children]
    const keys = contentKeys(kids)
    return new Map(kids.map((k, i) => [keys[i]!, layoutOf(k)] as const))
  }

  /** After the code lands: drop the orders, glide whatever the code put elsewhere. */
  settle(before: Map<string, Box>): number {
    this.clear()
    const kids = [...this.parent.children]
    // layout against layout: glides already in flight carry on untouched
    return reducedMotion() ? 0 : glideFrom(kids, contentKeys(kids), before, layoutOf).length
  }
}

export interface HoldResult {
  /** 'landed': the hot reload showed up; 'timeout': it never did, released anyway. */
  how: 'landed' | 'timeout'
  /** How many boxes still had to glide (0 = the code matched what you saw). */
  glided: number
  ms: number
}

/**
 * Keep the visual edit on until the code's version shows up under `root`
 * (childList, text or class changes; our own inline styles are ignored),
 * then run `release` in that same task, before the page paints.
 */
export function holdUntilLanded(
  root: Element,
  release: (how: HoldResult['how']) => number,
  timeoutMs = 2500,
): Promise<HoldResult> {
  const t0 = performance.now()
  return new Promise((resolve) => {
    let done = false
    const finish = (how: HoldResult['how']) => {
      if (done) return
      done = true
      mo.disconnect()
      clearTimeout(timer)
      const glided = release(how)
      resolve({ how, glided, ms: performance.now() - t0 })
    }
    const mo = new MutationObserver(() => finish('landed'))
    mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })
    const timer = setTimeout(() => finish('timeout'), timeoutMs)
  })
}

/**
 * n6: hold a resize (or a move) until the code lands. The boxes that can be
 * pushed around by one element changing size: the element, its siblings, and
 * each ancestor's later siblings a few levels up (a taller card pushes the
 * next section down). Keyed by identity: the codemods only rewrite classes,
 * so the hot reload keeps these nodes.
 */
export function pushedBy(el: HTMLElement, levels = 4): HTMLElement[] {
  const out = new Set<HTMLElement>([el])
  let at: HTMLElement | null = el
  for (let i = 0; at && at !== document.body && i < levels; i++) {
    const parent: HTMLElement | null = at.parentElement
    if (!parent) break
    for (const k of parent.children) {
      if (k instanceof HTMLElement && k.id !== 's2c-overlay-host') out.add(k)
    }
    at = parent
  }
  return [...out]
}

export type Boxes = Map<HTMLElement, Box>
export function boxesOf(els: HTMLElement[]): Boxes {
  return new Map(els.filter((e) => e.isConnected).map((e) => [e, rectOf(e)] as const))
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.75

/**
 * From what was on screen (`before`) to the layout now, smoothly. If `focus`
 * changed size, its size eases from the old one (the rest of the page rides
 * along with the real layout, frame by frame); otherwise every box that ended
 * up somewhere else glides there. Returns how many boxes differed.
 */
export function settleBoxes(before: Boxes, focus: HTMLElement, duration = GLIDE_MS): number {
  let differed = 0
  for (const [el, b] of before) {
    if (!el.isConnected) continue
    const a = rectOf(el)
    if (!(near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h))) differed++
  }
  if (differed === 0 || reducedMotion()) return differed
  const fb = before.get(focus)
  const fa = focus.isConnected ? rectOf(focus) : null
  if (fb && fa && (!near(fa.w, fb.w) || !near(fa.h, fb.h)) && typeof focus.animate === 'function') {
    const kf: Keyframe[] = [{}, {}]
    if (!near(fa.w, fb.w)) { kf[0]!.width = `${fb.w}px`; kf[1]!.width = `${fa.w}px` }
    if (!near(fa.h, fb.h)) { kf[0]!.height = `${fb.h}px`; kf[1]!.height = `${fa.h}px` }
    focus.animate(kf, { duration, easing: EASE })
    return differed
  }
  for (const [el, b] of before) {
    if (!el.isConnected || typeof el.animate !== 'function') continue
    const a = rectOf(el)
    if (near(a.x, b.x) && near(a.y, b.y)) continue
    el.animate(
      [{ transform: `translate(${b.x - a.x}px, ${b.y - a.y}px)` }, { transform: 'none' }],
      { duration, easing: EASE, composite: 'add' },
    )
  }
  return differed
}
