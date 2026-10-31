/**
 * Which drawn marks a typed note is about.
 *
 * Lives here (not in the pipeline) so the overlay can run the very same rule
 * while you draw and show each note's mark before anything is built: what you
 * see bound is what the build is told.
 */
import type { BBox, Stroke } from './types.js'
import { COPY_CHAR_EM, COPY_OVERFLOW_SLACK, isLevelLine, isTextMark, textStacks, type StackOpts } from './textmark.js'

/** A text stack at least this big (font px) is one display heading for note focus. */
export const GIANT_STACK_PX = 60

/** n88: a stack this big (font px) or more is heading type: a note whose words overflow its line covers the stack. */
export const STACK_COPY_MIN_FONT_PX = 28

/** How far past the nearest stroke a stroke can sit and still be "right here". */
export const NOTE_FOCUS_SLACK_PX = 24

/**
 * Which of a note's strokes it is actually about. The overlay's own pick wins
 * (it knows the newest stroke for type-to-label); otherwise the strokes nearest
 * the point the note was typed at, within a small slack so the two lines of
 * one heading stay together. Undefined when that is all of them anyway.
 */
export function noteFocus(
  ids: string[],
  given: string[] | undefined,
  at: { x: number; y: number } | undefined,
  strokes: Stroke[],
  text?: string,
  stackOpts: StackOpts = {},
): string[] | undefined {
  if (ids.length < 2) return undefined
  let focus: string[] = (given ?? []).filter((id) => ids.includes(id))
  if (focus.length === 0 && at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
    const d = new Map<string, number>()
    const rects = new Map<string, BBox>()
    // closed outlines (not plain boxes) the point is inside, by their area
    const enclosed = new Map<string, number>()
    for (const st of strokes) {
      if (!ids.includes(st.id) || st.points.length === 0) continue
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const p of st.points) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
      }
      const r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      rects.set(st.id, r)
      const ds = distToStroke(at, st.points, r)
      d.set(st.id, ds.d)
      if (ds.area !== undefined) enclosed.set(st.id, ds.area)
    }
    if (d.size === 0) return undefined
    // n69: typed on the row of one of a column of look-alike marks (an ingredient beside its checkbox),
    // with no other mark on that row: the note is that mark's, though a line above may be nearer
    const row = text && groupCount(text) !== null ? null : rowMarkOf(ids, at, strokes, rects, d)
    if (row) return row === ids[0] && ids.length === 1 ? undefined : [row]
    const best = Math.min(...d.values())
    // n71: typed right ON a level line (within 8px of it, inside its span) with no other mark that close: the note is
    // that line's words. Round 34 e3 (habits): "M T W T F S S" typed 5px over its 500px line also took the card box
    // 29px below, so the line got no words and the build never saw the row it set.
    const onLine = ids.filter((id) => {
      const r = rects.get(id)
      return !!r && r.h <= 6 && r.w >= 40 && (d.get(id) ?? Infinity) <= 8 && at.x >= r.x && at.x <= r.x + r.w
    })
    const lr = onLine.length === 1 ? rects.get(onLine[0]!)! : null
    // a line in a stack (heading lines, paragraph wraps) is left to the stack rules below
    const otherLines = !!lr && ids.some((id) => {
      const r = rects.get(id)
      return id !== onLine[0] && !!r && r.h <= 6 && Math.abs(r.y - lr.y) <= 160 && Math.min(r.x + r.w, lr.x + lr.w) - Math.max(r.x, lr.x) > 0
    })
    if (onLine.length === 1 && !otherLines && ids.every((id) => id === onLine[0] || (d.get(id) ?? Infinity) > 12)) return onLine[0] === ids[0] && ids.length === 1 ? undefined : [onLine[0]!]
    focus = ids.filter((id) => (d.get(id) ?? Infinity) <= best + NOTE_FOCUS_SLACK_PX)
    focus = dropFarSideLines(focus, d, best, at, strokes, stackOpts)
    // Typed inside two drawn outlines, one within the other (a near ridge over a far one,
    // an inner ring): the note is about the innermost one, as with containers below.
    const boxed = boxes(strokes, ids)
    const outlines = focus.filter((id) => enclosed.has(id) && !boxed.has(id))
    if (outlines.length >= 2) {
      const inner = outlines.reduce((a, b) => (enclosed.get(b)! < enclosed.get(a)! ? b : a))
      focus = focus.filter((id) => !outlines.includes(id) || id === inner)
    }
    // Typed inside a drawn box, near or inside another box that crosses it (neither holds
    // the other: an arch over the edge of a dark half): the note is about the box it was
    // typed in (the smallest, if several). Round 4 c2: the portrait's gradient note, typed
    // 3px from the dark half's edge, also focused the dark half, which was built lavender.
    const boxesIn = focus.filter((id) => boxed.has(id) && enclosed.has(id))
    if (boxesIn.length > 0) {
      const area = (id: string) => rects.get(id)!.w * rects.get(id)!.h
      const small = boxesIn.reduce((a, b) => (area(b) < area(a) ? b : a))
      const sr = rects.get(small)!
      const crossing = focus.filter((id) => id !== small && boxed.has(id) &&
        !contains(rects.get(id)!, sr) && !contains(sr, rects.get(id)!))
      if (crossing.length > 0) focus = focus.filter((id) => !crossing.includes(id))
    }
    // Typed inside a drawn container (a panel box holding a heading and body
    // lines): the container is at distance 0, so distance alone can't tell a
    // note about the panel from one about its heading. Typed on (or between
    // the lines of) one of its contents → that block joins the focus;
    // otherwise the panel's contents leave it.
    // Before this, the slack pulled in whichever child sat within 24px and the
    // note's copy landed there (round 1 c3: the panel's headline copy went to
    // the body line under the heading).
    const container = innermostContainer(at, rects, boxes(strokes, ids))
    if (container) {
      const c = rects.get(container)!
      // the container's own X (an image box) shares its box: part of it, not contents
      const kids = ids.filter((id) => id !== container && rects.has(id) && contains(c, rects.get(id)!) && !sameBox(c, rects.get(id)!))
      const bestKid = Math.min(...kids.map((id) => d.get(id) ?? Infinity))
      const near = kids.filter((id) => (d.get(id) ?? Infinity) <= bestKid + NOTE_FOCUS_SLACK_PX)
      if (near.length > 0 && inside(at, union(near.map((id) => rects.get(id)!)), NOTE_ON_BLOCK_PX)) {
        focus = ids.filter((id) => focus.includes(id) || near.includes(id))
      } else focus = focus.filter((id) => !kids.includes(id))
    }
    // Typed inside a small box that sits inside a bigger one (a badge or a button on a
    // card): the note is about the small box only. n10, round 2 c3: the badge's and the
    // button's notes were "on these 2 boxes" and their words reached the card too.
    const holding = focus.filter((id) => boxed.has(id) && enclosed.has(id))
    if (holding.length >= 2) {
      const outer = holding.filter((o) => holding.some((i) => i !== o &&
        contains(rects.get(o)!, rects.get(i)!) && !sameBox(rects.get(o)!, rects.get(i)!)))
      if (outer.length && outer.length < holding.length) focus = focus.filter((id) => !outer.includes(id))
    }
    // n69: typed beside (or in) one of a column or row of look-alike marks (five checkboxes, three chat
    // bubbles): the note is that one mark's, unless it names a group.
    if (focus.length >= 2 && !(text && groupCount(text) !== null)) focus = oneOfLookAlikes(focus, at, strokes)
  }
  // A note typed on one line of a giant heading is about all its lines: they sit ~150px
  // apart, past the slack, so typed on line 1, line 2 lost the note. Only giant stacks:
  // small ones also stack a title over a section heading, or a list of separate links.
  if (focus.length > 0) {
    for (const st of textStacks(strokes.filter((x) => ids.includes(x.id)), stackOpts)) {
      if (st.lines >= 2 && st.fontPx >= GIANT_STACK_PX && st.strokes.some((id) => focus.includes(id))) {
        focus = ids.filter((id) => focus.includes(id) || st.strokes.includes(id))
      }
    }
  }
  // n88: a note typed on one line of a heading-sized stack whose words cannot fit on the line(s) it landed on is
  // about the whole stack: the copy wraps onto the lines drawn under it (see overflowStack).
  if (focus.length > 0 && text) {
    const more = overflowStack(strokes.filter((x) => ids.includes(x.id)), focus, text, stackOpts)
    if (more.length) focus = ids.filter((id) => focus.includes(id) || more.includes(id))
  }
  // A note on the first line of a paragraph is about its wrap lines too: level lines
  // stepped tightly under it (under PARA_PITCH_PX), overlapping it and no longer than it.
  // n19, round 1 c1: the subtitle's note took line 1 and left "little longer." unbuilt.
  if (focus.length > 0) {
    const lv = strokes.filter((x) => ids.includes(x.id) && x.points.length > 1 && isLevelLine(x.points))
      .map((x) => {
        const xs = x.points.map((p) => p.x), ys = x.points.map((p) => p.y)
        return { id: x.id, x0: Math.min(...xs), x1: Math.max(...xs), cy: ys.reduce((a, b) => a + b, 0) / ys.length }
      }).sort((a, b) => a.cy - b.cy)
    for (const l of lv) {
      if (!focus.includes(l.id)) continue
      let last = l
      for (const n of lv) {
        if (n.cy <= last.cy) continue
        const gap = n.cy - last.cy
        if (gap > PARA_PITCH_PX) break
        if (gap >= 8 && Math.min(n.x1, last.x1) > Math.max(n.x0, last.x0) && n.x1 - n.x0 <= (last.x1 - last.x0) * 1.05) {
          if (!focus.includes(n.id)) focus = ids.filter((id) => focus.includes(id) || id === n.id)
          last = n
        } else break
      }
    }
  }
  // n31: a note that names a group ("3 tilted stacked cards", "gold frames on all 3") is about
  // every mark of that group: the like-sized closed shapes that touch or sit in a row with the one
  // it landed on. Round 31 c3 and c2: such notes reached only the nearest card or frame.
  if (focus.length > 0 && text) {
    const g = groupOf(text, focus, ids, strokes, at)
    if (g) focus = ids.filter((id) => focus.includes(id) || g.includes(id))
  }
  return focus.length > 0 && focus.length < ids.length ? focus : undefined
}

