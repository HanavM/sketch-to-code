/**
 * A row of stats typed as one note comes out big, each value over its small label (n185).
 *
 * Round 43 c5 (climbing gym, n175/n177/n184): three short lines were drawn in a row under the button and one
 * note typed under them: "£14 day pass, £52 monthly, 6–23 open daily; big bold, label under". Every build put
 * the three values on the drawn lines but at body size (about 15px, the target is about 30px), the labels a
 * little smaller under them. Nothing in the brief said how big "big" is for a value, and nothing checked it:
 * stat CARDS (n82) need a drawn box, and a line's size check (n45) needs the words typed ON the line. The
 * layout score stayed at 53-62 while everything else was right.
 *
 * A person who types a list of numbers each with a few words, and says big (or bold, label under), means a
 * stats row, the common block under a landing page's button or across a dashboard. Here:
 * - a note whose comma parts are each a value (a number, a price, a range such as 6–23, a percent) and a short
 *   label (1-4 words), two or more of them, with a size word (big, large, huge, giant) or "bold ... label
 *   under/below", is a stats row;
 * - the build is told each value is its own element, big and bold (big: about 30px; huge: about 48px), its label
 *   its own smaller element (13-15px, muted) under it (above when typed so), left-aligned with the value, the
 *   items side by side in the typed order on the lines drawn for them; look words are never printed;
 * - the page is checked: each value is found as its own text, at least 24px (36px for huge), bold when said,
 *   and its label sits under (or above) it, smaller.
 * Zero tokens.
 */

export interface StatItem { value: string; label: string }
export interface StatRow { items: StatItem[]; size: 'big' | 'huge'; bold: boolean; labelAbove: boolean }

const LOOK = /^(big|bigger|huge|giant|large|massive|jumbo|display|bold|bolder|heavy|black|white|grey|gray|dark|light|muted|small|smaller|tiny|regular|numbers?|values?|figures?|stats?|labels?|under|below|beneath|underneath|above|over|on|top|each|and|with|the|a|left|aligned|row|in)$/i
/** Words that only style type: a label holding one is a look note, not copy. */
const STYLE = /^(big|bigger|huge|giant|large|massive|jumbo|bold|bolder|heavy|grey|gray|muted|small|smaller|tiny|regular|numbers?|values?|labels?|aligned)$/i
const SIZE_BIG = /\b(big|bigger|large|larger)\b/i
const SIZE_HUGE = /\b(huge|giant|massive|jumbo|enormous)\b/i
const BOLD = /\b(bold|bolder|heavy|black weight)\b/i
const LABEL_UNDER = /\blabels?\s+(?:small\s+|grey\s+|gray\s+|muted\s+)*(?:under|below|beneath|underneath)\b|\b(?:numbers?|values?)\s+(?:on\s+top|above|over)\b/i
const LABEL_ABOVE = /\blabels?\s+(?:small\s+|grey\s+|gray\s+|muted\s+)*(?:above|over|on\s+top|first)\b|\b(?:numbers?|values?)\s+(?:under|below|beneath)\b/i
/** A value: a price, number, range (6–23, 9-5), percent, or count with a plus (200+). */
const VAL = /^[-−+]?(?:[$£€]\s?)?\d+(?:[.,:]\d+)*(?:\s?[–—-]\s?\d+(?:[.,:]\d+)*)?(?:%|\+|k|m|x|°[cf]?)?$/i
const UNIT = /^(kg|g|lb|km|m|cm|mm|mi|ft|in|min|mins|h|hrs?|hours?|days?|weeks?|months?|years?|pts|gb|mb|tb)$/i

const words = (s: string) => s.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}$£€\-−+]+|[^\p{L}\p{N}%+°]+$/gu, '')).filter(Boolean)

/** Split on commas that are not inside a number (3,800). */
const commaParts = (s: string) => s.split(/,(?!\d{3}(?!\d))/).map((p) => p.trim()).filter(Boolean)

function itemOf(part: string): StatItem | null {
  const ws = words(part)
  if (ws.length < 2 || ws.length > 7) return null
  // value first ("£14 day pass") or last ("Members 1,200")
  const tryAt = (i: number): StatItem | null => {
    if (!VAL.test(ws[i]!)) return null
    let value = ws[i]!
    let rest = i === 0 ? ws.slice(1) : ws.slice(0, -1)
    if (i === 0 && !/^[$£€]/.test(value) && rest[0] && UNIT.test(rest[0]) && rest.length > 1) { value = `${value} ${rest[0]}`; rest = rest.slice(1) }
    if (rest.some((w) => /\d/.test(w))) return null
    // the label is copy: some real word in it, no style word (big, bold, grey), at most 5 words ("clear nights a month")
    if (!rest.length || rest.length > 5 || rest.every((w) => LOOK.test(w)) || rest.some((w) => STYLE.test(w))) return null
    return { value, label: rest.join(' ') }
  }
  return tryAt(0) ?? tryAt(ws.length - 1)
}

