/**
 * n155: a menu list typed in a side panel, with no rows drawn for it, stacks from the top of the panel's free space
 * and ends above the box drawn under it.
 *
 * Round 41 (hand, n150/n153): in the file browser, "nav: My files picked blue, Shared, Recent, Starred, Trash" was
 * typed at y 130 in the tall left panel, with the Upload button drawn at y 258. The note's spot was told as where
 * its words sit ("a note typed at a spot in a big box sits there", n21), so the five rows were built from y 128 at
 * about 40px each: they ran under the Upload button and "Trash" was hidden; in the target they start about 28px from
 * the top. In the bank home, "nav: Home picked, Cards, ..." typed at y 220 under the "penny" logo note (y 48) was
 * built from y 235, the target's from about 107. A person types a long list note wherever there is room; a side menu
 * with no drawn rows starts right under what is above it in the panel.
 *
 * From the drawing alone:
 * - PANEL: a drawn box at least 360px (or half the page) tall, 120-420px wide, touching the page's left or right edge.
 * - LIST: a note typed inside it whose part after a colon lists 3 to 10 items, typed in the panel's upper 60%.
 * - No level line drawn inside the panel between its top and the note's rows (drawn rows place themselves).
 * - START: under the lowest note or drawn mark above the note in the panel (its bottom + 32px), else the panel's top
 *   + 24px; only ever moved up.
 * - FOOT: the first drawn box (button) in the panel below the start: the rows end 12px above it; the row pitch is
 *   what fits (32 to 48px), 44px with nothing below.
 * The note's typed spot is moved to the start (so no other brief says "at y 130"), the build is told the start, pitch
 * and the box to stay above, and the page is checked: the first item near the start, the last above the foot.
 * Zero tokens.
 */