/** Closed outline of any size (a 22px checkbox counts): its box, or null. */
export function closedAnySize(st: Stroke): BBox | null {
  const pts = st.points
  if (pts.length < 5) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  const w = x1 - x0, h = y1 - y0
  if (w < 8 || h < 8) return null
  const a = pts[0]!, b = pts[pts.length - 1]!
  if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(12, 0.15 * Math.min(w, h))) return null
  return { x: x0, y: y0, w, h }
}

/**
 * n69: look-alike marks in a list each own the note typed level with them.
 *
 * Round 34 e1 (recipe): five 22px checkboxes 38px apart, each ingredient typed to the right of its box. The
 * slack (24px) reached the next box too, so each note was "on these 2 boxes" (dragging a note onto a box did
 * not help: the next box is 16px away) and the build put one row's words on several rows. Round 34 e4: three
 * chat bubbles 24px apart, each message typed inside its own bubble, also reached the next bubble.
 *
 * Among the like-sized closed marks in the focus (each side within half again of the others): the one the
 * point is inside; else, for a column, the one whose height band holds the point (for a row, its width band);
 * else the clearly nearest. Other marks in the focus stay.
 */
export function oneOfLookAlikes(focus: string[], at: { x: number; y: number }, strokes: Stroke[]): string[] {
  const shapes = new Map<string, BBox>()
  for (const st of strokes) {
    if (!focus.includes(st.id)) continue
    const b = closedAnySize(st)
    if (b) shapes.set(st.id, b)
  }
  if (shapes.size < 2) return focus
  const ratio = (a: number, b: number) => Math.max(a, b) / Math.max(1, Math.min(a, b))
  const ids = [...shapes.keys()]
  // the look-alikes: like-sized with at least one other, none holding another
  const like = ids.filter((id) => ids.some((o) => o !== id &&
    ratio(shapes.get(id)!.w, shapes.get(o)!.w) <= 1.5 && ratio(shapes.get(id)!.h, shapes.get(o)!.h) <= 1.5 &&
    !contains(shapes.get(id)!, shapes.get(o)!) && !contains(shapes.get(o)!, shapes.get(id)!)))
  if (like.length < 2) return focus
  const bx = (id: string) => shapes.get(id)!
  let pick: string[] = like.filter((id) => inside(at, bx(id)))
  if (pick.length !== 1) {
    const disjointY = like.every((a) => like.every((b) => a === b || bx(a).y + bx(a).h <= bx(b).y + 2 || bx(b).y + bx(b).h <= bx(a).y + 2))
    const disjointX = like.every((a) => like.every((b) => a === b || bx(a).x + bx(a).w <= bx(b).x + 2 || bx(b).x + bx(b).w <= bx(a).x + 2))
    if (disjointY) pick = like.filter((id) => at.y >= bx(id).y - 2 && at.y <= bx(id).y + bx(id).h + 2)
    else if (disjointX) pick = like.filter((id) => at.x >= bx(id).x - 2 && at.x <= bx(id).x + bx(id).w + 2)
    else pick = []
  }
  if (pick.length !== 1) {
    const ds = like.map((id) => ({ id, d: distToRect(at, bx(id)) })).sort((a, b) => a.d - b.d)
    if (ds[1]!.d - ds[0]!.d < 8) return focus
    pick = [ds[0]!.id]
  }
  return focus.filter((id) => !like.includes(id) || id === pick[0])
}