/** The stats row a note gives, or null. */
export function statRowOf(note: string): StatRow | null {
  const semi = note.indexOf(';')
  const copy0 = semi === -1 ? note : note.slice(0, semi)
  const tail0 = semi === -1 ? '' : note.slice(semi + 1)
  const parts = commaParts(copy0)
  // a trailing look part with no number ("..., big bold") joins the look tail
  const look: string[] = [tail0]
  while (parts.length && !/\d/.test(parts[parts.length - 1]!) && words(parts[parts.length - 1]!).every((w) => LOOK.test(w))) look.unshift(parts.pop()!)
  const lookText = look.join(' ')
  if (parts.length < 2 || parts.length > 6) return null
  const items = parts.map(itemOf)
  if (items.some((x) => !x)) return null
  const huge = SIZE_HUGE.test(lookText)
  const big = huge || SIZE_BIG.test(lookText)
  const bold = BOLD.test(lookText)
  const under = LABEL_UNDER.test(lookText), above = LABEL_ABOVE.test(lookText)
  if (!big && !(bold && (under || above))) return null
  return { items: items as StatItem[], size: huge ? 'huge' : 'big', bold, labelAbove: above && !under }
}

const PX = { big: 30, huge: 48 } as const
const MIN = { big: 24, huge: 36 } as const

export function statRowBrief(notes: readonly string[]): string {
  const lines: string[] = []
  for (const n of new Set(notes)) {
    const r = statRowOf(n)
    if (!r) continue
    lines.push(`- "${n}": a STATS ROW of ${r.items.length}, side by side in this order: ${r.items.map((it) => `"${it.value}" (label "${it.label}")`).join(', ')}. ` +
      `Each value is its OWN element, ${r.size} and ${r.bold ? 'bold (font-weight 700)' : 'semibold or bold'}: about ${PX[r.size]}px (never under ${MIN[r.size]}px, never body size), dark like the heading; ` +
      `its label is a separate element, small (13-15px) and muted, ${r.labelAbove ? 'just ABOVE' : 'just UNDER'} the value, left-aligned with it. ` +
      `Where short lines were drawn for them, each value starts on its own line, first value on the first line. No cards, borders, icons or dividers round them. ` +
      `Never print the look words (big, bold, label under).`)
  }
  return lines.length ? `STATS ROWS (deterministic, from the typed note; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

interface BBox { x: number; y: number; w: number; h: number }
interface NodeLike { id: string; text?: string; textBox?: BBox; rect?: BBox; style?: { fontSize?: string; fontWeight?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface StatRowVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const norm = (s: string) => s.toLowerCase().replace(/[‘’“”"'!?:;]/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
const px = (n: NodeLike) => parseFloat(n.style?.fontSize ?? '') || 0
const weight = (n: NodeLike) => { const w = n.style?.fontWeight ?? ''; return w === 'bold' ? 700 : parseInt(w, 10) || 400 }

/** The leaves holding `t`, smallest text first. */
const leaves = (t: string, after: Snap) => {
  const want = norm(t)
  return after.nodes.filter((n) => n.textBox && n.textBox.w > 0 && n.textBox.h > 0 && norm(n.text ?? '').includes(want))
    .sort((a, b) => (a.text ?? '').length - (b.text ?? '').length || a.textBox!.w * a.textBox!.h - b.textBox!.w * b.textBox!.h)
}

export function verifyStatRows(notes: readonly string[], after: Snap): StatRowVerdict {
  const rows = [...new Set(notes)].map(statRowOf).filter((r): r is StatRow => !!r)
  if (!rows.length) return { satisfied: true, unverifiable: true, reason: 'no stats rows typed' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const r of rows) {
    for (const it of r.items) {
      const v = leaves(it.value, after)[0]
      if (!v) continue
      judged++
      const q = `"${it.value}"`
      const vt = norm(v.text ?? '')
      if (vt !== norm(it.value) && vt.includes(norm(it.label))) {
        faults.push(`the stat ${q} shares one text element with its label "${it.label}": make the value its own element, ${r.size} and bold (about ${PX[r.size]}px), the label a small element ${r.labelAbove ? 'above' : 'under'} it`)
        continue
      }
      const f = px(v)
      if (f && f < MIN[r.size]) faults.push(`the stat ${q} is ${Math.round(f)}px: it was typed ${r.size}; make it about ${PX[r.size]}px${r.bold ? ' and bold' : ''}, its label staying small ${r.labelAbove ? 'above' : 'under'} it`)
      else if (r.bold && weight(v) < 600) faults.push(`the stat ${q} is not bold (weight ${weight(v)}): make it font-weight 700`)
      const vb = v.textBox!
      const l = leaves(it.label, after).find((n) => n !== v && Math.abs(n.textBox!.x - vb.x) <= vb.w + 80 && Math.abs(n.textBox!.y - vb.y) <= 120)
      if (!l) continue
      const lb = l.textBox!
      const lc = lb.y + lb.h / 2, vc = vb.y + vb.h / 2
      if (!r.labelAbove && lc < vc - 2) faults.push(`the label "${it.label}" sits above its stat ${q}: put it under the value, left-aligned`)
      else if (r.labelAbove && lc > vc + 2) faults.push(`the label "${it.label}" sits under its stat ${q}: put it above the value (it was typed so), left-aligned`)
      else if (px(l) && f && px(l) >= f) faults.push(`the label "${it.label}" is as big as its stat ${q}: the label is small (13-15px), the value ${r.size}`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no stat value found on the page' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${judged} stat value${judged > 1 ? 's' : ''} ${rows[0]!.size} and bold with the label in place` }
}