import { listNote, type BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { listLead } from './rowwords.js'

interface NodeLike { rect: BBox; text?: string; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
interface Spot { text: string; x: number; y: number }
export interface SideListVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface SideList {
  text: string
  items: string[]
  panel: BBox
  /** where the note was typed */
  typedY: number
  /** top of the first row, px */
  start: number
  pitch: number
  /** the drawn box the rows stay above, or null */
  foot: BBox | null
}

export const START_TOL_PX = 28
const r = Math.round
const NOTE_H = 14 // a note's point is its first line's middle; its words reach about this far under it

/** The items of a list note ("nav: Home picked, Cards, Payments"), or null. */
export function sideItems(text: string): string[] | null {
  if (!listNote(text)) return null
  const { body } = listLead(text)
  const rest = body === text ? text.slice(text.indexOf(':') + 1) : body
  const items = rest.replace(/\([^)]*\)/g, '').split(/\s*[,;/]\s*/).map((t) => t.trim()).filter(Boolean)
  return items.length >= 3 && items.length <= 10 ? items : null
}

const within = (b: BBox, p: { x: number; y: number }, tol = 4) => p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol
const insideBox = (a: BBox, b: BBox, tol = 8) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol

/** Tall boxes at a page edge: side panels. */
export function sidePanels(marks: readonly Pick<ShapeMark, 'shape' | 'box' | 'tilt'>[], viewport: { w: number; h: number }): BBox[] {
  return marks.filter((m) => m.shape === 'box' && !m.tilt && m.box.h >= Math.min(360, 0.5 * viewport.h) && m.box.w >= 120 && m.box.w <= 420 &&
    (m.box.x <= 24 || m.box.x + m.box.w >= viewport.w - 24)).map((m) => m.box)
}

/**
 * Side menu lists, from the marks (with their typed notes), every drawn shape on the page (claimed by an action or
 * not), and every typed note with a spot.
 */
export function sideLists(marks: readonly ShapeMark[], shapes: readonly Pick<ShapeMark, 'shape' | 'box' | 'from' | 'to' | 'tilt'>[], notes: readonly Spot[], viewport: { w: number; h: number }): SideList[] {
  const out: SideList[] = []
  const seen = new Set<string>()
  for (const m of marks) {
    if (m.shape !== 'box' || !m.typed?.length) continue
    const P = m.box
    if (!sidePanels([m], viewport).length) continue
    for (const t of m.typed) {
      const items = sideItems(t.text)
      if (!items || seen.has(t.text)) continue
      if (t.y > P.y + 0.6 * P.h) continue
      // what is drawn or typed in the panel, other than the panel itself
      const inPanel = shapes.filter((s) => !(Math.abs(s.box.x - P.x) <= 6 && Math.abs(s.box.y - P.y) <= 6 && Math.abs(s.box.w - P.w) <= 12 && Math.abs(s.box.h - P.h) <= 12) &&
        insideBox(s.box, P) && s.box.w * Math.max(1, s.box.h) > 0)
      const above = [
        ...inPanel.filter((s) => s.box.y + s.box.h <= t.y - 6).map((s) => s.box.y + s.box.h),
        ...notes.filter((n) => n.text !== t.text && within(P, n) && n.y < t.y - 10 && !sideItems(n.text)).map((n) => n.y + NOTE_H),
      ]
      const start = r(above.length ? Math.max(...above) + 32 : P.y + 24)
      if (start > t.y - 16) continue // already typed at the top of its free space
      // drawn rows: a level line in the panel between the start and the list's reach places the rows itself
      const level = (s: (typeof inPanel)[number]) => s.shape === 'line' && !!s.from && !!s.to && Math.abs(s.from.y - s.to.y) <= 4
      if (inPanel.some((s) => level(s) && s.box.y >= start - 8 && s.box.y <= t.y + items.length * 44)) continue
      const below = inPanel.filter((s) => s.shape === 'box' && s.box.y >= start + 32 && s.box.h <= 90 && s.box.w >= 0.4 * P.w)
        .sort((a, b) => a.box.y - b.box.y)[0]
      const foot = below ? { x: r(below.box.x), y: r(below.box.y), w: r(below.box.w), h: r(below.box.h) } : null
      const pitch = foot ? Math.max(32, Math.min(48, Math.floor((foot.y - 12 - start) / items.length))) : 44
      seen.add(t.text)
      out.push({ text: t.text, items, panel: { x: r(P.x), y: r(P.y), w: r(P.w), h: r(P.h) }, typedY: t.y, start, pitch, foot })
    }
  }
  return out
}

/** Move each side list's typed spot to where its rows start (in place), so no other brief places it at the note. */
export function markSideLists(marks: ShapeMark[], shapes: readonly Pick<ShapeMark, 'shape' | 'box' | 'from' | 'to' | 'tilt'>[], notes: readonly Spot[], viewport: { w: number; h: number }): SideList[] {
  const lists = sideLists(marks, shapes, notes, viewport)
  for (const l of lists) {
    for (const m of marks) {
      const own = (m.typed ?? []).filter((t) => t.text === l.text && t.y === l.typedY)
      for (const t of own) t.y = l.start + r(l.pitch / 2)
      if (own.length) (m.sideLists ??= []).push(l)
    }
  }
  return lists
}

/** Every side list recorded on the marks. */
export const sideListsOf = (marks: readonly ShapeMark[]): SideList[] => marks.flatMap((m) => m.sideLists ?? [])

export function sideListBrief(lists: readonly SideList[]): string {
  if (!lists.length) return ''
  const each = lists.map((l) => {
    const end = l.start + l.items.length * l.pitch
    return `"${l.text}" (${l.items.length} items) was typed in the side panel at (${l.panel.x},${l.panel.y}) ${l.panel.w}x${l.panel.h} with no rows drawn for it: ` +
      `it is that panel's menu, stacked from the TOP of the panel's free space, not from where the note was typed (y ${l.typedY}). ` +
      `The first row's top is at y ${l.start}, rows about ${l.pitch}px apart (each about ${l.pitch - 6}px tall), so the last ends by y ${end}` +
      (l.foot ? `, above the box drawn at (${l.foot.x},${l.foot.y}) ${l.foot.w}x${l.foot.h}px (its button), which is NOT part of the menu's flow: its top stays at exactly y ${l.foot.y} ` +
        `and it keeps its drawn ${l.foot.w}px width (e.g. a margin-top that takes up the empty space between the last row and y ${l.foot.y}); no row runs under or behind it, and it never moves up to follow the menu` : '') +
      `. Every item is shown (none hidden or cut), the lead before the colon is never printed, and look words on an item (picked, blue) style that row`
  })
  return `\n\nSIDE MENUS (deterministic, from the drawing; checked on the page): ${each.join('; ')}.`
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** An item's copy: its words before look words ("My files picked blue" -> "my files"). */
const LOOK = /\b(picked|selected|active|current|highlighted|bold|blue|grey|gray|white|dark|light|green|red|purple|orange|yellow|black|pill|chip|icon|badge|faint|muted|big|small)\b.*$/i
const copyOf = (item: string) => norm(item.replace(LOOK, '')) || norm(item)

export function verifySideLists(lists: readonly SideList[], after: Snap): SideListVerdict {
  if (!lists.length) return { satisfied: true, unverifiable: true, reason: 'no side menu typed' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const l of lists) {
    const P = l.panel
    const inPanel = (after.nodes ?? []).filter((n) => n.text && n.textBox && n.textBox.w > 0 && n.textBox.h > 0 &&
      n.textBox.x + n.textBox.w / 2 >= P.x && n.textBox.x + n.textBox.w / 2 <= P.x + P.w)
    const find = (item: string) => {
      const want = copyOf(item)
      if (want.length < 2) return null
      return inPanel.filter((n) => norm(n.text!) === want).sort((a, b) => a.textBox!.h - b.textBox!.h)[0] ?? null
    }
    const first = find(l.items[0]!)
    const last = find(l.items[l.items.length - 1]!)
    if (!first && !last) continue
    judged++
    if (first) {
      const cy = first.textBox!.y + first.textBox!.h / 2
      const want = l.start + l.pitch / 2
      if (Math.abs(cy - want) > START_TOL_PX) {
        faults.push(`the side menu "${l.text}" starts at y ${r(cy)} (its first item's middle) but was drawn to start at the top of the panel's free space: ` +
          `move the whole menu ${cy > want ? 'up' : 'down'} so the first row's top is at y ${l.start} (its words' middle about y ${r(want)}), rows about ${l.pitch}px apart`)
      }
    }
    if (l.foot) {
      const F = l.foot
      const btn = inPanel.map((n) => n.rect).concat((after.nodes ?? []).map((n) => n.rect))
        .filter((b) => Math.abs(b.x - F.x) <= 40 && Math.abs(b.y - F.y) <= 120 && b.h >= 0.5 * F.h && b.h <= 2 * F.h && b.w >= 30 && b.w <= 1.4 * F.w)
        .sort((a, b) => Math.abs(a.y - F.y) + Math.abs(a.w - F.w) - (Math.abs(b.y - F.y) + Math.abs(b.w - F.w)))[0]
      if (btn && (Math.abs(btn.y - F.y) > 16 || btn.w < 0.75 * F.w)) {
        faults.push(`the button drawn under the side menu at (${F.x},${F.y}) ${F.w}x${F.h}px is built at y ${r(btn.y)}, ${r(btn.w)}px wide: it does not follow the menu; ` +
          `put its top at y ${F.y} (a margin-top taking up the space under the last row) and make it ${F.w}px wide`)
      }
    }
    if (last && l.foot) {
      const b = last.textBox!
      if (b.y + b.h > l.foot.y - 2) {
        faults.push(`the side menu's last item "${l.items[l.items.length - 1]}" sits at y ${r(b.y)} to ${r(b.y + b.h)}, under or behind the box drawn at y ${l.foot.y} (its button): ` +
          `start the menu at y ${l.start} with rows about ${l.pitch}px apart so every item ends above y ${l.foot.y - 8}; keep the button at y ${l.foot.y}`)
      }
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'side menu items not found on the page' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '. Change only the menu\'s place and row spacing; not its colours, copy or width' }
    : { satisfied: true, reason: `${lists.length} side menu${lists.length > 1 ? 's' : ''} from the top of the panel, clear of the button under it` }
}