/** n69: how far right of a list mark a note may be typed and still be that row's (px). */
export const ROW_NOTE_REACH_PX = 240

/**
 * n69: a column of two or more look-alike small marks (checkboxes, bullets, radio rings; each side 8 to 80px,
 * within half again of each other, lined up on their left edges, none overlapping in height); a note typed
 * level with one of them (inside its height band), inside it or to its right within ROW_NOTE_REACH_PX, with no
 * other mark on that row nearer: that mark. Round 34 e1: "400 g spaghetti" typed right of the first checkbox
 * went to the "Ingredients" line 39px above (the box was 74px away).
 */
function rowMarkOf(ids: string[], at: { x: number; y: number }, strokes: Stroke[], rects: Map<string, BBox>, d: Map<string, number>): string | null {
  const small = new Map<string, BBox>()
  for (const st of strokes) {
    if (!ids.includes(st.id)) continue
    const b = closedAnySize(st)
    if (b && b.w <= 80 && b.h <= 80) small.set(st.id, b)
  }
  if (small.size < 2) return null
  const ratio = (a: number, b: number) => Math.max(a, b) / Math.max(1, Math.min(a, b))
  const on = [...small].filter(([, b]) => at.y >= b.y - 2 && at.y <= b.y + b.h + 2 && at.x >= b.x - 4 && at.x <= b.x + b.w + ROW_NOTE_REACH_PX)
  if (on.length !== 1) return null
  const [id, b] = on[0]!
  const column = [...small].filter(([o, c]) => o !== id && ratio(c.w, b.w) <= 1.5 && ratio(c.h, b.h) <= 1.5 &&
    Math.abs(c.x - b.x) <= Math.max(8, 0.5 * b.w) && (c.y >= b.y + b.h - 2 || c.y + c.h <= b.y + 2))
  if (column.length === 0) return null
  // another mark on the same row, nearer the point (a line drawn for the row's words) owns it instead
  const mine = d.get(id) ?? Infinity
  for (const [o, r] of rects) {
    if (o === id || small.has(o)) continue
    const cy = r.y + r.h / 2
    if (cy >= b.y - 4 && cy <= b.y + b.h + 4 && (d.get(o) ?? Infinity) < mine) return null
    if (r.w > 0 && r.h > 0 && inside(at, r) && !(r.w * r.h > 4 * b.w * b.h)) return null
  }
  return id
}

/**
 * n69: the list mark (a small closed mark, 80px or less) whose row a point was typed on: level with it and
 * inside it or right of it within ROW_NOTE_REACH_PX; the nearest such. The overlay seeds a note's drawing on
 * it when nothing is within its usual reach (an ingredient typed 84px right of its checkbox was "placed here").
 */
export function rowSeed(strokes: Stroke[], at: { x: number; y: number }): string | null {
  let best: string | null = null, bd = Infinity
  for (const st of strokes) {
    const b = closedAnySize(st)
    if (!b || b.w > 80 || b.h > 80) continue
    if (at.y < b.y - 2 || at.y > b.y + b.h + 2 || at.x < b.x - 4 || at.x > b.x + b.w + ROW_NOTE_REACH_PX) continue
    const dd = Math.max(0, at.x - (b.x + b.w))
    if (dd < bd) { bd = dd; best = st.id }
  }
  return best
}

/** n55: the far line must be at least this many times as far as the nearest to be dropped. */
export const FAR_SIDE_RATIO = 2
/** n55: ... and at least this many px further. */
export const FAR_SIDE_MIN_PX = 10

/**
 * n55: a note typed between two text lines, clearly nearer one of them, is about that one only,
 * when the other belongs to another block: it sits a block gap away (more than a paragraph's wrap
 * pitch), or another note was typed closer to it (it has its own words). Round 33 c1 and c4: the
 * paragraph's note, typed just above its first line, was within the slack of the heading's last
 * line too, so it also took the heading (and, via the giant stack, all of it).
 */
function dropFarSideLines(
  focus: string[], d: Map<string, number>, best: number, at: { x: number; y: number },
  strokes: Stroke[], stackOpts: StackOpts,
): string[] {
  if (focus.length < 2) return focus
  const line = new Map<string, { cy: number; pts: Stroke['points'] }>()
  for (const st of strokes) {
    if (!focus.includes(st.id) || !isTextLine(st.points)) continue
    line.set(st.id, { cy: st.points.reduce((a, p) => a + p.y, 0) / st.points.length, pts: st.points })
  }
  const nearest = focus.filter((id) => line.has(id) && (d.get(id) ?? Infinity) === best)
  if (nearest.length !== 1) return focus
  const near = line.get(nearest[0]!)!
  const sideNear = Math.sign(near.cy - at.y)
  const others = (stackOpts.notesAt ?? []).filter((q) => Math.hypot(q.x - at.x, q.y - at.y) > 2)
  const drop = new Set<string>()
  for (const [id, l] of line) {
    if (id === nearest[0]) continue
    const df = d.get(id) ?? Infinity
    if (df < Math.max(FAR_SIDE_RATIO * best, best + FAR_SIDE_MIN_PX)) continue
    const side = Math.sign(l.cy - at.y)
    if (sideNear !== 0 && side === sideNear) continue
    const blockGap = Math.abs(l.cy - near.cy) > PARA_PITCH_PX
    const xs = l.pts.map((p) => p.x), ys = l.pts.map((p) => p.y)
    const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    const ownNote = others.some((q) => distToRect(q, r) < df)
    if (blockGap || ownNote) drop.add(id)
  }
  return drop.size ? focus.filter((id) => !drop.has(id)) : focus
}

/** n69: plural nouns that name drawn things on a page (a group a note can be about). */
const GROUP_NOUN = /^(cards?|frames?|boxes|tiles?|rings?|circles?|discs?|dots?|blobs?|shapes?|marks?|buttons?|pills?|chips?|tags?|badges?|icons?|avatars?|photos?|images?|pictures?|thumbnails?|panels?|columns?|rows?|bars?|blocks?|items?|tabs?|lines?|stripes?|bands?|squares?|rectangles?|triangles?|stars?|bubbles?|cells?|slots?|seats?|steps?|stats?|fields?|inputs?|toggles?|checkboxes|sections?|logos?|planets?|petals?|layers?|sheets?|pages?|posters?|tickets?|stickers?|polaroids?|windows?|screens?|phones?|devices?|labels?|links?)$/

const COUNT_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, both: 2 }

/**
 * How many marks a note names as a group: "3 cards", "three frames", "all 3", "on both" give the
 * number; "all cards", "each tile", "every box" give 0 (all of the group). Null when it names none.
 */
/** n144: a note that lists items after a colon (three or more, comma or slash separated): its words are copy. */
export function listNote(text: string): boolean {
  const c = text.indexOf(':')
  if (c < 0) return false
  const rest = text.slice(c + 1).replace(/\([^)]*\)/g, '')
  return rest.split(/[,/;]/).filter((p) => p.trim().length > 0).length >= 3
}

export function groupCount(text: string): number | null {
  const t = ` ${text.toLowerCase()} `
  const num = String.raw`(\d|two|three|four|five|six|seven|eight|nine)`
  const plural = String.raw`(?:[a-z-]+\s+){0,3}[a-z]+s\b`
  let m = new RegExp(String.raw`\b(?:all|each of(?: the)?|on)\s+${num}\b`).exec(t)
  // n69: "3 cards" names a group of drawn things; "3 cloves garlic", "2 lemons" are copy (a quantity)
  if (!m) {
    const q = new RegExp(String.raw`(?:^|[\s,(])${num}\s+(${plural})`).exec(t)
    if (q && GROUP_NOUN.test(q[2]!.trim().split(/\s+/).pop()!)) m = q
  }
  if (m) {
    const n = /\d/.test(m[1]!) ? Number(m[1]) : COUNT_WORDS[m[1]!]!
    return n >= 2 && n <= 9 ? n : null
  }
  // n144: a list note's "both" / "all" is about items it lists, not drawn marks. Round 40 e2: "checkbox list: 200 g
  // ricotta, 2 eggs (both ticked orange, crossed out), ..." typed in empty space 120px right of the photo box joined it.
  if (listNote(t)) return null
  if (/\bboth\b/.test(t)) return 2
  // n69: "every box", "all three cards" name a group; "every time I click it", "each day" are copy
  const every = /\b(?:all|each|every)\s+((?:the\s+)?(?:[a-z-]+\s+){0,2}[a-z]+s?)\b/.exec(t)
  if (every && every[1]!.split(/\s+/).some((w) => GROUP_NOUN.test(w)) && !/\b(all|every)\s+(text|words|copy|page|the page)\b/.test(t)) return 0
  return null
}

/** Closed outline (box, ring, turned box): ends meet and it is not tiny. */
function closedBox(st: Stroke): BBox | null {
  const pts = st.points
  if (pts.length < 8) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  const w = x1 - x0, h = y1 - y0
  if (w < 24 || h < 20) return null
  const a = pts[0]!, b = pts[pts.length - 1]!
  if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(24, 0.15 * Math.min(w, h))) return null
  return { x: x0, y: y0, w, h }
}

function groupOf(text: string, focus: string[], ids: string[], strokes: Stroke[], at: { x: number; y: number } | undefined): string[] | null {
  const n = groupCount(text)
  if (n === null) return null
  const shapes = new Map<string, BBox>()
  for (const st of strokes) {
    if (!ids.includes(st.id)) continue
    const b = closedBox(st)
    if (b) shapes.set(st.id, b)
  }
  const seeds = focus.filter((id) => shapes.has(id))
  if (seeds.length !== 1) return null
  const s = shapes.get(seeds[0]!)!
  // like-sized: each side within half again of the seed's (round 31 c2: frames 300, 420 and 340 wide)
  const ratio = (a: number, b: number) => Math.max(a, b) / Math.max(1, Math.min(a, b))
  const like = (b: BBox) => ratio(b.w, s.w) <= 1.5 && ratio(b.h, s.h) <= 1.5
  const gapOf = (a: BBox, b: BBox) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h))
  const reach = Math.max(40, 0.6 * Math.min(s.w, s.h))
  // like-sized shapes chained by overlap or a small gap, none holding another
  const group = [seeds[0]!]
  for (let grew = true; grew;) {
    grew = false
    for (const [id, b] of shapes) {
      if (group.includes(id) || !like(b)) continue
      if (group.some((g) => { const gb = shapes.get(g)!; return contains(gb, b) || contains(b, gb) })) continue
      if (group.some((g) => gapOf(shapes.get(g)!, b) <= reach)) { group.push(id); grew = true }
    }
  }
  if (group.length < 2) return null
  if (n === 0) return group
  if (group.length < n) return null
  // more than named: the n nearest the point it was typed at (the seed always among them)
  const p = at ?? { x: s.x + s.w / 2, y: s.y + s.h / 2 }
  const d = (id: string) => { const b = shapes.get(id)!; return id === seeds[0] ? -1 : Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y) }
  return group.sort((a, b) => d(a) - d(b)).slice(0, n)
}

/** Line pitch (px) under which level lines are one paragraph's wraps. */
export const PARA_PITCH_PX = 36

/** How far outside a block's own box a point may be and still count as typed on it. */
export const NOTE_ON_BLOCK_PX = 12

export const inside = (p: { x: number; y: number }, r: BBox, pad = 0): boolean =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

export const contains = (outer: BBox, r: BBox): boolean =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h

export const union = (rs: BBox[]): BBox => {
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y))
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const sameBox = (a: BBox, b: BBox, tol = 12): boolean =>
  Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol &&
  Math.abs(a.x + a.w - (b.x + b.w)) <= tol && Math.abs(a.y + a.h - (b.y + b.h)) <= tol

/**
 * Strokes drawn as a box: closed, and nearly every point on the edge of its own
 * bounding box. Rings, jagged shapes and diagonal lines also have a big bbox
 * that "holds" other ink, but they are not containers (layered pages put a
 * ring around a headline on purpose).
 */
export function boxes(strokes: Stroke[], ids: string[]): Set<string> {
  const out = new Set<string>()
  for (const st of strokes) {
    const pts = st.points
    if (!ids.includes(st.id) || pts.length < 8) continue
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
    const w = x1 - x0, h = y1 - y0
    if (w < 40 || h < 40) continue
    const tol = Math.max(6, 0.06 * Math.min(w, h))
    const a = pts[0]!, b = pts[pts.length - 1]!
    if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(24, 0.1 * Math.min(w, h))) continue
    const onEdge = pts.filter((p) => Math.min(p.x - x0, x1 - p.x, p.y - y0, y1 - p.y) <= tol).length
    if (onEdge / pts.length >= 0.85) out.add(st.id)
  }
  return out
}

/** The smallest drawn box that holds the point and at least one other stroke. */
function innermostContainer(p: { x: number; y: number }, rects: Map<string, BBox>, boxIds: Set<string>): string | null {
  let best: string | null = null
  let area = Infinity
  for (const [id, r] of rects) {
    if (!boxIds.has(id) || !inside(p, r)) continue
    const holds = [...rects].some(([o, or]) => o !== id && contains(r, or) && !sameBox(r, or))
    if (holds && r.w * r.h < area) { best = id; area = r.w * r.h }
  }
  return best
}

/**
 * How far a typed point is from a stroke. A closed outline that is not a box (a jagged
 * cut-out, a ring) covers only its inside, not its whole bounding box: a point in the box
 * but outside the outline is as far as the nearest edge. Round 3 c1: the far ridge's box
 * runs to the page bottom and holds the near ridge, so a note typed on the near ridge
 * focused both and the colours swapped.
 */
const segDist = (p: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }): number => {
  const vx = v.x - u.x, vy = v.y - u.y, L = vx * vx + vy * vy
  const t = L ? Math.max(0, Math.min(1, ((p.x - u.x) * vx + (p.y - u.y) * vy) / L)) : 0
  return Math.hypot(p.x - (u.x + t * vx), p.y - (u.y + t * vy))
}

const distToStroke = (p: { x: number; y: number }, pts: { x: number; y: number }[], r: BBox): { d: number; area?: number } => {
  const out = distToRect(p, r)
  if (out > 0 || pts.length < 8 || r.w < 16 || r.h < 16) return { d: out }
  const a = pts[0]!, b = pts[pts.length - 1]!
  // An open stroke whose box is wide AND tall (a diagonal, a long curve) covers only its
  // ink, not its box: n9, round 12 c4, a page-tall diagonal band's box swallowed every note
  // typed beside it, so "huge outlined 09" in the big box was also about the band.
  if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(24, 0.1 * Math.hypot(r.w, r.h))) {
    return { d: Math.min(...pts.slice(1).map((q, i) => segDist(p, pts[i]!, q))) }
  }
  let inside = false, edge = Infinity, area2 = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]!, pj = pts[j]!
    if ((pi.y > p.y) !== (pj.y > p.y) && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside
    const vx = pj.x - pi.x, vy = pj.y - pi.y, L = vx * vx + vy * vy
    const t = L ? Math.max(0, Math.min(1, ((p.x - pi.x) * vx + (p.y - pi.y) * vy) / L)) : 0
    edge = Math.min(edge, Math.hypot(p.x - (pi.x + t * vx), p.y - (pi.y + t * vy)))
    area2 += pj.x * pi.y - pi.x * pj.y
  }
  return inside ? { d: 0, area: Math.abs(area2) / 2 } : { d: edge }
}

export const distToRect = (p: { x: number; y: number }, r: BBox): number => {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h))
  return Math.hypot(dx, dy)
}

/**
 * n40: the lines of a giant heading are one drawing, and a heading line never joins the next block.
 *
 * Round 32 c1 (aurora): NORTH and LIGHTS were drawn as two level lines 170px apart, the date line
 * 90px under LIGHTS. The overlay groups a note's marks by distance (boxes within 120px), so the
 * heading note typed on line 1 took only line 1, and LIGHTS' line joined the date line: the date
 * note was "on these 2 marks" and its thread drew one box round LIGHTS and the date.
 *
 * Returns, for every stroke in a giant stack (two or three level lines or squiggles read as one
 * display heading, letters GIANT_STACK_PX or more), the ids of all that stack's strokes.
 */
export function giantStacks(strokes: Array<{ id: string; points: Array<{ x: number; y: number }> }>, stackOpts: StackOpts = {}): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const usable = strokes.filter((s) => s.points.length > 1)
  for (const st of textStacks(usable as Stroke[], stackOpts)) {
    if (st.lines < 2 || st.fontPx < GIANT_STACK_PX) continue
    for (const id of st.strokes) out.set(id, st.strokes)
  }
  return out
}

/**
 * Whether two strokes drawn close together may be grouped as one drawing, given the giant stacks:
 * lines of one giant heading always go together; a giant heading's line never groups with another
 * text line (a level line or squiggle outside its stack), however close. Anything else: undefined,
 * and the usual space-and-time rule decides.
 */
export function stackJoin(a: string, b: string, stacks: Map<string, string[]>, isTextLine: (id: string) => boolean): boolean | undefined {
  const sa = stacks.get(a), sb = stacks.get(b)
  if (sa && sa === sb) return true
  if ((sa && !sb && isTextLine(b)) || (sb && !sa && isTextLine(a))) return false
  if (sa && sb && sa !== sb) return false
  return undefined
}

/** A stroke that says "a line of text goes here": a level line or a text squiggle (n40). */
export const isTextLine = (points: Array<{ x: number; y: number }>): boolean =>
  points.length > 1 && (isLevelLine(points as Stroke['points']) || isTextMark(points as Stroke['points']))

/**
 * n88: the other lines of a heading-sized stack that a note's words need. Round 36 c4 (florist): "Fresh flowers,
 * at your door by noon." typed on line 1 of three ~62px-pitched lines (font ~57px, under the giant-stack size)
 * bound that line only, and the heading was built as one small cut line. When the typed words cannot fit on the
 * stack lines the note already has (about COPY_CHAR_EM of the font per character, with slack), the note is about
 * the whole stack. A title over a section heading, or a column of short links, keeps its own line: the words fit.
 * Returns the stack's stroke ids not already in `have` (empty when nothing changes).
 */
export function overflowStack(
  strokes: Array<{ id: string; points: Array<{ x: number; y: number }> }>,
  have: string[], text: string, stackOpts: StackOpts = {},
): string[] {
  const chars = text.replace(/\s+/g, ' ').trim().length
  if (!chars || have.length === 0) return []
  const usable = strokes.filter((x) => x.points.length > 1) as Stroke[]
  for (const st of textStacks(usable, stackOpts)) {
    if (st.lines < 2 || st.fontPx < STACK_COPY_MIN_FONT_PX || !st.lineWidths) continue
    const on = st.strokes.map((id, i) => (have.includes(id) ? (st.lineWidths![i] ?? 0) : -1)).filter((w) => w >= 0)
    if (on.length === 0 || on.length === st.lines) continue
    const room = on.reduce((a, b) => a + b, 0)
    if (chars * COPY_CHAR_EM * st.fontPx > COPY_OVERFLOW_SLACK * room) return st.strokes.filter((id) => !have.includes(id))
  }
  return []
}
